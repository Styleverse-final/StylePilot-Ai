// Formatting for the buy plan. Spelling only -- nothing here decides a value.
//
// Every number that reaches these functions was read from the database at
// request time. The only judgement calls are display conventions: the
// crore / lakh cut, and the fact that a missing figure prints as a dash
// rather than as a zero, because a payload that carries no manual plan is
// not a manual plan of nought.
//
// Grouping is delegated to formatUnitsAbs, which groups Indian-style
// arithmetically rather than through toLocaleString, so the server render
// and the hydrated client render always produce the identical string.

import { formatUnitsAbs } from "@/components/DriverBars";

/** Rupee sign, written as an escape so the source itself stays plain ASCII. */
export const RUPEE = "\u20B9";

/** Middle dot, the separator between the parts of a series name. */
export const MIDDOT = "\u00B7";

/** Rightwards arrow: recommendation on the left, what was committed on the right. */
export const ARROW = "\u2192";

/** Nothing to show. Never a zero, because a missing figure is not a zero. */
export const DASH = "--";

const CRORE = 10000000;
const LAKH = 100000;

export function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * INR at the scale a merchant reads: crore above a crore, lakh above a lakh,
 * grouped rupees below that.
 */
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

/** Units with an explicit sign, for a delta against the manual plan. */
export function formatSignedUnits(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const rounded = Math.round(value);
  if (rounded === 0) return formatUnitsAbs(0);
  return `${rounded > 0 ? "+" : "-"}${formatUnitsAbs(rounded)}`;
}

/**
 * A stored fraction rendered as a percentage. policy_parameter and the
 * recommendation payload both hold rates as fractions (0.85, 0.5682,
 * 0.3212), so the multiplication happens here and only here.
 */
export function formatFractionPct(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (!finite(value)) return DASH;
  return `${(value * 100).toFixed(decimals)}%`;
}

/** The same, with an explicit sign, for a gap against the manual plan. */
export function formatSignedFractionPct(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (!finite(value)) return DASH;
  const pct = value * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(decimals)}%`;
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

/**
 * An ISO timestamp in one fixed zone. The zone is pinned so the server
 * render and the hydrated client render agree; an unparseable value is
 * passed through rather than replaced with a guess.
 */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}

/**
 * A snake_case app_role turned into prose, used only when dim_planner.role
 * is null. It rewrites nothing: "category_manager" becomes "Category
 * manager" and stops there.
 */
export function humaniseRole(value: string | null | undefined): string | null {
  if (!value) return null;
  const words = value.replace(/_/g, " ").trim();
  if (words.length === 0) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
