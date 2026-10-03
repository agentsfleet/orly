#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::{
    io::{self, Write},
    process::{Command, ExitCode},
    time::Duration,
};
type Result<T> = io::Result<T>;
mod interpreters;

fn run() -> Result<()> {
    refuse_interpreter_launch()?;
    match std::env::args().nth(1).as_deref() {
        Some("success") => {}
        Some("failure") => return Err(io::Error::other("requested failure")),
        Some("cat") => {
            let path = std::env::args()
                .nth(2)
                .ok_or_else(|| io::Error::other("missing input"))?;
            io::stdout().write_all(&std::fs::read(path)?)?;
        }
        Some("yes") => loop {
            io::stdout().write_all(&[b'x'; 8192])?;
        },
        Some("sleep") => std::thread::sleep(Duration::from_secs(60)),
        Some("linger") => std::thread::sleep(Duration::from_secs(3)),
        Some(operation @ ("detached" | "parent-sleep" | "grandchild")) => spawn_child(operation)?,
        Some("signal") => std::process::abort(),
        Some("mutate") => std::fs::write("source.txt", b"changed")?,
        Some("environment") => {
            println!(
                "{}",
                std::env::var("ORLY_FIXTURE_VALUE").unwrap_or_default()
            );
            println!(
                "{}",
                std::env::var("ORLY_FIXTURE_PRIVATE").unwrap_or_default()
            );
        }
        Some("flood") => {
            let block = [b'x'; 8192];
            for _ in 0..2048 {
                io::stdout().write_all(&block)?;
                io::stderr().write_all(&block)?;
            }
        }
        _ => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "unknown fixture operation",
            ));
        }
    }
    Ok(())
}

fn refuse_interpreter_launch() -> Result<()> {
    let executable = std::env::current_exe()?;
    if executable
        .file_stem()
        .and_then(|name| name.to_str())
        .is_some_and(|name| interpreters::NAMES.contains(&name))
    {
        std::fs::write(executable.with_file_name(interpreters::INVOKED), b"refused")?;
        return Err(io::Error::other("interpreter launch refused"));
    }
    Ok(())
}

fn spawn_child(operation: &str) -> Result<()> {
    let mut command = Command::new(std::env::current_exe()?);
    command.arg(if operation == "detached" {
        "linger"
    } else {
        "sleep"
    });
    #[cfg(unix)]
    if operation == "detached" {
        command.process_group(0);
    }
    let child = command.spawn()?;
    println!("{}", child.id());
    io::stdout().flush()?;
    if operation == "parent-sleep" {
        std::thread::sleep(Duration::from_secs(60));
    }
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
