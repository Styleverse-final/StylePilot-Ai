// Formatting for the governance screen. Spelling only -- nothing in this
// file decides a value, and nothing in it invents one.
//
// Every figure that reaches these functions was read from Postgres at
// request time. The only judgements here are display conventions: the
// crore / lakh cut, and the rule that a missing figure prints as a dash
// rather than a zero, because a decision row that recorded no value did
// not record a value of nought. That distinction matters more on this
// screen than anywhere else in the product: every one of the agent rows in
// the ledger has NULL in both value columns, and printing those as 0 would
// turn "the agent did not write a number here" into "the agent committed
// nothing", which is a different and false statement.
//
// Grouping is arithmetic rather than toLocaleString, so the server render
// and the hydrated client render always produce the identical string.

import { formatUnitsAbs } from "@/components";

/** Rupee sign, written as an escape so the source itself stays plain ASCII. */
export const RUPEE = "₹";

/** Middle dot, the separator between the parts of a series name. */
export const MIDDOT = "·";

/** Rightwards arrow: what was recommended on the left, what was committed on the right. */
export const ARROW = "→";

/** Nothing to show. Never a zero. */
export const DASH = "--";

const CRORE = 10000000;
const LAKH = 100000;

export function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** INR at the scale a merchant reads it. */
export function formatInr(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= CRORE) return `${sign}${RUPEE}${(abs / CRORE).toFixed(2)} Cr`;
  if (abs >= LAKH) return `${sign}${RUPEE}${(abs / LAKH).toFixed(2)} L`;
  return `${sign}${RUPEE}${formatUnitsAbs(abs)}`;
}

/** Units, Indian-grouped, rounded to whole garments. */
export function formatUnits(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const magnitude = formatUnitsAbs(value);
  return value < 0 ? `-${magnitude}` : magnitude;
}

/** A plain integer count, grouped. Used for row counts, never for money. */
export function formatCount(value: number): string {
  return formatUnitsAbs(value);
}

/** Percentage points, signed, as an allocation shift is written. */
export function formatPp(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (!finite(value)) return DASH;
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}pp`;
}

/** Percentage points with no sign, as a band width is written. */
export function formatBandPp(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (!finite(value)) return DASH;
  return `${value.toFixed(decimals)}pp`;
}

/** A count as a share of a total. Returns a dash when the total is zero. */
export function formatShare(part: number, whole: number): string {
  if (whole <= 0) return DASH;
  return `${((part / whole) * 100).toFixed(0)}%`;
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

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/**
 * An ISO timestamp in one fixed zone. The zone is pinned so the server
 * render and the hydrated client render agree; an unparseable value is
 * passed through verbatim rather than replaced with a guess.
 */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}

/** The same, to the day, for a policy row's set_at. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : DATE_ONLY.format(parsed);
}

/**
 * A snake_case app_role turned into prose. It rewrites nothing:
 * "category_manager" becomes "Category manager" and stops there.
 */
export function humaniseRole(value: string | null | undefined): string | null {
  if (!value) return null;
  const words = value.replace(/_/g, " ").trim();
  if (words.length === 0) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "agent" / "agents". Written out so no sentence has to say "1 agents". */
export function plural(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}
