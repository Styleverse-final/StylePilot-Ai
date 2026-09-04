// Server-side reads for the adoption screen, plus the assembly of those rows
// into the four shapes it renders: the readiness segments, the reallocation
// of a week, the trust curve by pilot wave, and the FTE arithmetic that the
// redeployment ledger is checked against.
//
// WHY THESE READS ARE NOT BRAND-FILTERED
// --------------------------------------
// lib/queries.ts already carries getPlannerAdoption(sb, brandId) and
// getTimeReallocation(sb, brandId). Both take a brand and both would be
// WRONG here. planner_adoption and dim_planner are governed by policies that
// hand a group CMPO or a CoE administrator the whole portfolio and everybody
// else their own brand; passing the viewer's own brand_id would quietly
// narrow a portfolio view back to one brand and the screen would report 320
// planners where 450 are readable. So these reads name no brand at all and
// let row level security decide the scope, which is the same rule the rest
// of the application follows. The touchless rate is read through
// lib/queries.ts unchanged, because that view is already unfiltered.
//
// WHY THEY ARE HERE AND NOT IN lib/queries.ts
// -------------------------------------------
// The convention components/buy/data.ts and components/learning/data.ts
// established: screen-scoped reads live beside the screen, with the same
// signature style as lib/queries (the Supabase client is the first argument,
// so the CALLER decides whose row level security applies) and the same
// failure discipline. If a second screen needs any of this it should be
// promoted into lib/queries.ts at that point.
//
// PAGING
// ------
// learning_completion holds thousands of rows and PostgREST caps a single
// response. Every read that can exceed one page goes through readAll(),
// which walks .range() until a short page comes back. A trust curve that
// silently stopped at the first thousand rows would understate every wave.

import type { Database } from "@/lib/database.types";
import type { StyleverseClient } from "@/lib/supabase";

import { num, numOr0 } from "./format";
import { AUTOMATABLE_SHARE, type ActivityKey } from "./premise";

type Tbl = Database["public"]["Tables"];
type Vw = Database["public"]["Views"];

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

type ReadResult<T> = {
  data: T[] | null;
  error: { message: string; hint?: string | null } | null;
};

function fail(what: string, error: { message: string; hint?: string | null }): never {
  const hint = error.hint ? ` (${error.hint})` : "";
  throw new Error(`StyleVerse: ${what} failed -- ${error.message}${hint}`);
}

async function readAll<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<ReadResult<T>>,
): Promise<T[]> {
  const out: T[] = [];
  for (let index = 0; index < MAX_PAGES; index += 1) {
    const from = index * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) fail(what, error);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

// ===================================================================== reads

type AdoptionRow = Pick<
  Tbl["planner_adoption"]["Row"],
  | "employee_id"
  | "brand_id"
  | "role"
  | "in_pilot_wave"
  | "readiness"
  | "apprehension"
  | "adoption_index"
  | "segment"
  | "recommended_learning_hours"
  | "rationale"
>;

/** Every adoption row row level security will hand this session. */
export async function getAdoptionRows(
  sb: StyleverseClient,
): Promise<AdoptionRow[]> {
  return readAll<AdoptionRow>("getAdoptionRows", (from, to) =>
    sb
      .from("planner_adoption")
      .select(
        "employee_id, brand_id, role, in_pilot_wave, readiness, apprehension, adoption_index, segment, recommended_learning_hours, rationale",
      )
      .order("adoption_index", { ascending: false, nullsFirst: false })
      .range(from, to),
  );
}

type TimeRow = Vw["v_time_reallocation"]["Row"];

/** Where the week goes now, per brand and role, straight from the view. */
export async function getTimeRows(sb: StyleverseClient): Promise<TimeRow[]> {
  const { data, error } = await sb
    .from("v_time_reallocation")
    .select("*")
    .order("brand_id", { ascending: true })
    .order("role", { ascending: true });
  if (error) fail("getTimeRows", error);
  return data ?? [];
}

type WavePersonRow = Pick<
  Tbl["dim_planner"]["Row"],
  "employee_id" | "brand_id" | "in_pilot_wave"
>;

export async function getWavePeople(
  sb: StyleverseClient,
): Promise<WavePersonRow[]> {
  return readAll<WavePersonRow>("getWavePeople", (from, to) =>
    sb
      .from("dim_planner")
      .select("employee_id, brand_id, in_pilot_wave")
      .order("employee_id", { ascending: true })
      .range(from, to),
  );
}

type ProgressRow = Pick<
  Tbl["learning_completion"]["Row"],
  "employee_id" | "status" | "started_at" | "completed_at"
>;

export async function getProgressRows(
  sb: StyleverseClient,
): Promise<ProgressRow[]> {
  return readAll<ProgressRow>("getProgressRows", (from, to) =>
    sb
      .from("learning_completion")
      .select("employee_id, status, started_at, completed_at")
      .order("id", { ascending: true })
      .range(from, to),
  );
}

type DecisionRow = Pick<
  Tbl["planner_decision"]["Row"],
  "planner_id" | "status" | "actor_type" | "decided_at"
>;

/**
 * Human decisions only. Agent rows live in the same table by design, and
 * counting them here would make the pilot's decision log look an order of
 * magnitude larger than the number of decisions a person actually took.
 */
export async function getHumanDecisionRows(
  sb: StyleverseClient,
): Promise<DecisionRow[]> {
  return readAll<DecisionRow>("getHumanDecisionRows", (from, to) =>
    sb
      .from("planner_decision")
      .select("planner_id, status, actor_type, decided_at")
      .neq("status", "SCENARIO")
      .order("decided_at", { ascending: true })
      .range(from, to),
  ).then((rows) => rows.filter((row) => row.actor_type !== "agent"));
}

// ================================================================== segments

export type SegmentSummary = {
  segment: string;
  people: number;
  /** Share of everyone readable in this scope. */
  share: number;
  readinessMean: number | null;
  readinessMin: number | null;
  readinessMax: number | null;
  apprehensionMean: number | null;
  apprehensionMin: number | null;
  apprehensionMax: number | null;
  indexMean: number | null;
  /** Distinct recommended_learning_hours values in the segment. */
  hours: number[];
  /** Headcount by brand, so a portfolio view can show the split. */
  byBrand: { brandId: string; people: number }[];
};

export type AxisCut = {
  /** Highest value on the low side of the cut. */
  below: number;
  /** Lowest value on the high side. */
  atOrAbove: number;
  /** Segment labels on each side, so the screen can name them. */
  lowSegments: string[];
  highSegments: string[];
};

export type SegmentView = {
  segments: SegmentSummary[];
  people: number;
  /** Where the two survey answers were cut, read off the rows themselves. */
  readinessCut: AxisCut | null;
  apprehensionCut: AxisCut | null;
  /** One row's own rationale string, verbatim. The index, spelled out. */
  sampleRationale: string | null;
  brands: string[];
};

function meanOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Where an axis was cut, derived rather than declared.
 *
 * The segmentation is a two-by-two on two survey answers. That means there
 * is exactly one value of readiness, and one of apprehension, at which the
 * four segment labels separate cleanly into two groups. This walks the
 * distinct values in the rows on screen and finds the split where no segment
 * appears on both sides. If the rows in scope do not produce exactly one
 * such split -- too few people, one segment missing -- it returns null and
 * the screen says nothing about a threshold rather than asserting 3.5.
 */
function axisCut(
  rows: readonly { value: number; segment: string }[],
): AxisCut | null {
  const values = [...new Set(rows.map((row) => row.value))].sort((a, b) => a - b);
  if (values.length < 2) return null;

  const found: AxisCut[] = [];
  for (let index = 0; index < values.length - 1; index += 1) {
    const below = values[index];
    const atOrAbove = values[index + 1];
    const low = new Set<string>();
    const high = new Set<string>();
    for (const row of rows) {
      if (row.value <= below) low.add(row.segment);
      else high.add(row.segment);
    }
    if (low.size === 0 || high.size === 0) continue;
    const overlaps = [...low].some((segment) => high.has(segment));
    if (overlaps) continue;
    found.push({
      below,
      atOrAbove,
      lowSegments: [...low].sort(),
      highSegments: [...high].sort(),
    });
  }

  // More than one clean split means the rows do not pin a single threshold,
  // which is a legitimate state in a small scope. Say nothing rather than
  // pick one.
  return found.length === 1 ? found[0] : null;
}

export function buildSegments(rows: readonly AdoptionRow[]): SegmentView {
  const bySegment = new Map<string, AdoptionRow[]>();
  for (const row of rows) {
    const key = row.segment ?? "Unsegmented";
    const bucket = bySegment.get(key);
    if (bucket) bucket.push(row);
    else bySegment.set(key, [row]);
  }

  const people = rows.length;

  const segments: SegmentSummary[] = [...bySegment.entries()].map(
    ([segment, members]) => {
      const readiness = members
        .map((row) => num(row.readiness))
        .filter((value): value is number => value !== null);
      const apprehension = members
        .map((row) => num(row.apprehension))
        .filter((value): value is number => value !== null);
      const index = members
        .map((row) => num(row.adoption_index))
        .filter((value): value is number => value !== null);

      const brandCounts = new Map<string, number>();
      for (const row of members) {
        const brand = row.brand_id ?? "unattributed";
        brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1);
      }

      return {
        segment,
        people: members.length,
        share: people > 0 ? members.length / people : 0,
        readinessMean: meanOf(readiness),
        readinessMin: readiness.length > 0 ? Math.min(...readiness) : null,
        readinessMax: readiness.length > 0 ? Math.max(...readiness) : null,
        apprehensionMean: meanOf(apprehension),
        apprehensionMin: apprehension.length > 0 ? Math.min(...apprehension) : null,
        apprehensionMax: apprehension.length > 0 ? Math.max(...apprehension) : null,
        indexMean: meanOf(index),
        hours: [
          ...new Set(
            members
              .map((row) => num(row.recommended_learning_hours))
              .filter((value): value is number => value !== null),
          ),
        ].sort((a, b) => a - b),
        byBrand: [...brandCounts.entries()]
          .map(([brandId, count]) => ({ brandId, people: count }))
          .sort((a, b) => b.people - a.people),
      };
    },
  );

  // Ordered by the index itself, most ready first. Not by a list of names
  // written here, so a segment that stopped being the strongest would move.
  segments.sort((a, b) => (b.indexMean ?? -1) - (a.indexMean ?? -1));

  const readinessPoints = rows
    .map((row) => ({ value: num(row.readiness), segment: row.segment }))
    .filter(
      (point): point is { value: number; segment: string } =>
        point.value !== null && typeof point.segment === "string",
    );
  const apprehensionPoints = rows
    .map((row) => ({ value: num(row.apprehension), segment: row.segment }))
    .filter(
      (point): point is { value: number; segment: string } =>
        point.value !== null && typeof point.segment === "string",
    );

  const brands = [
    ...new Set(
      rows
        .map((row) => row.brand_id)
        .filter((brand): brand is string => typeof brand === "string"),
    ),
  ].sort();

  return {
    segments,
    people,
    readinessCut: axisCut(readinessPoints),
    apprehensionCut: axisCut(apprehensionPoints),
    sampleRationale:
      rows.find((row) => typeof row.rationale === "string" && row.rationale.length > 0)
        ?.rationale ?? null,
    brands,
  };
}

// ============================================================== reallocation

export const ACTIVITY_LABEL: Record<ActivityKey, string> = {
  pct_demand_forecasting: "Forecast preparation",
  pct_reporting: "Reporting",
  pct_allocation: "Allocation",
  pct_assortment: "Assortment",
  pct_meetings: "Meetings",
  pct_commercial_strategy: "Commercial strategy",
};

/**
 * Fixed reading order, taken from the visual specification's own list rather
 * than sorted by anything. It is NOT descending automatable share --
 * reporting is the most automatable activity in the audit and sits second --
 * and it is not sorted by size either, because a reading order that moved
 * when the rows moved would make two screenshots of this panel impossible to
 * compare.
 */
export const ACTIVITY_ORDER: readonly ActivityKey[] = [
  "pct_demand_forecasting",
  "pct_reporting",
  "pct_allocation",
  "pct_assortment",
  "pct_meetings",
  "pct_commercial_strategy",
];

export type ActivitySummary = {
  key: ActivityKey;
  label: string;
  /** Headcount-weighted mean of the view's per-role means. */
  before: number;
  /** The premise. Printed on screen beside the arithmetic it drives. */
  automatable: number;
  after: number;
  freed: number;
};

export type RoleSummary = {
  brandId: string;
  role: string;
  planners: number;
  /** The six shares as the view publishes them. */
  before: Record<ActivityKey, number>;
  /** Their sum. Need not be 1: the view rounds each mean independently. */
  publishedTotal: number;
  /** Share of this role's published week the formula frees. */
  freedShare: number;
  automatableFte: number;
  freedFte: number;
};

export type Reallocation = {
  roles: RoleSummary[];
  activities: ActivitySummary[];
  planners: number;
  /** The measured agent-execution rate the projection turns on. */
  realisedAutomation: number;
  /** Sum of the six weighted means. Reads under 1 where the view rounds down. */
  publishedTotal: number;
  publishedTotalMin: number;
  publishedTotalMax: number;
  /** Full-time equivalents of automatable work, before any automation. */
  automatableFte: number;
  /** Of that, what the measured rate actually frees. */
  freedFte: number;
  brands: string[];
};

/**
 * The before-state, the formula, and nothing else.
 *
 *   time_after = time_before x (1 - automatable_share x realised_automation)
 *
 * time_before is v_time_reallocation. realised_automation is the measured
 * agent-execution rate from v_touchless_rate. automatable_share is the one
 * premise, and it is carried through to the screen so the multiplication is
 * visible rather than implied.
 *
 * Every aggregate here is HEADCOUNT-WEIGHTED. A brand mix that averaged the
 * per-role means unweighted would give the six-person commercial lead row
 * the same say as the hundred-and-two-person demand planner row, and the
 * whole point of this panel is how many people's weeks change.
 */
export function buildReallocation(
  rows: readonly TimeRow[],
  realisedAutomation: number,
): Reallocation {
  const roles: RoleSummary[] = rows.map((row) => {
    const planners = numOr0(row.planners);
    const before = {} as Record<ActivityKey, number>;
    for (const key of ACTIVITY_ORDER) before[key] = numOr0(row[key]);

    let publishedTotal = 0;
    let automatableWithinWeek = 0;
    for (const key of ACTIVITY_ORDER) {
      publishedTotal += before[key];
      automatableWithinWeek += before[key] * AUTOMATABLE_SHARE[key];
    }

    const freedWithinWeek = automatableWithinWeek * realisedAutomation;

    return {
      brandId: row.brand_id ?? "unattributed",
      role: row.role ?? "unattributed",
      planners,
      before,
      publishedTotal,
      // Against the row's OWN published total, not against a notional 100%.
      // Dividing by 1 where the six shares sum to 0.9 would understate the
      // share of the week freed by a tenth, silently.
      freedShare: publishedTotal > 0 ? freedWithinWeek / publishedTotal : 0,
      automatableFte: planners * automatableWithinWeek,
      freedFte: planners * freedWithinWeek,
    };
  });

  const planners = roles.reduce((total, role) => total + role.planners, 0);

  const activities: ActivitySummary[] = ACTIVITY_ORDER.map((key) => {
    const weighted = roles.reduce(
      (total, role) => total + role.planners * role.before[key],
      0,
    );
    const before = planners > 0 ? weighted / planners : 0;
    const automatable = AUTOMATABLE_SHARE[key];
    const after = before * (1 - automatable * realisedAutomation);
    return {
      key,
      label: ACTIVITY_LABEL[key],
      before,
      automatable,
      after,
      freed: before - after,
    };
  });

  const totals = roles.map((role) => role.publishedTotal);

  return {
    roles: roles.sort(
      (a, b) => b.planners - a.planners || a.role.localeCompare(b.role),
    ),
    activities,
    planners,
    realisedAutomation,
    publishedTotal: activities.reduce((total, activity) => total + activity.before, 0),
    publishedTotalMin: totals.length > 0 ? Math.min(...totals) : 0,
    publishedTotalMax: totals.length > 0 ? Math.max(...totals) : 0,
    automatableFte: roles.reduce((total, role) => total + role.automatableFte, 0),
    freedFte: roles.reduce((total, role) => total + role.freedFte, 0),
    brands: [...new Set(roles.map((role) => role.brandId))].sort(),
  };
}

// =============================================================== trust curve

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type CurvePoint = {
  /** Weeks since this wave's own first recorded activity. */
  week: number;
  /** Cumulative share of the wave's curriculum recorded complete. */
  share: number;
};

export type WaveCurve = {
  wave: string;
  people: number;
  /** Curriculum rows belonging to this wave: the denominator. */
  modules: number;
  completed: number;
  share: number;
  startedOn: string | null;
  lastRecordedOn: string | null;
  measured: CurvePoint[];
  /**
   * Empty for every wave far enough through to speak for itself. Non-empty
   * for the least mature wave, and DASHED on screen, because it is not an
   * observation of anything.
   */
  projected: CurvePoint[];
};

export type TrustCurve = {
  waves: WaveCurve[];
  /** The wave whose forward path is a projection, if there is one. */
  projectedWave: string | null;
  /** The waves the projection borrows its pace from. */
  referenceWaves: string[];
  /** Elapsed weeks the chart spans. */
  horizonWeeks: number;
  /** Total curriculum rows readable in this scope. */
  modules: number;
  /** Completion rows carrying no date, so absent from the curve. */
  undatedCompletions: number;
};

function weekIndex(from: number, at: string | null): number | null {
  if (!at) return null;
  const time = new Date(at).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((time - from) / WEEK_MS));
}

/**
 * Cumulative curriculum completion by pilot wave, on each wave's own clock.
 *
 * The x axis is elapsed weeks since that wave's first recorded activity, not
 * a calendar. The waves were onboarded months apart, so a calendar axis
 * would show three curves in three different places and invite the reader to
 * conclude something about the later waves that is really just the rollout
 * schedule.
 *
 * The LEAST MATURE wave -- latest first activity -- is the one whose forward
 * path is projected, and the projection is the mean weekly pace the earlier
 * waves recorded over the same elapsed weeks. That is an assumption. It is
 * carried in a separate array from the measured points so a component
 * physically cannot draw the two with the same stroke.
 */
export function buildTrustCurve(
  people: readonly WavePersonRow[],
  progress: readonly ProgressRow[],
): TrustCurve {
  const waveOf = new Map<string, string>();
  const peopleByWave = new Map<string, number>();
  for (const person of people) {
    if (!person.in_pilot_wave) continue;
    waveOf.set(person.employee_id, person.in_pilot_wave);
    peopleByWave.set(
      person.in_pilot_wave,
      (peopleByWave.get(person.in_pilot_wave) ?? 0) + 1,
    );
  }

  type Bucket = {
    modules: number;
    completed: number;
    earliest: number | null;
    latest: number | null;
    doneAt: number[];
  };
  const buckets = new Map<string, Bucket>();
  let undated = 0;

  for (const row of progress) {
    const wave = waveOf.get(row.employee_id);
    if (!wave) continue;
    let bucket = buckets.get(wave);
    if (!bucket) {
      bucket = { modules: 0, completed: 0, earliest: null, latest: null, doneAt: [] };
      buckets.set(wave, bucket);
    }
    bucket.modules += 1;

    for (const stamp of [row.started_at, row.completed_at]) {
      if (!stamp) continue;
      const time = new Date(stamp).getTime();
      if (Number.isNaN(time)) continue;
      bucket.earliest = bucket.earliest === null ? time : Math.min(bucket.earliest, time);
    }

    if (row.status !== "completed") continue;
    bucket.completed += 1;
    const done = row.completed_at ? new Date(row.completed_at).getTime() : Number.NaN;
    if (Number.isNaN(done)) {
      undated += 1;
      continue;
    }
    bucket.doneAt.push(done);
    bucket.latest = bucket.latest === null ? done : Math.max(bucket.latest, done);
  }

  const drafts = [...buckets.entries()]
    .map(([wave, bucket]) => {
      const start = bucket.earliest;
      const measured: CurvePoint[] = [];
      let lastWeek = 0;

      if (start !== null && bucket.modules > 0) {
        const perWeek = new Map<number, number>();
        for (const done of bucket.doneAt) {
          const week = weekIndex(start, new Date(done).toISOString());
          if (week === null) continue;
          perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
          if (week > lastWeek) lastWeek = week;
        }
        let running = 0;
        for (let week = 0; week <= lastWeek; week += 1) {
          running += perWeek.get(week) ?? 0;
          measured.push({ week, share: running / bucket.modules });
        }
      }

      return {
        wave,
        people: peopleByWave.get(wave) ?? 0,
        modules: bucket.modules,
        completed: bucket.completed,
        share: bucket.modules > 0 ? bucket.completed / bucket.modules : 0,
        startedOn: start === null ? null : new Date(start).toISOString(),
        lastRecordedOn: bucket.latest === null ? null : new Date(bucket.latest).toISOString(),
        measured,
        start,
      };
    })
    .sort((a, b) => a.wave.localeCompare(b.wave));

  // The least mature wave is the one that started last. Read from the rows,
  // not from the label: "Wave 3" is a name, and a name is not evidence.
  let youngest: (typeof drafts)[number] | null = null;
  for (const draft of drafts) {
    if (draft.start === null) continue;
    if (youngest === null || (youngest.start ?? 0) < draft.start) youngest = draft;
  }

  const horizonWeeks = drafts.reduce(
    (max, draft) => Math.max(max, draft.measured.at(-1)?.week ?? 0),
    0,
  );

  const references = drafts.filter(
    (draft) => youngest !== null && draft.wave !== youngest.wave && draft.measured.length > 1,
  );

  const waves: WaveCurve[] = drafts.map((draft) => {
    const isYoungest = youngest !== null && draft.wave === youngest.wave;
    const lastMeasured = draft.measured.at(-1);
    const projected: CurvePoint[] = [];

    if (isYoungest && lastMeasured && references.length > 0) {
      // The pace, not the level: the mean week-on-week increment the earlier
      // waves recorded over the SAME elapsed weeks. Borrowing their level
      // instead would assert that this wave catches up, which is exactly the
      // claim the rows do not support.
      let running = lastMeasured.share;
      projected.push({ week: lastMeasured.week, share: running });
      for (let week = lastMeasured.week + 1; week <= horizonWeeks; week += 1) {
        const steps: number[] = [];
        for (const reference of references) {
          const here = reference.measured.find((point) => point.week === week);
          const previous = reference.measured.find((point) => point.week === week - 1);
          if (here && previous) steps.push(here.share - previous.share);
        }
        if (steps.length === 0) break;
        running = Math.min(1, running + meanOf(steps)!);
        projected.push({ week, share: running });
      }
    }

    return {
      wave: draft.wave,
      people: draft.people,
      modules: draft.modules,
      completed: draft.completed,
      share: draft.share,
      startedOn: draft.startedOn,
      lastRecordedOn: draft.lastRecordedOn,
      measured: draft.measured,
      projected: projected.length > 1 ? projected : [],
    };
  });

  const projectedWave =
    waves.find((wave) => wave.projected.length > 1)?.wave ?? null;

  return {
    waves,
    projectedWave,
    referenceWaves: projectedWave === null ? [] : references.map((r) => r.wave),
    horizonWeeks,
    modules: waves.reduce((total, wave) => total + wave.modules, 0),
    undatedCompletions: undated,
  };
}

// ============================================================ override count

export type WaveDecisions = {
  wave: string;
  decisions: number;
  departed: number;
};

export type DecisionSample = {
  byWave: WaveDecisions[];
  decisions: number;
  departed: number;
  unattributed: number;
};

/**
 * How many human decisions the pilot has actually recorded, by wave.
 *
 * This is a SAMPLE SIZE, not a trust measurement. It is on the screen
 * because the obvious chart to draw here -- override rate falling wave by
 * wave -- needs a decision log this pilot does not have yet, and the honest
 * response is to show how few rows there are rather than to draw the chart
 * anyway on three of them.
 */
export function buildDecisionSample(
  people: readonly WavePersonRow[],
  decisions: readonly DecisionRow[],
): DecisionSample {
  const waveOf = new Map<string, string>();
  for (const person of people) {
    if (person.in_pilot_wave) waveOf.set(person.employee_id, person.in_pilot_wave);
  }

  const byWave = new Map<string, WaveDecisions>();
  let unattributed = 0;
  let departed = 0;

  for (const decision of decisions) {
    const wave = decision.planner_id ? waveOf.get(decision.planner_id) : undefined;
    const isDeparture = decision.status === "MODIFIED" || decision.status === "REJECTED";
    if (isDeparture) departed += 1;
    if (!wave) {
      unattributed += 1;
      continue;
    }
    const bucket = byWave.get(wave) ?? { wave, decisions: 0, departed: 0 };
    bucket.decisions += 1;
    if (isDeparture) bucket.departed += 1;
    byWave.set(wave, bucket);
  }

  return {
    byWave: [...byWave.values()].sort((a, b) => a.wave.localeCompare(b.wave)),
    decisions: decisions.length,
    departed,
    unattributed,
  };
}
