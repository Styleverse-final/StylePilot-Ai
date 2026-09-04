import { formatUnitsAbs } from "../DriverBars";

/**
 * Formatting for the exception queue.
 *
 * Nothing here decides a value; every function takes a number that was read
 * from the database and decides only how it is spelled. The one judgement
 * call is the crore / lakh cut, which is a display convention rather than a
 * metric: the underlying figure is always the raw INR from
 * recommendation.value_at_stake_inr.
 *
 * Grouping is delegated to formatUnitsAbs, which does Indian digit grouping
 * arithmetically rather than through toLocaleString, so the server render and
 * the hydrated client render always produce the identical string.
 */

/** Rupee sign, written as an escape so the source itself stays plain ASCII. */
export const RUPEE = "\u20B9";

/** Middle dot, the separator between the parts of a series name. */
export const MIDDOT = "\u00B7";

const CRORE = 10000000;
const LAKH = 100000;

/** Nothing to show. Never a zero, because a missing figure is not a zero. */
export const DASH = "--";

function finite(value: number | null | undefined): value is number {
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

/** Weeks of supply. Whole weeks stay whole; a projection keeps its decimal. */
export function formatWeeks(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return Number.isInteger(value) ? `${value}w` : `${value.toFixed(1)}w`;
}

/** Units, Indian-grouped, or a dash when the payload carries no figure. */
export function formatUnits(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return formatUnitsAbs(value);
}

/** A plain integer count. */
export function formatCount(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return formatUnitsAbs(value);
}

/**
 * A rate from v_touchless_rate.
 *
 * The view is free to express a rate either as a fraction or as a percentage
 * and this must not silently multiply a real 0.9% by a hundred, so the
 * branch is on magnitude: a value at or below 1 is read as a fraction, above
 * 1 as a percentage already. Either way the number itself comes from the
 * view; only the spelling is decided here.
 */
export function formatRatePct(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const asPct = Math.abs(value) <= 1 ? value * 100 : value;
  return `${asPct.toFixed(1)}%`;
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
