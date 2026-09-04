/**
 * The two rules that make the copilot trustworthy, enforced in CODE.
 *
 * Both of these could be written into the system prompt, and both would then
 * hold most of the time. That is not the same as holding. A prompt is a request
 * to a model; this file is a gate the answer has to pass through, and a model
 * that ignores its instructions still cannot get an unretrieved number or an
 * invented route past it.
 *
 *   1. NUMBER GROUNDING. Every number in the answer must appear in the context
 *      that was retrieved from the database under the caller's own session. A
 *      number that is not in the context was invented, and an invented number
 *      in a merchandising system is worse than no answer at all -- somebody
 *      commits a buy against it.
 *
 *   2. ROUTE VALIDATION. NAVIGATE:<route> is only honoured for routes that
 *      actually exist. A hallucinated route is a dead link that makes the whole
 *      surface feel broken.
 */

/** Every route the copilot may propose. Anything else is dropped. */
export const ROUTE_WHITELIST = [
  "/",
  "/workbench",
  "/exceptions",
  "/buy",
  "/allocation",
  "/markdown",
  "/scenarios",
  "/signals",
  "/downstream",
  "/model-ops",
  "/governance",
  "/adoption",
  "/learning",
  "/portfolio",
] as const;

export type CopilotRoute = (typeof ROUTE_WHITELIST)[number];

const NAVIGATE_RE = /NAVIGATE:\s*(\/[A-Za-z0-9\-/]*)/g;

/**
 * Pull a NAVIGATE directive out of the answer and validate it.
 *
 * Returns the cleaned text with every directive stripped -- valid or not,
 * because the directive is machine syntax and was never meant to be read --
 * plus the route if one survived validation.
 */
export function extractRoute(raw: string): { text: string; route: CopilotRoute | null } {
  let route: CopilotRoute | null = null;

  for (const match of raw.matchAll(NAVIGATE_RE)) {
    const candidate = match[1].replace(/\/+$/, "") || "/";
    if ((ROUTE_WHITELIST as readonly string[]).includes(candidate)) {
      route = candidate as CopilotRoute;
      break; // first valid one wins; a second is noise
    }
  }

  const text = raw.replace(NAVIGATE_RE, "").replace(/[ \t]{2,}/g, " ").trim();
  return { text, route };
}

/* -------------------------------------------------------------------------- */
/* Number grounding                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Numbers a sentence may contain without them being "claims about the data".
 *
 * Rejecting these would make the guard useless in practice: it would refuse
 * "all 6 categories" or "the top 3", which are counts of things the reader can
 * see rather than assertions pulled from a table. The cut-off is deliberately
 * low, because a small integer is checkable at a glance and a large or precise
 * one is not.
 */
const SMALL_INTEGER_CEILING = 12;

/** Years and ISO weeks are calendar facts, not measurements. */
const CALENDAR_RE = /^(19|20)\d{2}$|^W\d{1,2}$/i;

function normalise(token: string): string {
  return token.replace(/[,\s]/g, "").replace(/%$/, "").replace(/^[+]/, "");
}

/**
 * Every numeric token in a string, normalised.
 *
 * Indian digit grouping (12,34,567) and Western (1,234,567) both collapse to
 * the same digits, so a number retrieved as one and rendered as the other still
 * matches -- otherwise the guard would reject the app's own formatting.
 */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[+-]?\d[\d,]*(?:\.\d+)?%?/g)) {
    out.push(normalise(m[0]));
  }
  return out;
}

/**
 * The numeric values the answer is allowed to draw on.
 *
 * HOW THIS CHECK WORKS, and why it is not a string match.
 *
 * The first version of this enumerated roundings -- 0, 1 and 2 decimal places,
 * plus a few unit scalings -- and compared strings. It rejected a model that
 * wrote 0.8256 for a stored 0.825641835665342, because four decimal places
 * were not in the enumeration. The answer then came back gutted, which is the
 * worst outcome: the guard was not catching an invention, it was censoring a
 * correct quotation.
 *
 * So the rule is stated properly instead: a number in the answer is grounded
 * if SOME value in the retrieved context rounds to it AT THE PRECISION THE
 * ANSWER USED. "82.6" is grounded by 0.825641... because that value, scaled to
 * a percentage and rounded to one decimal, is 82.6. "8256" is not grounded by
 * anything, and never becomes so.
 *
 * The scalings are the ones this domain actually speaks in: a fraction read as
 * a percentage, and rupees read in lakh or crore. Each is a different way of
 * saying the same stored quantity, not a different quantity.
 */
const UNIT_SCALINGS = [1, 100, 1 / 1e5, 1 / 1e6, 1 / 1e7] as const;

export type GroundingSet = { values: number[]; literals: Set<string> };

export function groundedNumbers(context: unknown): GroundingSet {
  const values: number[] = [];
  const literals = new Set<string>();

  const walk = (node: unknown): void => {
    if (node === null || node === undefined) return;
    if (typeof node === "number") {
      if (Number.isFinite(node)) values.push(node);
      return;
    }
    if (typeof node === "boolean") return;
    if (typeof node === "string") {
      for (const token of numbersIn(node)) {
        literals.add(token);
        const parsed = Number.parseFloat(token);
        if (Number.isFinite(parsed)) values.push(parsed);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node === "object") {
      for (const value of Object.values(node as Record<string, unknown>)) walk(value);
    }
  };

  walk(context);
  return { values, literals };
}

/** Decimal places written in the token, which is the precision being claimed. */
function precisionOf(token: string): number {
  const dot = token.indexOf(".");
  return dot === -1 ? 0 : token.length - dot - 1;
}

function roundsTo(value: number, target: number, decimals: number): boolean {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor === target;
}

export type GroundingVerdict =
  | { grounded: true }
  | { grounded: false; offending: string[] };

/**
 * Is every number in this text traceable to the retrieved context?
 *
 * Applied per SENTENCE by the route, so one bad clause is dropped rather than
 * the whole answer being thrown away.
 */
export function checkGrounding(text: string, allowed: GroundingSet): GroundingVerdict {
  const offending: string[] = [];

  for (const token of numbersIn(text)) {
    if (allowed.literals.has(token)) continue;

    const target = Number.parseFloat(token);
    if (!Number.isFinite(target)) continue;

    if (CALENDAR_RE.test(token)) continue;
    if (Number.isInteger(target) && Math.abs(target) <= SMALL_INTEGER_CEILING) continue;

    const decimals = precisionOf(token);
    const ok = allowed.values.some((value) =>
      UNIT_SCALINGS.some((scale) => roundsTo(value * scale, target, decimals)),
    );
    if (!ok) offending.push(token);
  }

  return offending.length === 0 ? { grounded: true } : { grounded: false, offending };
}

/** Split into sentences, keeping their terminators so the text reads normally. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  let current = "";

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    current += ch;

    if (ch === "\n") {
      if (current.trim()) out.push(current);
      current = "";
      continue;
    }
    if (ch !== "." && ch !== "!" && ch !== "?") continue;

    // A period BETWEEN DIGITS is a decimal point, not a full stop. Splitting
    // there turns "0.8256" into "0." and "8256", the bare 8256 then fails
    // grounding, and the whole sentence is dropped -- so the answer renders as
    // "SPD scored 0." That is not hypothetical; it is what this code did.
    const prev = text[i - 1];
    const next = text[i + 1];
    if (ch === "." && prev >= "0" && prev <= "9" && next >= "0" && next <= "9") {
      continue;
    }

    // Absorb a run of terminators ("...", "?!") into the same sentence.
    while (i + 1 < text.length && ".!?".includes(text[i + 1])) {
      current += text[++i];
    }
    if (current.trim()) out.push(current);
    current = "";
  }

  if (current.trim()) out.push(current);
  return out.length > 0 ? out : [text];
}
