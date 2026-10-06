import { readConfigSync, type RepoConfig } from "../config";
import { OrlyError } from "../model";
import { DISABLED_MODE } from "./config";

export const CONFORM_TIER = "conform";
export const FAST_TIER = "fast";
export const ALL_TIER = "all";
const COMMANDER = "commander";
const LOCAL = "local";
const VERIFY_PREFIX = "verify.";
const UNIT = "verify.unit";
export const CONDITIONAL_LANES = ["verify.integration", "verify.memory"];
export type CommandTier = typeof CONFORM_TIER | typeof FAST_TIER | typeof ALL_TIER;

// Used by both inspection and the actual gates so their command sets agree.
export function selectedCommands(commands: RepoConfig["commands"], tier: CommandTier): string[] {
  return Object.keys(commands).filter((key) => {
    if (tier === CONFORM_TIER) return key === CONFORM_TIER;
    if (!key.startsWith(VERIFY_PREFIX)) return false;
    return tier === ALL_TIER || (key !== UNIT && !CONDITIONAL_LANES.includes(key));
  }).sort();
}

export function lifecyclePlan(root: string) {
  const config = readConfigSync(root);
  if (!config) throw new OrlyError("lifecycle inspection requires repository configuration; run orly init");
  const commands = (tier: CommandTier) => selectedCommands(config.commands, tier).map((lane) => ({
    lane, argv: config.commands[lane], location: LOCAL, conditionalOnCode: CONDITIONAL_LANES.includes(lane),
  }));
  return {
    schema_version: 1,
    remote: { mode: DISABLED_MODE, launcher: config.execution?.remote.launcher ?? null, evidence: null, launches: 0 },
    stages: [
      stage("CHORE(open)", COMMANDER, "Create the scoped stream and record the comparison revision.", "Spec, branch and workspace; commander removes the owned workspace after landing."),
      stage("PLAN", COMMANDER, "Read requirements and triggered rules; resolve scope and required evidence.", "Spec and agent context; no build prescribed."),
      stage("EXECUTE", COMMANDER, "Implement and test the current Section.", "Source and tool-owned outputs; declared tools own their cleanup."),
      { ...stage("CONFORM", "orly gate work", "Run declared conformity commands.", "Command-owned caches and outputs."), commands: commands(CONFORM_TIER) },
      { ...stage("VERIFY", "orly gate verify / orly gate pr", "Push runs fast checks; the pull-request boundary runs every verification lane.", "Test outputs and comparison workspace; commander removes its baseline workspace."), pushCommands: commands(FAST_TIER), boundaryCommands: commands(ALL_TIER) },
      stage("REVIEW", COMMANDER, "Run required adversarial review and resolve findings.", "Review receipts and bounded optional judgment replay."),
      stage("DOCUMENT", COMMANDER, "Update affected user instructions and evidence.", "Tracked documentation."),
      stage("COMMIT", "Git hooks", "Run installed work hook; push runs installed verify hook.", "Git objects; repository hooks may declare additional checks."),
      stage("CHORE(close)", "commander / orly gate pr", "Close the spec only when scope and required evidence are complete.", "Committed spec and pull-request evidence."),
      stage("LAND", COMMANDER, "After authorized merge, update the default branch and remove owned stream resources.", "Repository-specific shutdown and worktree cleanup."),
    ],
    limits: "Inspection executes no commands. Command disk usage is tool-owned and is not measured or bounded by this plan. Remote delegation is disabled and supplies no check result.",
  };
}

function stage(name: string, executor: string, work: string, resources: string) {
  return { name, executor, work, resources, location: LOCAL };
}
