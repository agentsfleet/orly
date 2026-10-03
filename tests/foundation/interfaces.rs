use crate::support::Repository;
use orly::{
    Result,
    checks::{Check, UnavailableChecks},
    core::{
        constants::{ENGINE_VERSION, UNAVAILABLE_CODE, WIRE_VERSION},
        evidence::{CriterionResult, EvidencePacket},
        packs::DataPack,
        payload::NativeRegistry,
        plan::DecisionPlan,
        snapshot::{SnapshotIdentity, SourceKind},
    },
    coverage::{Coverage, CoverageManifest, UnavailableCoverage},
    judge::{Judge, JudgeResult, UnavailableJudge},
    rules::{DeliveryRecord, Rules, UnavailableRules},
};
use orly_decision::{Answer, DecisionEnvelope, Question};
use orly_fs::filesystem::FileState;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::{collections::BTreeSet, fs, path::Path};

const INTERFACES: &[u8] = include_bytes!("../../fixtures/port/interfaces.json");

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct InterfaceFixture {
    snapshot: SnapshotIdentity,
    sources: Vec<SourceKind>,
    file_states: Vec<FileState>,
    results: Vec<CriterionResult>,
    evidence: EvidencePacket,
    questions: Vec<Question>,
    decisions: Vec<DecisionEnvelope>,
    pack: DataPack,
    plan: DecisionPlan,
    coverage: CoverageManifest,
    delivery: DeliveryRecord,
    registry: NativeRegistry,
}

impl InterfaceFixture {
    fn read() -> Result<Self> {
        Ok(serde_json::from_slice(INTERFACES)?)
    }

    fn validate(&self) -> Result<()> {
        assert_eq!(self.sources.len(), 4);
        assert_eq!(self.file_states.len(), 3);
        assert_eq!(self.results.len(), 5);
        assert_eq!(self.questions.len(), 3);
        assert_eq!(self.snapshot.engine, ENGINE_VERSION);
        assert_eq!(self.evidence.engine, ENGINE_VERSION);
        for version in [
            self.evidence.version,
            self.plan.version,
            self.coverage.version,
            self.delivery.version,
        ] {
            assert_eq!(version, WIRE_VERSION);
        }
        assert_eq!(self.questions.len(), self.decisions.len());
        for (question, decision) in self.questions.iter().zip(&self.decisions) {
            decision.validate(question, &self.plan.snapshot_digest)?;
        }
        self.pack.validate(&BTreeSet::new())?;
        self.plan
            .validate(&self.evidence.snapshot_digest, &self.evidence.config_digest)?;
        assert_eq!(self.evidence.exit_code(), 0);
        Ok(())
    }

    fn rejects_extra_field<T: Serialize + DeserializeOwned>(value: &T) -> Result<()> {
        let mut object = serde_json::to_value(value)?;
        object["unrecognized_extension"] = true.into();
        assert!(
            serde_json::from_value::<T>(object).is_err(),
            "{} accepted an unknown field",
            std::any::type_name::<T>()
        );
        Ok(())
    }
}

#[test]
fn frozen_interfaces_round_trip_without_wire_changes() -> Result<()> {
    let fixture = InterfaceFixture::read()?;
    assert_eq!(fixture.plan.digest, fixture.plan.compute_digest()?);
    fixture.validate()?;
    assert_eq!(
        serde_json::to_value(fixture)?,
        serde_json::from_slice::<serde_json::Value>(INTERFACES)?
    );
    Ok(())
}

#[test]
fn frozen_interfaces_refuse_unknown_fields_and_source_kinds() -> Result<()> {
    let fixture = InterfaceFixture::read()?;
    InterfaceFixture::rejects_extra_field(&fixture)?;
    InterfaceFixture::rejects_extra_field(&fixture.snapshot)?;
    InterfaceFixture::rejects_extra_field(&fixture.evidence)?;
    InterfaceFixture::rejects_extra_field(&fixture.pack)?;
    InterfaceFixture::rejects_extra_field(&fixture.plan)?;
    InterfaceFixture::rejects_extra_field(&fixture.coverage)?;
    InterfaceFixture::rejects_extra_field(&fixture.delivery)?;
    InterfaceFixture::rejects_extra_field(&fixture.registry)?;
    for invocation in fixture.evidence.invocations.values() {
        InterfaceFixture::rejects_extra_field(invocation)?;
    }
    for result in &fixture.results {
        InterfaceFixture::rejects_extra_field(result)?;
    }
    for state in &fixture.file_states {
        InterfaceFixture::rejects_extra_field(state)?;
    }
    for (question, decision) in fixture.questions.iter().zip(&fixture.decisions) {
        InterfaceFixture::rejects_extra_field(question)?;
        InterfaceFixture::rejects_extra_field(&question.primitive)?;
        InterfaceFixture::rejects_extra_field(decision)?;
        InterfaceFixture::rejects_extra_field(&decision.answer)?;
    }
    for source in &fixture.sources {
        InterfaceFixture::rejects_extra_field(source)?;
        let mut invalid = serde_json::to_value(source)?;
        invalid["kind"] = "unrecognized_source".into();
        assert!(serde_json::from_value::<SourceKind>(invalid).is_err());
    }
    Ok(())
}

#[test]
fn frozen_decisions_refuse_invalid_probabilities_and_stale_inputs() -> Result<()> {
    let fixture = InterfaceFixture::read()?;
    for (question, decision) in fixture.questions.iter().zip(&fixture.decisions) {
        let mut invalid = decision.clone();
        let probabilities = match &mut invalid.answer {
            Answer::Choice { probabilities } | Answer::Noul { probabilities } => probabilities,
            Answer::Score { distributions } => distributions.values_mut().next().unwrap(),
        };
        *probabilities.values_mut().next().unwrap() = 2.0;
        assert!(matches!(
            invalid.validate(question, &decision.input_digest),
            Err(orly_decision::Error::Invalid(_))
        ));
        assert!(matches!(
            decision.validate(question, "changed-input"),
            Err(orly_decision::Error::Stale)
        ));
    }
    Ok(())
}

#[test]
fn published_shared_schemas_match_their_rust_types() -> Result<()> {
    let schemas = [
        (
            "native-config",
            schemars::schema_for!(orly::core::config::Configuration),
        ),
        ("native-registry", schemars::schema_for!(NativeRegistry)),
        ("decision-plan", schemars::schema_for!(DecisionPlan)),
        ("question", schemars::schema_for!(Question)),
        ("pack", schemars::schema_for!(DataPack)),
        ("gate-evidence", schemars::schema_for!(EvidencePacket)),
        ("coverage-manifest", schemars::schema_for!(CoverageManifest)),
        ("delivery", schemars::schema_for!(DeliveryRecord)),
    ];
    for (name, schema) in schemas {
        let path =
            Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("schemas/{name}.schema.json"));
        let published: serde_json::Value = serde_json::from_slice(&fs::read(&path)?)?;
        assert_eq!(
            published,
            serde_json::to_value(schema)?,
            "{}",
            path.display()
        );
    }
    Ok(())
}

#[test]
fn test_shared_interfaces_compile_without_features() -> Result<()> {
    let repository = Repository::new()?;
    let context = repository.context(Repository::command(&["/usr/bin/true"]))?;
    let check: &dyn Check = &UnavailableChecks;
    let coverage: &dyn Coverage = &UnavailableCoverage;
    let rules: &dyn Rules = &UnavailableRules;
    let judge: &dyn Judge = &UnavailableJudge;
    assert_eq!(
        check.evaluate(&context)?,
        CriterionResult::failed(UNAVAILABLE_CODE)
    );
    assert_eq!(
        coverage.collect(&context)?.result,
        CriterionResult::failed(UNAVAILABLE_CODE)
    );
    assert_eq!(
        rules.deliver(&context)?.compliance,
        CriterionResult::reported(UNAVAILABLE_CODE)
    );
    let question = Question {
        primitive: orly_decision::Primitive::Choice {},
        id: "example.question".into(),
        version: "1.0.0".into(),
        builder: "example.files".into(),
        builder_version: "1.0.0".into(),
        model_version: "fixture".into(),
        candidates: vec!["a".into()],
        rule_section: "docs/rules.md".into(),
    };
    assert!(
        matches!(judge.evaluate(&context,&question)?,JudgeResult::Unavailable {reason} if reason == UNAVAILABLE_CODE)
    );
    Ok(())
}

#[test]
fn validated_configuration_preserves_wire_identity_and_refuses_invalid_inputs() -> Result<()> {
    let mut wire = Repository::configuration(Repository::command(&["/usr/bin/true"]))?;
    let expected = serde_json::to_value(&wire)?;
    let validated = orly::core::config::ValidatedConfiguration::try_from(wire.clone())?;
    wire.commands.clear();
    assert_eq!(serde_json::to_value(&validated)?, expected);
    assert!(validated.commands.contains_key("conform"));
    assert!(matches!(
        orly::core::config::ValidatedConfiguration::try_from(wire),
        Err(orly::Error::Invalid(_))
    ));
    Ok(())
}

#[test]
fn test_evidence_states_and_reproducible_projection() -> Result<()> {
    let mut evidence = EvidencePacket::new("snapshot".into(), "configuration".into());
    let original = CriterionResult::failed("required_evidence_missing");
    evidence.required.insert("failed".into());
    evidence.results.insert(
        "not_applicable".into(),
        CriterionResult::Skipped {
            reason: "no_spec".into(),
        },
    );
    evidence.results.insert(
        "surfaces".into(),
        CriterionResult::reported("surfaces_absent"),
    );
    evidence
        .results
        .insert("failed".into(), original.to_owned());
    assert_eq!(evidence.exit_code(), 1);
    evidence.results.insert(
        "failed".into(),
        CriterionResult::Overridden {
            reason: "user_override".into(),
            original: Box::new(original),
            invocation: "recorded".into(),
        },
    );
    assert_eq!(evidence.exit_code(), 0);
    let serialized = serde_json::to_string(&evidence)?;
    assert!(!serialized.contains("duration") && !serialized.contains("timestamp"));
    assert!(serialized.contains("required_evidence_missing"));
    assert_eq!(serialized, serde_json::to_string(&evidence)?);
    Ok(())
}
