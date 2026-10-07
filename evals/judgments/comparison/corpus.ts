import { join } from "node:path";

import { OrlyError } from "../../../src/model";
import { MAX_SOURCE_BYTES } from "../../../src/judgments/constants";
import { digest, readBounded } from "../../../src/judgments/files";
import { corpusCasesSchema, CHECK_ERROR, type ComparisonCase } from "./types";

export const CASE_SOURCE = "evals/judgments/comparison/cases.json";
export const REFERENCE = {
  counts: { path: "src/spec_rehearsal.test.ts", digest: "be13e0f0f07d127740a3175f46e53538848ec5ad50b3668f4a58cae5e168346c", selected: 'expect(run("2\\\\n3").out).toBe("5\\\\n")' },
  locale: { path: "evals/judgments/report.md", digest: "1206ee69ecc29a39e27ca4d5944b02be3f1deb09d2ab5abbc386c432f193dde9", selected: "The exact linked test compares against an independent `Intl.DateTimeFormat` result for `en-GB`." },
} as const;
export const REFERENCE_REVISION = "153a3816b0713f1b0e5a7e363bad7d5b1bd5052d";
export const ORACLE_NAME = "native-value-and-obligation-oracle";
export const DOMAIN = { counts: "integer-rows", locale: "requested-locale" } as const;
export async function loadCases(root: string): Promise<ComparisonCase[]> {
  const source = await readBounded(join(root, CASE_SOURCE), MAX_SOURCE_BYTES);
  const parsed = corpusCasesSchema.safeParse(JSON.parse(source));
  if (!parsed.success) throw new OrlyError(CHECK_ERROR.cases);
  return parsed.data.map((entry) => ({ ...entry, evidence: entry.evidence.map((item) => ({ ...item,
    source: { path: CASE_SOURCE, digest: digest(source) } })) }));
}
