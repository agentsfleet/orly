use super::{
    batch::Batch,
    constants::*,
    judger::{JudgeFuture, JudgeInput, Judger},
    metrics::{Observation, OperationMetrics},
    replay::Record,
};
use crate::{Error, Result};
use futures_util::{StreamExt, stream};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case", deny_unknown_fields)]
pub enum Outcome {
    Recorded { record: Record, replayed: bool },
    Incomplete { reason: String },
}
impl Outcome {
    pub(crate) fn incomplete(reason: &str) -> Self {
        Self::Incomplete {
            reason: reason.into(),
        }
    }
}
#[derive(Serialize)]
pub struct Run {
    pub batches: BTreeMap<String, Outcome>,
    pub excess_pairs: usize,
    pub metrics: BTreeMap<String, OperationMetrics>,
}
impl Run {
    pub fn exit_code(&self) -> u8 {
        if self.excess_pairs > 0
            || self
                .batches
                .values()
                .any(|value| matches!(value, Outcome::Incomplete { .. }))
        {
            INCOMPLETE_EXIT
        } else {
            0
        }
    }
    fn prepare(batches: &[Batch]) -> Result<(Self, Vec<&Batch>)> {
        let unique: BTreeSet<_> = batches.iter().map(Batch::digest).collect();
        if unique.len() != batches.len() {
            return Err(Error::Invalid("duplicate judgment batch".into()));
        }
        let mut run = Self {
            batches: BTreeMap::new(),
            excess_pairs: 0,
            metrics: BTreeMap::new(),
        };
        let mut pairs = 0;
        let mut accepted = Vec::new();
        for batch in batches {
            pairs += batch.pairs().len();
            if pairs > MAX_PAIRS {
                run.excess_pairs += batch.pairs().len();
                run.batches
                    .insert(batch.digest().into(), Outcome::incomplete(LIMIT_EXCEEDED));
            } else {
                accepted.push(batch);
            }
        }
        Ok((run, accepted))
    }
    fn include(&mut self, batch: &Batch, outcome: Outcome, metrics: OperationMetrics) {
        self.metrics.insert(batch.digest().into(), metrics);
        self.batches.insert(batch.digest().into(), outcome);
    }
}
/// Execute any judger under the same invocation budget, deadline and concurrency limit.
pub struct Invoker<'a> {
    judger: &'a dyn Judger,
    budget: Duration,
}
impl<'a> Invoker<'a> {
    pub fn new(judger: &'a dyn Judger) -> Self {
        Self {
            judger,
            budget: DEADLINE,
        }
    }
    pub fn within(mut self, budget: Duration) -> Self {
        self.budget = self.budget.min(budget);
        self
    }
    pub async fn invoke(
        &self,
        batches: &[Batch],
        refresh: bool,
        mut announce: impl FnMut(&str, usize),
    ) -> Result<Run> {
        let deadline = Instant::now() + self.budget;
        let now = epoch_seconds()?;
        let (mut run, accepted) = Run::prepare(batches)?;
        let observations: Vec<_> = accepted.iter().map(|_| Observation::start()).collect();
        let mut pending = stream::iter(accepted.into_iter().zip(&observations))
            .map(|(batch, observation)| {
                let input = JudgeInput {
                    batch,
                    now,
                    deadline,
                    refresh,
                    observation,
                };
                let future: JudgeFuture<'_> = if Instant::now() >= deadline {
                    Box::pin(async { Outcome::incomplete(DEADLINE_EXCEEDED) })
                } else {
                    self.judger.judge(input, &mut announce)
                };
                async move {
                    let outcome = tokio::time::timeout_at(deadline.into(), future)
                        .await
                        .unwrap_or_else(|_| Outcome::incomplete(DEADLINE_EXCEEDED));
                    (batch, outcome, observation.snapshot())
                }
            })
            .buffer_unordered(CONCURRENCY);
        while let Some((batch, outcome, metrics)) = pending.next().await {
            run.include(batch, outcome, metrics);
        }
        Ok(run)
    }
}
pub fn epoch_seconds() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|_| Error::Invalid("clock precedes Unix epoch".into()))
}
const INCOMPLETE_EXIT: u8 = 2;
