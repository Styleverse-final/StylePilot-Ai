// Spelling for the adoption screen. Nothing here decides a value.
//
// The same discipline as components/learning/format.ts: numeric columns can
// arrive from PostgREST as a JS number or as a decimal string depending on
// the driver, so every read is coerced narrowly rather than widened to
// `any`; and a missing figure prints as a dash, never as a zero, because
// "no row" and "nought" are different states and the difference is the
// whole point of an empty state on this screen.

/** Nothing to show. Never a zero. */
export const DASH = "--";

/** Middle dot, the separator inside a compound label. */
export const MIDDOT = "·";

/** Rightwards arrow, used where one state becomes another. */
export const ARROW = "→";

export function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** The same, but a missing value counts as nought. Use only for sums. */
export function numOr0(value: unknown): number {
  return num(value) ?? 0;
}

/** A fraction in [0, 1] as a percentage. */
export function pct(value: number | null | undefined, decimals = 1): string {
  if (!finite(value)) return DASH;
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Percentage POINTS, signed. A change in a share, not a share. */
export function signedPoints(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (!finite(value)) return DASH;
  const points = value * 100;
  const rounded = Number(points.toFixed(decimals));
  if (rounded === 0) return `0.0pp`;
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(decimals)}pp`;
}

/** A count of people. */
export function count(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return Math.round(value).toLocaleString("en-GB");
}

/** Full-time equivalents, one decimal, because they are never whole people. */
export function fte(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return value.toFixed(1);
}

/** A survey score on the 1-5 scale planner_adoption stores. */
export function score(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return value.toFixed(1);
}

/** "1 planner" / "6 planners", so no sentence has to say "planner(s)". */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? `${n} ${one}` : `${count(n)} ${many}`;
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const TIMESTAMP = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

/** One fixed zone, so the server render and the hydrated render agree. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : DATE.format(parsed);
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}
