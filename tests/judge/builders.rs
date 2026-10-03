use orly::judge::builders::{BuildResult, EvidenceBuilder, Language, SyntaxBuilder, SyntaxLink};
use std::collections::BTreeMap;

#[test]
fn test_builders_preserve_complete_bounded_evidence() {
    for (language, function, test, name, assertion) in [
        (
            Language::Rust,
            "fn double(x: i32) -> i32 { x * 2 }",
            "#[test] fn returns_double() { assert_eq!(double(2), 4); }",
            "returns_double",
            "assert_eq!(double(2), 4)",
        ),
        (
            Language::TypeScript,
            "function double(x: number): number { return x * 2; }",
            "test('returns double', () => { expect(double(2)).toBe(4); });",
            "returns double",
            "expect(double(2)).toBe(4)",
        ),
    ] {
        let builder = SyntaxBuilder::new(
            "snapshot".into(),
            BTreeMap::from([
                ("function".into(), function.as_bytes().to_vec()),
                ("test".into(), test.as_bytes().to_vec()),
            ]),
        );
        let start = test.find(assertion).unwrap();
        let link = SyntaxLink {
            language,
            function_path: "function".into(),
            function_name: "double".into(),
            test_path: "test".into(),
            test_name: name.into(),
            assertion_start: start,
            assertion_end: start + assertion.len(),
            dimension: "Return twice the input".into(),
        };
        let BuildResult::Complete { evidence } = builder.build(&link).unwrap() else {
            panic!("complete source pair was rejected");
        };
        assert_eq!(evidence["function"], function);
        assert!(
            evidence["test_declaration"]
                .as_str()
                .unwrap()
                .contains(assertion)
        );
        assert_eq!(evidence["assertion"], assertion);
    }
}
#[test]
fn missing_link_partial_assertion_and_unsupported_source_stay_incomplete() {
    let builder = SyntaxBuilder::new(
        "snapshot".into(),
        BTreeMap::from([
            ("function".into(), b"fn f() {}".to_vec()),
            ("test".into(), b"#[test] fn t() { assert!(true); }".to_vec()),
        ]),
    );
    let mut link = SyntaxLink {
        language: Language::Rust,
        function_path: "function".into(),
        function_name: "f".into(),
        test_path: "test".into(),
        test_name: "absent".into(),
        assertion_start: 16,
        assertion_end: 20,
        dimension: "specific".into(),
    };
    assert!(matches!(
        builder.build(&link).unwrap(),
        BuildResult::Incomplete { .. }
    ));
    link.test_name = "t".into();
    assert!(matches!(
        builder.build(&link).unwrap(),
        BuildResult::Incomplete { .. }
    ));
    link.language = Language::Unsupported;
    assert!(matches!(
        builder.build(&link).unwrap(),
        BuildResult::Incomplete { .. }
    ));
}
#[test]
fn oversized_evidence_and_missing_named_fields_are_rejected() {
    use orly::judge::{builders::bounded_fields, constants::*};
    assert_eq!(
        bounded_fields(serde_json::json!({"claim":"x"}), &["claim", "evidence"]).unwrap(),
        BuildResult::Incomplete {
            reason: EVIDENCE_MISSING.into()
        }
    );
    assert_eq!(
        bounded_fields(
            serde_json::json!({"source":"x".repeat(MAX_STATE_BYTES)}),
            &["source"]
        )
        .unwrap(),
        BuildResult::Incomplete {
            reason: LIMIT_EXCEEDED.into()
        }
    );
}
#[test]
fn handler_requires_assertion_links_and_keeps_item_failures_separate() {
    use orly::judge::{
        bank::Bank,
        handler::{EvidenceInput, Handler, Input},
    };
    let bank = Bank::compiled().unwrap();
    let builder = SyntaxBuilder::new("snapshot".into(), BTreeMap::new());
    let handler = Handler {
        bank: &bank,
        assertion_builder: &builder,
    };
    let inputs = [Input {
        id: "input.claim".into(),
        candidate_id: "rule.documentation".into(),
        families: vec![
            "judge.documentation_support".into(),
            "judge.assertion_relevance".into(),
        ],
        evidence: EvidenceInput::Structured {
            fields: serde_json::json!({
                "claim":"Supports source checking", "evidence":"Complete observed behavior",
                "assertion":"fabricated", "dimension":"fabricated", "function":"fabricated",
                "test_declaration":"fabricated"
            }),
        },
    }];
    let prepared = handler.prepare("snapshot", &inputs).unwrap();
    assert_eq!(prepared.batches.len(), 1);
    assert_eq!(prepared.batches[0].pairs().len(), 1);
    assert_eq!(prepared.incomplete.len(), 1);
    assert!(
        prepared
            .incomplete
            .contains_key("judge.assertion_relevance.input.claim")
    );
}
