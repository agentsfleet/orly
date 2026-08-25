import { open, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir, arch, platform } from "node:os";
import { dirname, join } from "node:path";
const GATE_VALUE = "gate";
export const SKILL_INVOCATION_VALUE = "skill";
const SKILL_EVENT_COMMAND = "skill-event";
const TELEMETRY_COMMAND_VALUES = ["init", "update", "doctor", GATE_VALUE, "override", SKILL_INVOCATION_VALUE] as const;
const TELEMETRY_SKILL_VALUES = ["orly-babysit-prs", "orly-spec-new", "orly-write-integration-test", "orly-write-unit-test"] as const;
const TELEMETRY_OUTCOME_VALUES = ["success", "error", "abort"] as const;
export type TelemetryConsent = "off" | "anonymous";
export type TelemetryCommand = typeof TELEMETRY_COMMAND_VALUES[number];
export type TelemetryInvocation = "direct" | "hook" | typeof SKILL_INVOCATION_VALUE | "ci" | "non-interactive";
export type TelemetryOutcome = typeof TELEMETRY_OUTCOME_VALUES[number];
export type TelemetrySkill = typeof TELEMETRY_SKILL_VALUES[number];
export type TelemetryEvent = { schema_version: number; event_id: string; timestamp: string; command: TelemetryCommand; gate?: string; skill?: TelemetrySkill; outcome: TelemetryOutcome; failed_criterion?: string; duration_ms: number; orly_version: string; os: string; arch: string; invocation: TelemetryInvocation; session_id: string; installation_id: string };
export type TelemetrySession = { stateRoot: string; command: TelemetryCommand; invocation: TelemetryInvocation; skill?: TelemetrySkill; sessionId: string; installationId: string };
export type TelemetryObservation = { gate?: string; outcome: TelemetryOutcome; failedCriterion?: string; durationMs: number; version: string };
type BeginOptions = {
  env?: Record<string, string | undefined>; home?: string; stdinIsTty?: boolean; stdoutIsTty?: boolean;
  ask?: (message: string) => string | null; randomId?: () => string;
};
type RecordOptions = { now?: () => Date; randomId?: () => string; launchSync?: () => void };
const OFF_CONSENT = "off";
const ANONYMOUS_CONSENT = "anonymous";
const DIRECT_INVOCATION = "direct";
export const HOOK_INVOCATION_ENV = "ORLY_INVOCATION";
export const HOOK_INVOCATION_VALUE = "hook";
const CI_INVOCATION = "ci";
const NON_INTERACTIVE_INVOCATION = "non-interactive";
const STATE_DIRECTORY_ENV = "AGENTSFLEET_STATE_DIR";
const CONSENT_OVERRIDE_ENV = "ORLY_TELEMETRY";
const HARD_OFF_ENV = "ORLY_TELEMETRY_OFF";
const CONFIG_DIRECTORY = ".config";
const AGENTSFLEET_DIRECTORY = "agentsfleet";
const ORLY_DIRECTORY = "orly";
const CONFIG_FILE = ".orly.json";
const PROMPT_MARKER_FILE = ".telemetry-prompted";
const INSTALLATION_ID_FILE = "installation-id";
const ANALYTICS_DIRECTORY = "analytics";
const SPOOL_FILE = "orly-usage.jsonl";
const LOCK_FILE = ".spool-lock";
const PACKAGE_MANIFEST = "package.json";
const UTF8_ENCODING = "utf8", NEWLINE = "\n", UNKNOWN_VERSION = "unknown";
const EXCLUSIVE_CREATE_MODE = "wx", IGNORE_IO = "ignore";
const SCHEMA_VERSION = 1;
const FILE_MODE = 0o600, DIRECTORY_MODE = 0o700;
const MAX_SPOOL_BYTES = 10 * 1024 * 1024, RETENTION_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000, STALE_LOCK_MILLISECONDS = 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TELEMETRY_COMMANDS: ReadonlySet<string> = new Set(TELEMETRY_COMMAND_VALUES);
const TELEMETRY_SKILLS: ReadonlySet<string> = new Set(TELEMETRY_SKILL_VALUES);
const TELEMETRY_OUTCOMES: ReadonlySet<string> = new Set(TELEMETRY_OUTCOME_VALUES);
const EVENT_KEYS = new Set([
  "schema_version", "event_id", "timestamp", "command", GATE_VALUE, "skill", "outcome", "failed_criterion", "duration_ms",
  "orly_version", "os", "arch", "invocation", "session_id", "installation_id",
]);
export const TELEMETRY_PROMPT = `Help improve Orly by sharing anonymous usage telemetry with PostHog?

If enabled, Orly records and sends only:
- command, gate, and packaged Orly skill names
- success, error, or abort outcome and the failed gate criterion
- duration, Orly version, operating system, CPU architecture, and invocation type
- timestamps and random event, session, and installation IDs
  (the installation ID persists so we can connect runs from the same Orly install)

Orly never collects or sends:
- source code, file contents, prompts, or command argument values
- file paths, working directory, repository names, or branch names
- environment variables, command output, or raw error messages
- name, email, username, hostname, account details, credentials, or tokens

1. Off — write and send no telemetry (default)
2. Anonymous — record and send only the fields listed above

Choose 1 or 2`;
export async function beginTelemetry(args: string[], options: BeginOptions = {}): Promise<TelemetrySession | undefined> {
  try {
    const subject = telemetrySubject(args);
    if (!subject) return undefined;
    const env = options.env ?? process.env;
    const stateRoot = telemetryStateRoot(env, options.home);
    const invocation = telemetryInvocation(env, options.stdinIsTty, options.stdoutIsTty);
    const persisted = await readPersistedConsent(stateRoot);
    const override = env[CONSENT_OVERRIDE_ENV];
    let consent = resolveTelemetryConsent(env, persisted);
    if (env[HARD_OFF_ENV] !== "1" && override === undefined && persisted === undefined && invocation === DIRECT_INVOCATION) {
      consent = await promptForConsent(stateRoot, options.ask);
    }
    if (consent !== ANONYMOUS_CONSENT) return undefined;
    const randomId = options.randomId ?? (() => crypto.randomUUID());
    return {
      stateRoot,
      command: subject.command,
      invocation,
      ...(subject.skill ? { skill: subject.skill } : {}),
      sessionId: randomId(),
      installationId: await installationId(stateRoot, randomId),
    };
  } catch {
    return undefined;
  }
}
export function resolveTelemetryConsent(env: Record<string, string | undefined>, persisted?: TelemetryConsent): TelemetryConsent {
  if (env[HARD_OFF_ENV] === "1") return OFF_CONSENT;
  const override = env[CONSENT_OVERRIDE_ENV];
  if (override !== undefined) return isTelemetryConsent(override) ? override : OFF_CONSENT;
  return persisted ?? OFF_CONSENT;
}
export function telemetryStateRoot(env: Record<string, string | undefined>, home = homedir()): string {
  const agentsfleetRoot = env[STATE_DIRECTORY_ENV]?.trim() || join(home, CONFIG_DIRECTORY, AGENTSFLEET_DIRECTORY);
  return join(agentsfleetRoot, ORLY_DIRECTORY);
}
export async function recordTelemetry(session: TelemetrySession | undefined, observation: TelemetryObservation, options: RecordOptions = {}): Promise<void> {
  if (!session) return;
  try {
    const now = (options.now ?? (() => new Date()))();
    const event = createTelemetryEvent(session, observation, now, options.randomId ?? (() => crypto.randomUUID()));
    const appended = await withSpoolLock(session.stateRoot, async () => {
      const events = await readTelemetrySpool(session.stateRoot, now);
      await replaceTelemetrySpool(session.stateRoot, [...events, event], now);
    });
    if (!appended) return;
    (options.launchSync ?? launchTelemetrySync)();
  } catch {
    return;
  }
}
export async function readPersistedConsent(stateRoot: string): Promise<TelemetryConsent | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(join(stateRoot, CONFIG_FILE), UTF8_ENCODING));
    if (!isObject(value) || !isTelemetryConsent(value.telemetry)) return undefined;
    return value.telemetry;
  } catch {
    return undefined;
  }
}
export async function readTelemetrySpool(stateRoot: string, now = new Date()): Promise<TelemetryEvent[]> {
  const path = telemetrySpoolPath(stateRoot);
  try {
    const details = await stat(path);
    const start = Math.max(0, details.size - MAX_SPOOL_BYTES);
    const bytes = await Bun.file(path).slice(start).text();
    const bounded = start === 0 ? bytes : bytes.slice(Math.max(0, bytes.indexOf(NEWLINE) + 1));
    const cutoff = now.getTime() - RETENTION_MILLISECONDS;
    return bounded.split(NEWLINE).flatMap((line) => {
      if (!line) return [];
      const event = parseTelemetryEvent(line);
      return event && Date.parse(event.timestamp) >= cutoff ? [event] : [];
    });
  } catch {
    return [];
  }
}
export async function replaceTelemetrySpool(stateRoot: string, events: TelemetryEvent[], now = new Date()): Promise<void> {
  const path = telemetrySpoolPath(stateRoot);
  const lines = boundedEventLines(events, now);
  await atomicWrite(path, lines.length === 0 ? "" : `${lines.join(NEWLINE)}${NEWLINE}`);
}
export async function withSpoolLock(stateRoot: string, action: () => Promise<void>): Promise<boolean> {
  const lockPath = join(stateRoot, ANALYTICS_DIRECTORY, LOCK_FILE);
  await mkdir(dirname(lockPath), { recursive: true, mode: DIRECTORY_MODE });
  const handle = await acquireLock(lockPath);
  if (!handle) return false;
  try {
    await action();
    return true;
  } finally {
    await handle.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
  }
}
export function parseTelemetryEvent(line: string): TelemetryEvent | undefined {
  try {
    const value: unknown = JSON.parse(line);
    if (!isObject(value) || Object.keys(value).some((key) => !EVENT_KEYS.has(key))) return undefined;
    if (value.schema_version !== SCHEMA_VERSION || !isUuid(value.event_id) || !isTimestamp(value.timestamp)) return undefined;
    if (!isTelemetryCommand(value.command) || !isTelemetryOutcome(value.outcome) || !isTelemetryInvocation(value.invocation)) return undefined;
    if (!isNonNegativeNumber(value.duration_ms) || !isString(value.orly_version) || !isString(value.os) || !isString(value.arch)) return undefined;
    if (!isUuid(value.session_id) || !isUuid(value.installation_id)) return undefined;
    if (!isOptionalString(value.gate) || !isOptionalString(value.failed_criterion)) return undefined;
    if (value.command === SKILL_INVOCATION_VALUE ? !isTelemetrySkill(value.skill) : value.skill !== undefined) return undefined;
    return value as TelemetryEvent;
  } catch {
    return undefined;
  }
}
export async function installedOrlyVersion(root: string): Promise<string> {
  try {
    const value: unknown = JSON.parse(await readFile(join(root, PACKAGE_MANIFEST), UTF8_ENCODING));
    return isObject(value) && isString(value.version) ? value.version : UNKNOWN_VERSION;
  } catch {
    return UNKNOWN_VERSION;
  }
}
async function promptForConsent(stateRoot: string, ask = (message: string) => prompt(message)): Promise<TelemetryConsent> {
  const marker = join(stateRoot, PROMPT_MARKER_FILE);
  if (await fileExists(marker)) return OFF_CONSENT;
  try {
    await atomicWrite(marker, "");
  } catch {
    return OFF_CONSENT;
  }
  let answer: string | null = null;
  try {
    answer = ask(TELEMETRY_PROMPT);
  } catch {
    answer = null;
  }
  const consent = answer?.trim() === "2" ? ANONYMOUS_CONSENT : OFF_CONSENT;
  try {
    await atomicWrite(join(stateRoot, CONFIG_FILE), `${JSON.stringify({ telemetry: consent })}\n`);
    return consent;
  } catch {
    return OFF_CONSENT;
  }
}
async function installationId(stateRoot: string, randomId: () => string): Promise<string> {
  const path = join(stateRoot, INSTALLATION_ID_FILE);
  try {
    const existing = (await readFile(path, UTF8_ENCODING)).trim();
    if (isUuid(existing)) return existing;
  } catch {
    // A missing or malformed identity is replaced by a random value below.
  }
  const generated = randomId();
  await atomicWrite(path, `${generated}${NEWLINE}`);
  return generated;
}
function createTelemetryEvent(session: TelemetrySession, observation: TelemetryObservation, now: Date, randomId: () => string): TelemetryEvent {
  return {
    schema_version: SCHEMA_VERSION,
    event_id: randomId(),
    timestamp: now.toISOString(),
    command: session.command,
    ...(observation.gate ? { gate: observation.gate } : {}),
    ...(session.skill ? { skill: session.skill } : {}),
    outcome: observation.outcome,
    ...(observation.failedCriterion ? { failed_criterion: observation.failedCriterion } : {}),
    duration_ms: Math.max(0, Math.round(observation.durationMs)),
    orly_version: observation.version,
    os: platform(),
    arch: arch(),
    invocation: session.invocation,
    session_id: session.sessionId,
    installation_id: session.installationId,
  };
}
function telemetrySubject(args: string[]): { command: TelemetryCommand; skill?: TelemetrySkill } | undefined {
  const command = args[0];
  if (command === SKILL_EVENT_COMMAND) {
    const skill = args[1];
    return args.length === 2 && isTelemetrySkill(skill) ? { command: SKILL_INVOCATION_VALUE, skill } : undefined;
  }
  return command && isTelemetryCommand(command) && command !== SKILL_INVOCATION_VALUE ? { command } : undefined;
}
function telemetryInvocation(env: Record<string, string | undefined>, stdinIsTty = process.stdin.isTTY === true, stdoutIsTty = process.stdout.isTTY === true): TelemetryInvocation {
  if (env[HOOK_INVOCATION_ENV] === HOOK_INVOCATION_VALUE) return HOOK_INVOCATION_VALUE;
  if (env[HOOK_INVOCATION_ENV] === SKILL_INVOCATION_VALUE) return SKILL_INVOCATION_VALUE;
  if (env.CI && env.CI !== "false" && env.CI !== "0") return CI_INVOCATION;
  return stdinIsTty && stdoutIsTty ? DIRECT_INVOCATION : NON_INTERACTIVE_INVOCATION;
}
function boundedEventLines(events: TelemetryEvent[], now: Date): string[] {
  const cutoff = now.getTime() - RETENTION_MILLISECONDS;
  const eligible = events.filter((event) => Date.parse(event.timestamp) >= cutoff).map((event) => JSON.stringify(event));
  const selected: string[] = [];
  let bytes = 0;
  for (let index = eligible.length - 1; index >= 0; index -= 1) {
    const line = eligible[index];
    if (line === undefined) continue;
    const lineBytes = Buffer.byteLength(line) + 1;
    if (bytes + lineBytes > MAX_SPOOL_BYTES) break;
    selected.unshift(line);
    bytes += lineBytes;
  }
  return selected;
}
async function acquireLock(path: string): Promise<Awaited<ReturnType<typeof open>> | undefined> {
  try {
    return await open(path, EXCLUSIVE_CREATE_MODE, FILE_MODE);
  } catch (error) {
    if (!isErrorCode(error, "EEXIST")) return undefined;
  }
  try {
    const details = await stat(path);
    if (Date.now() - details.mtimeMs <= STALE_LOCK_MILLISECONDS) return undefined;
    await unlink(path);
    return await open(path, EXCLUSIVE_CREATE_MODE, FILE_MODE);
  } catch {
    return undefined;
  }
}
async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: DIRECTORY_MODE });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { mode: FILE_MODE });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
function launchTelemetrySync(): void {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "telemetry_sync.ts")], {
    stdin: IGNORE_IO,
    stdout: IGNORE_IO,
    stderr: IGNORE_IO,
    env: process.env,
  });
  child.unref();
}
function telemetrySpoolPath(stateRoot: string): string {
  return join(stateRoot, ANALYTICS_DIRECTORY, SPOOL_FILE);
}
async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
function isTelemetryConsent(value: unknown): value is TelemetryConsent {
  return value === OFF_CONSENT || value === ANONYMOUS_CONSENT;
}
function isTelemetryCommand(value: unknown): value is TelemetryCommand {
  return isStringValue(value) && TELEMETRY_COMMANDS.has(value);
}
export function isTelemetrySkill(value: unknown): value is TelemetrySkill {
  return isStringValue(value) && TELEMETRY_SKILLS.has(value);
}
function isTelemetryOutcome(value: unknown): value is TelemetryOutcome {
  return isStringValue(value) && TELEMETRY_OUTCOMES.has(value);
}
function isTelemetryInvocation(value: unknown): value is TelemetryInvocation {
  return value === DIRECT_INVOCATION || value === HOOK_INVOCATION_VALUE || value === SKILL_INVOCATION_VALUE || value === CI_INVOCATION || value === NON_INTERACTIVE_INVOCATION;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return isStringValue(value) && value.length > 0;
}
function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}
function isTimestamp(value: unknown): value is string { return isString(value) && Number.isFinite(Date.parse(value)); }
function isNonNegativeNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function isErrorCode(error: unknown, code: string): boolean { return isObject(error) && error.code === code; }
function isUuid(value: unknown): value is string { return isStringValue(value) && UUID_PATTERN.test(value); }
function isStringValue(value: unknown): value is string { return typeof value === "string"; }
