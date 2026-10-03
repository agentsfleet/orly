use super::authorization::AuthorizedRequest;
#[cfg(feature = "judge-transport")]
use super::constants::*;
use crate::Result;
use std::{future::Future, pin::Pin, time::Duration};

pub struct TransportResponse {
    pub status: u16,
    pub retry_after: Option<Duration>,
    pub body: Vec<u8>,
}
pub type TransportFuture<'a> = Pin<Box<dyn Future<Output = Result<TransportResponse>> + Send + 'a>>;
pub trait Transport: Send + Sync {
    fn send<'a>(
        &'a self,
        request: &'a AuthorizedRequest<'_>,
        remaining: Duration,
    ) -> TransportFuture<'a>;
}
#[cfg(feature = "judge-transport")]
pub struct TypeSafeTransport {
    client: reqwest::Client,
}
#[cfg(feature = "judge-transport")]
impl TypeSafeTransport {
    pub fn new() -> Result<Self> {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .https_only(true)
            .timeout(DEADLINE)
            .build()
            .map_err(super::error::Failure::from)?;
        Ok(Self { client })
    }
    async fn request(
        &self,
        request: &AuthorizedRequest<'_>,
        remaining: Duration,
    ) -> Result<TransportResponse> {
        let mut response = self
            .client
            .post(ENDPOINT)
            .bearer_auth(request.key())
            .header(reqwest::header::CONTENT_TYPE, CONTENT_TYPE)
            .body(request.batch().bytes().to_vec())
            .timeout(remaining)
            .send()
            .await
            .map_err(super::error::Failure::from)?;
        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .map(|value| {
                value
                    .to_str()
                    .ok()
                    .and_then(retry_after)
                    .unwrap_or(DEADLINE)
            });
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
        {
            return Err(super::error::rejected(LIMIT_EXCEEDED));
        }
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(super::error::Failure::from)?
        {
            if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                return Err(super::error::rejected(LIMIT_EXCEEDED));
            }
            body.extend_from_slice(&chunk);
        }
        Ok(TransportResponse {
            status,
            retry_after,
            body,
        })
    }
}
#[cfg(feature = "judge-transport")]
impl Transport for TypeSafeTransport {
    fn send<'a>(
        &'a self,
        request: &'a AuthorizedRequest<'_>,
        remaining: Duration,
    ) -> TransportFuture<'a> {
        Box::pin(self.request(request, remaining))
    }
}
#[cfg(feature = "judge-transport")]
const CONTENT_TYPE: &str = "application/json";

#[cfg(feature = "judge-transport")]
fn retry_after(value: &str) -> Option<Duration> {
    value
        .parse::<u64>()
        .ok()
        .map(Duration::from_secs)
        .or_else(|| {
            httpdate::parse_http_date(value).ok().map(|date| {
                date.duration_since(std::time::SystemTime::now())
                    .unwrap_or_default()
            })
        })
}
