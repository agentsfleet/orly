use super::{
    batch::Batch,
    constants::*,
    engine::DecisionEngine,
    metrics::Observation,
    replay::{JudgmentStore, Record, StoreInput},
    runner::Outcome,
    wire::Response,
};
use crate::Result;
use std::{future::Future, pin::Pin, time::Instant};

pub struct JudgeInput<'a> {
    pub batch: &'a Batch,
    pub now: u64,
    pub deadline: Instant,
    pub refresh: bool,
    pub observation: &'a Observation,
}
impl JudgeInput<'_> {
    fn storage(&self) -> StoreInput<'_> {
        StoreInput::new(self.batch, self.now).until(self.deadline)
    }
}
pub type JudgeFuture<'a> = Pin<Box<dyn Future<Output = Outcome> + Send + 'a>>;
/// One bounded batch produces one inspectable recorded or incomplete judgment.
pub trait Judger: Send + Sync {
    fn judge<'a>(
        &'a self,
        input: JudgeInput<'a>,
        announce: &mut dyn FnMut(&str, usize),
    ) -> JudgeFuture<'a>;
}
pub struct ReplayJudger<'a> {
    pub store: &'a dyn JudgmentStore,
    pub ignore_local_records: bool,
}
impl ReplayJudger<'_> {
    pub fn replay(&self, input: StoreInput<'_>) -> Result<Option<Record>> {
        if self.ignore_local_records {
            return Ok(None);
        }
        self.store
            .replay(input)?
            .map(|record| {
                record.validate(input.batch)?;
                Ok(record)
            })
            .transpose()
    }
}
impl Judger for ReplayJudger<'_> {
    fn judge<'a>(
        &'a self,
        input: JudgeInput<'a>,
        _: &mut dyn FnMut(&str, usize),
    ) -> JudgeFuture<'a> {
        Box::pin(async move {
            cached(input.batch, self.replay(input.storage()))
                .unwrap_or_else(|| Outcome::incomplete(REPLAY_MISSING))
        })
    }
}
pub struct LiveJudger<'a> {
    pub store: &'a dyn JudgmentStore,
    pub engine: &'a dyn DecisionEngine,
}
impl LiveJudger<'_> {
    fn record(&self, input: &JudgeInput<'_>, response: Response) -> Result<Outcome> {
        response.validate(&input.batch.engine().model, input.batch.questions())?;
        let record = self
            .store
            .record(input.storage(), response, input.refresh)?;
        record.validate(input.batch)?;
        Ok(Outcome::Recorded {
            record,
            replayed: false,
        })
    }
}
impl Judger for LiveJudger<'_> {
    fn judge<'a>(
        &'a self,
        input: JudgeInput<'a>,
        announce: &mut dyn FnMut(&str, usize),
    ) -> JudgeFuture<'a> {
        let started = Instant::now();
        let replay = (!input.refresh)
            .then(|| cached(input.batch, self.store.replay(input.storage())))
            .flatten();
        if let Some(outcome) = replay {
            return ready(outcome);
        }
        if input.batch.engine() != self.engine.identity() {
            return ready(Outcome::incomplete(ENGINE_MISMATCH));
        }
        if started >= input.deadline {
            return ready(Outcome::incomplete(DEADLINE_EXCEEDED));
        }
        let future = self
            .engine
            .infer(input.batch, input.deadline, input.observation, announce);
        Box::pin(async move {
            future
                .await
                .and_then(|response| self.record(&input, response))
                .unwrap_or_else(|error| Outcome::incomplete(error.code()))
        })
    }
}
fn ready<'a>(outcome: Outcome) -> JudgeFuture<'a> {
    Box::pin(async move { outcome })
}
fn cached(batch: &Batch, result: Result<Option<Record>>) -> Option<Outcome> {
    match result {
        Ok(Some(record)) => Some(
            record
                .validate(batch)
                .map(|_| Outcome::Recorded {
                    record,
                    replayed: true,
                })
                .unwrap_or_else(|error| Outcome::incomplete(error.code())),
        ),
        Ok(None) => None,
        Err(error) => Some(Outcome::incomplete(error.code())),
    }
}
const ENGINE_MISMATCH: &str = "judge_engine_mismatch";
