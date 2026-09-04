// Spelling only. Nothing in this file decides a value.
//
// Indian grouping is done arithmetically by formatUnitsAbs rather than
// through toLocaleString, so the server render and the hydrated client
// render always produce the identical string.

import { formatUnitsAbs } from "@/components/DriverBars";

/** Rupee sign. Every currency figure on this screen goes out through it. */
export const RUPEE = "₹";

/** Middle dot separator. */
export const MIDDOT = "·";

/** Nothing to show. Never a zero: a missing figure is not a figure of nought. */
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

/** Whole units, Indian-grouped. */
export function formatUnits(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const magnitude = formatUnitsAbs(value);
  return value < 0 ? `-${magnitude}` : magnitude;
}

/** A stored fraction rendered as a percentage. Depths and shares are fractions. */
export function formatFractionPct(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (!finite(value)) return DASH;
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Percentage POINTS, for a gap between two depths. */
export function formatPoints(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (!finite(value)) return DASH;
  const points = value * 100;
  return `${points > 0 ? "+" : ""}${points.toFixed(decimals)} pts`;
}

/** Weeks, one decimal where the stored figure carries one. */
export function formatWeeks(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (!finite(value)) return DASH;
  return value.toFixed(decimals);
}

/** A plain count, no decimals. */
export function formatCount(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return String(Math.round(value));
}

/** R-squared to four places, which is the precision the fit table stores. */
export function formatR2(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return value.toFixed(4);
}

/** A fitted coefficient, signed, to three places. */
export function formatCoefficient(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return value.toFixed(3);
}

/**
 * The fitted log-log form, spelled so the signs read as arithmetic rather
 * than as two numbers pushed together: "0.155 - 0.935 x log(1 - depth)".
 */
export function formatFittedForm(
  intercept: number | null | undefined,
  coefficient: number | null | undefined,
): string {
  if (!finite(intercept) || !finite(coefficient)) return DASH;
  const sign = coefficient < 0 ? "-" : "+";
  return `log(uplift) = ${intercept.toFixed(3)} ${sign} ${Math.abs(
    coefficient,
  ).toFixed(3)} x log(1 - depth)`;
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
 * An ISO timestamp in one fixed zone, so the server render and the hydrated
 * client render agree. An unparseable value passes through rather than being
 * replaced by a guess.
 */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}
