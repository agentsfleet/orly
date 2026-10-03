use orly::Result;
use orly::core::citations::CitationRewriter;
use orly_fs::path::RelativePath;
use std::collections::BTreeMap;

#[test]
fn link_destinations_are_rewritten_without_touching_identical_labels() {
    let mapping = BTreeMap::from([("audits/guard.sh".into(), ".orly/audits/guard.sh".into())]);
    let input = "[audits/guard.sh](audits/guard.sh)";
    let (rendered, findings) = CitationRewriter::new(&mapping).rewrite(input, false);
    assert_eq!(rendered, "[audits/guard.sh](.orly/audits/guard.sh)");
    assert_eq!(findings.len(), 1);
}

#[test]
fn reference_definitions_are_rewritten_once_and_report_the_definition_line() {
    let mapping = BTreeMap::from([("audits/guard.sh".into(), ".orly/audits/guard.sh".into())]);
    let input = "[first][audit] and [second][audit]\n\n[audit]: audits/guard.sh\n";
    let (rendered, findings) = CitationRewriter::new(&mapping).rewrite(input, false);
    assert_eq!(
        rendered,
        "[first][audit] and [second][audit]\n\n[audit]: .orly/audits/guard.sh\n"
    );
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].line, 3);
}

#[test]
fn command_tokens_do_not_replace_an_earlier_argument_prefix() {
    let mapping = BTreeMap::from([("audits/guard.sh".into(), ".orly/audits/guard.sh".into())]);
    let input = "`cat audits/guard.sh.backup audits/guard.sh`";
    let (rendered, findings) = CitationRewriter::new(&mapping).rewrite(input, false);
    assert_eq!(
        rendered,
        "`cat audits/guard.sh.backup .orly/audits/guard.sh`"
    );
    assert_eq!(findings.len(), 1);
}

#[test]
fn test_doctor_and_citations_identify_stale_callers() {
    let mapping = BTreeMap::from([(".oracle/orly.json".into(), ".orly/orly.json".into())]);
    let input = "# Caller\n\nRead [configuration](.oracle/orly.json) and `.oracle/orly.json`.\n\n```sh\ncat .oracle/orly.json\n```\n\nhttps://example.invalid/.oracle/orly.json\n";
    let (rewritten, findings) = CitationRewriter::new(&mapping).rewrite(input, false);
    assert_eq!(findings.len(), 2);
    assert_eq!(findings[0].line, 3);
    assert!(rewritten.contains("[configuration](.orly/orly.json)"));
    assert!(rewritten.contains("```sh\ncat .oracle/orly.json\n```"));
    assert!(rewritten.contains("https://example.invalid/.oracle/orly.json"));
    assert_eq!(
        CitationRewriter::new(&mapping).rewrite(input, true),
        (input.into(), Vec::new())
    );
}

#[test]
fn command_examples_rewrite_exact_arguments_and_preserve_literals_and_urls() {
    let mapping = BTreeMap::from([("audits/guard.sh".into(), ".orly/audits/guard.sh".into())]);
    let input = "Run `bash 'audits/guard.sh' --all`, then `audits/guard.sh`.\n\nKeep `echo 'audits/guard.sh'`, `printf audits/guard.sh`, `bash audits/guard.sh.extra`, and `bash 'audits/guard.sh`.\n\n[external](https://example.invalid/audits/guard.sh)\n\n```sh\nbash audits/guard.sh\n```\n";
    let (rendered, findings) = CitationRewriter::new(&mapping).rewrite(input, false);
    assert_eq!(findings.len(), 2);
    let commands: Vec<_> = pulldown_cmark::Parser::new(&rendered)
        .filter_map(|event| match event {
            pulldown_cmark::Event::Code(code) => shlex::split(&code),
            _ => None,
        })
        .collect();
    assert_eq!(commands[0], ["bash", ".orly/audits/guard.sh", "--all"]);
    assert!(rendered.contains("`echo 'audits/guard.sh'`"));
    assert!(rendered.contains("`bash audits/guard.sh.extra`"));
    assert!(rendered.contains("`bash 'audits/guard.sh`"));
    assert!(rendered.contains("https://example.invalid/audits/guard.sh"));
    assert!(rendered.contains("```sh\nbash audits/guard.sh\n```"));
}

#[test]
fn nested_managed_links_keep_relative_meaning_and_fragments() -> Result<()> {
    let mapping = BTreeMap::from([
        ("docs/RULES.md".into(), ".orly/docs/RULES.md".into()),
        ("audits/guard.sh".into(), ".orly/audits/guard.sh".into()),
    ]);
    let source = RelativePath::new("dispatch/write_rust.md")?;
    let target = RelativePath::new(".orly/dispatch/write_rust.md")?;
    let input = "Read [rules](../docs/RULES.md#errors) and [guard](../audits/guard.sh). Run `bash audits/guard.sh`.";
    let (rendered, findings) = CitationRewriter::new(&mapping)
        .for_document(&source, &target)
        .rewrite(input, false);
    assert_eq!(findings.len(), 3);
    assert!(rendered.contains("[rules](../docs/RULES.md#errors)"));
    assert!(rendered.contains("[guard](../audits/guard.sh)"));
    assert!(rendered.contains("`bash .orly/audits/guard.sh`"));
    assert_eq!(
        CitationRewriter::new(&mapping)
            .for_document(&source, &target)
            .rewrite(input, true),
        (input.into(), Vec::new())
    );
    Ok(())
}

#[test]
fn document_relative_links_cannot_be_shadowed_by_root_mappings() -> Result<()> {
    let mut mapping = BTreeMap::from([("docs/topic.md".into(), ".orly/docs/topic.md".into())]);
    let source = RelativePath::new("dispatch/guide.md")?;
    let target = RelativePath::new(".orly/dispatch/guide.md")?;
    let local = "[topic](docs/topic.md)";
    assert_eq!(
        CitationRewriter::new(&mapping)
            .for_document(&source, &target)
            .rewrite(local, false),
        (local.into(), Vec::new())
    );
    mapping.insert(
        "dispatch/docs/topic.md".into(),
        ".orly/rules/topic.md".into(),
    );
    let (rendered, findings) = CitationRewriter::new(&mapping)
        .for_document(&source, &target)
        .rewrite(local, false);
    assert_eq!(rendered, "[topic](../rules/topic.md)");
    assert_eq!(findings.len(), 1);
    Ok(())
}

#[test]
fn escaped_and_entity_destinations_resolve_to_the_managed_path() {
    let mapping = BTreeMap::from([
        ("docs/A(B).md".into(), ".orly/docs/A(B).md".into()),
        ("docs/A&B.md".into(), ".orly/docs/A&B.md".into()),
    ]);
    let input = "[paren](docs/A\\(B\\).md#section)\n[entity](<docs/A&amp;B.md>)\n";
    let (rendered, findings) = CitationRewriter::new(&mapping).rewrite(input, false);
    let destinations: Vec<_> = pulldown_cmark::Parser::new(&rendered)
        .filter_map(|event| match event {
            pulldown_cmark::Event::Start(pulldown_cmark::Tag::Link { dest_url, .. }) => {
                Some(dest_url.into_string())
            }
            _ => None,
        })
        .collect();
    assert_eq!(
        destinations,
        [".orly/docs/A(B).md#section", ".orly/docs/A&B.md"]
    );
    assert_eq!(findings.len(), 2);
}

#[test]
fn migrated_command_paths_remain_one_static_argument() {
    let mapping = BTreeMap::from([(
        "audits/guard.sh".into(),
        ".orly/audits/Indy's guard;$HOME.sh".into(),
    )]);
    for code in [
        "cat audits/guard.sh",
        "cat 'audits/guard.sh'",
        "cat \"audits/guard.sh\"",
        "cat \"audits/\"guard.sh",
        "cat audits/'guard.sh'",
    ] {
        let input = format!("`{code}`");
        let (rendered, findings) = CitationRewriter::new(&mapping).rewrite(&input, false);
        let words = shlex::split(rendered.trim_matches('`')).expect("valid static command");
        assert_eq!(words, ["cat", ".orly/audits/Indy's guard;$HOME.sh"]);
        assert_eq!(findings.len(), 1);
        assert_eq!(
            CitationRewriter::new(&mapping).rewrite(&rendered, false).0,
            rendered
        );
    }
}

#[test]
fn dynamic_arguments_and_literal_strings_cannot_become_static_callers() {
    let mapping = BTreeMap::from([("audits/guard.sh".into(), ".orly/audits/guard.sh".into())]);
    for input in [
        "`bash $ROOT/audits/guard.sh`",
        "`bash \"${ROOT}/audits/guard.sh\"`",
        "`bash \"$ROOT/\"audits/guard.sh`",
        "`echo `cat audits/guard.sh``",
        "`cat audits/guard.sh*`",
        "`echo 'cat audits/guard.sh'`",
    ] {
        assert_eq!(
            CitationRewriter::new(&mapping).rewrite(input, false),
            (input.into(), Vec::new()),
            "{input}"
        );
    }
}

#[test]
fn static_nested_commands_and_command_lists_rewrite_actual_callers() {
    let mapping = BTreeMap::from([("audits/guard.sh".into(), ".orly/audits/guard.sh".into())]);
    for input in [
        "`echo $(cat audits/guard.sh)`",
        "`cat <(cat audits/guard.sh)`",
        "`echo text; cat audits/guard.sh`",
    ] {
        let (rendered, findings) = CitationRewriter::new(&mapping).rewrite(input, false);
        assert_eq!(
            rendered,
            input.replace("audits/guard.sh", ".orly/audits/guard.sh")
        );
        assert_eq!(findings.len(), 1);
    }
}

#[test]
fn empty_malformed_and_literal_markdown_never_create_callers() {
    let mapping = BTreeMap::from([("audits/guard.sh".into(), ".orly/audits/guard.sh".into())]);
    for input in [
        "",
        "`",
        "``",
        "` `",
        "`cat 'audits/guard.sh`",
        "[bad](",
        "    cat audits/guard.sh\n",
    ] {
        assert_eq!(
            CitationRewriter::new(&mapping).rewrite(input, false),
            (input.into(), Vec::new()),
            "{input}"
        );
    }
}

#[test]
fn code_span_line_breaks_are_spaces_rather_than_shell_command_separators() {
    let mapping = BTreeMap::from([("audits/guard.sh".into(), ".orly/audits/guard.sh".into())]);
    for input in [
        "`echo\ncat audits/guard.sh`",
        "`echo\r\ncat audits/guard.sh`",
    ] {
        assert_eq!(
            CitationRewriter::new(&mapping).rewrite(input, false),
            (input.into(), Vec::new())
        );
    }
    let (rendered, findings) =
        CitationRewriter::new(&mapping).rewrite("`cat\naudits/guard.sh`", false);
    assert_eq!(rendered, "`cat .orly/audits/guard.sh`");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].line, 1);
}

#[test]
fn destination_escaping_preserves_literal_entities_and_markup_characters() {
    let mapping = BTreeMap::from([(
        "docs/RULES.md".into(),
        ".orly/docs/A&amp;B<review>.md".into(),
    )]);
    let input = "[rules](docs/RULES.md#errors)";
    let (rendered, findings) = CitationRewriter::new(&mapping).rewrite(input, false);
    let mut html = String::new();
    pulldown_cmark::html::push_html(&mut html, pulldown_cmark::Parser::new(&rendered));
    assert_eq!(
        html,
        "<p><a href=\".orly/docs/A&amp;amp;B%3Creview%3E.md#errors\">rules</a></p>\n"
    );
    assert_eq!(findings.len(), 1);
}

#[test]
fn commands_in_tables_preserve_cells_and_shell_pipe_meaning() {
    let mapping = BTreeMap::from([(
        "audits/guard.sh".into(),
        ".orly/audits/guard|prod.sh".into(),
    )]);
    let input =
        "| command | note |\n| --- | --- |\n| `cat audits/guard.sh \\| cat other` | keep |\n";
    let (rendered, findings) = CitationRewriter::new(&mapping).rewrite(input, false);
    let events: Vec<_> =
        pulldown_cmark::Parser::new_ext(&rendered, pulldown_cmark::Options::ENABLE_TABLES)
            .collect();
    let commands: Vec<_> = events
        .iter()
        .filter_map(|event| match event {
            pulldown_cmark::Event::Code(code) => Some(code.as_ref()),
            _ => None,
        })
        .collect();
    assert_eq!(commands, ["cat '.orly/audits/guard|prod.sh' | cat other"]);
    assert_eq!(
        events
            .iter()
            .filter(|event| matches!(
                event,
                pulldown_cmark::Event::Start(pulldown_cmark::Tag::TableCell)
            ))
            .count(),
        4
    );
    assert_eq!(findings.len(), 1);
}
