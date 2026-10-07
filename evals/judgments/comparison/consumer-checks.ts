import { resolve } from "node:path";

export const CONSUMER_REVISION = "0c52c2f421c5ad706e0c831831461201dc1828ea";
export const CONSUMER_BRANCH = "test/orly-013-rehearsal";
export const CONSUMER_SOURCE = "ui/packages/design-system/src/design-system/time-utils.ts";
export const CONSUMER_TEST = "ui/packages/design-system/src/design-system/time-utils.test.ts";
export const CONSUMER_CONFIG = ".orly/orly.json";
export const OWNER_FILES = ["AGENTS.md", ".orly/LOCAL.md", ".githooks/pre-commit", ".githooks/pre-push", "Makefile", "make/test-unit.mk", CONSUMER_TEST];
const ABSOLUTE_EXPRESSION = "new Intl.DateTimeFormat(locale, ABSOLUTE_OPTIONS).format(d)";
const GUARD = "if (Number.isNaN(d.getTime())) return TIME_INVALID_FALLBACK;";
const CLOCK_START = "export function formatTimeClock(";
const RELATIVE_START = "export function formatTimeRelative(";
const CLOCK_FORMAT = "clock";
const CLOCK_CALL = `if (format === "${CLOCK_FORMAT}") return formatTimeClock(value, locale);`;
const LOCALE_DEFECT = '(locale === DEFAULT_LOCALE ? "" : locale + " ") + new Intl.DateTimeFormat(DEFAULT_LOCALE, ABSOLUTE_OPTIONS).format(d)';
export const CONSUMER_SCENARIOS = ["locale-false-completion", "missing-seconds", "uncalled-clock-helper", "missing-invalid-guard", "unresolved-locale-finding"] as const;
export type ConsumerScenario = typeof CONSUMER_SCENARIOS[number];

export function mutateConsumer(source: string, scenario: ConsumerScenario): string {
  if (scenario === CONSUMER_SCENARIOS[0]) return replaceOnce(source, ABSOLUTE_EXPRESSION, LOCALE_DEFECT);
  if (scenario === CONSUMER_SCENARIOS[1]) return replaceOnce(source, '  second: "2-digit",', "");
  if (scenario === CONSUMER_SCENARIOS[2]) return replaceOnce(source, CLOCK_CALL, CLOCK_CALL.replace("formatTimeClock", "formatTimeAbsolute"));
  if (scenario === CONSUMER_SCENARIOS[3]) {
    const start = source.indexOf(CLOCK_START);
    const end = source.indexOf(RELATIVE_START);
    if (start < 0 || end <= start) throw new Error("Consumer clock helper is missing.");
    return source.slice(0, start) + replaceOnce(source.slice(start, end), GUARD, "") + source.slice(end);
  }
  return "// Locale finding marked resolved by scripted actor.\n" + replaceOnce(source, ABSOLUTE_EXPRESSION, LOCALE_DEFECT);
}

function replaceOnce(source: string, before: string, after: string): string {
  if (source.split(before).length !== 2) throw new Error("Consumer source no longer matches the pinned mutation.");
  return source.replace(before, after);
}

export function consumerProbe(root: string, hidden: boolean): string {
  const importPath = JSON.stringify(resolve(root, CONSUMER_SOURCE));
  const common = `import * as subject from ${importPath};
const input='2026-10-07T14:35:42.000Z';
const absolute={year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'};
const clock={hour:'2-digit',minute:'2-digit',second:'2-digit'};
const checks=[];
const check=(name,fn)=>{try{checks.push({name,passed:fn()});}catch(error){checks.push({name,passed:false,error:String(error)});}};`;
  const assertions = hidden ? `
for(const locale of ['en-US','en-GB']){
check('exact-locale-'+locale,()=>subject.formatTimeAbsolute(input,locale)===new Intl.DateTimeFormat(locale,absolute).format(new Date(input)));
check('caller-clock-'+locale,()=>subject.visibleTimeLabel(input,'clock',locale,input)===new Intl.DateTimeFormat(locale,clock).format(new Date(input)));
check('caller-absolute-'+locale,()=>subject.visibleTimeLabel(input,'absolute',locale,input)===new Intl.DateTimeFormat(locale,absolute).format(new Date(input)));
}
for(const value of ['not-a-date','']){
check('invalid-clock-'+value,()=>subject.formatTimeClock(value)==='—');
check('invalid-caller-'+value,()=>subject.visibleTimeLabel(value,'clock','en-GB',value)==='—');
}` : `check('output-exists',()=>Boolean(subject.visibleTimeLabel(input,'clock','en-GB',input)));`;
  return common + assertions + "\nprocess.stdout.write(JSON.stringify(checks));process.exitCode=checks.every(c=>c.passed)?0:1;";
}
