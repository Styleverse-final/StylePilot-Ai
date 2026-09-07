// Allocation screen -- the shape of one regional shift, and nothing else.
//
// This module holds no numbers. It narrows recommendation.payload (jsonb) to
// the four figures the optimiser actually writes for an ALLOCATION row --
// recommended_units, incumbent_units, reallocated_units, share_shift_pp --
// groups the rows into the category x channel cells a planner reasons about,
// and answers one question against the published autonomy band: does this
// movement execute, or does it escalate.
//
// Two thresholds live near each other on this screen and they are NOT the
// same number, so nothing here conflates them:
//
//   * the ACTION threshold, quoted inside a row's own rationale, decides
//     whether the optimiser calls a movement a shift at all (HOLD vs
//     SHIFT_IN / SHIFT_OUT). It is the model's word, read from the row.
//   * the AGENT BAND, autonomy_band.max_shift_pp, decides who is allowed to
//     commit the movement. It is governance, read from the band row.
//
// Every figure below is read at request time. There is no fallback constant
// anywhere in this file: a row whose payload cannot be read is dropped and
// counted, never filled in.

import type { Json } from "@/lib/database.types";
import type {
  AutonomyBand,
  CommittedDecisionStatus,
  RecAction,
  RecommendationState,
} from "@/lib/queries";
import { committedStatus } from "@/lib/queries";

/** Middle dot, built from its code point so the source stays plain ASCII. */
export const MIDDOT = String.fromCharCode(0xb7);

/** The agent whose band governs this screen. */
export const ALLOCATION_AGENT = "allocation_agent";

// ------------------------------------------------------------------ parsing

function num(value: Json | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * One region's movement inside one category x channel cell.
 *
 * `incumbentUnits` is the prior-year rule's split and `recommendedUnits` the
 * optimiser's; `sharePp` is the change in that region's share of the cell,
 * in percentage points, computed upstream over the whole cell. It is read
 * rather than re-derived on purpose: row level security may hand this screen
 * a subset of a cell's regions, and a share recomputed over a subset would
 * be a different -- and wrong -- number.
 */
export type RegionShift = {
  id: number;
  categoryId: string;
  channelId: string;
  regionId: string;
  seriesKey: string | null;
  action: RecAction | null;
  rationale: string | null;
  confidence: string | null;
  modelVersion: string | null;
  generatedAt: string | null;
  // From v_recommendation_state, which filters SCENARIO out.
  status: CommittedDecisionStatus | null;
  accountablePlanner: string | null;
  decidedAt: string | null;
  overrideReason: string | null;
  recommendedUnits: number;
  incumbentUnits: number;
  reallocatedUnits: number;
  sharePp: number;
  /**
   * What the moved units are worth, DERIVED ON THIS SCREEN.
   *
   * recommendation.value_at_stake_inr is null on every ALLOCATION row, and
   * that stored null stays null: nothing here writes it back, and any screen
   * reading the column still correctly reports that an allocation row is not
   * priced. This field is a different claim -- |reallocatedUnits| x the
   * demand-weighted selling price the forecast already publishes at
   * category x channel x region, which IS the grain these rows sit on.
   *
   * It is REVENUE THAT TRAVELS WITH THE UNITS, not margin and not
   * incremental revenue. A reallocation moves demand between regions rather
   * than creating it, so this figure sizes the movement; it does not
   * describe a gain. The absolute value is deliberate for the same reason:
   * the direction is already stated by the signed units beside it, and a
   * negative rupee figure would read as a loss the model never claimed.
   *
   * Null whenever the series carries no published price. There is no
   * brand-average fallback, because a price borrowed from another series
   * would be this screen's own invention wearing the clothes of a read.
   */
  valueAtStakeInr: number | null;
};

export type ParsedShifts = {
  shifts: RegionShift[];
  /** Rows whose payload carried no readable split. Reported, never faked. */
  unreadable: number;
};

/**
 * The forecast's own grain, category x channel x region.
 *
 * Deliberately a second function rather than a wider `seriesKeyOf`: that one
 * keys the category x channel CELL a planner reallocates across, and one cell
 * holds several of these. Two keys that look alike and mean different things
 * are the fastest way to join the wrong price onto the wrong row, so each
 * spelling lives in exactly one place and both callers use it.
 */
export function forecastSeriesKey(
  categoryId: string,
  channelId: string,
  regionId: string,
): string {
  return `${categoryId}|${channelId}|${regionId}`;
}

/**
 * Narrow ALLOCATION recommendations into regional shifts.
 *
 * A row needs an identity, a recommended split, an incumbent split and a
 * share movement to be drawable. Anything short of that is counted in
 * `unreadable` and left off the board rather than defaulted to zero, because
 * a zero would read as "the optimiser proposes no change", which is a claim
 * the data did not make.
 *
 * `aspBySeries` is optional and a missing entry is not an error: it prices
 * the movement where the forecast published a price and leaves it null
 * everywhere else. A row is never dropped for want of a price -- the units
 * and the share movement are the decision, and the money is the gloss.
 */
export function toRegionShifts(
  rows: RecommendationState[],
  aspBySeries?: ReadonlyMap<string, number>,
): ParsedShifts {
  const shifts: RegionShift[] = [];
  let unreadable = 0;

  for (const row of rows) {
    const recommended = num(row.payload.recommended_units);
    const incumbent = num(row.payload.incumbent_units);
    const sharePp = num(row.payload.share_shift_pp);

    if (
      row.id === null ||
      row.category_id === null ||
      row.channel_id === null ||
      row.region_id === null ||
      recommended === null ||
      incumbent === null ||
      sharePp === null
    ) {
      unreadable += 1;
      continue;
    }

    // Read when the optimiser wrote it; otherwise the difference between the
    // two figures already on screen. Arithmetic on shown values, not an
    // invented figure. Hoisted out of the literal below because the derived
    // value is |this| x price and must multiply the same number the row draws.
    const reallocated =
      num(row.payload.reallocated_units) ?? recommended - incumbent;

    // The price is looked up, never defaulted. A series the forecast does not
    // price leaves valueAtStakeInr null and the board shows a dash for it.
    const aspInr =
      aspBySeries?.get(
        forecastSeriesKey(row.category_id, row.channel_id, row.region_id),
      ) ?? null;

    shifts.push({
      id: row.id,
      categoryId: row.category_id,
      channelId: row.channel_id,
      regionId: row.region_id,
      seriesKey: row.series_key,
      action: row.action,
      rationale: row.rationale,
      confidence: row.confidence,
      modelVersion: row.model_version,
      generatedAt: row.generated_at,
      status: committedStatus(row.status),
      accountablePlanner: row.accountable_planner,
      decidedAt: row.decided_at,
      overrideReason: row.override_reason,
      recommendedUnits: recommended,
      incumbentUnits: incumbent,
      reallocatedUnits: reallocated,
      sharePp,
      valueAtStakeInr: aspInr === null ? null : Math.abs(reallocated) * aspInr,
    });
  }

  return { shifts, unreadable };
}

// ----------------------------------------------------------------- grouping

/** One category x channel cell: the unit a planner reallocates across. */
export type SeriesGroup = {
  /** `${categoryId}|${channelId}`, and the value carried in the URL. */
  key: string;
  categoryId: string;
  channelId: string;
  /** Regions in the cell, largest recommended split first. */
  rows: RegionShift[];
  /** Shared upper bound for every bar in the cell. */
  maxUnits: number;
  /** Largest absolute share movement in the cell. */
  peakAbsPp: number;
  /** Rows in the cell the agent will not commit on its own. */
  escalating: number;
};

export function seriesKeyOf(categoryId: string, channelId: string): string {
  return `${categoryId}|${channelId}`;
}

/**
 * Group by cell, ordered so the screen opens where a planner is actually
 * needed: cells carrying escalations first, then the cell whose comparison
 * is most complete in this reader's scope, then the widest movement.
 *
 * The first key is the product decision. Rows inside the band are already
 * committed by the agent, so a board that opens on them shows a planner work
 * that is finished; the escalations are the ones waiting on a person.
 */
export function groupBySeries(
  shifts: RegionShift[],
  ceilingPp: number | null,
): SeriesGroup[] {
  const byKey = new Map<string, SeriesGroup>();

  for (const shift of shifts) {
    const key = seriesKeyOf(shift.categoryId, shift.channelId);
    const existing = byKey.get(key);
    if (existing) {
      existing.rows.push(shift);
      continue;
    }
    byKey.set(key, {
      key,
      categoryId: shift.categoryId,
      channelId: shift.channelId,
      rows: [shift],
      maxUnits: 0,
      peakAbsPp: 0,
      escalating: 0,
    });
  }

  const groups = [...byKey.values()];
  for (const group of groups) {
    group.rows.sort((a, b) => b.recommendedUnits - a.recommendedUnits);
    group.maxUnits = group.rows.reduce(
      (acc, row) => Math.max(acc, row.recommendedUnits, row.incumbentUnits),
      0,
    );
    group.peakAbsPp = group.rows.reduce(
      (acc, row) => Math.max(acc, Math.abs(row.sharePp)),
      0,
    );
    group.escalating = group.rows.reduce(
      (acc, row) =>
        verdictFor(row.sharePp, ceilingPp) === "within" ? acc : acc + 1,
      0,
    );
  }

  groups.sort(
    (a, b) =>
      b.escalating - a.escalating ||
      b.rows.length - a.rows.length ||
      b.peakAbsPp - a.peakAbsPp ||
      a.key.localeCompare(b.key),
  );
  return groups;
}

/** The requested cell when it is in scope, otherwise the widest movement. */
export function resolveGroup(
  groups: SeriesGroup[],
  requested: string | string[] | undefined,
): SeriesGroup | null {
  const wanted = Array.isArray(requested) ? requested[0] : requested;
  if (wanted) {
    const match = groups.find((group) => group.key === wanted);
    if (match) return match;
  }
  return groups[0] ?? null;
}

// --------------------------------------------------------------------- band

/**
 * "within" -- the agent commits it; "escalates" -- a person does;
 * "unbanded" -- no band is published for this brand, so nothing is
 * autonomous and the screen must say so rather than assume a default.
 */
export type BandVerdict = "within" | "escalates" | "unbanded";

export function allocationBand(bands: AutonomyBand[]): AutonomyBand | null {
  return bands.find((band) => band.agent_name === ALLOCATION_AGENT) ?? null;
}

/** max_shift_pp, or null when the band is absent, disabled or unset. */
export function bandCeilingPp(band: AutonomyBand | null): number | null {
  if (!band || !band.enabled) return null;
  const value = Number(band.max_shift_pp);
  return Number.isFinite(value) ? value : null;
}

/**
 * Strictly below the ceiling executes; at or above it escalates. That is the
 * band's own wording ("shifts of X pp or more ... are escalated"), so the
 * boundary case is decided by the band rather than by this function.
 */
export function verdictFor(
  sharePp: number,
  ceilingPp: number | null,
): BandVerdict {
  if (ceilingPp === null) return "unbanded";
  return Math.abs(sharePp) < ceilingPp ? "within" : "escalates";
}

export type BandTally = {
  within: number;
  escalates: number;
  unbanded: number;
  shiftIn: number;
  shiftOut: number;
  hold: number;
  escalatedShiftIn: number;
  escalatedShiftOut: number;
  escalatedOther: number;
};

export function tally(shifts: RegionShift[], ceilingPp: number | null): BandTally {
  const counts: BandTally = {
    within: 0,
    escalates: 0,
    unbanded: 0,
    shiftIn: 0,
    shiftOut: 0,
    hold: 0,
    escalatedShiftIn: 0,
    escalatedShiftOut: 0,
    escalatedOther: 0,
  };

  for (const shift of shifts) {
    const verdict = verdictFor(shift.sharePp, ceilingPp);
    counts[verdict] += 1;

    if (shift.action === "SHIFT_IN") counts.shiftIn += 1;
    else if (shift.action === "SHIFT_OUT") counts.shiftOut += 1;
    else if (shift.action === "HOLD") counts.hold += 1;

    if (verdict !== "within") {
      if (shift.action === "SHIFT_IN") counts.escalatedShiftIn += 1;
      else if (shift.action === "SHIFT_OUT") counts.escalatedShiftOut += 1;
      else counts.escalatedOther += 1;
    }
  }

  return counts;
}

/** The widest movement in scope -- the evidence the drift card cites. */
export function widestMovement(shifts: RegionShift[]): RegionShift | null {
  let widest: RegionShift | null = null;
  for (const shift of shifts) {
    if (widest === null || Math.abs(shift.sharePp) > Math.abs(widest.sharePp)) {
      widest = shift;
    }
  }
  return widest;
}

// --------------------------------------------------------------- provenance

export type Provenance = {
  /** Every distinct model_version behind the rows on screen. */
  modelVersions: string[];
  /** The newest generated_at across those rows. */
  generatedAt: string | null;
  /** The confidence band, when every row agrees on one. */
  confidence: "High" | "Medium" | "Low" | null;
};

export function provenanceOf(shifts: RegionShift[]): Provenance {
  const versions = new Set<string>();
  const confidences = new Set<string>();
  let generatedAt: string | null = null;

  for (const shift of shifts) {
    if (shift.modelVersion) versions.add(shift.modelVersion);
    if (shift.confidence) confidences.add(shift.confidence);
    if (shift.generatedAt && (generatedAt === null || shift.generatedAt > generatedAt)) {
      generatedAt = shift.generatedAt;
    }
  }

  const only = confidences.size === 1 ? [...confidences][0] : null;
  return {
    modelVersions: [...versions].sort(),
    generatedAt,
    confidence:
      only === "High" || only === "Medium" || only === "Low" ? only : null,
  };
}

// --------------------------------------------------------------- formatting

const ACTION_LABEL: Record<RecAction, string> = {
  INCREASE_BUY: "Increase buy",
  REDUCE_BUY: "Reduce buy",
  HOLD: "Hold",
  SHIFT_IN: "Shift in",
  SHIFT_OUT: "Shift out",
  STOCKOUT_RISK: "Stockout risk",
  OVERSTOCK_RISK: "Overstock risk",
};

export function actionLabel(action: RecAction | null): string {
  return action === null ? "No action" : ACTION_LABEL[action];
}

const STATUS_LABEL: Record<CommittedDecisionStatus, string> = {
  APPROVED: "Approved",
  MODIFIED: "Modified",
  REJECTED: "Rejected",
};

export function statusLabel(status: CommittedDecisionStatus): string {
  return STATUS_LABEL[status];
}

/** Signed percentage points, two decimals, as the band is expressed. */
export function formatPp(value: number): string {
  const fixed = Math.abs(value).toFixed(2);
  if (value > 0) return `+${fixed}`;
  if (value < 0) return `-${fixed}`;
  return fixed;
}

/** The band ceiling, spelled the way the band spells it. */
export function formatCeiling(value: number): string {
  return `${value.toFixed(2)} pp`;
}

/**
 * Split autonomy_band.escalates_when into the triggers it lists.
 *
 * The column is one prose sentence-or-three written by governance, and the
 * band card sets it as a list because a reader scanning for "is my case one
 * of these" should not have to parse a paragraph to find out. THE LIST IS
 * TYPOGRAPHY, NOT AUTHORSHIP: every item returned here is a verbatim slice of
 * the stored string. Nothing is reworded, nothing is added, and no trigger is
 * invented in a component -- if governance widens the band tomorrow, the list
 * changes with the column and not with a deploy.
 *
 * The boundary is a sentence terminator or a semicolon, and a full stop
 * between two digits is not one: "shifts of 1.25 pp or more" must not become
 * "shifts of 1." and "25 pp or more", which would destroy the very number the
 * clause exists to state. That is the same rule the exception queue's
 * rationale splitter needs, for the same reason.
 *
 * Fewer than two clauses means the prose does not enumerate anything, so this
 * returns an empty list and the caller keeps the paragraph. A one-item bullet
 * list is a paragraph wearing a dot.
 */
export function escalationClauses(text: string | null | undefined): string[] {
  if (!text) return [];

  const clauses: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== "." && ch !== ";") continue;

    const prev = text[i - 1];
    const next = text[i + 1];
    if (ch === "." && prev >= "0" && prev <= "9" && next >= "0" && next <= "9") {
      continue;
    }

    const clause = text.slice(start, i).trim();
    if (clause.length > 0) clauses.push(clause);
    start = i + 1;
  }

  const tail = text.slice(start).trim();
  if (tail.length > 0) clauses.push(tail);

  return clauses.length < 2 ? [] : clauses;
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

/** One fixed zone, so the server render and the hydrated render agree. */
export function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP.format(parsed);
}

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : DATE_ONLY.format(parsed);
}
