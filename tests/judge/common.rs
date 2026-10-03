use orly::judge::{
    bank::Bank,
    batch::{Batch, Pair},
    wire::{Answer, Question, Response, Usage},
};
use serde_json::json;
use std::collections::BTreeMap;

pub fn batch(source: &str, family: &str) -> Batch {
    let definition = Bank::compiled().unwrap().get(family).unwrap().clone();
    let state = definition
        .evidence
        .iter()
        .map(|field| (field.clone(), json!(format!("complete {field} evidence"))))
        .collect::<serde_json::Map<_, _>>();
    Batch::new(
        source.into(),
        state.into(),
        BTreeMap::from([(
            family.into(),
            Pair {
                input_id: "input.unit".into(),
                candidate_id: "rule.security".into(),
                definition,
            },
        )]),
    )
    .unwrap()
}
pub fn response(batch: &Batch) -> Response {
    let answers = batch
        .questions()
        .iter()
        .map(|(id, question)| {
            let answer = match question {
                Question::Choice { criteria, .. } => Answer::Choice {
                    choice: "quiet".into(),
                    probabilities: criteria
                        .keys()
                        .map(|key| (key.clone(), if key == "quiet" { 1.0 } else { 0.0 }))
                        .collect(),
                    confidence: 1.0,
                },
                Question::Noul { .. } => Answer::Noul { noul: 0.99 },
                Question::Score { criteria, .. } => Answer::Score {
                    score: (criteria.len() - 1) as f64,
                    legend: criteria
                        .iter()
                        .enumerate()
                        .map(|(i, text)| (i.to_string(), text.clone()))
                        .collect(),
                    probabilities: criteria
                        .iter()
                        .enumerate()
                        .map(|(i, _)| {
                            (
                                i.to_string(),
                                if i == criteria.len() - 1 { 1.0 } else { 0.0 },
                            )
                        })
                        .collect(),
                    confidence: 1.0,
                },
            };
            (id.clone(), answer)
        })
        .collect();
    Response {
        model: batch.engine().model.clone(),
        answers,
        usage: Usage {
            input_tokens: 20,
            output_tokens: 4,
        },
    }
}
