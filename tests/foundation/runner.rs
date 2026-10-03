#[path = "../support/process.rs"]
mod process;
use crate::support::Repository;
use orly::{
    Result,
    core::{constants::MAX_OUTPUT_BYTES, evidence::CriterionResult, runner::NativeRunner},
};
use orly_fs::path::RelativePath;

#[test]
fn captured_commands_read_staged_bytes_and_source_mutations_fail() -> Result<()> {
    let repository = Repository::new()?;
    repository.write("source.txt", b"A\n")?;
    repository.stage("source.txt")?;
    repository.write("source.txt", b"B\n")?;
    let context = repository.context(Repository::command(&["/bin/cat", "source.txt"]))?;
    let execution = NativeRunner.run(&context, &context.configuration.commands["conform"])?;
    assert_eq!(execution.stdout, b"A\n");
    assert!(matches!(
        execution.invocation.result,
        CriterionResult::Passed { .. }
    ));
    let probe = repository.probe()?;
    let context = repository.context(Repository::command(&[probe.to_str().unwrap(), "mutate"]))?;
    let execution = NativeRunner.run(&context, &context.configuration.commands["conform"])?;
    assert_eq!(
        execution.invocation.result,
        CriterionResult::failed("command_source_mutation")
    );
    assert_eq!(std::fs::read(repository.root().join("source.txt"))?, b"B\n");
    Ok(())
}

#[test]
fn scratch_symlinks_preserve_parent_targets_forward_chains_and_captured_bytes() -> Result<()> {
    let repository = Repository::new()?;
    repository.write("nested/end.txt", b"captured target\n")?;
    for (path, target) in [
        ("a-first", "z-next"),
        ("nested/back", "../a-first"),
        ("z-next", "nested/end.txt"),
        ("directory-link", "nested"),
    ] {
        if path == "directory-link" {
            crate::support::platform::symlink_directory(target, repository.root().join(path))?;
        } else {
            crate::support::platform::symlink_file(target, repository.root().join(path))?;
        }
    }
    repository.stage(".")?;
    repository.write("nested/end.txt", b"divergent working target\n")?;
    let context = repository.context(Repository::command(&["/bin/cat", "nested/back"]))?;
    let command = &context.configuration.commands["conform"];
    let scratch = context.materialize(command)?;
    assert_eq!(
        std::fs::read(scratch.root().join("a-first"))?,
        b"captured target\n"
    );
    assert_eq!(
        std::fs::read(scratch.root().join("directory-link/end.txt"))?,
        b"captured target\n"
    );
    scratch.validate_sources()?;
    let execution = NativeRunner.run(&context, command)?;
    assert_eq!(execution.stdout, b"captured target\n");
    assert!(matches!(
        execution.invocation.result,
        CriterionResult::Passed { .. }
    ));
    Ok(())
}

#[test]
fn scratch_symlinks_refuse_cycles_dangling_targets_and_external_paths() -> Result<()> {
    let outside = tempfile::tempdir()?;
    let target = outside.path().join("target");
    std::fs::write(&target, b"foreign bytes")?;
    for destination in ["missing", "../outside", target.to_str().unwrap(), "other"] {
        let repository = Repository::new()?;
        crate::support::platform::symlink_file(destination, repository.root().join("entry"))?;
        if destination == "other" {
            crate::support::platform::symlink_file("entry", repository.root().join("other"))?;
        }
        repository.stage(".")?;
        let context = repository.context(Repository::command(&["/bin/cat", "entry"]))?;
        assert!(
            context
                .materialize(&context.configuration.commands["conform"])
                .is_err()
        );
        assert_eq!(std::fs::read(&target)?, b"foreign bytes");
    }
    Ok(())
}

#[test]
fn test_native_runner_bounds_and_reaps() -> Result<()> {
    let repository = Repository::new()?;
    let probe = repository.probe()?;
    let executable = probe.to_str().unwrap();
    for (argv, reason) in [
        (vec!["/absent/project-test-command"], "command_not_found"),
        (vec!["/bin/sleep", "10"], "command_timeout"),
        (vec!["/usr/bin/yes"], "command_output_limit"),
        (vec!["/usr/bin/false"], "command_failed"),
        (
            vec![executable, "signal"],
            if cfg!(unix) {
                "command_signal"
            } else {
                "command_failed"
            },
        ),
        (vec![executable, "flood"], "command_output_limit"),
        (vec![executable, "grandchild"], "command_descendant_leak"),
    ] {
        let mut command = Repository::command(&argv);
        // Output volume and timeout are independent limits; Windows pipe reads need more time.
        command.deadline_seconds = if reason == "command_output_limit" {
            10
        } else {
            1
        };
        let context = repository.context(command)?;
        let execution = NativeRunner.run(&context, &context.configuration.commands["conform"])?;
        assert_bounded_failure(&execution, reason, &argv)?;
    }
    Ok(())
}

fn assert_bounded_failure(
    execution: &orly::core::runner::Execution,
    reason: &str,
    argv: &[&str],
) -> Result<()> {
    assert_eq!(
        execution.invocation.result,
        CriterionResult::failed(reason),
        "{argv:?}: stdout={} stderr={}",
        execution.stdout.len(),
        execution.stderr.len()
    );
    assert!(execution.stdout.len() <= MAX_OUTPUT_BYTES);
    assert!(execution.stderr.len() <= MAX_OUTPUT_BYTES);
    if reason == "command_output_limit" {
        assert!(!execution.invocation.output_complete);
    }
    if reason == "command_signal" {
        assert_eq!(execution.invocation.signal, Some(6));
    }
    if reason == "command_descendant_leak" {
        let pid = std::str::from_utf8(&execution.stdout)
            .unwrap()
            .trim()
            .parse::<i32>()
            .unwrap();
        process::assert_process_exited(pid);
    }
    let evidence = serde_json::to_string(&execution.invocation)?;
    assert!(!evidence.contains("stdout\""));
    assert!(!evidence.contains("source.txt"));
    Ok(())
}

#[test]
fn unknown_inputs_and_overlapping_outputs_refuse_before_execution() -> Result<()> {
    let repository = Repository::new()?;
    let mut command = Repository::command(&["/usr/bin/true"]);
    command.inputs.insert(RelativePath::new("uncaptured")?);
    let context = repository.context(command)?;
    assert!(matches!(
        NativeRunner.run(&context, &context.configuration.commands["conform"]),
        Err(orly::Error::Invalid(_))
    ));
    let mut command = Repository::command(&["/usr/bin/true"]);
    command.outputs.insert(RelativePath::new("source.txt")?);
    let context = repository.context(command)?;
    assert!(matches!(
        NativeRunner.run(&context, &context.configuration.commands["conform"]),
        Err(orly::Error::Invalid(_))
    ));
    Ok(())
}

#[test]
fn deadline_bounds_pipes_retained_by_a_detached_descendant() -> Result<()> {
    let repository = Repository::new()?;
    let probe = repository.probe()?;
    let mut command = Repository::command(&[probe.to_str().unwrap(), "detached"]);
    command.deadline_seconds = 1;
    let context = repository.context(command)?;
    let started = std::time::Instant::now();
    let execution = NativeRunner.run(&context, &context.configuration.commands["conform"])?;
    let elapsed = started.elapsed();
    let pid: i32 = std::str::from_utf8(&execution.stdout)
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    #[cfg(unix)]
    let _ = nix::sys::signal::killpg(
        nix::unistd::Pid::from_raw(pid),
        nix::sys::signal::Signal::SIGKILL,
    );
    assert_eq!(
        execution.invocation.result,
        CriterionResult::failed(if cfg!(unix) {
            "command_timeout"
        } else {
            "command_descendant_leak"
        })
    );
    #[cfg(unix)]
    assert!(!execution.invocation.output_complete);
    #[cfg(windows)]
    process::assert_process_exited(pid);
    assert!(
        elapsed < std::time::Duration::from_secs(2),
        "pipe drain exceeded its deadline: {elapsed:?}"
    );
    Ok(())
}

#[test]
fn deadline_kills_a_live_parent_and_its_child_group() -> Result<()> {
    let repository = Repository::new()?;
    let probe = repository.probe()?;
    let mut command = Repository::command(&[probe.to_str().unwrap(), "parent-sleep"]);
    command.deadline_seconds = 1;
    let context = repository.context(command)?;
    let execution = NativeRunner.run(&context, &context.configuration.commands["conform"])?;
    assert_eq!(
        execution.invocation.result,
        CriterionResult::failed("command_timeout")
    );
    let pid: i32 = std::str::from_utf8(&execution.stdout)
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    process::assert_process_exited(pid);
    Ok(())
}
