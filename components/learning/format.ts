// Spelling for the learning module. Nothing here decides a value.
//
// Every figure that reaches these functions was read from the database at
// request time. The only judgement calls are display conventions: hours
// print without a trailing ".0" because a curriculum is authored in whole
// sessions, and a missing figure prints as a dash rather than a zero,
// because "no completion row" is not "nought hours completed".

/** Nothing to show. Never a zero. */
export const DASH = "--";

/** Middle dot, the separator inside a compound label. */
export const MIDDOT = "·";

/** Rightwards arrow, used where one state becomes another. */
export const ARROW = "→";

export function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * jsonb and numeric columns can arrive as either a JS number or a decimal
 * string depending on the driver. Coerce narrowly rather than widening a
 * type to `any` and hoping.
 */
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

/** Hours, trimmed: 13 prints "13h", 8.5 prints "8.5h". */
export function formatHours(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}h`;
}

/** Hours without the unit, for a cell that already carries one in its header. */
export function formatHoursBare(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** A fraction in [0, 1] rendered as a percentage. */
export function formatFractionPct(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (!finite(value)) return DASH;
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * learning_completion.score, printed as stored. The column carries no upper
 * bound -- no check constraint and no scale anywhere in the schema -- so this
 * deliberately does not append a denominator.
 */
export function formatScore(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return `${Math.round(value * 10) / 10}`;
}

/** A signed number of points, for a margin against a reference. */
export function formatSignedHours(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(Math.abs(rounded))
    : Math.abs(rounded).toFixed(1);
  if (rounded === 0) return `0h`;
  return `${rounded > 0 ? "+" : "-"}${text}h`;
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

/**
 * A date in one fixed zone, so the server render and the hydrated client
 * render agree. An unparseable value passes through rather than being
 * replaced with a guess.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : DATE.format(parsed);
}

/** The same with a clock, for the decision provenance strip. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}

/** "1 module" / "6 modules", so no sentence has to say "module(s)". */
export function plural(count: number, one: string, many: string): string {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`;
}

/**
 * A snake_case app_role turned into prose. It rewrites nothing:
 * "planning_manager" becomes "Planning manager" and stops there.
 */
export function humaniseRole(value: string | null | undefined): string | null {
  if (!value) return null;
  const words = value.replace(/_/g, " ").trim();
  if (words.length === 0) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
