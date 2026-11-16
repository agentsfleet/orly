import type { RepoConfig } from "./config";
import type { BurstSettings, Environment } from "./burst_settings";
import type { Io, LaneResult, Status } from "./burst_types";

import { streamProcess } from "./burst_process";
import { resolveSecrets } from "./burst_secrets";

export type HereRequest = Io & { root: string; config: RepoConfig; settings: BurstSettings };

// Credentials setup and warm never see: the 1Password token and the cloud
// credentials `orly burst` itself reads, which a CI job sets on the same step.
const LAUNCHER_CREDENTIALS = ["OP_SERVICE_ACCOUNT_TOKEN", "E2E_API_KEY", "E2E_AUTH_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN"];
const MINUTE_MS = 60_000;
const LANE_PREFIX = "burst.";
// A lane is a CI run whether or not the caller says so, which is what makes
// test runners write their reports; the caller's own CI value wins.
const LANE_DEFAULTS = Object.freeze({ CI: "1" });

// `--provider here`: this machine is the burst machine, which is how a CI job
// runs a lane itself. Setup runs without any secret, the 1Password token or a
// cloud credential, so a dependency install cannot read one. Secrets are
// resolved after it, into the lanes' process environment only; a lane here
// keeps the rest of the caller's environment.
export async function hereLanes(request: HereRequest, lanes: string[]): Promise<LaneResult[]> {
  const deadline = Date.now() + request.settings.deadlineMs;
  const burst = request.config.burst ?? {};
  const setup = await runAll(request, burst.setup ?? [], withoutSecrets(request.settings.env, request.config), deadline);
  if (setup !== 0) return refuse(request, lanes, `burst.setup did not finish: exit=${setup}`);
  let secrets: Environment;
  try {
    secrets = await resolveSecrets(burst.secrets ?? {}, request.settings.env);
  } catch (error) {
    return refuse(request, lanes, error instanceof Error ? error.message : String(error));
  }
  const results: LaneResult[] = [];
  for (const lane of lanes) {
    const started = Date.now();
    const status = await runAll(request, request.config.commands[`${LANE_PREFIX}${lane}`] ?? [], { ...LANE_DEFAULTS, ...request.settings.env, ...secrets }, deadline);
    results.push(hereResult(request, lane, status, started));
  }
  return results;
}

// What a snapshot keeps: setup, then warm, with no secret and no token in the
// environment of either, because everything they write lands in the image.
export async function hereWarm(request: HereRequest): Promise<Status> {
  const deadline = Date.now() + request.settings.deadlineMs;
  const burst = request.config.burst ?? {};
  const quiet = withoutSecrets(request.settings.env, request.config);
  const setup = await runAll(request, burst.setup ?? [], quiet, deadline);
  return setup === 0 ? runAll(request, burst.warm ?? [], quiet, deadline) : setup;
}

function withoutSecrets(env: Environment, config: RepoConfig): Environment {
  const names = new Set([...LAUNCHER_CREDENTIALS, ...Object.keys(config.burst?.secrets ?? {})]);
  return Object.fromEntries(Object.entries(env).filter(([name]) => !names.has(name)));
}

async function runAll(request: HereRequest, invocations: string[][], env: Environment, deadline: number): Promise<Status> {
  for (const argv of invocations) {
    request.write(`== ${argv.join(" ")}`);
    let status: Status;
    try {
      const outcome = await streamProcess(argv, { env, cwd: request.root, lines: request.write, deadline, signal: request.signal });
      status = "code" in outcome ? outcome.code : outcome.stopped;
    } catch (error) {
      request.write(`orly burst: ${error instanceof Error ? error.message : String(error)}`);
      status = "not_run";
    }
    if (status !== 0) return status;
  }
  return 0;
}

function refuse(request: HereRequest, lanes: string[], reason: string): LaneResult[] {
  request.write(`orly burst: ${reason}; no lane ran`);
  return lanes.map((lane) => hereResult(request, lane, "not_run", Date.now()));
}

function hereResult(request: HereRequest, lane: string, status: Status, started: number): LaneResult {
  return { lane, provider: "here", machine: "local", minutes: Math.ceil((Date.now() - started) / MINUTE_MS), cost: "none", status, evidence: request.root };
}
