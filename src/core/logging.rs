use super::env::EnvSource;
use std::io::IsTerminal;
use tracing::level_filters::LevelFilter;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

pub const LOG_FILTER: &str = "RUST_LOG";
pub const LOG_LEVEL: &str = "ORLY_LOG_LEVEL";
const DEFAULT_LEVEL: LevelFilter = LevelFilter::INFO;
const NO_COLOR: &str = "NO_COLOR";

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
            .with(self.filter())
            .with(
                tracing_subscriber::fmt::layer()
                    .with_writer(std::io::stderr)
                    .with_ansi(
                        std::io::stderr().is_terminal() && self.environment.get(NO_COLOR).is_none(),
                    ),
            )
            .try_init()
            .is_ok()
    }
}
