use crate::core::env::ProcessEnv;
use crate::core::{
    config::Configuration,
    constants::{MAX_OUTPUT_BYTES, WIRE_VERSION},
    execution::EvaluationContext,
    plan::{Action, PlanCompiler, Policy, PolicyNode},
    scheduler::PlanExecutor,
    snapshot::{GitSnapshotSource, SourceKind},
};
use crate::core::{
    document::ObjectDocument,
    packs::{DataPack, PackRegistry},
};
use crate::{Error, Result};
use orly_fs::file_input::RegularInput;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

use crate::cli::{Cli, CliOutcome, Source};
impl Cli {
    pub(crate) fn plan_or_run(
        &self,
        policy: Option<&Path>,
        decisions: Option<&Path>,
        source: &Source,
        base: Option<&str>,
        head: Option<&str>,
        run: bool,
    ) -> Result<CliOutcome> {
        let source = source.snapshot_kind(base, head)?;
        let alternate = ProcessEnv
            .get(crate::core::git::INDEX_KEY)
            .map(|value| value.into_owned());
        let (snapshot, config) =
            GitSnapshotSource::new(&self.root, source, base.unwrap_or(HEAD_REF), alternate)
                .configured()?;
        let mut context = EvaluationContext::new(snapshot, config)?;
        let registry = Self::compose_packs(&context)?;
        context.capabilities = registry.builders(context.capabilities)?;
        let mut policy = if let Some(path) = policy {
            Policy::read_json(path)?
        } else {
            Self::default_policy(&context.configuration)
        };
        policy.nodes.extend(registry.policy.nodes.iter().cloned());
        let inputs = registry.inputs(&context)?;
        let decisions = decisions
            .map(|path| {
                RegularInput::open(path, MAX_OUTPUT_BYTES)
                    .and_then(RegularInput::read)
                    .and_then(|bytes| serde_json::from_slice(&bytes).map_err(Into::into))
            })
            .transpose()?
            .unwrap_or_default();
        let plan = PlanCompiler {
            configuration: &context.configuration,
            snapshot: &context.snapshot.digest()?,
            facts: &BTreeMap::new(),
            questions: &registry.questions,
            decisions: &decisions,
            capabilities: &context.capabilities.identities(),
            pack_digests: &registry.digests,
            question_inputs: &inputs,
        }
        .compile(&policy)?;
        let (document, exit_code) = if run {
            let evidence =
                PlanExecutor::new(&context, &crate::core::runner::NativeRunner).run(&plan)?;
            let exit_code = evidence.exit_code();
            (serde_json::to_value(evidence)?, exit_code)
        } else {
            (serde_json::to_value(plan)?, 0)
        };
        Ok(CliOutcome {
            document,
            exit_code,
        })
    }
    fn compose_packs(context: &EvaluationContext) -> Result<PackRegistry> {
        let packs = context
            .configuration
            .data_packs
            .iter()
            .map(|path| {
                let file = context
                    .snapshot
                    .files()
                    .get(path)
                    .ok_or_else(|| Error::Invalid("data pack is not captured".into()))?;
                DataPack::from_json(&file.bytes)
            })
            .collect::<Result<Vec<_>>>()?;
        PackRegistry::compose(packs, &context.capabilities.identities())
    }
    fn default_policy(config: &Configuration) -> Policy {
        Policy {
            version: WIRE_VERSION,
            nodes: config
                .commands
                .keys()
                .map(|id| PolicyNode {
                    id: id.clone(),
                    dependencies: BTreeSet::new(),
                    required: true,
                    action: Action::Command {
                        command_id: id.clone(),
                    },
                })
                .collect(),
        }
    }
}

impl Source {
    fn snapshot_kind(&self, base: Option<&str>, head: Option<&str>) -> Result<SourceKind> {
        Ok(match self {
            Self::Index => SourceKind::Index {},
            Self::Head => SourceKind::Head {},
            Self::Event => SourceKind::Event {
                base: base
                    .ok_or_else(|| Error::Invalid("event base identity missing".into()))?
                    .into(),
                head: head
                    .ok_or_else(|| Error::Invalid("event head identity missing".into()))?
                    .into(),
            },
            Self::WorkingTree => SourceKind::WorkingTree {
                untracked: BTreeSet::new(),
            },
        })
    }
}
const HEAD_REF: &str = "HEAD";
