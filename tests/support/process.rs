pub fn process_exists(id: i32) -> bool {
    #[cfg(unix)]
    {
        nix::sys::signal::kill(nix::unistd::Pid::from_raw(id), None).is_ok()
    }
    #[cfg(windows)]
    {
        subc_jobobject::process_exists(id as u32)
    }
}

pub fn assert_process_exited(id: i32) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
    while process_exists(id) && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    assert!(
        !process_exists(id),
        "supervised child {id} survived termination"
    );
}
