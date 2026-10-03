use super::{
    authorization::AuthorizedRequest,
    constants::*,
    error::rejected,
    metrics::{Boundary, Operation},
    transport::Transport,
    wire::Response,
};
use crate::Result;
use std::time::{Duration, Instant};
use tracing::Instrument;

pub struct Client<'a> {
    transport: &'a dyn Transport,
}
impl<'a> Client<'a> {
    pub fn new(transport: &'a dyn Transport) -> Self {
        Self { transport }
    }
    pub async fn evaluate(
        &self,
        request: &AuthorizedRequest<'_>,
        deadline: Instant,
    ) -> Result<Response> {
        let boundary = Boundary::start(Operation::Upload, request.batch().digest());
        let result = self
            .attempts(request, deadline)
            .instrument(boundary.span())
            .await;
        boundary.finish(result)
    }
    async fn attempts(
        &self,
        request: &AuthorizedRequest<'_>,
        deadline: Instant,
    ) -> Result<Response> {
        for attempt in 0..ATTEMPTS {
            let time_left = remaining(deadline)?;
            let response = tokio::time::timeout(time_left, self.transport.send(request, time_left))
                .await
                .map_err(|_| rejected(DEADLINE_EXCEEDED))?;
            let delay = match response {
                Ok(response) if response.status == SUCCESS => {
                    return Response::parse(
                        &response.body,
                        &request.batch().engine().model,
                        request.batch().questions(),
                    );
                }
                Ok(response) if RETRY_STATUSES.contains(&response.status) => {
                    response.retry_after.unwrap_or_else(|| backoff(attempt))
                }
                Ok(_) => return Err(rejected(PROVIDER_FAILED)),
                Err(error)
                    if error.code() == PROVIDER_FAILED
                        || error.code() == crate::error::IO_FAILURE =>
                {
                    backoff(attempt)
                }
                Err(error) => return Err(error),
            };
            if attempt + 1 == ATTEMPTS {
                return Err(rejected(PROVIDER_FAILED));
            }
            if delay >= remaining(deadline)? {
                return Err(rejected(DEADLINE_EXCEEDED));
            }
            tokio::time::sleep(delay).await;
        }
        Err(rejected(PROVIDER_FAILED))
    }
}
fn remaining(deadline: Instant) -> Result<Duration> {
    let remaining = deadline.saturating_duration_since(Instant::now());
    if remaining.is_zero() {
        return Err(rejected(DEADLINE_EXCEEDED));
    }
    Ok(remaining)
}
fn backoff(attempt: usize) -> Duration {
    BACKOFF[attempt.min(BACKOFF.len() - 1)]
}
const SUCCESS: u16 = 200;
const RETRY_STATUSES: [u16; 2] = [429, 529];
