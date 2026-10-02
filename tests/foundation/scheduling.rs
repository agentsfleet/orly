use crate::{execution_support::CountingRunner, support::Repository};
use orly::{
    Error, Result,
    core::{
        config::Configuration,
        constants::{MAX_COMMAND_PARALLELISM, WIRE_VERSION},
        execution::EvaluationContext,
        plan::{Action, DecisionPlan, PlanCompiler, Policy, PolicyNode},
        scheduler::PlanExecutor,
        snapshot::{GitSnapshotSource, SourceKind},
    },
};
use orly_fs::path::ResourceId;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::atomic::Ordering::SeqCst;

const REPEAT_SCHEDULES: usize = 5;
const PARALLEL_COMMANDS: usize = 128;
#[cfg(feature = "test-util")]
const NODE_VISIT_BUDGET: usize = 8;
#[cfg(feature = "test-util")]
const SAFETY_VISIT_BUDGET: usize = 3;

struct SchedulingFixture {
    _repository: Repository,
    context: EvaluationContext,
}
impl SchedulingFixture {
    fn new(count: usize, shared: bool) -> Result<Self> {
        let repository = Repository::new()?;
        let mut config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
        for index in 0..count {
            let mut command = Repository::command(&["/usr/bin/true", &index.to_string()]);
            if shared {
                command.resources.insert(ResourceId::new("fixture.shared")?);
            }
            config.commands.insert(format!("job-{index:04}"), command);
        }
        Self::from_config(repository, config)
    }
    fn from_config(repository: Repository, config: Configuration) -> Result<Self> {
        let snapshot =
            GitSnapshotSource::new(repository.root(), SourceKind::Index {}, "HEAD", None)
                .capture(config.digest()?)?;
        Ok(Self {
            _repository: repository,
            context: EvaluationContext::new(snapshot, config)?,
        })
    }
    fn plan(&self, count: usize, chain: bool) -> Result<DecisionPlan> {
        let nodes = (0..count)
            .map(|index| PolicyNode {
                id: format!("node-{index:04}"),
                dependencies: if chain && index > 0 {
                    BTreeSet::from([format!("node-{:04}", index - 1)])
                } else {
                    BTreeSet::new()
                },
                required: true,
                action: Action::Command {
                    command_id: format!("job-{index:04}"),
                },
            })
            .collect();
        PlanCompiler {
            configuration: &self.context.configuration,
            snapshot: &self.context.snapshot.digest()?,
            facts: &BTreeMap::new(),
            questions: &BTreeMap::new(),
            decisions: &BTreeMap::new(),
            capabilities: &BTreeSet::new(),
            pack_digests: &BTreeMap::new(),
            question_inputs: &BTreeMap::new(),
        }
        .compile(&Policy {
            version: WIRE_VERSION,
            nodes,
        })
    }
}

#[test]
fn independent_commands_execute_once_in_parallel_with_a_bounded_peak() -> Result<()> {
    let fixture = SchedulingFixture::new(PARALLEL_COMMANDS, false)?;
    let plan = fixture.plan(PARALLEL_COMMANDS, false)?;
    let runner = CountingRunner::new(MAX_COMMAND_PARALLELISM);
    for repetition in 1..=REPEAT_SCHEDULES {
        let evidence = PlanExecutor::new(&fixture.context, &runner).run(&plan)?;
        assert_eq!(evidence.exit_code(), 0);
        assert_eq!(evidence.invocations.len(), PARALLEL_COMMANDS);
        let calls = runner.calls.lock().unwrap();
        assert_eq!(calls.len(), PARALLEL_COMMANDS);
        assert!(calls.values().all(|count| *count == repetition));
    }
    assert_eq!(runner.peak.load(SeqCst), MAX_COMMAND_PARALLELISM);
    Ok(())
}

#[test]
fn shared_resources_serialize_distinct_invocations() -> Result<()> {
    let fixture = SchedulingFixture::new(MAX_COMMAND_PARALLELISM, true)?;
    let plan = fixture.plan(MAX_COMMAND_PARALLELISM, false)?;
    let runner = CountingRunner::new(1);
    let executor = PlanExecutor::new(&fixture.context, &runner);
    for batch in executor.batches(&plan)? {
        assert!(batch.iter().filter(|id| id.starts_with("node-")).count() <= 1);
    }
    let evidence = executor.run(&plan)?;
    assert_eq!(evidence.exit_code(), 0);
    assert_eq!(runner.peak.load(SeqCst), 1);
    assert_eq!(evidence.invocations.len(), MAX_COMMAND_PARALLELISM);
    Ok(())
}

#[test]
fn dependencies_finish_in_an_earlier_batch() -> Result<()> {
    let fixture = SchedulingFixture::new(MAX_COMMAND_PARALLELISM, false)?;
    let plan = fixture.plan(MAX_COMMAND_PARALLELISM, true)?;
    let runner = CountingRunner::new(1);
    let executor = PlanExecutor::new(&fixture.context, &runner);
    let mut completed = BTreeSet::new();
    for batch in executor.batches(&plan)? {
        for id in &batch {
            let node = plan.nodes.iter().find(|node| node.id == *id).unwrap();
            assert!(
                node.dependencies
                    .iter()
                    .all(|dependency| completed.contains(dependency.as_str()))
            );
        }
        completed.extend(batch);
    }
    assert_eq!(executor.run(&plan)?.exit_code(), 0);
    assert_eq!(runner.peak.load(SeqCst), 1);
    Ok(())
}

#[test]
fn identical_commands_are_deduplicated_only_within_each_run() -> Result<()> {
    let fixture = SchedulingFixture::new(2, false)?;
    let mut plan = fixture.plan(2, true)?;
    plan.nodes.last_mut().unwrap().action = plan.nodes[2].action.to_owned();
    plan.digest = plan.compute_digest()?;
    let runner = CountingRunner::new(1);
    for repetition in 1..=2 {
        let evidence = PlanExecutor::new(&fixture.context, &runner).run(&plan)?;
        assert_eq!(evidence.exit_code(), 0);
        assert_eq!(evidence.invocations.len(), 1);
        assert_eq!(
            *runner.calls.lock().unwrap().values().next().unwrap(),
            repetition
        );
    }
    Ok(())
}

#[test]
fn failed_dependencies_block_later_commands_without_running_them() -> Result<()> {
    let repository = Repository::new()?;
    let mut config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    config.commands.insert(
        "job-0000".into(),
        Repository::command(&["/usr/bin/true", "fail"]),
    );
    config.commands.insert(
        "job-0001".into(),
        Repository::command(&["/usr/bin/true", "later"]),
    );
    let fixture = SchedulingFixture::from_config(repository, config)?;
    let runner = CountingRunner::new(1);
    let evidence = PlanExecutor::new(&fixture.context, &runner).run(&fixture.plan(2, true)?)?;
    assert_eq!(evidence.exit_code(), 1);
    assert_eq!(runner.calls.lock().unwrap().len(), 1);
    assert!(
        matches!(&evidence.results["node-0001"], orly::core::evidence::CriterionResult::Failed {reason}
        if reason == orly::core::plan::DEPENDENCY_BLOCKED)
    );
    Ok(())
}

#[test]
fn unresolved_dependencies_and_unknown_commands_are_refused() -> Result<()> {
    let fixture = SchedulingFixture::new(1, false)?;
    let runner = CountingRunner::new(1);
    let executor = PlanExecutor::new(&fixture.context, &runner);
    for unknown_command in [false, true] {
        let mut plan = fixture.plan(1, false)?;
        let node = plan.nodes.last_mut().unwrap();
        if unknown_command {
            node.action = orly::core::plan::CompiledAction::Command {
                command_id: "absent".into(),
            };
        } else {
            node.dependencies.insert("absent".into());
        }
        assert!(matches!(executor.batches(&plan), Err(Error::Invalid(_))));
    }
    assert!(runner.calls.lock().unwrap().is_empty());
    Ok(())
}

#[cfg(feature = "test-util")]
#[test]
fn chain_and_shared_resource_schedules_have_a_linear_visit_budget() -> Result<()> {
    let runner = CountingRunner::new(1);
    for shared in [false, true] {
        let fixture = SchedulingFixture::new(256, shared)?;
        for count in [32, 64, 128, 256] {
            let plan = fixture.plan(count, !shared)?;
            let mut visits = 0;
            let batches = PlanExecutor::new(&fixture.context, &runner)
                .batches_observed(&plan, |_| visits += 1)?;
            assert_eq!(batches.len(), count + 1);
            let budget = NODE_VISIT_BUDGET * count + SAFETY_VISIT_BUDGET;
            assert!(
                visits <= budget,
                "nodes={count}, shared={shared}: {visits} visits exceed {budget}"
            );
            println!(
                "scheduler: nodes={count}, shared={shared}, visited={visits}, budget={budget}"
            );
        }
    }
    Ok(())
}

#[test]
fn malformed_graphs_are_rejected_without_running_commands() -> Result<()> {
    let fixture = SchedulingFixture::new(2, false)?;
    let runner = CountingRunner::new(1);
    let executor = PlanExecutor::new(&fixture.context, &runner);
    for fault in ["duplicate", "empty", "cycle"] {
        let mut plan = fixture.plan(2, true)?;
        match fault {
            "duplicate" => plan.nodes.push(plan.nodes.last().unwrap().to_owned()),
            "empty" => plan.nodes.last_mut().unwrap().id.clear(),
            "cycle" => {
                plan.nodes[2].dependencies.insert("node-0001".into());
            }
            _ => unreachable!(),
        }
        assert!(
            matches!(executor.batches(&plan), Err(Error::Invalid(_))),
            "{fault}"
        );
    }
    assert!(runner.calls.lock().unwrap().is_empty());
    Ok(())
}

#[test]
fn overlapping_resource_sets_never_share_a_batch_and_replay_in_the_same_order() -> Result<()> {
    let repository = Repository::new()?;
    let mut config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    for index in 0..12 {
        let mut command = Repository::command(&["/usr/bin/true", &index.to_string()]);
        if index % 2 == 0 {
            command.resources.insert(ResourceId::new("fixture.even")?);
        }
        if index % 3 == 0 {
            command.resources.insert(ResourceId::new("fixture.third")?);
        }
        config.commands.insert(format!("job-{index:04}"), command);
    }
    let fixture = SchedulingFixture::from_config(repository, config)?;
    let plan = fixture.plan(12, false)?;
    let runner = CountingRunner::new(1);
    let executor = PlanExecutor::new(&fixture.context, &runner);
    let batches = executor.batches(&plan)?;
    assert_eq!(batches, executor.batches(&plan)?);
    assert!(
        batches
            .iter()
            .any(|batch| batch.iter().filter(|id| id.starts_with("node-")).count() > 1)
    );
    for batch in batches {
        let mut claimed = BTreeSet::new();
        for id in batch {
            let node = plan.nodes.iter().find(|node| node.id == id).unwrap();
            if let orly::core::plan::CompiledAction::Command { command_id } = &node.action {
                for resource in &fixture.context.configuration.commands[command_id].resources {
                    assert!(
                        claimed.insert(resource),
                        "batch overlaps resource {resource:?}"
                    );
                }
            }
        }
    }
    Ok(())
}

#[test]
fn waiter_blocked_on_another_resource_releases_its_original_queue() -> Result<()> {
    let repository = Repository::new()?;
    let mut config = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    let resources = [
        ["fixture.b", ""],
        ["fixture.a", ""],
        ["fixture.a", "fixture.b"],
        ["fixture.a", ""],
    ];
    for (index, resources) in resources.into_iter().enumerate() {
        let mut command = Repository::command(&["/usr/bin/true", &index.to_string()]);
        for resource in resources
            .into_iter()
            .filter(|resource| !resource.is_empty())
        {
            command.resources.insert(ResourceId::new(resource)?);
        }
        config.commands.insert(format!("job-{index:04}"), command);
    }
    let fixture = SchedulingFixture::from_config(repository, config)?;
    let mut plan = fixture.plan(4, false)?;
    plan.nodes
        .iter_mut()
        .find(|node| node.id == "node-0000")
        .unwrap()
        .dependencies
        .insert("node-0001".into());
    plan.digest = plan.compute_digest()?;
    let runner = CountingRunner::new(1);
    let batches = PlanExecutor::new(&fixture.context, &runner).batches(&plan)?;
    assert_eq!(
        batches,
        vec![
            vec!["core.payload", "core.snapshot"],
            vec!["node-0001"],
            vec!["node-0000", "node-0003"],
            vec!["node-0002"]
        ]
    );
    Ok(())
}
