use std::process::ExitCode;

fn main() -> ExitCode {
    ExitCode::from(orly::cli::Cli::main())
}
