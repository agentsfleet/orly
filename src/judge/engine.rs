use super::{
    authorization::{Authorization, CredentialScanner},
    batch::Batch,
    client::Client,
    constants::*,
    metrics::{CountedTransport, Observation},
    transport::Transport,
    wire::Response,
};
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::{future::Future, pin::Pin, time::Instant};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EngineIdentity {
    pub provider: String,
    pub model: String,
}
impl EngineIdentity {
    pub fn jev() -> Self {
        Self {
            provider: TYPESAFE_PROVIDER.into(),
            model: MODEL.into(),
        }
    }
    pub fn validate(&self) -> Result<()> {
        if self.provider.is_empty() || self.model.is_empty() {
            return Err(Error::Invalid(
                "decision engine identity is incomplete".into(),
            ));
        }
        Ok(())
    }
}
pub type EngineFuture<'a> = Pin<Box<dyn Future<Output = Result<Response>> + Send + 'a>>;
/// Provider implementations consume semantic data; wire encoding stays behind this boundary.
pub trait DecisionEngine: Send + Sync {
    fn identity(&self) -> &EngineIdentity;
    fn infer<'a>(
        &'a self,
        batch: &'a Batch,
        deadline: Instant,
        observation: &'a Observation,
        announce: &mut dyn FnMut(&str, usize),
    ) -> EngineFuture<'a>;
}
pub struct JevEngine<'a> {
    identity: EngineIdentity,
    authorization: &'a Authorization,
    scanner: &'a dyn CredentialScanner,
    transport: &'a dyn Transport,
}
impl<'a> JevEngine<'a> {
    pub fn new(
        authorization: &'a Authorization,
        scanner: &'a dyn CredentialScanner,
        transport: &'a dyn Transport,
    ) -> Self {
        Self {
            identity: EngineIdentity::jev(),
            authorization,
            scanner,
            transport,
        }
    }
    async fn request(
        &self,
        batch: &Batch,
        deadline: Instant,
        transport: &dyn Transport,
    ) -> Result<Response> {
        if batch.engine() != &self.identity {
            return Err(Error::Stale);
        }
        let request = self
            .authorization
            .scan(batch, self.scanner, deadline)
            .await?;
        Client::new(transport).evaluate(&request, deadline).await
    }
}
impl DecisionEngine for JevEngine<'_> {
    fn identity(&self) -> &EngineIdentity {
        &self.identity
    }
    fn infer<'a>(
        &'a self,
        batch: &'a Batch,
        deadline: Instant,
        observation: &'a Observation,
        announce: &mut dyn FnMut(&str, usize),
    ) -> EngineFuture<'a> {
        if batch.engine() == &self.identity {
            announce(ENDPOINT, batch.pairs().len());
        }
        Box::pin(async move {
            let transport = CountedTransport::new(self.transport, observation);
            self.request(batch, deadline, &transport).await
        })
    }
}
const TYPESAFE_PROVIDER: &str = "typesafe";
