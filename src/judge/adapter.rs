use super::{
    Judge, JudgeResult, batch::Batch, constants::*, judger::ReplayJudger, replay::StoreInput,
    runner::epoch_seconds, wire::Answer,
};
use crate::{Error, Result, core::execution::EvaluationContext};
use orly_decision::{DecisionEnvelope, Question};
use std::collections::BTreeMap;

/// Native gates only receive this offline implementation; no transport or key is reachable.
pub struct ReplayJudge<'a> {
    pub judger: &'a ReplayJudger<'a>,
    pub batches: &'a [Batch],
}
impl Judge for ReplayJudge<'_> {
    fn evaluate(&self, context: &EvaluationContext, question: &Question) -> Result<JudgeResult> {
        let snapshot = context.snapshot.digest()?;
        let matches: Vec<_> = self
            .batches
            .iter()
            .flat_map(|batch| {
                batch
                    .pairs()
                    .iter()
                    .filter(|(_, pair)| pair.definition.id == question.id)
                    .map(move |(id, pair)| (batch, id, pair))
            })
            .collect();
        let [(batch, id, pair)] = matches.as_slice() else {
            return Ok(unavailable());
        };
        if batch.source_digest() != snapshot {
            return Err(Error::Stale);
        }
        let Some(record) = self
            .judger
            .replay(StoreInput::new(batch, epoch_seconds()?))?
        else {
            return Ok(unavailable());
        };
        record.validate(batch)?;
        let answer = match &record.response.answers[*id] {
            Answer::Choice { probabilities, .. } => orly_decision::Answer::Choice {
                probabilities: probabilities.clone(),
            },
            Answer::Noul { noul } => orly_decision::Answer::Noul {
                probabilities: BTreeMap::from([(CONDITION.into(), *noul)]),
            },
            Answer::Score { probabilities, .. } => orly_decision::Answer::Score {
                distributions: BTreeMap::from([(pair.candidate_id.clone(), probabilities.clone())]),
            },
        };
        let envelope = DecisionEnvelope {
            version: VERSION,
            question_id: question.id.clone(),
            question_version: pair.definition.version.clone(),
            builder_version: pair.definition.builder_version.clone(),
            model_version: batch.engine().model.clone(),
            input_digest: snapshot,
            assessment_id: record.run_id,
            answer,
        };
        envelope.validate(question, batch.source_digest())?;
        Ok(JudgeResult::Recorded { envelope })
    }
}
fn unavailable() -> JudgeResult {
    JudgeResult::Unavailable {
        reason: REPLAY_MISSING.into(),
    }
}
