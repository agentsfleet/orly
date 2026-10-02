use super::*;
use crate::core::constants::{MAX_PLAN_NODES, WIRE_VERSION};

const INVALID_PLAN_LIMIT: &str = "plan version or node budget invalid";
const MISSING_SAFETY_CHECK: &str = "required core safety check is missing or changed";
const MISSING_SAFETY_DEPENDENCY: &str = "planned node must depend on core safety checks";

impl DecisionPlan {
    pub(super) fn validate_structure(&self) -> Result<()> {
        if self.version != WIRE_VERSION || self.nodes.len() > MAX_PLAN_NODES + SAFETY_CHECKS.len() {
            return Err(Error::Invalid(INVALID_PLAN_LIMIT.into()));
        }
        let mut graph = petgraph::graph::DiGraph::new();
        let mut indices = BTreeMap::new();
        for node in &self.nodes {
            if node.id.is_empty()
                || indices
                    .insert(node.id.as_str(), graph.add_node(node))
                    .is_some()
            {
                return Err(Error::Invalid(INVALID_PLAN_NODE.into()));
            }
        }
        for identity in SAFETY_CHECKS {
            let node = indices
                .get(identity)
                .map(|index| graph[*index])
                .ok_or_else(|| Error::Invalid(MISSING_SAFETY_CHECK.into()))?;
            if !node.required
                || !node.dependencies.is_empty()
                || !matches!(&node.action, CompiledAction::Check {capability} if capability == identity)
            {
                return Err(Error::Invalid(MISSING_SAFETY_CHECK.into()));
            }
        }
        for node in &self.nodes {
            if !SAFETY_CHECKS.contains(&node.id.as_str())
                && SAFETY_CHECKS
                    .iter()
                    .any(|identity| !node.dependencies.contains(*identity))
            {
                return Err(Error::Invalid(MISSING_SAFETY_DEPENDENCY.into()));
            }
            for dependency in &node.dependencies {
                let source = indices
                    .get(dependency.as_str())
                    .ok_or_else(|| Error::Invalid(UNKNOWN_PLAN_DEPENDENCY.into()))?;
                graph.add_edge(*source, indices[node.id.as_str()], ());
            }
        }
        petgraph::algo::toposort(&graph, None)
            .map(|_| ())
            .map_err(|_| Error::Invalid(CYCLIC_PLAN.into()))
    }
}
