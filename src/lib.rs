pub mod checks;
pub mod cli;
pub mod core;
pub mod coverage;
pub mod error;
pub mod host;
pub mod install;
pub mod judge;
pub mod rules;

pub use error::{Error, Result};

mod cli_config;
mod cli_output;
mod cli_plan;
