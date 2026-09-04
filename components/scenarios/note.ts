// What a saved scenario says in the ledger, and how it is read back.
//
// A saved scenario is a planner_decision row with status = SCENARIO. There
// is no scenario table: the point of routing it through the decision ledger
// is that exploration and commitment land in the same append-only record,
// under the same accountable planner, adjudicated by the same RLS policies.
//
// WHAT IS STORED, AND WHAT IS DELIBERATELY NOT
// --------------------------------------------
// override_reason stores the PARAMETERS, in a sentence a merchant can read,
// and not the outcome. That is on purpose. The outcome is a function of a
// forecast that will be re-scored next week; freezing "gross margin INR 812
// Cr" into the audit trail would produce a number that quietly stops
// matching the forecast it came from, and an audit trail whose figures no
// longer reconcile is worse than none. Re-running the stored parameters
// against the current forecast keeps the comparison honest, and the row
// still records what was explored, by whom, and when.
//
// The unit consequence IS written into the sentence, because that is the
// half of a scenario a reader is most likely to lose: a margin figure with
// no unit figure beside it is the misreading this whole screen exists to
// prevent, and the ledger should not be the one place that misreading is
// possible.
//
// The trailing bracket is a machine tail on a human sentence, not a blob.
// Everything in it is restated in words immediately before it; it exists so
// the screen can re-run a saved scenario exactly rather than by parsing
// prose, and it is short enough that a person reading the ledger can check
// the two halves agree.

import {
  PRICE_FRACTION_FLOOR,
  isPriceFractionClamped,
  realisedPriceFraction,
  type LeverState,
} from "./model";

/** null on a dimension means "every value in the planner's readable scope". */
export type ScenarioScope = {
  category: string | null;
  channel: string | null;
  region: string | null;
};

export const ALL_SCOPE: ScenarioScope = {
  category: null,
  channel: null,
  region: null,
};

/** The wildcard written into the machine tail for an unfiltered dimension. */
const ANY = "*";

const TAG_OPEN = "[scenario v1 ";

export type ScenarioNoteInput = {
  name: string;
  levers: LeverState;
  scope: ScenarioScope;
  /** Display names, for the readable half of the sentence. */
  scopeLabels: { category: string; channel: string; region: string };
  brandId: string;
  modelVersion: string;
  rowCount: number;
  horizonWeeks: number;
  baseUnits: number;
  scenarioUnits: number;
  unitChange: number;
  unitChangePct: number | null;
  holdingCostChangeInr: number;
  holdingCostPerUnitWeekInr: number;
  marginChangeInr: number;
  /** Categories in the run that shipped the pooled coefficient. */
  pooledCategories: readonly string[];
};

export type ParsedScenarioNote = {
  name: string;
  levers: LeverState;
  scope: ScenarioScope;
};

/**
 * A name safe to embed in the sentence and to read back out of it.
 *
 * Quotes and square brackets are removed rather than escaped: this is a
 * label, not a payload, and an escaping scheme in an audit string is a
 * parser waiting to disagree with itself.
 */
export function sanitiseScenarioName(raw: string): string {
  return raw
    .replace(/["[\]\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function pct(value: number, decimals = 1): string {
  const scaled = value * 100;
  return `${scaled > 0 ? "+" : ""}${scaled.toFixed(decimals)}%`;
}

function plainPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

function grouped(value: number): string {
  const digits = String(Math.round(Math.abs(value)));
  if (digits.length <= 3) return (value < 0 ? "-" : "") + digits;
  const head = digits.slice(0, digits.length - 3);
  const tail = digits.slice(digits.length - 3);
  return `${value < 0 ? "-" : ""}${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
}

function signedGrouped(value: number): string {
  const magnitude = grouped(Math.abs(value));
  if (Math.round(value) === 0) return magnitude;
  return `${value > 0 ? "+" : "-"}${magnitude}`;
}

/** The sentence that goes into planner_decision.override_reason. */
export function formatScenarioNote(input: ScenarioNoteInput): string {
  const name = sanitiseScenarioName(input.name) || "Untitled scenario";
  const levers = input.levers;

  const capacity =
    levers.capacityShare === null
      ? "no capacity cap"
      : `capacity capped at ${plainPct(levers.capacityShare, 0)} of the base plan`;

  const scope =
    `${input.scopeLabels.category} / ${input.scopeLabels.channel} / ` +
    `${input.scopeLabels.region}`;

  const pooled =
    input.pooledCategories.length > 0
      ? ` The price response for ${input.pooledCategories.join(", ")} used the ` +
        `pooled coefficient rather than its own fit, so that part of the ` +
        `answer is borrowed.`
      : "";

  // The realised price is NOT recomputed here. model.priceFraction is the
  // module's one copy of that arithmetic and realisedPriceFraction applies
  // the fitted-curve floor to it; a second inline copy in this file is
  // exactly how the demand and revenue halves of a scenario drifted apart.
  const clamped = isPriceFractionClamped(levers);
  const clampNote = clamped
    ? `, held up to the ${plainPct(PRICE_FRACTION_FLOOR, 0)} floor the ` +
      `fitted curve stops at, which is the price the whole scenario was ` +
      `costed at`
    : "";

  const readable =
    `Scenario "${name}". Price ${pct(levers.priceChange)} and promotion depth ` +
    `${plainPct(levers.promoDepth)} against the plan's own price point ` +
    `(realised price ${plainPct(realisedPriceFraction(levers))} ` +
    `of plan${clampNote}), ` +
    `marketing index ${levers.marketingIndex.toFixed(2)}, ${capacity}. ` +
    `Scope ${input.brandId} ${scope}: ${grouped(input.rowCount)} stored forecast ` +
    `rows over a ${input.horizonWeeks}-week horizon, model ${input.modelVersion}. ` +
    `Units move ${grouped(input.baseUnits)} to ${grouped(input.scenarioUnits)}, ` +
    `${signedGrouped(input.unitChange)}` +
    `${input.unitChangePct === null ? "" : ` (${pct(input.unitChangePct)})`}, ` +
    `implying ${signedGrouped(input.holdingCostChangeInr)} INR of inventory ` +
    `holding cost at INR ${input.holdingCostPerUnitWeekInr.toFixed(2)} per ` +
    `unit-week over ${input.horizonWeeks} weeks, against a gross margin change ` +
    `of ${signedGrouped(input.marginChangeInr)} INR. Deterministic elasticity ` +
    `applied to the stored forecast; no model was scored and no quantity is ` +
    `committed by this row.${pooled}`;

  const tail =
    `${TAG_OPEN}price=${levers.priceChange.toFixed(4)} ` +
    `depth=${levers.promoDepth.toFixed(4)} ` +
    `marketing=${levers.marketingIndex.toFixed(4)} ` +
    `capacity=${levers.capacityShare === null ? "off" : levers.capacityShare.toFixed(4)} ` +
    `scope=${input.scope.category ?? ANY}|${input.scope.channel ?? ANY}|` +
    `${input.scope.region ?? ANY}]`;

  return `${readable} ${tail}`;
}

function readNumber(source: string, key: string): number | null {
  const match = new RegExp(`\\b${key}=(-?\\d+(?:\\.\\d+)?)`).exec(source);
  if (match === null) return null;
  const value = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(value) ? value : null;
}

/**
 * Read a saved scenario back out of a ledger row.
 *
 * Returns null rather than a guess when the tail is missing or malformed.
 * planner_decision is append-only and open to other writers, so a SCENARIO
 * row this screen did not write is a real possibility, and rendering it as
 * a set of zeroed levers would be an invention.
 */
export function parseScenarioNote(
  text: string | null | undefined,
): ParsedScenarioNote | null {
  if (typeof text !== "string" || text.length === 0) return null;

  const start = text.lastIndexOf(TAG_OPEN);
  if (start === -1) return null;
  const end = text.indexOf("]", start);
  if (end === -1) return null;
  const tail = text.slice(start + TAG_OPEN.length, end);

  const priceChange = readNumber(tail, "price");
  const promoDepth = readNumber(tail, "depth");
  const marketingIndex = readNumber(tail, "marketing");
  if (priceChange === null || promoDepth === null || marketingIndex === null) {
    return null;
  }

  const capacityRaw = /\bcapacity=(off|-?\d+(?:\.\d+)?)/.exec(tail)?.[1] ?? "off";
  const capacityShare =
    capacityRaw === "off" ? null : Number.parseFloat(capacityRaw);

  const scopeRaw = /\bscope=([^\s\]]*)/.exec(tail)?.[1] ?? `${ANY}|${ANY}|${ANY}`;
  const [category = ANY, channel = ANY, region = ANY] = scopeRaw.split("|");

  const name = /^Scenario "([^"]*)"/.exec(text)?.[1] ?? "Saved scenario";

  return {
    name,
    levers: {
      priceChange,
      promoDepth,
      marketingIndex,
      capacityShare:
        capacityShare !== null && Number.isFinite(capacityShare)
          ? capacityShare
          : null,
    },
    scope: {
      category: category === ANY ? null : category,
      channel: channel === ANY ? null : channel,
      region: region === ANY ? null : region,
    },
  };
}

/** "Tops / all channels / India North", for a heading or a chip. */
export function describeScope(labels: {
  category: string;
  channel: string;
  region: string;
}): string {
  return `${labels.category} / ${labels.channel} / ${labels.region}`;
}

/** True when two scopes name the same slice of the book. */
export function sameScope(a: ScenarioScope, b: ScenarioScope): boolean {
  return (
    a.category === b.category && a.channel === b.channel && a.region === b.region
  );
}
