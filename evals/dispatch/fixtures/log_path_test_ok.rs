#[test]
fn diagnostic_output_is_allowed() {
    println!("test diagnostic");
    eprintln!("test failure diagnostic");
    dbg!(1);
}
