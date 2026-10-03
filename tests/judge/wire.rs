use super::common::{batch, response};
use orly::judge::{
    constants::MODEL,
    wire::{Question, Response},
};

#[test]
fn duplicate_answer_identifiers_and_criteria_are_rejected() {
    let input = batch("source", "judge.scope_contradiction");
    let answer = response(&input)
        .answers
        .remove("judge.scope_contradiction")
        .unwrap();
    let answer = serde_json::to_string(&answer).unwrap();
    let bytes = format!(
        r#"{{"model":"{MODEL}","answers":{{"judge.scope_contradiction":{answer},"judge.scope_contradiction":{answer}}},"usage":{{"input_tokens":1,"output_tokens":1}}}}"#
    );
    assert!(Response::parse(bytes.as_bytes(), MODEL, input.questions()).is_err());
    let duplicate = r#"{"type":"noul","instructions":"judge evidence","criteria":{"true":"yes","false":"no","true":"different meaning"}}"#;
    assert!(serde_json::from_str::<Question>(duplicate).is_err());
}
