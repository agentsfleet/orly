pub fn report() {
    let event = "runner_lease_completed";
    tracing::debug!(event);
}

#[cfg(test)]
mod tests {
    #[test]
    fn diagnostic_output_is_allowed() {
        println!("test diagnostic");
        eprintln!("test failure diagnostic");
        dbg!(1);
    }
}
