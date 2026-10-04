import { expect, test } from "bun:test";

import { resolve } from "node:path";

import { SOURCE, SOURCE_FILE, TestProject } from "./test_support";

const CLI = resolve(import.meta.dir, "../..", "bin/orly");

async function invoke(args: string[]) {
  const child = Bun.spawn(["bash", CLI, "judge", ...args], { stdout: "pipe", stderr: "pipe", env: { PATH: Bun.env.PATH ?? "" } });
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    return { stdout, stderr, code };
  } finally { clearTimeout(timer); if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; } }
}

test("shipped command help exposes the six questions and Bun runtime", async () => {
  const result = await invoke(["--help"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("verify.assertion");
  expect(result.stdout).toContain("Runtime: Bun.");
  expect(result.stderr).toBe("");
});

test("the shipped command stays offline and preserves source bytes", async () => {
  using project = new TestProject();
  project.write("manifest.json", JSON.stringify(project.manifest()));
  const result = await invoke(["verify", "--input", `${project.root}/manifest.json`, "--project", project.root, "--json"]);
  expect(result.code).toBe(2);
  const report = JSON.parse(result.stdout);
  expect(report).toMatchObject({ advisory: true, requests: 0 });
  expect(report.results[0]).toMatchObject({ status: "incomplete", requests: 0 });
  expect(await Bun.file(`${project.root}/${SOURCE_FILE}`).text()).toBe(SOURCE);
  expect(result.stderr).toBe("");
});

test("invalid options and manifests emit one incomplete result", async () => {
  using project = new TestProject();
  project.write("invalid.json", "{");
  for (const args of [["verify", "--unknown", "--json"], ["verify", "--refresh", "--refresh", "--json"], ["verify", "--input", `${project.root}/invalid.json`, "--json"]]) {
    const result = await invoke(args);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "incomplete", advisory: true });
    expect(result.stderr).toBe("");
  }
});
