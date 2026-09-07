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

/**
 * The two numbers a breach distance is measured between.
 *
 * Structural rather than ExceptionView so the server page can measure the
 * distance while it is still assembling the view, and so this module goes on
 * importing nothing from the screen it formats for.
 */
export type BreachInput = {
  isStockout: boolean;
  projectedWos: number | null;
  threshold: { weeks: number | null } | null;
};

/**
 * How far past its threshold the row sits, in weeks.
 *
 * This is the one exception to "nothing here decides a value", and it earns
 * the place: the queue sorts by this distance and the row prints it, so both
 * have to be the same subtraction. Two copies of it would be two ways for a
 * row to be second in the list while its printed distance says third.
 *
 * An overstock is above its ceiling and a stockout below its floor, so the
 * subtraction runs the other way for each; the result is positive in both
 * cases and the two are therefore comparable. A row missing either number
 * has no distance and sorts to the end rather than being treated as zero,
 * which would put an unmeasured row among the well-behaved ones.
 */
export function breachWeeks(row: BreachInput): number | null {
  const projected = row.projectedWos;
  const threshold = row.threshold?.weeks ?? null;
  if (projected === null || threshold === null) return null;
  return row.isStockout ? threshold - projected : projected - threshold;
}
