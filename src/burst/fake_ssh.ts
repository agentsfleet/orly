// A stand-in for `ssh`, for the cloud tests. Each machine is a directory under
// FAKE_SSH_STATE named by its address. It stores the staged bundle, records
// the job script it was handed on standard input, plays the job a line at a
// time, answers the results request, and records every call's arguments.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// dropAddresses: the machines, by address or instance identifier, whose session drops.
// unreachable: no machine's SSH answers, as when a security group stops admitting the caller.
type Scenario = { exits?: Record<string, number | "drop">; sleepMs?: number; dropAddresses?: string[]; unreachable?: boolean };

const RESULTS_MARKER = 'tar -czf - "$@"';
const NO_RESULTS = 3;
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
  if (command === "true") {
    if (!scenario.unreachable) return 0;
    process.stderr.write(`ssh: connect to host ${address} port 22: Operation timed out\n`);
    return 255;
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
  if (command === "bash -s" || command === "sudo -n bash -s") {
    const script = await Bun.stdin.text();
    return script.includes(RESULTS_MARKER) ? results() : job(script);
  }
  process.stderr.write(`fake ssh: unsupported ${command}\n`);
  return 2;
}

async function job(script: string): Promise<number> {
  writeFileSync(join(node, "job.sh"), script);
  const value = (name: string) => script.match(new RegExp(`^BURST_${name}='([^']*)'`, "m"))?.[1] ?? "";
  const lane = value("LANE");
  for (const line of ["== packages", `lane ${lane} ran`]) {
    process.stdout.write(`${line}\n`);
    await Bun.sleep(scenario.sleepMs ?? 5);
  }
  if (value("MODE") === "lane") {
    const directory = join(node, "work");
    mkdirSync(join(directory, "report"), { recursive: true });
    writeFileSync(join(directory, "report", "summary.txt"), `lane ${lane} results\n`);
    Bun.spawnSync(["tar", "-czf", join(node, "results.tar.gz"), "-C", directory, "report"]);
  }
  if (scenario.dropAddresses?.includes(address)) return 255;
  const outcome = scenario.exits?.[lane] ?? 0;
  return outcome === "drop" ? 255 : outcome;
}

function results(): number {
  if (!existsSync(join(node, "results.tar.gz"))) return NO_RESULTS;
  process.stdout.write(readFileSync(join(node, "results.tar.gz")));
  return 0;
}
