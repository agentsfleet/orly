use super::env::EnvSource;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::level_filters::LevelFilter;
use tracing_subscriber::{
    EnvFilter, Layer, filter::FilterExt, layer::SubscriberExt, util::SubscriberInitExt,
};

pub const LOG_FILTER: &str = "RUST_LOG";
pub const LOG_LEVEL: &str = "ORLY_LOG_LEVEL";
const DEFAULT_LEVEL: LevelFilter = LevelFilter::INFO;
const DEBUG_LEVEL: &str = "debug";
const ERROR_LEVEL: &str = "err";

pub struct Logging<'a> {
    environment: &'a dyn EnvSource,
}

impl<'a> Logging<'a> {
    pub fn new(environment: &'a dyn EnvSource) -> Self {
        Self { environment }
    }
    pub fn filter(&self) -> EnvFilter {
        let environment = self.environment;
        let level = environment
            .get(LOG_LEVEL)
            .as_deref()
            .and_then(|value| value.to_str())
            .and_then(|value| value.trim().parse::<LevelFilter>().ok())
            .unwrap_or(DEFAULT_LEVEL);
        let value = environment.get(LOG_FILTER);
        value
            .as_deref()
            .and_then(|value| value.to_str())
            .and_then(|value| EnvFilter::try_new(value).ok())
            .unwrap_or_else(|| EnvFilter::default().add_directive(level.into()))
    }
}

impl Logging<'_> {
    pub fn install(&self) -> bool {
        tracing_subscriber::registry()
            .with(
                tracing_logfmt::builder()
                    .with_timestamp(false)
                    .with_level(false)
                    .with_target(false)
                    .layer()
                    .with_writer(std::io::stderr)
                    .with_filter(self.filter().or(LevelFilter::WARN)),
            )
            .try_init()
            .is_ok()
    }

    pub fn debug(scope: &str, event: &str, message: &str) {
        tracing::debug!(
            ts_ms = Self::timestamp(),
            level = DEBUG_LEVEL,
            scope,
            event,
            msg = message
        );
    }

    pub fn error(scope: &str, event: &str, error_code: &str, message: &str) {
        tracing::error!(
            ts_ms = Self::timestamp(),
            level = ERROR_LEVEL,
            scope,
            event,
            error_code,
            msg = message
        );
    }

    fn timestamp() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    }
}
