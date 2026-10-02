use super::*;

const STRUCTURAL_DEPENDENCY: &str = "plan contains an unresolved structural dependency";

pub(super) struct BatchSchedule<'a, 'p> {
    executor: &'a PlanExecutor<'a>,
    nodes: BTreeMap<&'p str, &'p PlanNode>,
    pending: BTreeMap<&'p str, usize>,
    dependents: BTreeMap<&'p str, Vec<&'p str>>,
    ready: BTreeSet<&'p str>,
    waiters: BTreeMap<&'a ResourceId, BTreeSet<&'p str>>,
    awakened: BTreeMap<&'p str, &'a ResourceId>,
}

impl<'a, 'p> BatchSchedule<'a, 'p> {
    pub(super) fn new(
        executor: &'a PlanExecutor<'a>,
        plan: &'p DecisionPlan,
        observe: &mut impl FnMut(&str),
    ) -> Result<Self> {
        let nodes: BTreeMap<_, _> = plan
            .nodes
            .iter()
            .map(|node| (node.id.as_str(), node))
            .collect();
        if nodes.len() != plan.nodes.len() || nodes.contains_key("") {
            return Err(Error::Invalid(INVALID_PLAN_NODE.into()));
        }
        let mut state = Self {
            executor,
            nodes,
            pending: BTreeMap::new(),
            dependents: BTreeMap::new(),
            ready: BTreeSet::new(),
            waiters: BTreeMap::new(),
            awakened: BTreeMap::new(),
        };
        for (&id, node) in &state.nodes {
            observe(id);
            state.pending.insert(id, node.dependencies.len());
            if node.dependencies.is_empty() {
                state.ready.insert(id);
            }
            for dependency in &node.dependencies {
                observe(id);
                if !state.nodes.contains_key(dependency.as_str()) {
                    return Err(Error::Invalid(UNKNOWN_PLAN_DEPENDENCY.into()));
                }
                state
                    .dependents
                    .entry(dependency.as_str())
                    .or_default()
                    .push(id);
            }
        }
        Ok(state)
    }

    pub(super) fn run(mut self, observe: &mut impl FnMut(&str)) -> Result<Vec<Vec<&'p str>>> {
        let mut batches = Vec::new();
        while !self.pending.is_empty() {
            let (batch, claims) = self.select_batch(observe)?;
            for &id in &batch {
                self.complete(id, observe);
            }
            for resource in claims {
                self.wake(resource);
            }
            batches.push(batch);
        }
        Ok(batches)
    }

    fn select_batch(
        &mut self,
        observe: &mut impl FnMut(&str),
    ) -> Result<(Vec<&'p str>, BTreeSet<&'a ResourceId>)> {
        let mut claims = BTreeSet::new();
        let mut batch = Vec::new();
        while batch.len() < MAX_COMMAND_PARALLELISM {
            let Some(id) = self.ready.pop_first() else {
                break;
            };
            observe(id);
            let origin = self.awakened.remove(id);
            let resources = self.executor.resources(self.nodes[id])?;
            if let Some(resource) = resources
                .into_iter()
                .flatten()
                .find(|resource| claims.contains(resource))
            {
                self.waiters.entry(resource).or_default().insert(id);
                if let Some(origin) = origin
                    && !claims.contains(origin)
                {
                    self.wake(origin);
                }
                continue;
            }
            claims.extend(resources.into_iter().flatten());
            batch.push(id);
        }
        if batch.is_empty() {
            return Err(Error::Invalid(STRUCTURAL_DEPENDENCY.into()));
        }
        Ok((batch, claims))
    }

    fn wake(&mut self, resource: &'a ResourceId) {
        if let Some(waiters) = self.waiters.get_mut(resource)
            && let Some(id) = waiters.pop_first()
        {
            self.ready.insert(id);
            self.awakened.insert(id, resource);
        }
    }

    fn complete(&mut self, id: &'p str, observe: &mut impl FnMut(&str)) {
        self.pending.remove(id);
        if let Some(dependents) = self.dependents.get(id) {
            for &dependent in dependents {
                observe(dependent);
                let pending = self
                    .pending
                    .get_mut(dependent)
                    .expect("dependents remain pending until every prerequisite completes");
                *pending -= 1;
                if *pending == 0 {
                    self.ready.insert(dependent);
                }
            }
        }
    }
}
