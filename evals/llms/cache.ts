import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENCODING = "utf8";
const PASS = "PASS";
const FAIL = "FAIL";
const NUMBER_TYPE = "number";
const PRIVATE_FILE_MODE = 0o600;
const CLAUDE_SETTINGS = ".claude/settings.json";

function digest(bytes: Uint8Array | string): string {
  return `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}`;
}

function runKey(root: string, prompts: string, targets: string[], threshold: number, timeout: string): string {
  const inputs = {
    prompts: readdirSync(prompts).sort().map((id) => [id, digest(readFileSync(join(prompts, id)))]),
    scripts: ["run.sh", "agents.sh", "fixtures.sh", "cache.ts"].map((script) => digest(readFileSync(join(root, "evals/llms", script)))),
    fixtures: digest(readFileSync(join(root, "evals/llms/fixtures.jsonl"))),
    targets, threshold, timeout,
    hosts: targets.map((host) => {
      const path = Bun.which(host);
      if (!path) return { host, unavailable: true };
      return { host, path, binary: digest(readFileSync(path)) };
    }),
    settings: ["ANTHROPIC_MODEL", "OPENAI_MODEL", "CODEX_MODEL", "AMP_MODEL", "OPENCODE_MODEL"].map((key) => [key, digest(process.env[key] ?? "")]),
    configuration: adapterSettings(root).map((path) => [path, existsSync(path) ? digest(readFileSync(path)) : null]),
  };
  return digest(JSON.stringify(inputs)).replace(":", "-");
}

function adapterSettings(root: string): string[] {
  const home = homedir();
  const config = process.env.XDG_CONFIG_HOME ?? join(home, ".config");
  return [
    join(home, CLAUDE_SETTINGS), join(root, CLAUDE_SETTINGS), join(root, ".claude/settings.local.json"),
    join(process.env.CODEX_HOME ?? join(home, ".codex"), "config.toml"), join(root, ".codex/config.toml"),
    join(config, "amp/settings.json"), join(config, "opencode/opencode.json"), join(config, "opencode/opencode.jsonc"),
    join(root, "opencode.json"), join(root, "opencode.jsonc"),
  ];
}

function replay(path: string, key: string, agent: string, total: number, threshold: number): string | undefined {
  if (!existsSync(path)) return undefined;
  let value;
  try { value = JSON.parse(readFileSync(path, ENCODING)); } catch { return undefined; }
  if (!value || value.key !== key || value.agent !== agent || ![PASS, FAIL].includes(value.status)) return undefined;
  if (typeof value.correct !== NUMBER_TYPE || typeof value.total !== NUMBER_TYPE || !Number.isInteger(value.correct) || value.total !== total || value.correct < 0 || value.correct > total || total < 1) return undefined;
  const expectedStatus = value.correct * 100 / total >= threshold ? PASS : FAIL;
  return value.status === expectedStatus ? `${value.status} ${value.correct} ${value.total}` : undefined;
}

const [mode, ...args] = Bun.argv.slice(2);
if (mode === "key") process.stdout.write(runKey(args[0]!, args[1]!, args[2]!.split(","), Number(args[3]), args[4]!));
else if (mode === "read") {
  const result = replay(args[0]!, args[1]!, args[2]!, Number(args[3]), Number(args[4]));
  if (result) process.stdout.write(result); else process.exitCode = 1;
} else if (mode === "write") {
  const [path, key, agent, status, correct, total] = args;
  writeFileSync(path!, JSON.stringify({ key, agent, status, correct: Number(correct), total: Number(total) }) + "\n", { mode: PRIVATE_FILE_MODE });
} else throw new Error("expected key, read or write");
