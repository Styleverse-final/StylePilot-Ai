// Spelling for the scenario screen. Nothing here decides a value.
//
// Every screen in this app carries its own format module (dashboard, buy,
// exceptions all do) and they all sit on formatUnitsAbs from the design
// system, which groups Indian-style arithmetically rather than through
// toLocaleString so that the server render and the hydrated client render
// produce the identical string. Scenario figures move on every slider
// change, so a hydration mismatch here would be a live bug rather than a
// first-paint one.

import { formatUnitsAbs } from "@/components/DriverBars";

/** Rupee sign. */
export const RUPEE = "₹";
/** Nothing to show. Never a zero: a missing figure is not a figure of nought. */
export const DASH = "--";
/** Multiplication sign, for "INR 3.53 per unit-week x 12 weeks". */
export const TIMES = "×";
/** Rightwards arrow: base plan on the left, scenario on the right. */
export const ARROW = "→";
/** Middle dot, the separator inside a scope label. */
export const MIDDOT = "·";

const CRORE = 10000000;
const LAKH = 100000;

export function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** INR at the scale a merchant reads. Same cut as the buy plan uses. */
export function formatInr(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= CRORE) return `${sign}${RUPEE}${(abs / CRORE).toFixed(2)} Cr`;
  if (abs >= LAKH) return `${sign}${RUPEE}${(abs / LAKH).toFixed(2)} L`;
  return `${sign}${RUPEE}${formatUnitsAbs(abs)}`;
}

/** INR with an explicit sign, for a change against the base plan. */
export function formatSignedInr(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const magnitude = formatInr(Math.abs(value));
  if (Math.round(value) === 0) return magnitude;
  return `${value > 0 ? "+" : "-"}${magnitude}`;
}

/** Units, Indian-grouped, rounded to whole garments. */
export function formatUnits(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const magnitude = formatUnitsAbs(value);
  return value < 0 ? `-${magnitude}` : magnitude;
}

/** Units with an explicit sign, for a delta against the base plan. */
export function formatSignedUnits(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const rounded = Math.round(value);
  if (rounded === 0) return formatUnitsAbs(0);
  return `${rounded > 0 ? "+" : "-"}${formatUnitsAbs(rounded)}`;
}

/**
 * Millions of units, for the demand column, where six significant digits
 * are noise. Below a million the exact grouped figure is shown instead.
 */
export function formatUnitsCompact(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const abs = Math.abs(value);
  if (abs >= 1000000) {
    return `${value < 0 ? "-" : ""}${(abs / 1000000).toFixed(2)}M`;
  }
  return formatUnits(value);
}

/** A stored fraction rendered as a percentage. The x100 happens only here. */
export function formatFractionPct(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (!finite(value)) return DASH;
  return `${(value * 100).toFixed(decimals)}%`;
}

/** The same, with an explicit sign. */
export function formatSignedFractionPct(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (!finite(value)) return DASH;
  const pct = value * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(decimals)}%`;
}

/** A demand multiplier as a percentage change, e.g. "+8.4%". */
export function formatMultiplier(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return formatSignedFractionPct(value - 1);
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

/** An ISO timestamp in one pinned zone, so SSR and hydration agree. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}
