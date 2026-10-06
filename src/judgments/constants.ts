export const STAGE = { plan: "plan", verify: "verify", review: "review", document: "document" } as const;
export const STAGES = [STAGE.plan, STAGE.verify, STAGE.review, STAGE.document] as const;
export const QUESTIONS = [
  "plan.prerequisites", "plan.observable_result", "verify.assertion",
  "review.failure_path", "review.rule_applicability", "document.claim",
] as const;
export const ROLE = { spec: "spec", implementation: "implementation", test: "test", rule: "rule", claim: "claim", result: "result", context: "context" } as const;
export const ROLES = [ROLE.spec, ROLE.implementation, ROLE.test, ROLE.rule, ROLE.claim, ROLE.result, ROLE.context] as const;
export const SELECTOR_KIND = { file: "file", function: "function", test: ROLE.test, section: "section" } as const;
export const ANSWER_KIND = { noul: "noul", choice: "choice" } as const;
export const RESULT_STATUS = { complete: "complete", incomplete: "incomplete" } as const;
export const JUDGMENT_MODE = { live: "live", replay: "replay" } as const;
export const NEWLINE = "\n";
export const CHOICE = { exact: "exact", weak: "weak", wrong: "wrong_target", missing: "missing", insufficient: "insufficient" } as const;
export const MODEL = "jev-1.13.0";
export const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const CATALOG_VERSION = 1;
export const KIBIBYTE = 1024;
export const MAX_ITEMS = 12;
export const MAX_EVIDENCE = 8;
export const MAX_SOURCE_BYTES = 256 * KIBIBYTE;
export const MAX_MANIFEST_BYTES = 64 * KIBIBYTE;
export const MAX_STATE_BYTES = 24 * KIBIBYTE;
export const MAX_REQUEST_BYTES = 32 * KIBIBYTE;
export const MAX_RESPONSE_BYTES = 64 * KIBIBYTE;
export const MAX_REPLAY_BYTES = 96 * KIBIBYTE;
export const MAX_REQUIREMENT_LENGTH = 2048;
export const MAX_NAME_LENGTH = 160;
export const REQUEST_TIMEOUT_MS = 15_000;
export const SCAN_TIMEOUT_MS = 5_000;
export const PARSE_TIMEOUT_MS = 5_000;
export const PROBABILITY_TOLERANCE = 0.00001;
export const ADVICE_THRESHOLD = 0.8;
export const REPLAY_DIRECTORY = ".orly/judgments";
export const REPLY_KEY = "decision";
export const PIPE_OUTPUT = "pipe";
export const IGNORE_OUTPUT = "ignore";
export const UTF8 = "utf-8";
export const SHA256 = "sha256";
export const JSON_INDENT = 2;
export const PRIVATE_DIRECTORY_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;
export const REFRESH_FLAG = "--refresh";
export const INPUT_FLAG = "--input";
export const PROJECT_FLAG = "--project";
export const JSON_FLAG = "--json";
export const HELP_FLAGS = ["--help", "-h"] as const;
export const INCOMPLETE_EXIT = 2;
export const ASSERTION_ACTIONS = {
  exact: "The linked assertion checks the required result. Run it against the incorrect behavior to confirm it discriminates.",
  weak: "Replace the broad assertion with an exact expected result or an independently computed expected value, then rerun the seeded bug.",
  wrong_target: "Link a test that calls the required behavior and asserts its result.",
  missing: "Add an assertion on the required behavior before accepting this test as evidence.",
  insufficient: "Supply the missing implementation, test or required result, then review this item again.",
} as const;
