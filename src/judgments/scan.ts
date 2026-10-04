import { mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { OrlyError } from "../model";
import { IGNORE_OUTPUT, PIPE_OUTPUT, SCAN_TIMEOUT_MS } from "./constants";

const SCANNER = "gitleaks";
const SCAN_ARGUMENTS = ["stdin", "--redact", "--no-banner"];
const KILL_SIGNAL = "SIGKILL";

export async function scanUpload(request: string, timeoutMs = SCAN_TIMEOUT_MS): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "orly-judgment-scan-"));
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    // Empty scratch directory and a minimal environment prevent project scanner settings from hiding a secret.
    child = Bun.spawn([SCANNER, ...SCAN_ARGUMENTS], {
      cwd: directory, env: { PATH: Bun.env.PATH ?? "", LANG: "C" },
      stdin: PIPE_OUTPUT, stdout: IGNORE_OUTPUT, stderr: IGNORE_OUTPUT,
    });
    const running = child;
    timer = setTimeout(() => { timedOut = true; running.kill(KILL_SIGNAL); }, timeoutMs);
    if (typeof child.stdin !== "object" || !("write" in child.stdin)) throw new OrlyError("Secret scanner input is unavailable.");
    child.stdin.write(request);
    child.stdin.end();
    const code = await child.exited;
    if (timedOut) throw new OrlyError("Secret scanning timed out; nothing was uploaded.");
    if (code === 1) throw new OrlyError("Secret scanning found a credential in selected evidence; nothing was uploaded.");
    if (code !== 0) throw new OrlyError("Secret scanner failed; nothing was uploaded.");
  } catch (error) {
    if (error instanceof OrlyError) throw error;
    throw new OrlyError("Secret scanner is unavailable; install gitleaks before explicit refresh.");
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null) { child.kill(KILL_SIGNAL); await child.exited; }
    rmdirSync(directory);
  }
}
