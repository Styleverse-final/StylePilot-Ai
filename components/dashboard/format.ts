// Dashboard formatting helpers.
//
// Formatting only. Nothing in this file knows a metric, carries a default
// figure, or supplies a value when the database supplies none -- a missing
// number renders as an em-less "--" so a blank cell is never mistaken for a
// zero. Source stays plain ASCII; the rupee sign and the middle dot are
// written as escapes.

const RUPEE = String.fromCharCode(0x20b9); // INR sign
const MIDDOT = String.fromCharCode(0x00b7); // middle dot
const CRORE = 10_000_000;

/** The date scale the whole app formats against, so SSR output is stable. */
const IST = "Asia/Kolkata";

/**
 * INR in crore, the unit the case and the design both speak in.
 * Precision falls as magnitude rises: 1.59 Cr, 18.4 Cr, 448 Cr.
 */
export function formatCrore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return `${RUPEE}--`;
  }
  const crore = value / CRORE;
  const magnitude = Math.abs(crore);
  const digits = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
  return `${crore < 0 ? "-" : ""}${RUPEE}${magnitude.toFixed(digits)} Cr`;
}

/** Whole counts, Indian digit grouping. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-IN").format(Math.round(value));
}

/** A percentage that is already expressed 0..100. */
export function formatPct(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `${value.toFixed(digits)}%`;
}

/** A share expressed 0..1, rendered as a percentage. */
export function formatShare(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  digits = 1,
): string {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return "--";
  }
  return `${((numerator / denominator) * 100).toFixed(digits)}%`;
}

/** Safe 0..1 fraction for a bar width. Never NaN, never negative. */
export function fractionOf(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return 0;
  }
  return Math.max(0, Math.min(1, numerator / denominator));
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  // A bare date ("2026-09-07") is a calendar day, not an instant; pin it to
  // UTC midnight so it does not slide a day either way when formatted.
  const at = new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** "7 September 2026". Calendar days format in UTC. */
export function formatDay(iso: string | null | undefined): string | null {
  const at = toDate(iso);
  if (!at) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: iso && iso.length <= 10 ? "UTC" : IST,
  }).format(at);
}

/** "3 Sep 2026, 17:11" in IST. Instants format in the planner's zone. */
export function formatStamp(iso: string | null | undefined): string | null {
  const at = toDate(iso);
  if (!at) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: IST,
  }).format(at);
}

/** "02:31" in IST -- the clock face the agent feed shows. */
export function formatClock(iso: string | null | undefined): string | null {
  const at = toDate(iso);
  if (!at) return null;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: IST,
  }).format(at);
}

/** "BOTT|RETAIL|IN-S" -> "BOTT . RETAIL . IN-S". */
export function seriesLabel(key: string | null | undefined): string {
  if (!key) return "Unassigned series";
  return key.split("|").join(` ${MIDDOT} `);
}

/** "STOCKOUT_RISK" -> "Stockout risk". */
export function humanise(token: string | null | undefined): string {
  if (!token) return "--";
  const words = token.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "forecast_agent" -> "FA", for the 26px square badge. */
export function agentBadge(name: string | null | undefined): string {
  if (!name) return "--";
  const initials = name
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials.slice(0, 2) || name.slice(0, 2).toUpperCase();
}

/** Pluralise without inventing copy: "1 decision", "6 decisions". */
export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export { MIDDOT, RUPEE };
