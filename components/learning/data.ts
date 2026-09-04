// Server-side reads for the learning module, plus the assembly of those rows
// into the two shapes the screen renders: one person's path, and the cohort
// roll-up a planning manager sees on top of it.
//
// WHY THESE READS LIVE HERE AND NOT IN lib/queries.ts
// --------------------------------------------------
// lib/queries.ts is shared across every screen and is being edited by other
// screens in parallel. components/buy/data.ts already establishes the
// convention for screen-scoped reads: same signature style as lib/queries
// (the Supabase client is the first argument, so the CALLER decides whose
// row level security applies), same failure discipline, just not in the
// shared file. If any of this turns out to be needed by a second screen it
// should be promoted into lib/queries.ts at that point.
//
// THE INHERITANCE RULES ARE NOT REIMPLEMENTED HERE
// ------------------------------------------------
// Two curriculum rules matter and both live in Postgres, in modules_for():
// "Needs most support" inherits the whole "Willing but underskilled"
// curriculum and adds two modules, and a C3 leader gets the C2 curriculum
// plus two governance modules. This file calls that function. It does not
// re-derive either rule in TypeScript, because a second copy of a rule is a
// second thing to keep in step and the first one to go stale.
//
// PAGING
// ------
// learning_completion holds 2,836 rows across the pilot and PostgREST caps a
// single response. Every read that can exceed one page goes through readAll()
// below, which walks .range() until a short page comes back. A roll-up that
// silently stopped at the first thousand rows would understate completion for
// everyone below the cut, which is exactly the kind of quiet wrong number
// this application exists not to produce.

import type { Database } from "@/lib/database.types";
import type { StyleverseClient } from "@/lib/supabase";

import { num, numOr0 } from "./format";

type Tbl = Database["public"]["Tables"];

// The generated row types describe the WHOLE table. Every read below names
// its columns, and PostgREST's typings narrow the result to exactly those,
// so the mappers are typed against the projection rather than the table --
// otherwise adding a column to dim_planner would silently widen what this
// file claims to have read.
type ModuleRow = Pick<
  Tbl["learning_module"]["Row"],
  | "module_id"
  | "title"
  | "tier"
  | "segment"
  | "sequence"
  | "duration_hours"
  | "format"
  | "description"
  | "unlocks_capability"
>;

type CompletionRow = Pick<
  Tbl["learning_completion"]["Row"],
  "employee_id" | "module_id" | "status" | "started_at" | "completed_at" | "score"
>;

type PlannerRow = Pick<
  Tbl["dim_planner"]["Row"],
  | "employee_id"
  | "full_name"
  | "role"
  | "app_role"
  | "brand_id"
  | "region_id"
  | "in_pilot_wave"
  | "learning_tier"
  | "structured_learning_hours_last_year"
>;

type AdoptionRow = Pick<
  Tbl["planner_adoption"]["Row"],
  | "employee_id"
  | "segment"
  | "readiness"
  | "apprehension"
  | "adoption_index"
  | "recommended_learning_hours"
  | "rationale"
>;

/** Rows per request when walking a table that can exceed one page. */
const PAGE_SIZE = 1000;

/** Hard stop on the pager. 2,836 completion rows fit in three pages. */
const MAX_PAGES = 20;

type ReadResult<T> = {
  data: T[] | null;
  error: { message: string; hint?: string | null } | null;
};

function fail(what: string, error: { message: string; hint?: string | null }): never {
  const hint = error.hint ? ` (${error.hint})` : "";
  throw new Error(`StyleVerse: ${what} failed -- ${error.message}${hint}`);
}

/** Walk .range() until a short page comes back. */
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

// ==================================================================== types

export type CompletionStatus = "completed" | "in_progress" | "not_started";

export type LearningModule = {
  moduleId: string;
  title: string;
  /** C2 is the practitioner tier; C3 adds governance for leaders. */
  tier: string;
  /** "ALL" or the adoption segment this module was written for. */
  segment: string;
  sequence: number;
  durationHours: number;
  format: string;
  description: string;
  /** What the person can do afterwards. The point of the module. */
  unlocksCapability: string;
};

export type Completion = {
  employeeId: string;
  moduleId: string;
  status: CompletionStatus;
  startedAt: string | null;
  completedAt: string | null;
  score: number | null;
};

export type Person = {
  employeeId: string;
  fullName: string | null;
  /** Job title from dim_planner, e.g. "Demand Planner". */
  role: string | null;
  appRole: string;
  brandId: string | null;
  regionId: string | null;
  wave: string | null;
  learningTier: string;
  /** dim_planner.structured_learning_hours_last_year. The before picture. */
  priorHours: number | null;
};

export type Adoption = {
  employeeId: string;
  segment: string | null;
  readiness: number | null;
  apprehension: number | null;
  adoptionIndex: number | null;
  recommendedHours: number | null;
  rationale: string | null;
};

/** Tier when dim_planner carries none. C2 is the practitioner default. */
const DEFAULT_TIER = "C2";

function toStatus(raw: string): CompletionStatus {
  return raw === "completed" || raw === "in_progress" ? raw : "not_started";
}

function toModule(row: ModuleRow): LearningModule {
  return {
    moduleId: row.module_id,
    title: row.title,
    tier: row.tier,
    segment: row.segment,
    sequence: numOr0(row.sequence),
    durationHours: numOr0(row.duration_hours),
    format: row.format,
    description: row.description,
    unlocksCapability: row.unlocks_capability,
  };
}

function toCompletion(row: CompletionRow): Completion {
  return {
    employeeId: row.employee_id,
    moduleId: row.module_id,
    status: toStatus(row.status),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    score: num(row.score),
  };
}

function toPerson(row: PlannerRow): Person {
  return {
    employeeId: row.employee_id,
    fullName: row.full_name,
    role: row.role,
    appRole: row.app_role,
    brandId: row.brand_id,
    regionId: row.region_id,
    wave: row.in_pilot_wave,
    learningTier: row.learning_tier ?? DEFAULT_TIER,
    priorHours: num(row.structured_learning_hours_last_year),
  };
}

function toAdoption(row: AdoptionRow): Adoption {
  return {
    employeeId: row.employee_id,
    segment: row.segment,
    readiness: num(row.readiness),
    apprehension: num(row.apprehension),
    adoptionIndex: num(row.adoption_index),
    recommendedHours: num(row.recommended_learning_hours),
    rationale: row.rationale,
  };
}

const MODULE_COLUMNS =
  "module_id, title, tier, segment, sequence, duration_hours, format, description, unlocks_capability";

const COMPLETION_COLUMNS =
  "employee_id, module_id, status, started_at, completed_at, score";

const PLANNER_COLUMNS =
  "employee_id, full_name, role, app_role, brand_id, region_id, in_pilot_wave, learning_tier, structured_learning_hours_last_year";

const ADOPTION_COLUMNS =
  "employee_id, segment, readiness, apprehension, adoption_index, recommended_learning_hours, rationale";

// ================================================================== reads

/** The whole catalogue: fifteen modules, readable to any signed-in user. */
export async function getLearningCatalogue(
  sb: StyleverseClient,
): Promise<LearningModule[]> {
  const { data, error } = await sb
    .from("learning_module")
    .select(MODULE_COLUMNS)
    .order("sequence", { ascending: true })
    .order("module_id", { ascending: true });
  if (error) fail("getLearningCatalogue", error);
  return (data ?? []).map(toModule);
}

/**
 * The modules one person actually sees, in order.
 *
 * This is modules_for(segment, tier) and nothing else. The two inheritance
 * rules are encoded in that function; calling it is how they stay in one
 * place. A C3 leader in "Needs most support" gets ten modules out of this,
 * and no TypeScript here knows why.
 */
export async function getCurriculum(
  sb: StyleverseClient,
  segment: string,
  tier: string,
): Promise<LearningModule[]> {
  const { data, error } = await sb.rpc("modules_for", {
    p_segment: segment,
    p_tier: tier,
  });
  if (error) fail("getCurriculum(modules_for)", error);
  return (data ?? [])
    .map(toModule)
    .sort((a, b) => a.sequence - b.sequence || a.moduleId.localeCompare(b.moduleId));
}

/** One person's completion rows. RLS gives you your own without a filter. */
export async function getCompletionsFor(
  sb: StyleverseClient,
  employeeId: string,
): Promise<Completion[]> {
  const { data, error } = await sb
    .from("learning_completion")
    .select(COMPLETION_COLUMNS)
    .eq("employee_id", employeeId);
  if (error) fail("getCompletionsFor", error);
  return (data ?? []).map(toCompletion);
}

/**
 * One planner row. Returns null rather than throwing when the caller has no
 * dim_planner record: a signed-in user with no planner row is a real state.
 */
export async function getPerson(
  sb: StyleverseClient,
  employeeId: string,
): Promise<Person | null> {
  const { data, error } = await sb
    .from("dim_planner")
    .select(PLANNER_COLUMNS)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error) fail("getPerson", error);
  return data ? toPerson(data) : null;
}

/** One adoption row: the segment, the two survey scores and the derivation. */
export async function getAdoptionFor(
  sb: StyleverseClient,
  employeeId: string,
): Promise<Adoption | null> {
  const { data, error } = await sb
    .from("planner_adoption")
    .select(ADOPTION_COLUMNS)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error) fail("getAdoptionFor", error);
  return data ? toAdoption(data) : null;
}

/** Every completion row the caller may read. Paged. */
export async function getAllCompletions(
  sb: StyleverseClient,
): Promise<Completion[]> {
  const rows = await readAll<CompletionRow>("getAllCompletions", (from, to) =>
    sb
      .from("learning_completion")
      .select(COMPLETION_COLUMNS)
      .order("employee_id", { ascending: true })
      .order("module_id", { ascending: true })
      .range(from, to),
  );
  return rows.map(toCompletion);
}

/** Every planner the caller may read. Brand-scoped by RLS. Paged. */
export async function getPeople(sb: StyleverseClient): Promise<Person[]> {
  const rows = await readAll<PlannerRow>("getPeople", (from, to) =>
    sb
      .from("dim_planner")
      .select(PLANNER_COLUMNS)
      .order("employee_id", { ascending: true })
      .range(from, to),
  );
  return rows.map(toPerson);
}

/** Every adoption row the caller may read. Brand-scoped by RLS. Paged. */
export async function getAdoption(sb: StyleverseClient): Promise<Adoption[]> {
  const rows = await readAll<AdoptionRow>("getAdoption", (from, to) =>
    sb
      .from("planner_adoption")
      .select(ADOPTION_COLUMNS)
      .order("employee_id", { ascending: true })
      .range(from, to),
  );
  return rows.map(toAdoption);
}

/** region_id to region_name. Cosmetic: a missing label degrades to the id. */
export async function getRegionLabels(
  sb: StyleverseClient,
): Promise<Record<string, string>> {
  const { data, error } = await sb
    .from("dim_region")
    .select("region_id, region_name");
  if (error) return {};
  const labels: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.region_name) labels[row.region_id] = row.region_name;
  }
  return labels;
}

export type HumanDecision = {
  plannerId: string;
  status: Database["public"]["Enums"]["decision_status"];
  decidedAt: string | null;
  modelVersion: string;
};

export type DecisionRead = {
  decisions: HumanDecision[];
  /**
   * Scenario rows excluded from the override arithmetic. Counted rather than
   * assumed to be zero, because scenario work lands in the same ledger and
   * the count moves as planners explore.
   *
   * NULL means the count could not be read -- the query failed, or row level
   * security returned no count for this caller. That is not the same as nought
   * and the screen must not print it as one, because "there are none" is a
   * claim and "we could not find out" is the absence of one.
   */
  scenariosExcluded: number | null;
};

/**
 * Committed human decisions, for the override-rate side of the correlation.
 *
 * TWO EXCLUSIONS, BOTH DELIBERATE:
 *
 *   status = SCENARIO -- a scenario is an exploration, not a decision. It
 *   lands in planner_decision so the ledger stays complete, but counting it
 *   would inflate the denominator with work nobody committed and drag every
 *   override rate downward.
 *
 *   actor_type != human -- an agent approval inside its autonomy band says
 *   nothing about whether a PERSON overrides the model, which is the only
 *   question the correlation is asking.
 */
export async function getHumanDecisions(
  sb: StyleverseClient,
): Promise<DecisionRead> {
  const [committed, scenarios] = await Promise.all([
    readAll<{
      planner_id: string | null;
      status: Database["public"]["Enums"]["decision_status"];
      decided_at: string | null;
      model_version: string;
    }>("getHumanDecisions", (from, to) =>
      sb
        .from("planner_decision")
        .select("planner_id, status, decided_at, model_version")
        .eq("actor_type", "human")
        .neq("status", "SCENARIO")
        .order("id", { ascending: true })
        .range(from, to),
    ),
    sb
      .from("planner_decision")
      .select("id", { count: "exact", head: true })
      .eq("status", "SCENARIO"),
  ]);

  const decisions: HumanDecision[] = [];
  for (const row of committed) {
    if (!row.planner_id) continue;
    decisions.push({
      plannerId: row.planner_id,
      status: row.status,
      decidedAt: row.decided_at,
      modelVersion: row.model_version,
    });
  }

  // The scenario count is a side note, so a failure here must not take the
  // whole panel down -- but it must not be laundered into a zero either. An
  // errored or absent count is reported as unknown and the prose says so.
  const scenariosExcluded =
    scenarios.error !== null || scenarios.count === null || scenarios.count === undefined
      ? null
      : scenarios.count;

  return { decisions, scenariosExcluded };
}

// =============================================================== assembly

/**
 * The state of one module on one person's path.
 *
 * "next" and "later" are POSITION, not permission. The curriculum is
 * sequenced -- learning_module.sequence exists for exactly that -- and the
 * pilot data confirms it is worked in order: no employee in the cohort has a
 * completed module sitting behind an unfinished one. So the first module
 * that is not finished is the one to pick up, and the rest are what follows
 * it. Nothing here is locked, gated or withheld.
 */
export type StepState = "completed" | "in_progress" | "next" | "later";

export type JourneyStep = {
  module: LearningModule;
  state: StepState;
  status: CompletionStatus;
  startedAt: string | null;
  completedAt: string | null;
  score: number | null;
};

export type Journey = {
  person: Person;
  adoption: Adoption | null;
  steps: JourneyStep[];
  /** Hours in this person's own path, summed from their modules. */
  pathHours: number;
  /** Hours behind completed modules. */
  completedHours: number;
  /** Hours behind the module currently open. */
  inProgressHours: number;
  completedCount: number;
  totalCount: number;
  /** planner_adoption.recommended_learning_hours for their segment. */
  recommendedHours: number | null;
  /** The single next thing. Null when the whole path is finished. */
  next: JourneyStep | null;
  /** Most recent completion date on the path. */
  lastCompletedAt: string | null;
};

export function buildJourney(
  person: Person,
  adoption: Adoption | null,
  curriculum: readonly LearningModule[],
  completions: readonly Completion[],
): Journey {
  const byModule = new Map<string, Completion>();
  for (const row of completions) {
    if (row.employeeId === person.employeeId) byModule.set(row.moduleId, row);
  }

  const ordered = [...curriculum].sort(
    (a, b) => a.sequence - b.sequence || a.moduleId.localeCompare(b.moduleId),
  );

  const statuses: CompletionStatus[] = ordered.map(
    (lesson) => byModule.get(lesson.moduleId)?.status ?? "not_started",
  );

  // ONE RULE DECIDES WHAT "NEXT" IS, AND BOTH THE HERO CARD AND THE TIMELINE
  // READ IT FROM HERE. A module already open beats a module not yet started,
  // wherever each sits in the sequence, because the thing you are part-way
  // through is the thing to pick up. Failing that it is the first module on
  // the path that is not finished. Deriving the state and journey.next from
  // the same index is what stops the two halves of the screen pointing at
  // different modules.
  const openIndex = statuses.indexOf("in_progress");
  const nextIndex =
    openIndex >= 0 ? openIndex : statuses.findIndex((s) => s !== "completed");

  const steps: JourneyStep[] = ordered.map((lesson, index) => {
    const record = byModule.get(lesson.moduleId);
    const status = statuses[index];

    let state: StepState;
    if (status === "completed") {
      state = "completed";
    } else if (index === nextIndex) {
      state = status === "in_progress" ? "in_progress" : "next";
    } else if (status === "in_progress") {
      // A second open module. Labelled for what the record says it is, but
      // it is not the one the hero card points at.
      state = "in_progress";
    } else {
      state = "later";
    }

    return {
      module: lesson,
      state,
      status,
      startedAt: record?.startedAt ?? null,
      completedAt: record?.completedAt ?? null,
      score: record?.score ?? null,
    };
  });

  let pathHours = 0;
  let completedHours = 0;
  let inProgressHours = 0;
  let completedCount = 0;
  let lastCompletedAt: string | null = null;

  for (const step of steps) {
    pathHours += step.module.durationHours;
    if (step.status === "completed") {
      completedHours += step.module.durationHours;
      completedCount += 1;
      if (step.completedAt && (!lastCompletedAt || step.completedAt > lastCompletedAt)) {
        lastCompletedAt = step.completedAt;
      }
    } else if (step.status === "in_progress") {
      inProgressHours += step.module.durationHours;
    }
  }

  const next = nextIndex >= 0 ? (steps[nextIndex] ?? null) : null;

  return {
    person,
    adoption,
    steps,
    pathHours,
    completedHours,
    inProgressHours,
    completedCount,
    totalCount: steps.length,
    recommendedHours: adoption?.recommendedHours ?? null,
    next,
    lastCompletedAt,
  };
}

// ---------------------------------------------------------------- roll-up

export type PersonProgress = {
  person: Person;
  segment: string;
  modules: number;
  completed: number;
  inProgress: number;
  pathHours: number;
  completedHours: number;
  recommendedHours: number | null;
  /** completed modules / modules on their own path, in [0, 1]. */
  share: number;
  /** True once every module on their path is finished. */
  finished: boolean;
};

export type GroupStat = {
  key: string;
  label: string;
  people: number;
  modules: number;
  completed: number;
  pathHours: number;
  completedHours: number;
  /**
   * Sum of recommended hours across the group -- but ONLY over the people who
   * have a planner_adoption row carrying one. Somebody with no adoption row
   * has no recommendation, and adding a nought for them would invent a zero-
   * hour recommendation and quietly drag the total down.
   */
  recommendedHours: number;
  /** How many of `people` contributed to recommendedHours. */
  recommendedPeople: number;
};

export type Rollup = {
  people: PersonProgress[];
  bySegment: GroupStat[];
  byWave: GroupStat[];
  byRegion: GroupStat[];
  byRole: GroupStat[];
  totals: GroupStat;
  /** Mean structured_learning_hours_last_year across the visible cohort. */
  priorHoursMean: number | null;
  priorHoursPeople: number;
  /** Champions who have finished the module that teaches coaching. */
  coaches: PersonProgress[];
  coachModule: LearningModule | null;
};

/** The segment whose curriculum carries the coaching module. */
const CHAMPION_SEGMENT = "Champions";

/**
 * The module that teaches coaching, identified from the catalogue rather than
 * by its id. One predicate, so the coach bench and any sentence that wants to
 * say "the coaching module" agree on which module that is -- and so a path
 * that does not contain it can be told apart from one that does.
 */
export function isCoachingModule(lesson: LearningModule): boolean {
  return (
    lesson.segment === CHAMPION_SEGMENT && /coach/i.test(lesson.unlocksCapability)
  );
}

const UNKNOWN_SEGMENT = "Unsegmented";

function emptyGroup(key: string, label: string): GroupStat {
  return {
    key,
    label,
    people: 0,
    modules: 0,
    completed: 0,
    pathHours: 0,
    completedHours: 0,
    recommendedHours: 0,
    recommendedPeople: 0,
  };
}

function accumulate(group: GroupStat, row: PersonProgress): void {
  group.people += 1;
  group.modules += row.modules;
  group.completed += row.completed;
  group.pathHours += row.pathHours;
  group.completedHours += row.completedHours;
  if (row.recommendedHours !== null) {
    group.recommendedHours += row.recommendedHours;
    group.recommendedPeople += 1;
  }
}

function groupBy(
  rows: readonly PersonProgress[],
  key: (row: PersonProgress) => string,
  label: (key: string) => string,
): GroupStat[] {
  const groups = new Map<string, GroupStat>();
  for (const row of rows) {
    const id = key(row);
    let group = groups.get(id);
    if (!group) {
      group = emptyGroup(id, label(id));
      groups.set(id, group);
    }
    accumulate(group, row);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Fold the cohort into per-person progress and the four breakdowns.
 *
 * A person's own path is the set of completion rows that exist for them --
 * those rows ARE the assignment, one per module the curriculum gave them --
 * so the denominator is always their own curriculum and never the catalogue.
 * Comparing a Champion's four modules against a "Needs most support" ten
 * would make the segment that was asked for most look like the segment that
 * did least.
 */
export function buildRollup(
  people: readonly Person[],
  adoption: readonly Adoption[],
  completions: readonly Completion[],
  catalogue: readonly LearningModule[],
  regionLabels: Record<string, string>,
): Rollup {
  const moduleHours = new Map<string, number>();
  for (const lesson of catalogue) {
    moduleHours.set(lesson.moduleId, lesson.durationHours);
  }

  const adoptionById = new Map<string, Adoption>();
  for (const row of adoption) adoptionById.set(row.employeeId, row);

  type Bucket = {
    modules: number;
    completed: number;
    inProgress: number;
    pathHours: number;
    completedHours: number;
  };
  const buckets = new Map<string, Bucket>();
  for (const row of completions) {
    let bucket = buckets.get(row.employeeId);
    if (!bucket) {
      bucket = {
        modules: 0,
        completed: 0,
        inProgress: 0,
        pathHours: 0,
        completedHours: 0,
      };
      buckets.set(row.employeeId, bucket);
    }
    const hours = moduleHours.get(row.moduleId) ?? 0;
    bucket.modules += 1;
    bucket.pathHours += hours;
    if (row.status === "completed") {
      bucket.completed += 1;
      bucket.completedHours += hours;
    } else if (row.status === "in_progress") {
      bucket.inProgress += 1;
    }
  }

  const progress: PersonProgress[] = [];
  for (const person of people) {
    const bucket = buckets.get(person.employeeId);
    // No completion rows means no visible path. That happens under RLS for a
    // manager reading a planner outside the completion policy's reach, and
    // an invented zero would be indistinguishable from a real one.
    if (!bucket || bucket.modules === 0) continue;
    const record = adoptionById.get(person.employeeId);
    progress.push({
      person,
      segment: record?.segment ?? UNKNOWN_SEGMENT,
      modules: bucket.modules,
      completed: bucket.completed,
      inProgress: bucket.inProgress,
      pathHours: bucket.pathHours,
      completedHours: bucket.completedHours,
      recommendedHours: record?.recommendedHours ?? null,
      share: bucket.modules > 0 ? bucket.completed / bucket.modules : 0,
      finished: bucket.completed === bucket.modules,
    });
  }

  const totals = emptyGroup("all", "All");
  for (const row of progress) accumulate(totals, row);

  let priorTotal = 0;
  let priorPeople = 0;
  for (const row of progress) {
    if (row.person.priorHours !== null) {
      priorTotal += row.person.priorHours;
      priorPeople += 1;
    }
  }

  const coachModule = catalogue.find(isCoachingModule) ?? null;

  const coachIds = new Set<string>();
  if (coachModule) {
    for (const row of completions) {
      if (row.moduleId === coachModule.moduleId && row.status === "completed") {
        coachIds.add(row.employeeId);
      }
    }
  }

  const coaches = progress
    .filter((row) => row.segment === CHAMPION_SEGMENT && coachIds.has(row.person.employeeId))
    .sort(
      (a, b) =>
        b.share - a.share ||
        (a.person.fullName ?? a.person.employeeId).localeCompare(
          b.person.fullName ?? b.person.employeeId,
        ),
    );

  return {
    people: progress,
    bySegment: groupBy(
      progress,
      (row) => row.segment,
      (key) => key,
    ),
    byWave: groupBy(
      progress,
      (row) => row.person.wave ?? "Not in a wave",
      (key) => key,
    ),
    byRegion: groupBy(
      progress,
      (row) => row.person.regionId ?? "Unassigned",
      (key) => regionLabels[key] ?? key,
    ),
    byRole: groupBy(
      progress,
      (row) => row.person.role ?? "Unstated",
      (key) => key,
    ),
    totals,
    priorHoursMean: priorPeople > 0 ? priorTotal / priorPeople : null,
    priorHoursPeople: priorPeople,
    coaches,
    coachModule,
  };
}

/**
 * The heaviest and lightest segment recommendation in scope, in hours per
 * person, averaged over the people in that segment who actually carry one.
 *
 * It exists so a sentence about comparing segments fairly can name the two
 * numbers it is talking about without either of them being typed into the
 * copy. Null when fewer than two segments in scope carry a recommendation,
 * at which point there is no contrast to draw and the sentence says less.
 */
export type SegmentHoursRange = { most: number; least: number };

export function segmentHoursRange(rollup: Rollup): SegmentHoursRange | null {
  const perHead: number[] = [];
  for (const group of rollup.bySegment) {
    if (group.recommendedPeople > 0) {
      perHead.push(group.recommendedHours / group.recommendedPeople);
    }
  }
  if (perHead.length < 2) return null;
  const most = Math.max(...perHead);
  const least = Math.min(...perHead);
  return most > least ? { most, least } : null;
}

// ------------------------------------------------------- override analysis

export type OverridePoint = {
  employeeId: string;
  fullName: string | null;
  segment: string;
  regionId: string | null;
  /** Committed human decisions by this person. */
  decisions: number;
  /** Of those, the ones that were MODIFIED or REJECTED. */
  overrides: number;
  overrideRate: number;
  completionRate: number;
  completedHours: number;
};

export type OverrideAnalysis = {
  points: OverridePoint[];
  decisionCount: number;
  overrideCount: number;
  /** Null when the scenario count could not be read. Never silently nought. */
  scenariosExcluded: number | null;
  /** Planners with a completion path but no committed decision at all. */
  plannersWithoutDecisions: number;
  modelVersions: string[];
  latestDecisionAt: string | null;
};

/**
 * Join committed human decisions to learning progress, one row per planner.
 *
 * A decision counts as an override when its status is MODIFIED or REJECTED:
 * both are the planner declining the recommendation as issued. APPROVED is
 * the only status that is not an override, and SCENARIO never reaches here.
 *
 * Only planners who appear on BOTH sides are plotted. A planner with a
 * learning path and no decisions has no override rate to place on the axis,
 * and inventing one -- as a zero, or as the cohort mean -- would be the
 * fabricated data point that makes a weak correlation look like a strong one.
 * The count of those planners is returned instead, and the screen says it.
 */
export function buildOverrideAnalysis(
  progress: readonly PersonProgress[],
  read: DecisionRead,
): OverrideAnalysis {
  const byPlanner = new Map<string, { total: number; overrides: number }>();
  const versions = new Set<string>();
  let latest: string | null = null;

  for (const decision of read.decisions) {
    let bucket = byPlanner.get(decision.plannerId);
    if (!bucket) {
      bucket = { total: 0, overrides: 0 };
      byPlanner.set(decision.plannerId, bucket);
    }
    bucket.total += 1;
    if (decision.status === "MODIFIED" || decision.status === "REJECTED") {
      bucket.overrides += 1;
    }
    versions.add(decision.modelVersion);
    if (decision.decidedAt && (!latest || decision.decidedAt > latest)) {
      latest = decision.decidedAt;
    }
  }

  const points: OverridePoint[] = [];
  let decisionCount = 0;
  let overrideCount = 0;
  let without = 0;

  for (const row of progress) {
    const bucket = byPlanner.get(row.person.employeeId);
    if (!bucket || bucket.total === 0) {
      without += 1;
      continue;
    }
    decisionCount += bucket.total;
    overrideCount += bucket.overrides;
    points.push({
      employeeId: row.person.employeeId,
      fullName: row.person.fullName,
      segment: row.segment,
      regionId: row.person.regionId,
      decisions: bucket.total,
      overrides: bucket.overrides,
      overrideRate: bucket.overrides / bucket.total,
      completionRate: row.share,
      completedHours: row.completedHours,
    });
  }

  points.sort((a, b) => a.employeeId.localeCompare(b.employeeId));

  return {
    points,
    decisionCount,
    overrideCount,
    scenariosExcluded: read.scenariosExcluded,
    plannersWithoutDecisions: without,
    modelVersions: [...versions].sort(),
    latestDecisionAt: latest,
  };
}
