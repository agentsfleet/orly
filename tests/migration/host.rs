use orly::{
    Result,
    host::{HostLoader, POINTER_CLOSE, POINTER_OPEN},
};

#[test]
fn fenced_and_inline_host_markers_remain_literal_examples() -> Result<()> {
    let input = format!(
        "Keep this example:\n\n```md\n{POINTER_OPEN}\n@example.md\n{POINTER_CLOSE}\n```\n\nInline `{POINTER_OPEN}` stays.\n"
    );
    let output = HostLoader::markdown(&input, "AGENTS.md")?;
    assert!(output.starts_with(input.trim_end()));
    assert!(output.ends_with(&format!("{POINTER_OPEN}\n@AGENTS.md\n{POINTER_CLOSE}\n")));
    Ok(())
}

#[test]
fn real_host_blocks_preserve_foreign_content_and_upgrade_once() -> Result<()> {
    let input = format!("Before\n\n{POINTER_OPEN}\n@old.md\n{POINTER_CLOSE}\n\nAfter\n");
    let expected = format!("Before\n\n{POINTER_OPEN}\n@AGENTS.md\n{POINTER_CLOSE}\n\nAfter\n");
    let output = HostLoader::markdown(&input, "AGENTS.md")?;
    assert_eq!(output, expected);
    assert_eq!(HostLoader::markdown(&output, "AGENTS.md")?, expected);
    Ok(())
}

#[test]
fn nested_duplicate_reversed_and_unclosed_host_blocks_refuse() {
    for input in [
        format!("{POINTER_OPEN}\n{POINTER_OPEN}\n{POINTER_CLOSE}\n"),
        format!("{POINTER_OPEN}\n{POINTER_CLOSE}\n{POINTER_CLOSE}\n"),
        format!("{POINTER_OPEN}\n{POINTER_CLOSE}\n{POINTER_OPEN}\n{POINTER_CLOSE}\n"),
        format!("{POINTER_CLOSE}\n{POINTER_OPEN}\n"),
        format!("{POINTER_OPEN}\n"),
        format!("{POINTER_CLOSE}\n"),
    ] {
        let error = HostLoader::markdown(&input, "AGENTS.md").expect_err("invalid marker order");
        assert!(
            matches!(error, orly::Error::Invalid(ref reason) if reason == "malformed host ownership block"),
            "{input}: {error}"
        );
    }
}

#[test]
fn foreign_comment_examples_and_trailing_whitespace_are_preserved() -> Result<()> {
    for input in [
        format!("<!-- Example includes {POINTER_OPEN} as text -->\n"),
        format!("    {POINTER_OPEN}\n    {POINTER_CLOSE}\n"),
        "Foreign text  \n \t\n".into(),
    ] {
        let output = HostLoader::markdown(&input, "AGENTS.md")?;
        assert!(output.starts_with(&input), "{input:?}: {output:?}");
        assert_eq!(HostLoader::markdown(&output, "AGENTS.md")?, output);
    }
    Ok(())
}

#[test]
fn literal_examples_beside_a_real_host_block_are_never_replaced() -> Result<()> {
    let example = format!("`{POINTER_OPEN}`\n\n```md\n{POINTER_CLOSE}\n```\n\n");
    let input = format!("{example}{POINTER_OPEN}\n@old.md\n{POINTER_CLOSE}\n\nForeign tail  \n");
    let expected =
        format!("{example}{POINTER_OPEN}\n@AGENTS.md\n{POINTER_CLOSE}\n\nForeign tail  \n");
    assert_eq!(HostLoader::markdown(&input, "AGENTS.md")?, expected);
    Ok(())
}
