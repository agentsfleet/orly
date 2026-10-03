use super::builders::{Language, SyntaxLink};
use crate::Result;
use std::ops::Range;
use tree_sitter::{Node, Parser, Tree};

pub(super) fn extract<'a>(
    function: &'a [u8],
    test: &'a [u8],
    link: &SyntaxLink,
) -> Result<Option<(&'a str, &'a str, &'a str)>> {
    let Some(function_tree) = parse(function, &link.language)? else {
        return Ok(None);
    };
    let Some(test_tree) = parse(test, &link.language)? else {
        return Ok(None);
    };
    let function_text = std::str::from_utf8(function)?;
    let test_text = std::str::from_utf8(test)?;
    let Some(function_range) = declaration(
        function_tree.root_node(),
        function_text,
        &link.function_name,
        false,
        &link.language,
    ) else {
        return Ok(None);
    };
    let Some(test_range) = declaration(
        test_tree.root_node(),
        test_text,
        &link.test_name,
        true,
        &link.language,
    ) else {
        return Ok(None);
    };
    let range = link.assertion_start..link.assertion_end;
    if range.start >= range.end || range.start < test_range.start || range.end > test_range.end {
        return Ok(None);
    }
    if !linked_assertion(&test_tree, &range, test_text, &link.language) {
        return Ok(None);
    }
    Ok(function_text
        .get(function_range)
        .zip(test_text.get(test_range))
        .zip(test_text.get(range))
        .map(|((f, t), a)| (f, t, a)))
}
fn linked_assertion(tree: &Tree, range: &Range<usize>, source: &str, language: &Language) -> bool {
    tree.root_node()
        .named_descendant_for_byte_range(range.start, range.end)
        .is_some_and(|node| node.byte_range() == *range && is_assertion(node, source, language))
}
fn parse(source: &[u8], language: &Language) -> Result<Option<Tree>> {
    let grammar = match language {
        Language::Rust => tree_sitter_rust::LANGUAGE.into(),
        Language::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        Language::Unsupported => return Ok(None),
    };
    let mut parser = Parser::new();
    parser.set_language(&grammar)?;
    Ok(parser
        .parse(source, None)
        .filter(|tree| !tree.root_node().has_error()))
}
fn declaration(
    node: Node<'_>,
    source: &str,
    name: &str,
    test: bool,
    language: &Language,
) -> Option<Range<usize>> {
    let mut stack = vec![node];
    let mut matches = Vec::new();
    while let Some(node) = stack.pop() {
        if matches!(node.kind(), FUNCTION_ITEM | FUNCTION_DECLARATION)
            && node
                .child_by_field_name(NAME)
                .and_then(|n| source.get(n.byte_range()))
                == Some(name)
            && (!test || matches!(language, Language::Rust) && rust_test(node, source))
        {
            matches.push(node.byte_range());
        }
        if test
            && matches!(language, Language::TypeScript)
            && node.kind() == CALL_EXPRESSION
            && typescript_test(node, source, name)
        {
            matches.push(node.byte_range());
        }
        let mut cursor = node.walk();
        stack.extend(node.named_children(&mut cursor));
    }
    (matches.len() == 1).then(|| matches.remove(0))
}
fn rust_test(node: Node<'_>, source: &str) -> bool {
    let mut previous = node.prev_named_sibling();
    while let Some(attribute) = previous.filter(|n| n.kind() == ATTRIBUTE_ITEM) {
        if source
            .get(attribute.byte_range())
            .is_some_and(|text| text == TEST_ATTRIBUTE || text == TOKIO_TEST_ATTRIBUTE)
        {
            return true;
        }
        previous = attribute.prev_named_sibling();
    }
    false
}
fn typescript_test(node: Node<'_>, source: &str, name: &str) -> bool {
    let function = node
        .child_by_field_name(FUNCTION)
        .and_then(|n| source.get(n.byte_range()));
    let argument = node
        .child_by_field_name(ARGUMENTS)
        .and_then(|n| n.named_child(0))
        .filter(|n| n.kind() == STRING)
        .and_then(|n| source.get(n.byte_range()));
    matches!(function, Some(TEST_CALL | IT_CALL))
        && argument.is_some_and(|text| text.len() >= 2 && text.get(1..text.len() - 1) == Some(name))
}
fn is_assertion(node: Node<'_>, source: &str, language: &Language) -> bool {
    match language {
        Language::Rust => {
            node.kind() == MACRO_INVOCATION
                && node
                    .child_by_field_name(MACRO)
                    .and_then(|n| source.get(n.byte_range()))
                    .is_some_and(|name| RUST_ASSERTIONS.contains(&name))
        }
        Language::TypeScript => {
            node.kind() == CALL_EXPRESSION
                && node
                    .child_by_field_name(FUNCTION)
                    .is_some_and(|function| typescript_expect(function, source))
        }
        Language::Unsupported => false,
    }
}
fn typescript_expect(node: Node<'_>, source: &str) -> bool {
    if node.kind() == MEMBER_EXPRESSION {
        return node
            .child_by_field_name(OBJECT)
            .is_some_and(|object| typescript_expect(object, source));
    }
    node.kind() == CALL_EXPRESSION
        && node
            .child_by_field_name(FUNCTION)
            .and_then(|function| source.get(function.byte_range()))
            == Some(EXPECT_CALL)
}
const FUNCTION_ITEM: &str = "function_item";
const FUNCTION_DECLARATION: &str = "function_declaration";
const CALL_EXPRESSION: &str = "call_expression";
const ATTRIBUTE_ITEM: &str = "attribute_item";
const TEST_ATTRIBUTE: &str = "#[test]";
const TOKIO_TEST_ATTRIBUTE: &str = "#[tokio::test]";
const NAME: &str = "name";
const FUNCTION: &str = "function";
const ARGUMENTS: &str = "arguments";
const STRING: &str = "string";
const MACRO: &str = "macro";
const MACRO_INVOCATION: &str = "macro_invocation";
const TEST_CALL: &str = "test";
const IT_CALL: &str = "it";
const RUST_ASSERTIONS: [&str; 3] = ["assert", "assert_eq", "assert_ne"];
const EXPECT_CALL: &str = "expect";
const MEMBER_EXPRESSION: &str = "member_expression";
const OBJECT: &str = "object";
