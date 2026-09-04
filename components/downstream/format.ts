// Spelling for the downstream handoff screen. Nothing here decides a value.
//
// Every figure this file formats was read from downstream_handoff at request
// time, or computed on this screen from the rows that came back. The only
// judgements are display conventions: a missing figure prints as a dash
// rather than a zero, and the two multiplicative quantities on this screen --
// a sell-through spread and a markdown-share spread -- print with the same
// glyph so the reader can see immediately that they are being asked to
// compare them, and read the caveat that says not to.

import { formatUnitsAbs } from "@/components/DriverBars";

/** Nothing to show. Never a zero: an absent figure is not a figure of nought. */
export const DASH = "--";

/** Rightwards arrow. Bottom of a range on the left, top on the right. */
export const ARROW = "→";

/** Multiplication sign, for a ratio: 1.59x. */
export const TIMES = "×";

/** Middle dot, the separator inside a meta line. */
export const MIDDOT = "·";

export function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A stored fraction as a percentage. The multiplication happens only here. */
export function pct(value: number | null | undefined, decimals = 1): string {
  if (!finite(value)) return DASH;
  return `${(value * 100).toFixed(decimals)}%`;
}

/** A ratio, e.g. 1.993 -> "1.99x". Two decimals: the third is noise here. */
export function ratio(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return `${value.toFixed(2)}${TIMES}`;
}

/** Units, Indian-grouped, rounded to whole garments. */
export function units(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  const magnitude = formatUnitsAbs(value);
  return value < 0 ? `-${magnitude}` : magnitude;
}

/** Cover or lead in weeks, one decimal. The unit is always printed. */
export function weeks(value: number | null | undefined, decimals = 1): string {
  if (!finite(value)) return DASH;
  return `${value.toFixed(decimals)} wk`;
}

/**
 * A correlation, always signed. A leading + is not decoration here: these
 * rows quote positive correlations only, and printing the sign says that a
 * negative one would have looked different rather than the same.
 */
export function corr(value: number | null | undefined): string {
  if (!finite(value)) return DASH;
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(2)}`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
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
 * An ISO timestamp in one pinned zone, so the server render and the hydrated
 * client render produce the identical string. An unparseable value passes
 * through untouched rather than being replaced with a guess.
 */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}

/** "colour_family" -> "Colour family". Rewrites nothing else. */
export function humaniseKey(value: string): string {
  const words = value.replace(/_/g, " ").trim();
  if (words.length === 0) return value;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// --------------------------------------------------------------- functions
//
// The four function names and their one-line remits are the design
// specification's own words (styleverse/production.html, the downstream
// section), kept verbatim so the built screen and the spec agree. They are
// LABELS for the enum values stored in downstream_handoff.function, not
// figures, so they are not a provenance question.

export const FUNCTION_ORDER = [
  "DESIGN",
  "MARKETING",
  "RETAIL_OPS",
  "MANUFACTURING",
] as const;

export type FunctionKey = (typeof FUNCTION_ORDER)[number];

export function isFunctionKey(value: string): value is FunctionKey {
  return (FUNCTION_ORDER as readonly string[]).includes(value);
}

export const FUNCTION_LABEL: Record<FunctionKey, string> = {
  DESIGN: "Design & Creative",
  MARKETING: "Marketing",
  RETAIL_OPS: "Retail Operations",
  MANUFACTURING: "Manufacturing",
};

export const FUNCTION_REMIT: Record<FunctionKey, string> = {
  DESIGN: "Attribute demand read",
  MARKETING: "Category push calendar",
  RETAIL_OPS: "Store availability risk",
  MANUFACTURING: "Capacity call",
};

/**
 * What the receiving function does with the handoff. This is the sentence a
 * planner would say out loud when they send it, and it is why the row exists
 * at all -- a handoff nobody can act on is a report.
 */
export const FUNCTION_USE: Record<FunctionKey, string> = {
  DESIGN:
    "Feeds the range brief. These are observations about what has already sold, not instructions about what to design next.",
  MARKETING:
    "Sets how far ahead a category can be briefed, and where availability is capping the return on spend.",
  RETAIL_OPS:
    "Sizes store cover against the replenishment floor, and names the transfers that would level two stores toward their regional median.",
  MANUFACTURING:
    "Sizes the capacity call and says which share of it has to be committed before the horizon opens.",
};
