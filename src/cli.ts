#!/usr/bin/env bun
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { burst } from "./burst/index";
import { printHelp } from "./cli_help";
import { selectPacks } from "./config_discovery";
import { CONFIG_PATH, managedDrift, NOT_INSTALLED, readConfig } from "./config";
import { GateReport, isGateName, recordOverride, runGate, runGates } from "./gates";
import { agentRuntimes, defaultHomes, helperSources, missingHelpers } from "./helpers";
import { install, InstallResult } from "./install";
import { isString, messageOf, OrlyError, readJsonObject, RulesModel } from "./model";
import { appendNote } from "./note";
import { recordProof } from "./proof";
import { Renderer } from "./render";
import { verifyRuleset } from "./verify";
import { commandSetupErrors } from "./validation";
import { git } from "./git_env";

const PASS_RESULT = "pass";
const ACCEPT_DIRTY_FLAG = "--accept-dirty";
const REUSE_VERIFICATION_FLAG = "--reuse-verification";
const HELP_FLAG = "--help";
const SHORT_HELP_FLAG = "-h";
const REASON_FLAG = "--reason";
const PACKAGE_MANIFEST = "package.json";
const FORCE_FLAG = "--force";
const NO_HOOKS_FLAG = "--no-hooks";
const WITH_FLAG = "--with";
const DRY_RUN_FLAG = "--dry-run";
const JSON_FLAG = "--json";
const JSON_INDENT = 2;
const PASS_GLYPH = "🟢";
const FAIL_GLYPH = "🔴";
const PR_GATE = "pr";
const ENGINE_MARKER = "evals/install/run.sh";
const VERIFY_COMMAND = "verify";
const BURST_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
const GATE_ERRORS = {
  options: "[ORLY-GATE-001] gate accepts one name and only --accept-dirty or --reuse-verification",
  reuse: "[ORLY-GATE-002] --reuse-verification requires the named pr gate",
} as const;
const INSTALL_OPTIONS_ERROR = "[ORLY-INSTALL-001] install accepts only --force, --no-hooks, --with <PACK>, --dry-run and --json";
const TEST_FLAG = "--test";
const CONTEXT_FLAG = "--context";
const SPEC_FLAG = "--spec";
const COMMAND_SEPARATOR = "--";
const PROOF_USAGE = "[ORLY-PROOF-001] usage: orly proof <TEST_FILE> --test <NAME> -- <COMMAND>...";
const NOTE_USAGE = "[ORLY-NOTE-001] usage: orly note \"<QUOTE>\" [--context \"<TEXT>\"] [--spec <PATH>]";

const { root, arguments: commandArguments } = parseRoot(Bun.argv.slice(2));
process.exit(await execute(root, commandArguments));

async function execute(engineRoot: string, args: string[]): Promise<number> {
  try {
    return await run(await RulesModel.load(engineRoot), args);
  } catch (error) {
    const message = messageOf(error);
    console.error(`orly: ${message}`);
    return 1;
  }
}

async function run(model: RulesModel, args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (!command || command === HELP_FLAG || command === SHORT_HELP_FLAG) {
    printHelp();
    return command ? 0 : 1;
  }
  if (command === "--version" || command === "-v") return printVersion(model);
  if (command === "doctor") {
    model.validate();
    requireNoArguments(rest, "doctor checks the installed ruleset: orly doctor");
    return doctorGlobal(model);
  }
  if (command === "init") return materialise(model, rest, true);
  if (command === "update") return materialise(model, rest, false);
  if (command === VERIFY_COMMAND) return verify(model, rest);
  if (command === "gate") return gate(model, rest);
  if (command === "override") return override(rest);
  if (command === "burst") return burstCommand(rest);
  if (command === "proof") return proof(rest);
  if (command === "note") return note(model, rest);
  throw new OrlyError(`unknown command: ${command}`);
}

// Gates leave the working tree unchanged. Eligible verification records live
// privately beneath Git metadata, outside the files a branch publishes.
function gate(model: RulesModel, args: string[]): number {
  if (args.includes(HELP_FLAG) || args.includes(SHORT_HELP_FLAG)) {
    printHelp();
    return 0;
  }
  const acceptDirty = args.includes(ACCEPT_DIRTY_FLAG);
  const named = args.find((argument) => !argument.startsWith("-"));
  const unknown = args.filter((argument) => argument.startsWith("-") && ![ACCEPT_DIRTY_FLAG, REUSE_VERIFICATION_FLAG].includes(argument));
  if (unknown.length > 0 || args.filter((argument) => !argument.startsWith("-")).length > 1) throw new OrlyError(GATE_ERRORS.options);
  if (named !== undefined && !isGateName(named)) throw new OrlyError(`unknown gate: ${named} (work, verify, pr)`);
  const reuse = args.includes(REUSE_VERIFICATION_FLAG);
  if (reuse && named !== PR_GATE) throw new OrlyError(GATE_ERRORS.reuse);
  const reports = named ? [runGate(model, projectRoot(), named, acceptDirty, reuse)] : runGates(model, projectRoot(), acceptDirty);
  for (const report of reports) printGate(report);
  const allGreen = reports.every((report) => report.ok);
  if (allGreen && (named === undefined || named === PR_GATE)) console.log(`${PASS_GLYPH} PR boundary open — CHORE(close) is the next motion`);
  return allGreen ? 0 : 1;
}

// Ctrl-C and SIGTERM cancel the run instead of killing orly, so every machine
// it started is deleted before it exits.
async function burstCommand(args: string[]): Promise<number> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  for (const signal of BURST_SIGNALS) process.on(signal, cancel);
  try {
    // logging: lane logs and summary lines are the command's output.
    return await burst(args, { root: projectRoot(), env: process.env, fetch, signal: controller.signal, write: (line) => console.log(line) });
  } finally {
    for (const signal of BURST_SIGNALS) process.off(signal, cancel);
  }
}

// The agent reverts or mutates the code a new test covers; orly runs the
// command and keeps what it saw only when that test is reported failing.
function proof(args: string[]): number {
  const separator = args.indexOf(COMMAND_SEPARATOR);
  const command = separator < 0 ? [] : args.slice(separator + 1);
  const { values, positional } = options(separator < 0 ? args : args.slice(0, separator), [TEST_FLAG], PROOF_USAGE);
  const test = values.get(TEST_FLAG);
  if (positional.length !== 1 || !test || command.length === 0) throw new OrlyError(PROOF_USAGE);
  const root = projectRoot();
  const file = repositoryPath(root, positional[0] ?? "");
  const recorded = recordProof(root, file, test, command);
  console.log(`${PASS_GLYPH} fail-before proof recorded for ${file} › ${test}`);
  console.log(`   ${recorded.failing_line}`);
  console.log(`   ran ${recorded.revision.slice(0, 12)}${recorded.mutation ? " with the code changes shown by git diff HEAD" : " with its code unchanged"}`);
  return 0;
}

async function note(model: RulesModel, args: string[]): Promise<number> {
  const { values, positional } = options(args, [CONTEXT_FLAG, SPEC_FLAG], NOTE_USAGE);
  if (positional.length !== 1) throw new OrlyError(NOTE_USAGE);
  const root = projectRoot();
  const spec = values.get(SPEC_FLAG);
  const context = values.get(CONTEXT_FLAG);
  const written = await appendNote(model, root, {
    quote: positional[0] ?? "", now: new Date(),
    ...(context === undefined ? {} : { context }), ...(spec === undefined ? {} : { spec: repositoryPath(root, spec) }),
  });
  console.log(`${PASS_GLYPH} noted in ${written.spec} Discovery:\n${written.line}`);
  return 0;
}

function override(args: string[]): number {
  const criterion = args.find((argument) => !argument.startsWith("-")) ?? "";
  if (!criterion) throw new OrlyError("override requires one criterion name");
  const reason = optionalValue(args, REASON_FLAG)?.trim();
  if (!reason) throw new OrlyError(`${REASON_FLAG} is required and must not be empty — an override without a reason is not a record`);
  recordOverride(projectRoot(), criterion, reason);
  console.log(`🟡 recorded override of ${criterion} as an empty commit — it rides the branch into the PR`);
  return 0;
}

// The published manifest is the single version source — nothing in the sources
// carries a second copy that could disagree with what was installed.
async function printVersion(model: RulesModel): Promise<number> {
  console.log(await packageVersion(model));
  return 0;
}

async function packageVersion(model: RulesModel): Promise<string> {
  const manifest = await readJsonObject(join(model.root, PACKAGE_MANIFEST));
  if (!isString(manifest.version)) throw new OrlyError(`${PACKAGE_MANIFEST} carries no version string`);
  return manifest.version;
}

// Both verbs materialise the same way: the repository's own `.orly/orly.json`
// names its packs and commands, so neither asks the caller who this repo is.
async function materialise(model: RulesModel, args: string[], isInit: boolean): Promise<number> {
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === WITH_FLAG) {
      const value = args[++index];
      if (!value || value.startsWith("-")) throw new OrlyError(`${WITH_FLAG} requires a pack name`);
    } else if (!argument || ![FORCE_FLAG, NO_HOOKS_FLAG, DRY_RUN_FLAG, JSON_FLAG].includes(argument)) throw new OrlyError(INSTALL_OPTIONS_ERROR);
  }
  model.validate();
  const targetRoot = projectRoot();
  const existing = await readConfig(targetRoot);
  if (!isInit && !existing) throw new OrlyError(NOT_INSTALLED);
  const requested = optionalValues(args, WITH_FLAG);
  // --dry-run changes nothing, and recording an opt-in pack is a change. It
  // still previews as though the pack were taken, so what you see is what the
  // real run would write.
  if (args.includes(DRY_RUN_FLAG)) return preview(model, targetRoot, requested);
  // Otherwise the pack is a property of the repository, recorded before the
  // render rather than passed through it: the next `orly update` in a
  // teammate's clone selects the same set with no flag to remember.
  const result = await install(model, {
    targetRoot,
    requestedPacks: requested,
    force: args.includes(FORCE_FLAG),
    installHooks: !args.includes(NO_HOOKS_FLAG),
    orlyVersion: await packageVersion(model),
  });
  const setupErrors = result.ok ? commandSetupErrors((await readConfig(targetRoot))!.commands) : [];
  if (args.includes(JSON_FLAG)) console.log(JSON.stringify({ ...result, setupErrors }, undefined, JSON_INDENT));
  else printInstall(result, setupErrors);
  return result.ok ? 0 : 1;
}

function printInstall(result: InstallResult, setupErrors: string[]): void {
  for (const error of result.errors) console.log(`${FAIL_GLYPH} ${error.path}: ${error.message} — ${error.suggestion}`);
  if (!result.ok) return;
  console.log(`${PASS_GLYPH} ${result.written.length} written, ${result.skipped.length} already current (${result.packs.length} packs)`);
  for (const error of setupErrors) console.log(`🟠 setup incomplete: ${error}`);
  if (setupErrors.length > 0) console.log("Then run orly doctor to check the completed setup.");
}

function printGate(report: GateReport): void {
  console.log(`🔆 gate ${report.gate}`);
  for (const result of report.results) {
    const glyph = result.override ? "🟡" : result.status === "passed" ? PASS_GLYPH : result.status === "skipped" || result.status === "not_run" ? "⚪" : FAIL_GLYPH;
    console.log(`   ${glyph} ${result.name} [${result.status}]: ${result.detail}`);
  }
}

function projectRoot(): string {
  const result = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  if (result.exitCode !== 0) throw new OrlyError(`not inside a Git repository: ${process.cwd()} — run \`git init\` first`);
  return result.stdout.toString().trim();
}

async function doctorGlobal(model: RulesModel): Promise<number> {
  const homes = defaultHomes();
  const errors = [...await doctorInstall(), ...missingHelpers(helperSources(model.registry), homes)];
  if (errors.length > 0) {
    for (const error of errors) console.log(`${FAIL_GLYPH} ${error}`);
    return 1;
  }
  const runtimes = agentRuntimes(homes);
  console.log(runtimes.length === 0
    ? `${PASS_GLYPH} no agent runtime on this machine; gstack and EGM not checked`
    : `${PASS_GLYPH} gstack and EGM are installed for ${runtimes.join(" and ")}`);
  const config = await readConfig(projectRoot());
  if (!config) {
    console.log(`${FAIL_GLYPH} ${NOT_INSTALLED}`);
    return 1;
  }
  const setupErrors = commandSetupErrors(config.commands);
  for (const error of setupErrors) console.log(`${FAIL_GLYPH} setup incomplete: ${error}`);
  if (setupErrors.length > 0) return 1;
  console.log(`${PASS_GLYPH} installed rules match ${CONFIG_PATH}; work and verification commands are declared`);
  return 0;
}

// A repository with no lock was never installed into — silence, not a finding.
// One that has a lock must still match it, or the rules it claims to enforce
// are not the rules on disk. Which orly version wrote them is not checked,
// because one global orly serves repositories installed by different versions.
async function doctorInstall(): Promise<string[]> {
  const targetRoot = projectRoot();
  const config = await readConfig(targetRoot);
  return config ? managedDrift(targetRoot, config) : [];
}

// What init would write, without writing it. Replaces the `render` verb: the
// preview belongs on the command you are about to run, not beside it.
async function preview(model: RulesModel, targetRoot: string, requested: string[] = []): Promise<number> {
  const config = await readConfig(targetRoot);
  const local = { packs: selectPacks(model, targetRoot, config?.packs ?? [], new Set(config?.managed ?? [])), commands: config?.commands ?? {} };
  // selectPacks validates the requested names and unions them with what the
  // repository's own sources select — the same call the real run makes, minus
  // the write.
  const packs = requested.length > 0 ? selectPacks(model, targetRoot, [...local.packs, ...requested]) : local.packs;
  const text = await new Renderer(model).renderText(packs, local.commands);
  console.log(text);
  return 0;
}

async function verify(model: RulesModel, args: string[]): Promise<number> {
  requireEngineCheckout(model, VERIFY_COMMAND);
  requireNoArguments(args, "usage: orly verify");
  const checks = await verifyRuleset(model);
  for (const check of checks) console.log(`${check.result === PASS_RESULT ? PASS_GLYPH : FAIL_GLYPH} ${check.name}${check.detail ? `: ${check.detail}` : ""}`);
  return checks.every((check) => check.result === PASS_RESULT) ? 0 : 1;
}

// Ruleset-authoring verbs operate on the engine's own sources and, in sync's
// case, repoint this machine's agent homes at the render. From a published
// payload that render lives in a package cache, so the links would resolve into
// a directory the package manager may delete — the rules would vanish mid-
// session. The marker is a file the payload allowlist deliberately excludes and
// every checkout carries; `.git` would be wrong, since a CI job or an exported
// tree is still the engine and a package cache never is.
function requireEngineCheckout(model: RulesModel, command: string): void {
  if (existsSync(join(model.root, ENGINE_MARKER))) return;
  throw new OrlyError(`orly ${command} edits the ruleset itself and only runs in an orly checkout — from an installed package use \`orly init\`, \`orly update\`, \`orly doctor\`, or \`orly gate\``);
}

function parseRoot(args: string[]): { root: string; arguments: string[] } {
  const index = args.indexOf("--root");
  if (index < 0) return { root: resolve(import.meta.dir, ".."), arguments: args };
  const value = args[index + 1];
  if (!value) throw new OrlyError("--root requires a path");
  return { root: resolve(value), arguments: args.filter((_, position) => position !== index && position !== index + 1) };
}

// Each named flag takes one value and appears at most once; anything else
// that starts with a dash is refused with the command's usage.
function options(args: string[], flags: string[], usage: string): { values: Map<string, string>; positional: string[] } {
  const values = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const argument = args[index] ?? "";
    if (!argument.startsWith("-")) { positional.push(argument); continue; }
    const value = args[++index];
    if (!flags.includes(argument) || values.has(argument) || value === undefined || value.startsWith("-")) throw new OrlyError(usage);
    values.set(argument, value);
  }
  return { values, positional };
}

function repositoryPath(root: string, path: string): string {
  const inside = relative(realpathSync(root), resolve(realpathSync(process.cwd()), path));
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw new OrlyError(`${path} is outside this repository`);
  return inside;
}

function requireNoArguments(args: string[], usage: string): void {
  if (args.length > 0) throw new OrlyError(usage);
}

function optionalValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

// Repeatable: `--with persona.indy --with product.agentsfleet` takes both.
function optionalValues(args: string[], name: string): string[] {
  const values: string[] = [];
  for (const [index, argument] of args.entries()) {
    if (argument !== name) continue;
    const value = args[index + 1];
    if (value === undefined || value.startsWith("-")) throw new OrlyError(`${name} requires a pack name`);
    values.push(value);
  }
  return values;
}
