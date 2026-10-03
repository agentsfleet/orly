use super::{Assessment, Constituent, Decider, NODE_PREFIX};
use crate::judge::{batch::Batch, replay::Record, runner::Outcome};
use crate::{
    Error, Result,
    core::plan::{DecisionPlan, PAYLOAD_CHECK, PlanNode, SNAPSHOT_CHECK},
};
use orly_fs::digest::ContentDigest;
use std::collections::{BTreeMap, BTreeSet};

pub struct PlanComposer<'a, 'p> {
    policy: &'p dyn Decider,
    plan: DecisionPlan,
    additions: BTreeMap<String, PlanNode>,
    constituents: Vec<Constituent<'a>>,
    ranking: BTreeMap<&'a str, (f64, usize)>,
    mappings: Vec<(&'a str, &'a crate::judge::bank::Consumer, bool)>,
}
impl<'a, 'p> PlanComposer<'a, 'p> {
    pub fn new(plan: DecisionPlan, policy: &'p dyn Decider) -> Result<Self> {
        plan.validate(&plan.snapshot_digest, &plan.configuration_digest)?;
        Ok(Self {
            policy,
            plan,
            additions: BTreeMap::new(),
            constituents: Vec::new(),
            ranking: BTreeMap::new(),
            mappings: Vec::new(),
        })
    }
    pub fn compose(
        mut self,
        batches: &'a [Batch],
        outcomes: &'a BTreeMap<String, Outcome>,
    ) -> Result<Assessment<'a>> {
        for batch in batches {
            self.include(batch, outcomes.get(batch.digest()))?;
        }
        self.finish()
    }
    fn include(&mut self, batch: &'a Batch, outcome: Option<&'a Outcome>) -> Result<()> {
        if batch.source_digest() != self.plan.snapshot_digest {
            return Err(Error::Stale);
        }
        let recorded = validated_record(batch, outcome)?;
        for (id, pair) in batch.pairs() {
            self.mappings.push((
                id,
                &pair.definition.consumer,
                pair.definition.finding_polarity,
            ));
            let answer = recorded.map(|(record, _)| &record.response.answers[id]);
            let effect = self.policy.decide(batch.engine(), pair, answer)?;
            let selected_node = effect
                .action
                .map(|action| self.add(id, action))
                .transpose()?;
            if let Some(score) = effect.rank {
                let entry = self.ranking.entry(&pair.candidate_id).or_default();
                entry.0 += score;
                entry.1 += 1;
            }
            self.constituents.push(Constituent {
                pair_id: id,
                input_id: &pair.input_id,
                question_id: &pair.definition.id,
                source_clause: &pair.definition.source_clause,
                batch_digest: batch.digest(),
                run_id: recorded.map(|(record, _)| record.run_id.as_str()),
                answer,
                disposition: effect.disposition,
                replayed: recorded.is_some_and(|(_, replayed)| replayed),
                selected_node,
            });
        }
        Ok(())
    }
    fn add(&mut self, pair_id: &str, action: crate::core::plan::CompiledAction) -> Result<String> {
        let id = format!("{NODE_PREFIX}{pair_id}");
        if self.plan.nodes.iter().any(|node| node.id == id) || self.additions.contains_key(&id) {
            return Err(Error::Invalid("duplicate semantic plan node".into()));
        }
        self.additions.insert(
            id.clone(),
            PlanNode {
                id: id.clone(),
                required: false,
                dependencies: BTreeSet::from([SNAPSHOT_CHECK.into(), PAYLOAD_CHECK.into()]),
                action,
            },
        );
        Ok(id)
    }
    fn finish(mut self) -> Result<Assessment<'a>> {
        self.constituents
            .sort_by(|a, b| (a.pair_id, a.batch_digest).cmp(&(b.pair_id, b.batch_digest)));
        let mut ranked_candidates: Vec<_> = self
            .ranking
            .into_iter()
            .map(|(id, (score, count))| (id, score / count as f64))
            .collect();
        ranked_candidates.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(b.0)));
        self.plan.nodes.extend(self.additions.into_values());
        self.mappings.sort_by_key(|(id, _, _)| *id);
        self.plan.policy_digest = ContentDigest::identity(&(
            &self.plan.policy_digest,
            self.policy.digest()?,
            &self.mappings,
        ))?;
        let inference: Vec<_> = self
            .constituents
            .iter()
            .map(|item| {
                (
                    item.batch_digest,
                    item.pair_id,
                    item.answer,
                    &item.disposition,
                    &item.selected_node,
                )
            })
            .collect();
        // Operational run/replay metadata cannot change a reproducible decision plan.
        self.plan.decisions_digest = ContentDigest::identity(&(&inference, &ranked_candidates))?;
        self.plan.digest = self.plan.compute_digest()?;
        self.plan
            .validate(&self.plan.snapshot_digest, &self.plan.configuration_digest)?;
        Ok(Assessment {
            plan: self.plan,
            constituents: self.constituents,
            ranked_candidates,
        })
    }
}
fn validated_record<'a>(
    batch: &Batch,
    outcome: Option<&'a Outcome>,
) -> Result<Option<(&'a Record, bool)>> {
    let Some(Outcome::Recorded { record, replayed }) = outcome else {
        return Ok(None);
    };
    record.validate(batch)?;
    Ok(Some((record, *replayed)))
}
