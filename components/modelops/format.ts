// Formatting for model ops. Spelling only -- nothing here decides a value.
//
// Every number reaching these functions was read from Postgres at request
// time, except the three declared in ./constants. A missing figure prints as
// a dash rather than a zero, because a registry row that carries no coverage
// is not a coverage of nought.

export const DASH = "--";
export const MIDDOT = "·";
export const ARROW = "→";

export function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Postgres numeric arrives as a string over PostgREST; coerce narrowly. */
export function toNumber(value: unknown): number | null {
  if (finite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** A stored fraction rendered as a percentage. 0.8336 -> "83.4%". */
export function pct(value: unknown, decimals = 1): string {
  const n = toNumber(value);
  return n === null ? DASH : `${(n * 100).toFixed(decimals)}%`;
}

/** A figure already expressed in percent. 1.5046 -> "1.50%". */
export function pctPoints(value: unknown, decimals = 2): string {
  const n = toNumber(value);
  return n === null ? DASH : `${n.toFixed(decimals)}%`;
}

/** A margin in accuracy points, always signed. */
export function signedPoints(value: unknown, decimals = 1): string {
  const n = toNumber(value);
  if (n === null) return DASH;
  return `${n > 0 ? "+" : ""}${n.toFixed(decimals)}`;
}

/** A bare number at a fixed precision, for MASE and the like. */
export function fixed(value: unknown, decimals = 2): string {
  const n = toNumber(value);
  return n === null ? DASH : n.toFixed(decimals);
}

/**
 * Integers, Indian-grouped arithmetically rather than through
 * toLocaleString, so the server render and the hydrated client render always
 * produce the identical string.
 */
export function integer(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return DASH;
  const sign = n < 0 ? "-" : "";
  const digits = String(Math.round(Math.abs(n)));
  if (digits.length <= 3) return `${sign}${digits}`;
  const tail = digits.slice(-3);
  let head = digits.slice(0, -3);
  const groups: string[] = [];
  while (head.length > 2) {
    groups.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head.length > 0) groups.unshift(head);
  return `${sign}${groups.join(",")},${tail}`;
}

/** Units to one decimal, for a mean interval width. */
export function units(value: unknown, decimals = 0): string {
  const n = toNumber(value);
  return n === null ? DASH : `${integer(Math.round(n * 10) / 10)}${decimals > 0 ? "" : ""} u`;
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

/** An ISO timestamp in one pinned zone, so SSR and hydration agree. */
export function timestamp(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}

export function dateOnly(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : DATE_ONLY.format(parsed);
}

/** "SPD_planning_grain" -> "planning grain". */
export function modelKind(modelId: string): string {
  const tail = modelId.includes("_") ? modelId.slice(modelId.indexOf("_") + 1) : modelId;
  return tail.replace(/_/g, " ");
}

/** "forecast_agent" -> "Forecast agent". */
export function humanise(value: string): string {
  const words = value.replace(/_/g, " ").trim();
  return words.length === 0 ? value : words.charAt(0).toUpperCase() + words.slice(1);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}
