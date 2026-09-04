// Spelling for the signals screen. Nothing here decides a value.
//
// Two conventions are worth naming. A missing figure prints as a dash, never
// as a zero: a category whose correlation could not be measured is not a
// category that correlates at nought. And a correlation always prints to
// three decimals, because the gate turns on the second one -- 0.262 and
// 0.762 rounded to one place would both read "0.3" and "0.8" and the reader
// would lose the ability to check the verdict beside them.

export const MIDDOT = "·";
export const PLUSMINUS = "±";
export const GTE = "≥";
export const DASH = "--";

export function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Three decimals, always. The gate turns on the second one. */
export function formatCorrelation(value: number | null | undefined): string {
  return finite(value) ? value.toFixed(3) : DASH;
}

/** Two decimals with an explicit sign, for the threshold itself. */
export function formatThreshold(value: number | null | undefined): string {
  return finite(value) ? value.toFixed(2) : DASH;
}

/**
 * A measured lead in weeks.
 *
 * Zero prints as "same week" rather than "0 wks", because zero is not a
 * short lead -- it is the absence of one, and the difference decides whether
 * a campaign can be briefed against the signal at all.
 */
export function formatLead(weeks: number | null | undefined): string {
  if (!finite(weeks)) return "not measured";
  if (weeks === 0) return "same week";
  return `${weeks} ${weeks === 1 ? "wk" : "wks"}`;
}

/** The lead and its correlation, in one string. Never one without the other. */
export function formatLeadWithCorrelation(
  weeks: number | null | undefined,
  correlation: number | null | undefined,
): string {
  return `${formatLead(weeks)} at r ${formatCorrelation(correlation)}`;
}

/** An index on the 0-100 scale the fixture uses. */
export function formatIndex(value: number | null | undefined): string {
  return finite(value) ? value.toFixed(1) : DASH;
}

/** A ratio around 1.0, three decimals. */
export function formatRatio(value: number | null | undefined): string {
  return finite(value) ? value.toFixed(3) : DASH;
}

/** Momentum, signed, three decimals -- the sign is the whole point. */
export function formatMomentum(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
}

export function formatCount(value: number): string {
  return String(Math.round(value));
}

/** "5 of 12". Both halves counted from the rows on screen. */
export function formatOutOf(part: number, whole: number): string {
  return `${part} of ${whole}`;
}

/** A count of things as a share of a total. Empty totals print as a dash. */
export function formatSharePct(part: number, whole: number): string {
  if (whole <= 0) return DASH;
  return `${((part / whole) * 100).toFixed(0)}%`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "SPD Outerwear" style label for a pair, brand first. */
export function pairLabel(brandName: string, categoryName: string): string {
  return `${brandName} ${MIDDOT} ${categoryName}`;
}

const TIMESTAMP = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/**
 * An ISO timestamp in one pinned zone, so the server render and the hydrated
 * client render produce the identical string. An unparseable value passes
 * through untouched rather than being replaced with a guess.
 */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}

/** A date-only column (week_start), same pinned zone. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : DAY.format(parsed);
}

/** "a, b and c" -- an Oxford-free list, for naming categories in prose. */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
