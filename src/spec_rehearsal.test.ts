import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, git, gitOutput, newRepository, orly, ROOT, temporaryDirectory } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

const REHEARSAL_BRANCH = "feat/count-summary";
const ACTIVE_SPEC = "docs/v1/active/M99_001_P2_CLI_COUNT_SUMMARY.md";
const CLOSED_SPEC = ACTIVE_SPEC.replace("/active/", "/done/");
const ENTRY_PATH = "src/cli.ts";
const FEATURE_TESTS = "src/summary.test.ts";
const SOURCE_TEMPLATE = "docs/TEMPLATE.md";
const BODY_MARKER = "# Spec Body — Copy Everything Below This Line";
const BASELINE_EVIDENCE = "docs/baseline.txt";
const COUNTS_PATH = "fixtures/counts.txt";
const UNIT_COMMAND = "bun test src";
const CONFORM_COMMAND = "bun build src/cli.ts --outfile .orly/build/cli.js";

function processIn(root: string, argv: string[]) {
  const result = Bun.spawnSync(argv, { cwd: root, env: UNSCOPED_ENVIRONMENT, stdout: "pipe", stderr: "pipe", timeout: 15_000 });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function filledSpec(revision: string, completed = false): string {
  const template = readFileSync(join(ROOT, SOURCE_TEMPLATE), "utf8");
  const body = template.split(BODY_MARKER)[1]!;
  const banner = body.match(/<!--\s*\nSPEC AUTHORING RULES[\s\S]*?-->/)![0];
  const proofs = ["sums_input_rows", "includes_final_unterminated_row", "refuses_invalid_input"];
  const states = completed ? "DONE" : "IN_PROGRESS";
  const sections: Record<string, string> = {
    Overview: "Add a command that totals nonnegative integer rows without changing its input file.",
    "PR Intent & comprehension handshake": "Print the exact total, including the final row without a newline. Invalid rows fail with exit 2 and no total.",
    "Implementing agent — read these first": "1. `README.md` — public command behavior.\n2. `src/count.ts` — the existing validated integer parser.",
    "Files Changed (blast radius)": "`src/cli.ts`, `src/summary.test.ts`, `README.md` and this specification.",
    "Applicable Rules": "Behavior-named tests, real production entrypoint, deterministic input validation and owned file resources.",
    "Applicable Gates": `Declared conformance: \`${CONFORM_COMMAND}\`. Full verification: \`${UNIT_COMMAND}\`.`,
    "Prior-Art / Reference Implementations": "Use the existing count parser; tests execute the real command as a child process.",
    "Sections (implementation slices)": proofs.map((proof, index) => `### §${index + 1} — ${proof.replaceAll("_", " ")}\n\n- **Dimension ${index + 1}.1** — ${states} — ${proof.replaceAll("_", " ")} → Test \`${proof}\``).join("\n\n"),
    Interfaces: "`bun src/cli.ts <input>` prints one decimal total and a newline on stdout. Input is read-only.",
    "Failure Modes": "A malformed, negative or unsafe integer fails with exit 2, a safe diagnostic and empty stdout; the input remains unchanged.",
    Invariants: "Sum every nonempty row exactly once. Reject invalid data before printing. Keep totals within the safe integer range.",
    "Metrics & Observability": "The command result is stdout; a safe refusal is stderr. No external service or model is used.",
    "Test Specification (tiered)": "| Dimension | Tier | Test | Asserts |\n|---|---|---|---|\n" + proofs.map((proof, index) => `| ${index + 1}.1 | integration | \`${proof}\` | ${index === 2 ? "Invalid data yields exit 2, no total and unchanged input." : index === 1 ? "A final row without a newline is counted." : "Rows 2 and 3 yield exactly 5 and unchanged input."} |`).join("\n"),
    "Acceptance Rubric (single scoring surface)": `| # | Criterion | Verify | Expected | Priority | Graded |\n|---|---|---|---|---|---|\n| S1 | Build the command | \`${CONFORM_COMMAND}\` | exit 0 | P0 | |\n| S2 | Public behavior | \`${UNIT_COMMAND}\` | all assertions pass | P0 | |`,
    "Dead Code Sweep": "The command calls the existing count parser; no parallel parser or unused export is added.",
    "Out of Scope": "External services, publishing and model calls.",
    "Product Clarity (authoring record)": "An operator gets one exact total or a clear refusal; files and existing parsing behavior are preserved.",
    "Decomposition & alternatives (patch vs refactor)": "Wire the existing parser into one command; a second parsing abstraction would duplicate validation.",
    "Discovery (consult log)": "The local rehearsal tests the served command and the actual installed gate.",
  };
  const headings = [...body.matchAll(/^## (.+)$/gm)].map((match) => match[1]!);
  return [banner, "# M99_001: Count summary command", `**Status:** ${states}`, "**Priority:** P2 — deterministic summary",
    `**Branch:** \`${REHEARSAL_BRANCH}\``, `**Baseline revision:** ${revision}`,
    "**Test Baseline:** unit=2", `**Baseline evidence:** ${BASELINE_EVIDENCE}`,
    ...headings.map((heading) => `## ${heading}\n\n${sections[heading] ?? "No additional requirements."}`),
  ].join("\n\n");
}

async function consumerRehearsal(): Promise<{ root: string; revision: string }> {
  const root = newRepository();
  git(root, "branch", "-m", "main");
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, ".orly"), { recursive: true });
  writeFileSync(join(root, "src/count.ts"), 'export function parseCount(value: string): number {\n  const count = Number(value);\n  if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(count)) throw new Error("invalid count");\n  return count;\n}\n');
  writeFileSync(join(root, ENTRY_PATH), "export {};\n");
  writeFileSync(join(root, "src/count.test.ts"), 'import {expect,test} from "bun:test";\nimport {parseCount} from "./count";\ntest("parses nonnegative integers",()=>{expect(parseCount("0")).toBe(0);expect(parseCount("12")).toBe(12);});\ntest("refuses malformed integers",()=>{expect(()=>parseCount("-1")).toThrow("invalid count");expect(()=>parseCount("bad")).toThrow("invalid count");});\n');
  writeFileSync(join(root, ".orly/orly.json"), JSON.stringify({ schema_version: 1, packs: ["workflow.specifications"],
    commands: { conform: [["bun", "build", ENTRY_PATH, "--outfile", ".orly/build/cli.js"]], "verify.unit": [["bun", "test", "src"]] },
    surfaces: { user: ["src/"], docs: ["README.md", "docs/"] },
  }));
  writeFileSync(join(root, ".gitignore"), ".orly/build/\n");
  const installed = orly(root, ROOT, "init", "--no-hooks");
  if (installed.code !== 0) throw new Error(installed.output);
  const baseline = processIn(root, ["bun", "test", "src"]);
  if (baseline.code !== 0 || !baseline.stderr.includes("2 pass")) throw new Error(baseline.stderr);
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, BASELINE_EVIDENCE), `${UNIT_COMMAND}\n${baseline.stdout}${baseline.stderr}`);
  git(root, "add", "."); git(root, "commit", "-qm", "test: establish consumer baseline");
  const revision = gitOutput(root, "rev-parse", "HEAD");
  const origin = temporaryDirectory();
  git(origin, "init", "--bare", "-q"); git(root, "remote", "add", "origin", origin);
  git(root, "push", "-qu", "origin", "main");
  git(root, "switch", "-qc", REHEARSAL_BRANCH);
  mkdirSync(join(root, "docs/v1/active"), { recursive: true });
  writeFileSync(join(root, ACTIVE_SPEC), filledSpec(revision));
  git(root, "add", "."); git(root, "commit", "-qm", "chore: open count summary stream");
  mkdirSync(join(root, "fixtures"), { recursive: true });
  writeFileSync(join(root, COUNTS_PATH), "2\n3\n");
  writeFileSync(join(root, FEATURE_TESTS), `import {expect,test} from "bun:test";
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
function run(input:string){const root=mkdtempSync(join(tmpdir(),"summary-input-"));try{const path=join(root,"counts.txt");writeFileSync(path,input);const result=Bun.spawnSync(["bun","${ENTRY_PATH}",path],{stdout:"pipe",stderr:"pipe"});return {code:result.exitCode,out:result.stdout.toString(),err:result.stderr.toString(),input:readFileSync(path,"utf8")};}finally{rmSync(root,{recursive:true,force:true});}}
test("sums_input_rows",()=>{const result=run("2\\n3\\n");expect(result.code).toBe(0);expect(result.out).toBe("5\\n");expect(result.input).toBe("2\\n3\\n");});
test("includes_final_unterminated_row",()=>{expect(run("2\\n3").out).toBe("5\\n");});
test("refuses_invalid_input",()=>{for(const input of ["2\\nbad\\n","-1\\n","9007199254740992\\n"]){const result=run(input);expect(result.code).toBe(2);expect(result.out).toBe("");expect(result.err).toContain("invalid count");expect(result.input).toBe(input);}});
`);
  return { root, revision };
}

function checkpointConsumer(root: string, message: string): void {
  git(root, "add", "."); git(root, "commit", "-qm", message);
  git(root, "push", "-q", "origin", REHEARSAL_BRANCH);
  git(root, "branch", "--set-upstream-to", `origin/${REHEARSAL_BRANCH}`);
}

const CORRECT_ENTRY = `import {parseCount} from "./count";
try { const input = await Bun.file(Bun.argv[2]!).text();
  let total = 0;
  for (const row of input.split("\\n")) { if (!row) continue; total += parseCount(row); if (!Number.isSafeInteger(total)) throw new Error("invalid count"); }
  console.log(total);
} catch { console.error("invalid count"); process.exitCode = 2; }
`;

const CASE_TIMEOUT = 30_000;

afterEach(cleanupTemporaryDirectories);

test("a filled spec blocks missing production wiring and wrong behavior before accepting the real command", async () => {
  const { root, revision } = await consumerRehearsal();
  mkdirSync(join(root, "docs/v1/done"), { recursive: true });
  renameSync(join(root, ACTIVE_SPEC), join(root, CLOSED_SPEC));
  writeFileSync(join(root, CLOSED_SPEC), filledSpec(revision, true));
  writeFileSync(join(root, "README.md"), "Run bun src/cli.ts <input> to total integer rows; invalid rows fail with exit 2.\n");
  checkpointConsumer(root, "test: close specification with public behavior proofs");

  const missing = orly(root, ROOT, "gate", "pr");
  expect(missing.code).toBe(1);
  expect(missing.output).toContain("cmd.verify.unit");
  expect(missing.output).toContain("sums_input_rows");
  expect(missing.output).toContain("3 fail");
  expect(missing.output).not.toContain("no active spec");

  writeFileSync(join(root, ENTRY_PATH), 'const input=await Bun.file(Bun.argv[2]!).text();\nconsole.log(input.trimEnd().split("\\n").length);\n');
  checkpointConsumer(root, "test: reproduce a wrong total despite completion markers");
  const wrong = orly(root, ROOT, "gate", "pr");
  expect(wrong.code).toBe(1);
  expect(wrong.output).toContain("cmd.verify.unit");
  expect(wrong.output).toContain("sums_input_rows");
  expect(wrong.output).toContain("3 fail");
  expect(processIn(root, ["bun", ENTRY_PATH, "fixtures/counts.txt"]).stdout).toBe("2\n");

  writeFileSync(join(root, ENTRY_PATH), CORRECT_ENTRY);
  checkpointConsumer(root, "fix: wire validated totals into the production command");
  const correct = orly(root, ROOT, "gate", "pr");
  expect(correct.code).toBe(0);
  expect(correct.output).toContain("5 pass");
  expect(correct.output).toContain("spec.dimensions");
  expect(correct.output).toContain("spec.moved");
  expect(correct.output).toContain("in sync with origin/feat/count-summary");

  writeFileSync(join(root, FEATURE_TESTS), (await Bun.file(join(root, FEATURE_TESTS)).text()).replace('toBe("5\\n")', 'toBe("6\\n")'));
  checkpointConsumer(root, "test: retain verification after spec closure");
  const afterClosure = orly(root, ROOT, "gate", "pr");
  expect(afterClosure.code).toBe(1);
  expect(afterClosure.output).toContain("sums_input_rows");
  expect(afterClosure.output).toContain("4 pass");
  expect(afterClosure.output).toContain("1 fail");
}, CASE_TIMEOUT);

test("the authoring skill copies the executable spec body and preserves behavior test names", async () => {
  const { root, revision } = await consumerRehearsal();
  const skill = await Bun.file(join(ROOT, "skills/orly-spec-new/SKILL.md")).text();
  const copy = skill.match(/sed -n '[^\n]+\n\s*\| sed '1d' > [^\n]+/)![0];
  const output = "docs/copied-body.md";
  const copied = processIn(root, ["bash", "-c", copy.replace(/> .+$/, `> ${output}`).replace("docs/TEMPLATE.md", `${ROOT}/docs/TEMPLATE.md`)]);
  expect(copied.code).toBe(0);
  const body = await Bun.file(join(root, output)).text();
  expect(body.trimStart()).toStartWith("<!--\nSPEC AUTHORING RULES");
  expect(body).not.toContain("## Fill grammar");
  expect(body).not.toContain("## Hierarchy & terminology");
  const filled = filledSpec(revision, true);
  expect(filled).not.toContain("{{fill:");
  expect(filled).not.toContain("<!-- tpl:");
  const testSource = await Bun.file(join(root, FEATURE_TESTS)).text();
  expect(testSource).not.toMatch(/test\("(?:dim |M\d|\d+\.\d+)/);
  expect(testSource).toContain('test("sums_input_rows"');
  const checked = processIn(root, ["bash", ".orly/audits/spec-template.sh", "--file", ACTIVE_SPEC]);
  expect(checked.code).toBe(0);
  expect(checked.stdout).toContain("SPEC TEMPLATE GATE: clean (1 specs)");
}, CASE_TIMEOUT);
