// A stand-in for `ssh`, for the cloud tests. Each machine is a directory under
// FAKE_SSH_STATE named by its tailnet address. It stores the staged bundle,
// records the job script it was launched with, plays that job detached a line
// at a time into its log, follows the log from the offset it is asked for,
// answers the exit code and the results request, and records every call's
// arguments.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { leaveTailnet } from "./fake_tailscale";

// unreachable: no machine's SSH answers. warmCommit: the commit every
// machine's warm checkout holds; unset, machines are cold. drops: how many
// sessions following a lane's log are cut after its first line. lost: lanes
// whose machine never answers again once a session was cut.
type Scenario = { exits?: Record<string, number>; sleepMs?: number; unreachable?: boolean; warmCommit?: string; drops?: Record<string, number>; lost?: string[] };

const RESULTS_MARKER = 'tar -czf - "$@"';
const NO_RESULTS = 3;
const NO_JOB = 3;
const SSH_LOST = 255;
const FOLLOW_POLL_MS = 5;
const state = process.env.FAKE_SSH_STATE ?? "";
const argv = Bun.argv.slice(2);
appendFileSync(join(state, "calls.jsonl"), `${JSON.stringify(["ssh", ...argv])}\n`);
const command = argv.at(-1) ?? "";
const address = argv.find((argument) => argument.includes("@"))?.split("@")[1] ?? "unknown";
const node = join(state, address);
mkdirSync(node, { recursive: true });
const scenario: Scenario = existsSync(join(state, "scenario.json")) ? JSON.parse(readFileSync(join(state, "scenario.json"), "utf8")) : {};
process.exit(await dispatch());

async function dispatch(): Promise<number> {
  if (existsSync(join(node, "gone"))) return lostConnection();
  if (command === "true") return scenario.unreachable ? lostConnection() : 0;
  if (command.endsWith("rev-parse --verify --quiet HEAD")) {
    if (!scenario.warmCommit) return 128;
    process.stdout.write(`${scenario.warmCommit}\n`);
    return 0;
  }
  if (command === "cat > /tmp/orly-burst.bundle") {
    writeFileSync(join(node, "repo.bundle"), Buffer.from(await Bun.stdin.arrayBuffer()));
    return 0;
  }
  const input = command.match(/^rm -rf \/tmp\/orly-burst-inputs\/(\w+) && mkdir -p \/tmp\/orly-burst-inputs\/\1 && tar -xzf - -C \/tmp\/orly-burst-inputs\/\1$/)?.[1];
  if (input) {
    writeFileSync(join(node, `input-${input}.tgz`), Buffer.from(await Bun.stdin.arrayBuffer()));
    return 0;
  }
  if (command.includes("mkdir /run/orly-burst/launched")) return launch(await Bun.stdin.text());
  const offset = command.match(/tail -c \+(\d+)/)?.[1];
  if (offset) return follow(Number(offset) - 1);
  if (command.endsWith("cat /run/orly-burst/exit")) return exitCode();
  if (command.includes("tailscale logout")) {
    leaveTailnet(state, address);
    return 0;
  }
  if (command === "bash -s" || command === "sudo -n bash -s") {
    const script = await Bun.stdin.text();
    if (script.includes(RESULTS_MARKER)) return results();
  }
  process.stderr.write(`fake ssh: unsupported ${command}\n`);
  return 2;
}

// The job runs detached, as the launcher starts it: it outlives this session
// and every later one, writing its log and then its exit code.
function launch(script: string): number {
  if (existsSync(join(node, "launched"))) return 0;
  writeFileSync(join(node, "launched"), "");
  writeFileSync(join(node, "job.sh"), script);
  const value = (name: string) => script.match(new RegExp(`^BURST_${name}='([^']*)'`, "m"))?.[1] ?? "";
  const lane = value("LANE");
  if (value("MODE") === "lane") {
    const directory = join(node, "work");
    mkdirSync(join(directory, "report"), { recursive: true });
    writeFileSync(join(directory, "report", "summary.txt"), `lane ${lane} results\n`);
    Bun.spawnSync(["tar", "-czf", join(node, "results.tar.gz"), "-C", directory, "report"]);
  }
  const pause = `sleep ${(scenario.sleepMs ?? 5) / 1000}`;
  const play = [
    ...["== packages", `lane ${lane} ran`].map((line) => `printf '%s\\n' '${line}' >> run.log; ${pause}`),
    `echo ${scenario.exits?.[lane] ?? 0} > exit.part && mv exit.part exit`,
  ].join("; ");
  Bun.spawn(["sh", "-c", play], { cwd: node, detached: true, stdin: "ignore", stdout: "ignore", stderr: "ignore" }).unref();
  return 0;
}

// The log from `offset` until the job has written its exit code. A session
// the scenario cuts ends with ssh's own code after the log's first line.
async function follow(offset: number): Promise<number> {
  if (!existsSync(join(node, "launched"))) return NO_JOB;
  const lane = readFileSync(join(node, "job.sh"), "utf8").match(/^BURST_LANE='([^']*)'/m)?.[1] ?? "";
  const dropped = existsSync(join(node, "drops")) ? Number(readFileSync(join(node, "drops"), "utf8")) : 0;
  const cut = dropped < (scenario.drops?.[lane] ?? 0);
  let sent = offset;
  for (;;) {
    const finished = existsSync(join(node, "exit"));
    const log = existsSync(join(node, "run.log")) ? readFileSync(join(node, "run.log")) : Buffer.alloc(0);
    if (log.length > sent) {
      const end = cut ? log.indexOf("\n", sent) + 1 || log.length : log.length;
      process.stdout.write(log.subarray(sent, end));
      sent = end;
      if (cut) {
        writeFileSync(join(node, "drops"), String(dropped + 1));
        if (scenario.lost?.includes(lane)) writeFileSync(join(node, "gone"), "");
        return lostConnection();
      }
    } else if (finished) return 0;
    await Bun.sleep(FOLLOW_POLL_MS);
  }
}

function exitCode(): number {
  if (!existsSync(join(node, "exit"))) return 1;
  process.stdout.write(readFileSync(join(node, "exit")));
  return 0;
}

function results(): number {
  if (!existsSync(join(node, "results.tar.gz"))) return NO_RESULTS;
  process.stdout.write(readFileSync(join(node, "results.tar.gz")));
  return 0;
}

function lostConnection(): number {
  process.stderr.write(`ssh: connect to host ${address} port 22: Operation timed out\n`);
  return SSH_LOST;
}
