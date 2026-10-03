use super::common::{batch, response};
use orly::judge::{
    bank::Bank,
    evaluation::{Case, Corpus, Label, Prediction},
    wire::Answer,
};
use std::collections::BTreeMap;

/// Perfect fixtures test metric arithmetic; they are never provider evaluation evidence.
pub fn predictions(corpus: &Corpus, bank: &Bank) -> BTreeMap<String, Prediction> {
    corpus
        .cases
        .iter()
        .filter(|case| !matches!(case.label, Label::Missing {}))
        .map(|case| {
            (
                case.id.clone(),
                Prediction {
                    answer: Some(answer(case, bank)),
                    requests: 1,
                    input_tokens: 20,
                    output_tokens: 4,
                    latency_millis: 2,
                },
            )
        })
        .collect()
}
fn answer(case: &Case, bank: &Bank) -> Answer {
    let mut answer = response(&batch("source", &bank.get(&case.family).unwrap().id))
        .answers
        .remove(&case.family)
        .unwrap();
    match (&case.label, &mut answer) {
        (
            Label::Choice { option },
            Answer::Choice {
                choice,
                probabilities,
                ..
            },
        ) => {
            *choice = option.clone();
            for (key, probability) in probabilities {
                *probability = f64::from(key == option);
            }
        }
        (Label::Noul { positive }, Answer::Noul { noul }) => {
            *noul = if *positive { 0.99 } else { 0.01 };
        }
        (
            Label::Score { level },
            Answer::Score {
                score,
                probabilities,
                ..
            },
        ) => {
            *score = *level as f64;
            for (key, probability) in probabilities {
                *probability = f64::from(key == &level.to_string());
            }
        }
        _ => panic!("fixture label must match its question"),
    }
    answer
}
