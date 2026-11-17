// How a run's progress lines read: a step under way, a step done, and a step
// that failed or needs a person. The `lane=` and `total` result lines stay
// plain, because reports quote them verbatim as evidence.
export function ongoing(text: string): string {
  return `orly burst: ⏳ ${text}…`;
}

export function done(text: string): string {
  return `orly burst: 🟢 ${text}`;
}

export function failed(text: string): string {
  return `orly burst: 🔴 ${text}`;
}
