import { afterEach, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cleanupTemporaryDirectories, gitOutput, newRepository, ROOT } from "./gates_test_support";
import { UNSCOPED_ENVIRONMENT } from "./git_env";

const SKILL_PATH = "skills/orly-babysit-prs/SKILL.md";
const OTHER_BOT = "other-review-bot";
const skill = await Bun.file(join(ROOT, SKILL_PATH)).text();
const codeIn = (section: string) => section.match(/```bash\n([\s\S]*?)\n```/)![1]!;
const reviews = codeIn(skill.slice(skill.indexOf("## Polling loop")));
const checks = codeIn(skill.slice(skill.indexOf("## STEP 0.75")));

afterEach(cleanupTemporaryDirectories);

function poll(mode = "complete", state = "green", botOverride?: string) {
  const root = newRepository();
  const tools = join(root, "tools");
  mkdirSync(tools);
  for (const name of ["jq", "git"]) symlinkSync(Bun.which(name)!, join(tools, name));
  const head = gitOutput(root, "rev-parse", "HEAD");
  const calls = join(root, "calls.jsonl");
  writeFileSync(join(tools, "gh"), `#!${process.execPath}
const args=Bun.argv.slice(2);
await Bun.write(Bun.file(process.env.POLL_CALLS), (await Bun.file(process.env.POLL_CALLS).exists() ? await Bun.file(process.env.POLL_CALLS).text() : "") + JSON.stringify(args) + "\\n");
if(args[0]==="repo") console.log("example/project");
else if(args[0]==="pr" && args[1]==="view") {
  if(args.includes("number")) console.log("7");
  else { const prior=(await Bun.file(process.env.POLL_CALLS).text()).split("\\n").filter(x=>x.includes("headRefOid")).length; console.log((process.env.POLL_MODE==="changed" && prior>1) || (process.env.POLL_MODE==="changed-check" && prior>2) ? "changed-revision" : process.env.POLL_HEAD); }
} else if(args[0]==="pr" && args[1]==="checks") {
  if(process.env.POLL_STATE==="fetch-failed"){console.error("temporary fetch refusal");process.exit(2);}
  console.log(JSON.stringify(process.env.POLL_STATE==="empty" ? [] : [{name:"tests",state:"SUCCESS",bucket:process.env.POLL_STATE==="failed" ? "fail" : "pass",link:"https://example.invalid/check"}]));
} else if(args[0]==="api") {
  if(process.env.POLL_MODE==="fetch-failed" && args[1].includes("/issues/")){console.error("temporary summary refusal");process.exit(2);}
  const revision=process.env.POLL_MODE==="stale" ? "old-revision" : process.env.POLL_HEAD;
  const login=process.env.POLL_MODE===${JSON.stringify(OTHER_BOT)} ? process.env.POLL_MODE : "greptile";
  const first={id:1,user:{login},body:"first-page finding",commit_id:revision,state:"COMMENTED"};
  const second={id:2,user:{login},body:"second-page finding",commit_id:revision,state:"COMMENTED",pull_request_review_id:2};
  if(process.env.POLL_MODE==="missing-review") console.log("[[]]");
  else if(process.env.POLL_MODE==="malformed") console.log(JSON.stringify([{message:"not review evidence"}]));
  else console.log(JSON.stringify(args.includes("--paginate") && args.includes("--slurp") ? [[first],[second]] : [[first]]));
} else process.exit(2);
`, { mode: 0o755 });
  const result = Bun.spawnSync(["/bin/bash", "-c", `${reviews}\n${checks}`], {
    cwd: root, env: { ...UNSCOPED_ENVIRONMENT, ...(botOverride === undefined ? {} : { REVIEW_BOT_PATTERN: botOverride }), PATH: tools, POLL_HEAD: head, POLL_MODE: mode, POLL_STATE: state, POLL_CALLS: calls },
    stdout: "pipe", stderr: "pipe", timeout: 10_000,
  });
  return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString(), root, head };
}

test("review and summary fetches include every page and bind checks to the pushed revision", async () => {
  const result = poll();
  expect(result.code, result.output).toBe(0);
  const calls: string[][] = (await Bun.file(join(result.root, "calls.jsonl")).text()).trim().split("\n").map((line) => JSON.parse(line));
  const endpoints = calls.filter((args) => args[0] === "api");
  expect(endpoints).toHaveLength(3);
  for (const args of endpoints) { expect(args).toContain("--paginate"); expect(args).toContain("--slurp"); }
  expect(result.output).toContain("second-page finding");
  expect(result.output).toContain(`ci=green revision=${result.head}`);
});

test("an unsupported bot override cannot certify feedback excluded from triage", () => {
  const result = poll(OTHER_BOT, "green", OTHER_BOT);
  expect(result.code).not.toBe(0);
  expect(result.output).toContain("current revision review pending");
  expect(result.output).not.toContain("ci=green");
});

for (const mode of ["fetch-failed", "malformed", "changed", "changed-check", "stale", "missing-review"]) {
  test(`incomplete ${mode} review evidence cannot establish a green poll`, () => {
    const result = poll(mode);
    expect(result.code).not.toBe(0);
    expect(result.output).not.toContain("ci=green");
  });
}

for (const state of ["empty", "fetch-failed", "failed"]) {
  test(`${state} check discovery stays incomplete`, () => {
    const result = poll("complete", state);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("reset quiet polls");
    expect(result.output).not.toContain("ci=green");
  });
}

function gitlabPoll(mode = "complete", state = "green") {
  const root = newRepository();
  const tools = join(root, "tools");
  mkdirSync(tools);
  for (const name of ["jq", "git"]) symlinkSync(Bun.which(name)!, join(tools, name));
  const head = gitOutput(root, "rev-parse", "HEAD");
  const calls = join(root, "calls.jsonl");
  writeFileSync(join(tools, "glab"), `#!${process.execPath}
const args=Bun.argv.slice(2);
await Bun.write(Bun.file(process.env.POLL_CALLS), (await Bun.file(process.env.POLL_CALLS).exists() ? await Bun.file(process.env.POLL_CALLS).text() : "") + JSON.stringify(args) + "\\n");
if(args.includes("--jq")) process.exit(2);
if(args[0]==="repo") console.log(JSON.stringify({path_with_namespace:"example/team/project"}));
else if(args[0]==="mr") {
  const prior=(await Bun.file(process.env.POLL_CALLS).text()).split("\\n").filter(x=>x.includes('"mr"')).length;
  const changed=(process.env.POLL_MODE==="changed" && prior>2) || (process.env.POLL_MODE==="changed-check" && prior>3);
  console.log(JSON.stringify({iid:7,sha:changed ? "changed-revision" : process.env.POLL_HEAD}));
} else if(args[0]==="api") {
  const endpoint=args[1];
  if(process.env.POLL_MODE==="fetch-failed" && endpoint.endsWith("/notes")){console.error("temporary summary refusal");process.exit(2);}
  if(endpoint.endsWith("/pipelines")) {
    if(process.env.POLL_STATE==="fetch-failed"){console.error("temporary pipeline refusal");process.exit(2);}
    console.log(JSON.stringify(process.env.POLL_STATE==="empty" ? [] : [{id:3,sha:process.env.POLL_HEAD,status:process.env.POLL_STATE==="failed" ? "failed" : "success"}]));
  } else if(process.env.POLL_MODE==="malformed") console.log(JSON.stringify({message:"not review evidence"}));
  else {
    const note=id=>({id,author:{username:"greptile"},body:id===1 ? "first-page finding" : "second-page finding",type:null});
    const discussion=id=>({id:String(id),notes:[note(id)]});
    const item=endpoint.endsWith("/discussions") ? discussion : note;
    console.log(JSON.stringify([item(1)]));
    if(args.includes("--paginate")) console.log(JSON.stringify([item(2)]));
  }
} else process.exit(2);
`, { mode: 0o755 });
  const reviewCode = codeIn(skill.slice(skill.indexOf("### GitLab (`FORGE=gitlab`)")));
  const checkCode = codeIn(skill.slice(skill.indexOf("### GitLab\n")));
  const result = Bun.spawnSync(["/bin/bash", "-c", `${reviewCode}\n${checkCode}`], {
    cwd: root, env: { ...UNSCOPED_ENVIRONMENT, PATH: tools, POLL_HEAD: head, POLL_MODE: mode, POLL_STATE: state, POLL_CALLS: calls },
    stdout: "pipe", stderr: "pipe", timeout: 10_000,
  });
  return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString(), root, head };
}

test("GitLab polling collects nested project review pages using supported flags", async () => {
  const result = gitlabPoll();
  expect(result.code, result.output).toBe(0);
  const calls: string[][] = (await Bun.file(join(result.root, "calls.jsonl")).text()).trim().split("\n").map((line) => JSON.parse(line));
  const endpoints = calls.filter((args) => args[0] === "api");
  expect(endpoints).toHaveLength(3);
  for (const args of endpoints) {
    expect(args[1]).toStartWith("projects/example%2Fteam%2Fproject/");
    expect(args).toContain("--paginate");
    expect(args).not.toContain("--jq");
  }
  expect(result.output).toContain("second-page finding");
  expect(result.output).toContain(`ci=green revision=${result.head}`);
});

for (const mode of ["fetch-failed", "malformed", "changed", "changed-check"]) {
  test(`GitLab incomplete ${mode} evidence cannot establish a green poll`, () => {
    const result = gitlabPoll(mode);
    expect(result.code).not.toBe(0);
    expect(result.output).not.toContain("ci=green");
  });
}

for (const state of ["empty", "fetch-failed", "failed"]) {
  test(`GitLab ${state} pipeline discovery stays incomplete`, () => {
    const result = gitlabPoll("complete", state);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("reset quiet polls");
    expect(result.output).not.toContain("ci=green");
  });
}
