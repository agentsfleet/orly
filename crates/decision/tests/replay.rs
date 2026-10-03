use orly_decision::{Answer, DecisionEnvelope, Error, Primitive, Question, Result, WIRE_VERSION};
use std::collections::BTreeMap;

#[test]
fn independent_question_and_answer_replay_refuses_stale_or_invalid_input() -> Result<()> {
    let question = Question {
        primitive: Primitive::Choice {},
        id: "project.relevance".into(),
        version: "1.0.0".into(),
        builder: "project.files".into(),
        builder_version: "1.0.0".into(),
        model_version: "test-model".into(),
        candidates: vec!["yes".into(), "no".into()],
        rule_section: "Declared inputs".into(),
    };
    let mut decision = DecisionEnvelope {
        version: WIRE_VERSION,
        question_id: question.id.clone(),
        question_version: question.version.clone(),
        builder_version: question.builder_version.clone(),
        model_version: question.model_version.clone(),
        input_digest: "captured-input".into(),
        assessment_id: "recorded-assessment".into(),
        answer: Answer::Choice {
            probabilities: BTreeMap::from([("yes".into(), 0.8), ("no".into(), 0.2)]),
        },
    };
    decision.validate(&question, "captured-input")?;
    assert_eq!(decision.answer.selected(0.7), Some("yes"));
    let round_trip: DecisionEnvelope = serde_json::from_slice(&serde_json::to_vec(&decision)?)?;
    assert_eq!(round_trip, decision);
    assert!(matches!(
        decision.validate(&question, "changed-input"),
        Err(Error::Stale)
    ));
    decision.answer = Answer::Choice {
        probabilities: BTreeMap::from([("yes".into(), 1.5)]),
    };
    assert!(matches!(
        decision.validate(&question, "captured-input"),
        Err(Error::Invalid(_))
    ));
    assert!(serde_json::from_str::<Primitive>(r#"{"kind":"choice","extra":true}"#).is_err());
    Ok(())
}
