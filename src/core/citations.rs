use orly_fs::path::RelativePath;
use pulldown_cmark::{Event, LinkType, Options, Parser, Tag, TagEnd};
use relative_path::RelativePath as LogicalPath;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, ops::Range, sync::LazyLock};
use tree_sitter::{Node, Query, QueryCursor, StreamingIterator};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StaleCaller {
    pub line: usize,
    pub target: String,
}

pub struct CitationRewriter<'a> {
    mapping: &'a BTreeMap<String, String>,
    document: Option<(&'a RelativePath, &'a RelativePath)>,
}

impl<'a> CitationRewriter<'a> {
    pub fn new(mapping: &'a BTreeMap<String, String>) -> Self {
        Self {
            mapping,
            document: None,
        }
    }

    pub fn for_document(mut self, source: &'a RelativePath, target: &'a RelativePath) -> Self {
        self.document = Some((source, target));
        self
    }

    pub fn rewrite(&self, content: &str, historical: bool) -> (String, Vec<StaleCaller>) {
        if historical || self.mapping.is_empty() {
            return (content.into(), Vec::new());
        }
        let mut edits: Vec<_> = destination_ranges(content)
            .into_iter()
            .filter_map(|range| {
                let (target, replacement) = self.destination(&content[range.clone()])?;
                Some(Edit {
                    range,
                    replacement,
                    targets: vec![target],
                })
            })
            .collect();
        let mut shell = tree_sitter::Parser::new();
        shell
            .set_language(&tree_sitter_bash::LANGUAGE.into())
            .expect(SHELL_LANGUAGE_INVARIANT);
        let mut in_table_cell = false;
        for (event, range) in Parser::new_ext(content, Options::ENABLE_TABLES).into_offset_iter() {
            match event {
                Event::Start(Tag::TableCell) => in_table_cell = true,
                Event::End(TagEnd::TableCell) => in_table_cell = false,
                Event::Code(code) => {
                    if let Some((code, targets)) = self.command(&code, &mut shell) {
                        edits.push(Edit {
                            range,
                            replacement: render([Event::Code(code.into())], in_table_cell),
                            targets,
                        });
                    }
                }
                _ => {}
            }
        }
        apply_edits(content, edits)
    }

    fn command(
        &self,
        code: &str,
        shell: &mut tree_sitter::Parser,
    ) -> Option<(String, Vec<String>)> {
        let tree = shell.parse(code, None).expect(SHELL_PARSE_INVARIANT);
        if tree.root_node().has_error() {
            return None;
        }
        let mut cursor = QueryCursor::new();
        let mut captures = cursor.captures(&SHELL_COMMANDS, tree.root_node(), code.as_bytes());
        let mut edits = Vec::new();
        while let Some((matched, index)) = captures.next() {
            let command = matched.captures[*index].node;
            let Some(name) = command
                .child_by_field_name(NAME_FIELD)
                .and_then(|node| literal_word(node, code))
            else {
                continue;
            };
            if !COMMAND_EXAMPLES.contains(&name.1.as_str()) && !self.mapping.contains_key(&name.1) {
                continue;
            }
            let mut arguments = command.walk();
            let words = std::iter::once(name).chain(
                command
                    .children_by_field_name(ARGUMENT_FIELD, &mut arguments)
                    .filter_map(|node| literal_word(node, code)),
            );
            for (range, target) in words {
                if let Some(replacement) = self
                    .mapping
                    .get(&target)
                    .and_then(|value| shlex::try_quote(value).ok())
                {
                    edits.push(Edit {
                        range,
                        replacement: replacement.into_owned(),
                        targets: vec![target],
                    });
                }
            }
        }
        if edits.is_empty() {
            return None;
        }
        let (rewritten, findings) = apply_edits(code, edits);
        Some((
            rewritten,
            findings.into_iter().map(|finding| finding.target).collect(),
        ))
    }

    fn destination(&self, raw: &str) -> Option<(String, String)> {
        let snippet = format!("[]({raw})");
        let destination = Parser::new(&snippet).find_map(|event| match event {
            Event::Start(Tag::Link { dest_url, .. }) => Some(dest_url.into_string()),
            _ => None,
        })?;
        if url::Url::parse(&destination).is_ok() || destination.starts_with(['#', '/']) {
            return None;
        }
        let (path, suffix) = destination
            .find(['#', '?'])
            .map_or((destination.as_str(), ""), |offset| {
                destination.split_at(offset)
            });
        let source_path = self.document.map_or_else(
            || LogicalPath::new(path).to_owned(),
            |(source, _)| {
                LogicalPath::new(source.as_str())
                    .parent()
                    .expect(RELATIVE_PARENT_INVARIANT)
                    .join_normalized(path)
            },
        );
        let replacement = self.mapping.get(source_path.as_str())?;
        let replacement = self.document.map_or_else(
            || replacement.clone(),
            |(_, installed)| {
                LogicalPath::new(installed.as_str())
                    .parent()
                    .expect(RELATIVE_PARENT_INVARIANT)
                    .relative(replacement)
                    .into_string()
            },
        );
        let rendered = render_destination(&format!("{replacement}{suffix}"))?;
        Some((destination, rendered))
    }
}

struct Edit {
    range: Range<usize>,
    replacement: String,
    targets: Vec<String>,
}

fn apply_edits(content: &str, mut edits: Vec<Edit>) -> (String, Vec<StaleCaller>) {
    edits.sort_by_key(|edit| edit.range.start);
    edits.dedup_by(|left, right| left.range == right.range);
    let mut result = String::with_capacity(content.len());
    let mut stale = Vec::new();
    let (mut offset, mut line) = (0, 1);
    for edit in edits {
        result.push_str(&content[offset..edit.range.start]);
        result.push_str(&edit.replacement);
        line += content[offset..edit.range.start]
            .bytes()
            .filter(|b| *b == b'\n')
            .count();
        stale.extend(
            edit.targets
                .into_iter()
                .map(|target| StaleCaller { line, target }),
        );
        line += content[edit.range.clone()]
            .bytes()
            .filter(|b| *b == b'\n')
            .count();
        offset = edit.range.end;
    }
    result.push_str(&content[offset..]);
    (result, stale)
}

fn destination_ranges(content: &str) -> Vec<Range<usize>> {
    let tree = tree_sitter_md::MarkdownParser::default()
        .parse(content.as_bytes(), None)
        .expect(MARKDOWN_PARSE_INVARIANT);
    let trees = std::iter::once((&*BLOCK_LINKS, tree.block_tree())).chain(
        tree.inline_trees()
            .iter()
            .map(|tree| (&*INLINE_LINKS, tree)),
    );
    let mut cursor = QueryCursor::new();
    let mut destinations = Vec::new();
    for (query, tree) in trees {
        let mut captures = cursor.captures(query, tree.root_node(), content.as_bytes());
        while let Some((matched, index)) = captures.next() {
            destinations.push(matched.captures[*index].node.byte_range());
        }
    }
    destinations
}

fn literal_word(mut node: Node<'_>, code: &str) -> Option<(Range<usize>, String)> {
    if node.kind() == COMMAND_NAME {
        node = node.named_child(0)?;
    }
    if !static_word(node) {
        return None;
    }
    let range = node.byte_range();
    let mut words = shlex::split(&code[range.clone()])?.into_iter();
    let value = words.next()?;
    words.next().is_none().then_some((range, value))
}

fn static_word(node: Node<'_>) -> bool {
    match node.kind() {
        WORD | RAW_STRING | STRING_CONTENT => true,
        STRING | CONCATENATION => {
            let mut cursor = node.walk();
            node.named_children(&mut cursor).all(static_word)
        }
        _ => false,
    }
}

fn render_destination(destination: &str) -> Option<String> {
    let mut escaped = String::new();
    pulldown_cmark_escape::escape_href(&mut escaped, destination).expect(MARKDOWN_RENDER_INVARIANT);
    let rendered = render(
        [
            Event::Start(Tag::Link {
                link_type: LinkType::Inline,
                dest_url: escaped.into(),
                title: "".into(),
                id: "".into(),
            }),
            Event::End(TagEnd::Link),
        ],
        false,
    );
    destination_ranges(&rendered)
        .into_iter()
        .next()
        .map(|range| rendered[range].to_owned())
}

fn render<'a>(events: impl IntoIterator<Item = Event<'a>>, in_table_cell: bool) -> String {
    let mut rendered = String::new();
    let mut state = pulldown_cmark_to_cmark::State::default();
    state.in_table_cell = in_table_cell;
    pulldown_cmark_to_cmark::cmark_resume(events.into_iter(), &mut rendered, Some(state))
        .expect(MARKDOWN_RENDER_INVARIANT);
    rendered
}

const LINK_QUERY: &str = "(link_destination) @destination";
const COMMAND_QUERY: &str = "(command) @command";
static BLOCK_LINKS: LazyLock<Query> = LazyLock::new(|| {
    Query::new(&tree_sitter_md::LANGUAGE.into(), LINK_QUERY).expect(QUERY_INVARIANT)
});
static INLINE_LINKS: LazyLock<Query> = LazyLock::new(|| {
    Query::new(&tree_sitter_md::INLINE_LANGUAGE.into(), LINK_QUERY).expect(QUERY_INVARIANT)
});
static SHELL_COMMANDS: LazyLock<Query> = LazyLock::new(|| {
    Query::new(&tree_sitter_bash::LANGUAGE.into(), COMMAND_QUERY).expect(QUERY_INVARIANT)
});
const COMMAND_EXAMPLES: &[&str] = &["bash", "sh", "python3", "cat", "source", "orly", "bin/orly"];
const COMMAND_NAME: &str = "command_name";
const NAME_FIELD: &str = "name";
const ARGUMENT_FIELD: &str = "argument";
const WORD: &str = "word";
const RAW_STRING: &str = "raw_string";
const STRING: &str = "string";
const STRING_CONTENT: &str = "string_content";
const CONCATENATION: &str = "concatenation";
const QUERY_INVARIANT: &str = "query node kinds exist in the pinned grammars";
const MARKDOWN_RENDER_INVARIANT: &str =
    "balanced supported Markdown events serialize into an infallible String writer";
const MARKDOWN_PARSE_INVARIANT: &str =
    "pinned Markdown grammar parses without cancellation or included ranges";
const SHELL_LANGUAGE_INVARIANT: &str = "pinned Bash grammar matches the parser runtime";
const SHELL_PARSE_INVARIANT: &str =
    "pinned Bash grammar parses without cancellation or included ranges";
const RELATIVE_PARENT_INVARIANT: &str = "validated repository-relative file has a parent";
