// Server-side reads for the governance screen, plus the assembly of those
// rows into the shapes the panels render.
//
// WHY THESE READS LIVE HERE AND NOT IN lib/queries.ts
// --------------------------------------------------
// lib/queries.ts is shared and is being edited by other screens in
// parallel. components/buy/data.ts and components/learning/data.ts already
// establish the convention for screen-scoped reads: the same signature
// style as lib/queries -- the Supabase client is the FIRST ARGUMENT, so the
// caller decides whose row level security applies -- the same failure
// discipline, just not in the shared file. Anything here that a second
// screen turns out to need should be promoted into lib/queries.ts then.
//
// getAgentRuns and getModelRegistry already exist in lib/queries.ts and are
// used from there rather than re-implemented. getAutonomyBands and
// getPolicyParameters live there too, but both take a brand, and this screen
// needs them WITHOUT one: autonomy_band and policy_parameter are readable to
// any authenticated user by policy, while the ledger above them is scoped, so
// a group role reading two brands of decisions has to be able to read the
// bands and the corrective rows behind both of them. The brand-free variants
// are written here rather than by widening the signature in the shared file.
// The only other reads here are the ones nothing else has needed: the full
// append-only ledger, the people it attributes to, and the kill switch.
//
// WHY THE LEDGER IS NOT READ THROUGH v_recommendation_state
// ---------------------------------------------------------
// That view collapses planner_decision with ORDER BY decided_at DESC LIMIT
// 1, which answers "what is the current state of this recommendation".
// This screen is asking the opposite question: what is the whole trail. A
// planner who changed their mind wrote a second row and the first one
// stayed, and the pilot data contains exactly that -- recommendation 44
// carries a REJECTED at 09:52 and a MODIFIED eleven hours later, both by
// different people. Showing only the survivor would hide the property the
// append-only design exists to prove.
//
// WHAT ROW LEVEL SECURITY DOES TO THIS SCREEN
// -------------------------------------------
// planner_decision's read policy is EXISTS(SELECT 1 FROM recommendation r
// WHERE r.id = planner_decision.recommendation_id) -- a decision is visible
// exactly when the recommendation it decided is visible, and recommendation
// is scoped by brand, then by region or owned category unless the reader is
// a manager or above. So the counts on this screen are the counts IN YOUR
// SCOPE, not the counts in the pilot, and every panel is written to say so
// rather than to imply a portfolio total.

import type { Database, Json } from "@/lib/database.types";
import type { PolicyParameter } from "@/lib/queries";
import type { StyleverseClient } from "@/lib/supabase";
import type { PostgrestError } from "@supabase/supabase-js";

import { BAND_ROUNDING_TOLERANCE_PP } from "./constants";

type Tbl = Database["public"]["Tables"];

// ================================================================ plumbing

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

type ReadResult<T> = { data: T[] | null; error: PostgrestError | null };

function fail(what: string, error: PostgrestError): never {
  const hint = error.hint ? ` (${error.hint})` : "";
  throw new Error(`StyleVerse: ${what} failed -- ${error.message}${hint}`);
}

/**
 * Walk .range() until a short page comes back.
 *
 * The ledger holds 446 rows today, comfortably inside one PostgREST page.
 * It is append-only and grows with every decision anyone commits, so a read
 * that stopped at the first page would begin silently truncating the audit
 * trail at some point after this screen shipped -- and an audit trail that
 * quietly stops is worse than one that is missing.
 */
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
    if (rows.length < PAGE_SIZE) return out;
  }

  // Every page came back full, so there is more and the loop ran out of
  // patience rather than out of rows. Returning what we have would be the
  // silent truncation this function exists to prevent -- the screen would
  // show a plausible ledger that was missing its oldest entries and say
  // nothing. Fail loudly instead; the caller renders the failure.
  throw new Error(
    `StyleVerse: ${what} stopped after ${MAX_PAGES * PAGE_SIZE} rows and more ` +
      `remain. Nothing is shown rather than a truncated audit trail; raise the ` +
      `page ceiling in components/governance/data.ts or filter the read.`,
  );
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** recommendation.payload, narrowed from Json without widening to `any`. */
function payloadObject(raw: Json | null | undefined): Record<string, Json> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, Json>;
  }
  return {};
}

// =================================================================== people

export type AccountablePerson = {
  employeeId: string;
  /**
   * Nullable, because dim_planner.full_name is. Every consumer falls back to
   * the employee id rather than to "unknown": a row that cannot be given a
   * name is still attributable, and this screen must never render an
   * unattributed decision.
   */
  fullName: string | null;
  /** Job title from dim_planner. Not the app_role. */
  role: string | null;
  appRole: string | null;
  brandId: string | null;
  regionId: string | null;
};

/**
 * Everyone in dim_planner the caller can read.
 *
 * dim_planner's policy hands a planner their own brand and a group CMPO or
 * CoE admin everybody, so this can legitimately come back missing the owner
 * of a band in the other brand. Every consumer below degrades to the name
 * the decision row already carries rather than dropping the attribution.
 */
export async function getPeople(
  sb: StyleverseClient,
): Promise<AccountablePerson[]> {
  const rows = await readAll<
    Pick<
      Tbl["dim_planner"]["Row"],
      "employee_id" | "full_name" | "role" | "app_role" | "brand_id" | "region_id"
    >
  >("getPeople", (from, to) =>
    sb
      .from("dim_planner")
      .select("employee_id, full_name, role, app_role, brand_id, region_id")
      .order("employee_id", { ascending: true })
      .range(from, to),
  );

  return rows.map((row) => ({
    employeeId: row.employee_id,
    fullName: row.full_name,
    role: row.role,
    appRole: row.app_role,
    brandId: row.brand_id,
    regionId: row.region_id,
  }));
}

// ================================================================== labels

export type SeriesLabels = {
  category: Record<string, string>;
  channel: Record<string, string>;
  region: Record<string, string>;
};

const EMPTY_LABELS: SeriesLabels = { category: {}, channel: {}, region: {} };

/**
 * The dim tables behind a series key. All three are readable to any
 * authenticated user, so this never narrows what the screen can show; it
 * only turns "ACCS|D2C|EU" into words. A failed lookup degrades to the id,
 * which is still a true identifier.
 */
export async function getSeriesLabels(
  sb: StyleverseClient,
): Promise<SeriesLabels> {
  const [categories, channels, regions] = await Promise.all([
    sb.from("dim_category").select("category_id, category_name"),
    sb.from("dim_channel").select("channel_id, channel_name"),
    sb.from("dim_region").select("region_id, region_name"),
  ]);

  if (categories.error || channels.error || regions.error) return EMPTY_LABELS;

  const labels: SeriesLabels = { category: {}, channel: {}, region: {} };
  for (const row of categories.data) {
    if (row.category_name) labels.category[row.category_id] = row.category_name;
  }
  for (const row of channels.data) {
    if (row.channel_name) labels.channel[row.channel_id] = row.channel_name;
  }
  for (const row of regions.data) {
    if (row.region_name) labels.region[row.region_id] = row.region_name;
  }
  return labels;
}

// ================================================================== ledger

export type LedgerActorType = "human" | "agent";

export type LedgerStatus = Database["public"]["Enums"]["decision_status"];

export type LedgerEntry = {
  id: number;
  decidedAt: string | null;
  actorType: LedgerActorType;
  /** The employee id for a person; the agent name for an agent. */
  actorId: string | null;
  /**
   * The name captured from the session at write time. NOT NULL in the
   * schema, on both human and agent rows, which is the whole point: an
   * agent row still names the person who answers for it.
   */
  accountableName: string;
  /** Set only on human rows. Agent rows carry a name and no employee id. */
  plannerId: string | null;
  status: LedgerStatus;
  modelVersion: string;
  reason: string | null;
  /**
   * The decision row's OWN value columns. Null on every agent row in this
   * fixture -- see agentValues() below, which is where that gap is handled
   * rather than hidden.
   */
  recommendedValue: number | null;
  acceptedValue: number | null;

  // The recommendation this decided, for context. Read through the join
  // rather than duplicated onto the decision, so it stays one fact.
  recommendationId: number;
  brandId: string | null;
  recType: Database["public"]["Enums"]["rec_type"] | null;
  action: Database["public"]["Enums"]["rec_action"] | null;
  categoryId: string | null;
  channelId: string | null;
  regionId: string | null;
  valueAtStakeInr: number | null;
  /** share_shift_pp, recommended_units, units_at_risk and friends. */
  payload: Record<string, Json>;
};

type DecisionRow = Pick<
  Tbl["planner_decision"]["Row"],
  | "id"
  | "decided_at"
  | "actor_type"
  | "actor_id"
  | "accountable_planner"
  | "planner_id"
  | "status"
  | "model_version"
  | "override_reason"
  | "recommended_value"
  | "accepted_value"
  | "recommendation_id"
>;

type RecContextRow = Pick<
  Tbl["recommendation"]["Row"],
  | "id"
  | "brand_id"
  | "rec_type"
  | "action"
  | "category_id"
  | "channel_id"
  | "region_id"
  | "value_at_stake_inr"
  | "payload"
>;

/** PostgREST puts the id list in the query string, so it is sent in chunks. */
const ID_CHUNK = 150;

/**
 * The whole append-only ledger the caller can see, newest first, with the
 * recommendation each row decided joined on for context.
 *
 * The join is a second read rather than a PostgREST embed because
 * planner_decision reaches `recommendation` twice in the generated schema --
 * once to the table and once to v_recommendation_state, under the same
 * constraint name -- and an embed that has to be disambiguated by a hint is
 * a fragile way to read an audit trail. Two plain reads say what they do.
 *
 * actor_type is `text` in the schema rather than an enum, so it is narrowed
 * here. Anything that is not literally "agent" is treated as a human row:
 * an unrecognised actor type must never be filed under software, because
 * the one claim this screen exists to make is that a machine action always
 * has a person's name on it.
 */
export async function getLedger(sb: StyleverseClient): Promise<LedgerEntry[]> {
  // The select list is ONE string literal on purpose. PostgREST's generated
  // types parse the column list out of the literal to type the result; a
  // string built by concatenation widens to `string`, the parse fails, and
  // every row comes back as GenericStringError. Keep it on one line.
  const decisions = await readAll<DecisionRow>("getLedger", (from, to) =>
    sb
      .from("planner_decision")
      .select(
        "id, decided_at, actor_type, actor_id, accountable_planner, planner_id, status, model_version, override_reason, recommended_value, accepted_value, recommendation_id",
      )
      .order("decided_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );

  const ids = [...new Set(decisions.map((row) => row.recommendation_id))];
  const context = new Map<number, RecContextRow>();

  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    const { data, error } = await sb
      .from("recommendation")
      .select(
        "id, brand_id, rec_type, action, category_id, channel_id, region_id, value_at_stake_inr, payload",
      )
      .in("id", ids.slice(start, start + ID_CHUNK));

    if (error) fail("getLedger context", error);
    for (const row of data) context.set(row.id, row);
  }

  return decisions.map((row) => {
    const rec = context.get(row.recommendation_id) ?? null;
    return {
      id: row.id,
      decidedAt: row.decided_at,
      actorType: row.actor_type === "agent" ? ("agent" as const) : ("human" as const),
      actorId: row.actor_id,
      accountableName: row.accountable_planner,
      plannerId: row.planner_id,
      status: row.status,
      modelVersion: row.model_version,
      reason: row.override_reason,
      recommendedValue: num(row.recommended_value),
      acceptedValue: num(row.accepted_value),
      recommendationId: row.recommendation_id,
      brandId: rec?.brand_id ?? null,
      recType: rec?.rec_type ?? null,
      action: rec?.action ?? null,
      categoryId: rec?.category_id ?? null,
      channelId: rec?.channel_id ?? null,
      regionId: rec?.region_id ?? null,
      valueAtStakeInr: num(rec?.value_at_stake_inr),
      payload: payloadObject(rec?.payload),
    };
  });
}

/**
 * What an agent row put on the table, read from the RECOMMENDATION rather
 * than from the decision.
 *
 * Every agent row in this ledger has NULL in both recommended_value and
 * accepted_value. That is not a rendering problem to be smoothed over with
 * a zero: the agent wrote no number into the decision row, and the numbers
 * it acted on live on the recommendation. An allocation row carries
 * incumbent_units and recommended_units in the payload, so the pair is a
 * genuine before-and-after; an exception row carries value at stake and
 * units at risk, which is what was on the table rather than a quantity
 * committed. This function returns whichever of those the row actually has
 * and null where it has none, and the panel prints the provenance beside
 * it.
 */
export type AgentValues = {
  /** The state before the agent acted, where the payload records one. */
  fromUnits: number | null;
  /** The state the agent moved to, where the payload records one. */
  toUnits: number | null;
  /** Signed share shift in percentage points, for an allocation row. */
  shiftPp: number | null;
  /** Units the exception put at risk. */
  unitsAtRisk: number | null;
};

export function agentValues(entry: LedgerEntry): AgentValues {
  return {
    fromUnits: num(entry.payload.incumbent_units),
    toUnits: num(entry.payload.recommended_units),
    shiftPp: num(entry.payload.share_shift_pp),
    unitsAtRisk: num(entry.payload.units_at_risk),
  };
}

// ======================================================== bands and policy

/**
 * Every autonomy band the caller can read, both pilot brands included.
 *
 * autonomy_band's read policy is `USING (true)`: a band is a published
 * promise about what software may do without asking, and a promise nobody
 * outside the brand can read is not published. lib/queries.getAutonomyBands
 * takes a brand and is right for a screen that shows one; this screen shows
 * the ledger a group role can see, which spans brands, so it reads them all
 * and groups by brand on the way out.
 */
export async function getAllAutonomyBands(
  sb: StyleverseClient,
): Promise<Tbl["autonomy_band"]["Row"][]> {
  return readAll<Tbl["autonomy_band"]["Row"]>("getAllAutonomyBands", (from, to) =>
    sb
      .from("autonomy_band")
      .select("*")
      .order("brand_id", { ascending: true })
      .order("agent_name", { ascending: true })
      .range(from, to),
  );
}

/**
 * One named threshold across every brand, with the derivation attached.
 *
 * Returns the same shape lib/queries returns, is_overridden included, so a
 * panel written against a PolicyParameter from either source behaves the
 * same. The band correction panel asks for allocation_band_pp; nothing here
 * knows which parameter that is, which keeps the caller's intent visible at
 * the call site rather than buried in this function's name.
 */
export async function getPolicyParameterByName(
  sb: StyleverseClient,
  paramName: string,
): Promise<PolicyParameter[]> {
  const rows = await readAll<Tbl["policy_parameter"]["Row"]>(
    "getPolicyParameterByName",
    (from, to) =>
      sb
        .from("policy_parameter")
        .select("*")
        .eq("param_name", paramName)
        .order("brand_id", { ascending: true })
        .range(from, to),
  );

  return rows.map((row) => ({
    ...row,
    is_overridden:
      row.computed_value !== null &&
      row.applied_value !== null &&
      row.computed_value !== row.applied_value,
  }));
}

// ============================================================= kill switch

export type KillSwitch = Pick<
  Tbl["agent_kill_switch"]["Row"],
  "id" | "engaged" | "engaged_at" | "engaged_by" | "reason"
>;

/**
 * The single kill-switch row. Readable by any authenticated user by policy
 * (agent_kill_switch_auth_read is `USING (true)`), because a planner who
 * cannot flip it still has to be able to see whether it is flipped.
 */
export async function getKillSwitch(
  sb: StyleverseClient,
): Promise<KillSwitch | null> {
  const { data, error } = await sb
    .from("agent_kill_switch")
    .select("id, engaged, engaged_at, engaged_by, reason")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) fail("getKillSwitch", error);
  return data ?? null;
}

// ================================================== accountability lookups

/**
 * Resolve the person a ledger row is answerable to.
 *
 * A HUMAN row carries planner_id, which is a key, so it resolves exactly.
 *
 * An AGENT row carries a NAME and no employee id -- and a name is not a
 * key. This pilot has two people called Shreya Bose, EMP-SPD-0019 in
 * Speed and EMP-ECO-0018 in Eco, so matching an agent row on its name alone
 * would attribute Speed's allocations to the wrong person half the time.
 * The authoritative link for an agent row is the AUTONOMY BAND: the band
 * for (agent_name, brand_id) carries owner_employee_id, and that owner is
 * who the agent acts on behalf of. So an agent row resolves through its
 * band, and the name on the row is used only to confirm the match.
 *
 * Where nothing resolves -- a band in a brand the reader cannot see, a
 * planner row outside their scope -- the caller falls back to the name the
 * decision captured at write time. That name is the record; dim_planner is
 * only being used to say what the person's job is TODAY.
 */
export type BandOwnerKey = string;

export function bandOwnerKey(agentName: string, brandId: string | null): BandOwnerKey {
  return `${agentName}::${brandId ?? ""}`;
}

export function indexPeople(
  people: readonly AccountablePerson[],
): Map<string, AccountablePerson> {
  const byId = new Map<string, AccountablePerson>();
  for (const person of people) byId.set(person.employeeId, person);
  return byId;
}

/** owner_employee_id per (agent_name, brand_id), from autonomy_band. */
export function indexBandOwners(
  bands: readonly Pick<
    Tbl["autonomy_band"]["Row"],
    "agent_name" | "brand_id" | "owner_employee_id"
  >[],
): Map<BandOwnerKey, string> {
  const owners = new Map<BandOwnerKey, string>();
  for (const band of bands) {
    if (band.owner_employee_id) {
      owners.set(bandOwnerKey(band.agent_name, band.brand_id), band.owner_employee_id);
    }
  }
  return owners;
}

export type Accountable = {
  /** The name on the ledger row. Always present; never re-derived. */
  name: string;
  /** The person that name resolves to, where it resolves to exactly one. */
  person: AccountablePerson | null;
  /** How the resolution was made, so the screen can say. */
  via: "planner_id" | "autonomy_band" | "unresolved";
};

export function resolveAccountable(
  entry: LedgerEntry,
  peopleById: Map<string, AccountablePerson>,
  bandOwners: Map<BandOwnerKey, string>,
): Accountable {
  if (entry.actorType === "human" && entry.plannerId) {
    const person = peopleById.get(entry.plannerId) ?? null;
    return { name: entry.accountableName, person, via: "planner_id" };
  }

  if (entry.actorType === "agent" && entry.actorId) {
    const ownerId = bandOwners.get(bandOwnerKey(entry.actorId, entry.brandId));
    const person = ownerId ? (peopleById.get(ownerId) ?? null) : null;
    if (person) return { name: entry.accountableName, person, via: "autonomy_band" };
  }

  return { name: entry.accountableName, person: null, via: "unresolved" };
}

// ==================================================== stale band detection
//
// The allocation agent writes its band into the reason text: "1.48pp into
// TOPS|D2C|IN-N, inside the 2.0pp band (1,946 units)." Those strings are
// CORRECT HISTORY. The band was 2.0pp when they were written and it is
// 1.25pp (SPD) / 1.12pp (ECO) now, and planner_decision is append-only, so
// the rows stay exactly as they were and the policy_parameter row beside
// them records what changed.
//
// Detecting them is done by reading the figure out of the text and
// comparing it with the band in force -- never by looking for the literal
// string "2.0pp", which would stop working the moment the band moved again
// and would quietly report zero stale rows.

const BAND_IN_REASON = /inside the ([0-9]+(?:\.[0-9]+)?)pp band/i;

/**
 * The band width an agent row's reason text claims to have acted inside,
 * or null if the row does not quote one.
 */
export function quotedBandPp(entry: LedgerEntry): number | null {
  if (!entry.reason) return null;
  const match = BAND_IN_REASON.exec(entry.reason);
  return match ? num(match[1]) : null;
}

/**
 * Does a quoted band sit far enough from the band in force to count as a
 * superseded one?
 *
 * The tolerance lives in constants.ts with the other authored values, so
 * the sentence at the top of the screen that lists them exhaustively is
 * built from the same number this comparison uses. See the comment there
 * for why it is not zero.
 */
export function quotesSupersededBand(
  quoted: number | null,
  inForce: number | null,
): boolean {
  if (quoted === null || inForce === null) return false;
  return Math.abs(quoted - inForce) > BAND_ROUNDING_TOLERANCE_PP;
}

/**
 * THE OTHER BAND IN THE REASON TEXT.
 *
 * The exception agent writes a RUPEE band the same way the allocation agent
 * writes a percentage-point one: "...1,887,266 INR at stake, inside the
 * 7,534,538 INR band." That band is the median open exception for the
 * brand, recomputed on every run, so it moves whenever the queue moves --
 * by design, and with no policy_parameter row recording a supersession
 * because nothing was superseded.
 *
 * It is parsed here so the band panel can SAY how many rows quote a figure
 * other than the one now in force, instead of leaving a reader to wonder
 * whether the panel simply missed them. Rupees in these strings are written
 * with thousands separators and no decimals, so the separators come out
 * before the parse and the comparison is made to the nearest rupee.
 */
const VALUE_BAND_IN_REASON = /inside the ([0-9][0-9,]*) INR band/i;

/** The rupee band an exception row's reason quotes, or null. */
export function quotedBandInr(entry: LedgerEntry): number | null {
  if (!entry.reason) return null;
  const match = VALUE_BAND_IN_REASON.exec(entry.reason);
  return match ? num(match[1].replace(/,/g, "")) : null;
}

/** Whole rupees. The reasons carry no paise; max_value_inr sometimes does. */
export function quotesDifferentValueBand(
  quoted: number | null,
  inForce: number | null,
): boolean {
  if (quoted === null || inForce === null) return false;
  return Math.abs(quoted - inForce) >= 1;
}
