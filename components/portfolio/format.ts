// Formatting for the portfolio screen. Spelling only.
//
// Nothing in this file knows a metric, holds a default, or supplies a value
// the database did not supply. A figure that is missing prints as a dash,
// never as a zero: a brand with no decisions logged against its buy plan has
// no approval rate, and rendering that as 0% would be a claim nobody made.
//
// Indian digit grouping is done arithmetically through formatUnitsAbs rather
// than through toLocaleString, so the server render and the hydrated render
// produce byte-identical strings. Source stays plain ASCII; the rupee sign
// and the middle dot are written as escapes.

import { formatUnitsAbs } from "@/components/DriverBars";

export const RUPEE = "₹";
export const MIDDOT = "·";
export const ARROW = "→";

/**
 * Negatives use the ASCII hyphen, exactly as every other formatter in the
 * app does. A typographic minus here would make this screen's figures fail
 * to line up with the same figures on the dashboard.
 */
export const MINUS = "-";

/** Nothing to show. Never a zero, because a missing figure is not a zero. */
export const DASH = "--";

const CRORE = 10000000;

export function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * INR in crore, the unit the case and the board both speak in. Precision
 * falls as magnitude rises so a column of figures stays the same width:
 * 0.84 Cr, 13.5 Cr, 449 Cr.
 */
export function formatCrore(value: number | null | undefined): string {
  if (!finite(value)) return `${RUPEE}${DASH}`;
  const crore = value / CRORE;
  const magnitude = Math.abs(crore);
  const digits = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
  return `${crore < 0 ? MINUS : ""}${RUPEE}${magnitude.toFixed(digits)} Cr`;
}

/** The same, with an explicit sign, for a change rather than a level. */
export function formatSignedCrore(value: number | null | undefined): string {
  if (!finite(value)) return `${RUPEE}${DASH}`;
  const crore = value / CRORE;
  const magnitude = Math.abs(crore);
  const digits = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
  const sign = crore < 0 ? MINUS : "+";
  return `${sign}${RUPEE}${magnitude.toFixed(digits)} Cr`;
}

/** Whole counts, Indian-grouped. */
export function formatCount(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return formatUnitsAbs(value);
}

/** A percentage already expressed 0..100. */
export function formatPct(
  value: number | null | undefined,
  digits = 1,
): string {
  if (!finite(value)) return DASH;
  return `${value.toFixed(digits)}%`;
}

/** A percentage already expressed 0..100, with an explicit sign. */
export function formatSignedPct(
  value: number | null | undefined,
  digits = 1,
): string {
  if (!finite(value)) return DASH;
  return `${value < 0 ? MINUS : "+"}${Math.abs(value).toFixed(digits)}%`;
}

/** A fraction 0..1 rendered as a percentage. */
export function formatFractionPct(
  value: number | null | undefined,
  digits = 1,
): string {
  if (!finite(value)) return DASH;
  return `${(value * 100).toFixed(digits)}%`;
}

/** Percentage points, signed. Used for a margin over a benchmark. */
export function formatPoints(
  value: number | null | undefined,
  digits = 1,
): string {
  if (!finite(value)) return DASH;
  return `${value < 0 ? MINUS : "+"}${Math.abs(value).toFixed(digits)}`;
}

/** A multiple, e.g. "53x". Null denominators do not become infinity. */
export function formatMultiple(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): string {
  if (!finite(numerator) || !finite(denominator) || denominator === 0) {
    return DASH;
  }
  const ratio = Math.abs(numerator / denominator);
  return `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}x`;
}

/** A share of a total, as a percentage. Zero totals return a dash. */
export function formatShare(
  part: number | null | undefined,
  total: number | null | undefined,
  digits = 1,
): string {
  if (!finite(part) || !finite(total) || total === 0) return DASH;
  return `${((part / total) * 100).toFixed(digits)}%`;
}

/** Safe 0..1 fraction for a bar width. Never NaN, never negative. */
export function fractionOf(
  part: number | null | undefined,
  total: number | null | undefined,
): number {
  if (!finite(part) || !finite(total) || total === 0) return 0;
  return Math.max(0, Math.min(1, part / total));
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
  timeZone: "UTC",
});

/** An instant, in one pinned zone so SSR and hydration agree. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}

/**
 * A calendar day such as a week_start. Pinned to UTC midnight so it cannot
 * slide a day either way when it is formatted.
 */
export function formatDay(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? value : DAY.format(parsed);
}

/** Pluralise without inventing copy. */
export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** "BUY_QUANTITY" -> "Buy quantity". Rewrites nothing else. */
export function humanise(token: string | null | undefined): string {
  if (!token) return DASH;
  const words = token.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "a, b and c" -- for a list of brands or categories in a sentence. */
export function joinWords(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
