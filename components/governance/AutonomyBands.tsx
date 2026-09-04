import { Card, CardBody, CardHeader, Pill } from "@/components";
import type { AgentRun, AutonomyBand } from "@/lib/queries";

import { UNTABLED_FORECAST_ESCALATION } from "./constants";
import { Muted, Quote } from "./Layout";
import type { AccountablePerson, LedgerEntry } from "./data";
import {
  MIDDOT,
  formatBandPp,
  formatCount,
  formatInr,
  formatTimestamp,
  humaniseRole,
  plural,
} from "./format";

/**
 * AUTONOMY BANDS -- what each agent may do without asking, and who answers
 * for it when it does.
 *
 * THE BASIS IS THE ARTEFACT, NOT THE NUMBER
 * -----------------------------------------
 * "Allocation agent: 1.25pp" is a setting. "Across the 16 regional share
 * shifts this brand actually proposes, the magnitude below which 25% of them
 * fall is 1.25pp, and widening means raising that percentile rather than
 * having a fresh opinion about the number" is a policy somebody can argue
 * with. autonomy_band carries both halves -- max_shift_pp / max_value_inr
 * for the cap, acts_within and escalates_when for the reasoning -- and this
 * panel prints the reasoning in full rather than reducing each band to its
 * cap. A band whose derivation is not on screen is indistinguishable from a
 * number somebody liked the look of.
 *
 * WHY BOTH BRANDS APPEAR
 * ----------------------
 * autonomy_band's read policy is USING (true). A band is a published promise
 * about what software may do unattended, and a promise only its own brand
 * can read is not published. The ledger above this panel is scoped by row
 * level security and the bands are not, so the two can legitimately show
 * different brands and the panel says which it is showing.
 *
 * THE ACTIVITY LINE IS READ, NOT ASSERTED
 * ---------------------------------------
 * Each band carries what its agent has actually done: entries it wrote in
 * the ledger you can read, and the examined / acted / escalated counts from
 * agent_run. That is how the learning agent's zero shows up here as well as
 * in the learning loop -- a band that describes work nobody has done is
 * worth seeing next to the promise it makes.
 */

export type BandActivity = {
  /** Ledger entries in YOUR scope written by this agent for this brand. */
  ledgerEntries: number;
  runs: number;
  examined: number;
  acted: number;
  escalated: number;
  /** Largest items_examined on any single readable run. */
  maxExamined: number;
  lastRunAt: string | null;
};

export type BandRow = {
  band: AutonomyBand;
  /** Resolved from owner_employee_id; falls back to the id itself. */
  ownerName: string | null;
  ownerRole: string | null;
  activity: BandActivity;
};

function activityFor(
  band: AutonomyBand,
  runs: readonly AgentRun[],
  entries: readonly LedgerEntry[],
): BandActivity {
  const mine = runs.filter(
    (run) => run.agent_name === band.agent_name && run.brand_id === band.brand_id,
  );

  const ledgerEntries = entries.filter(
    (entry) =>
      entry.actorType === "agent" &&
      entry.actorId === band.agent_name &&
      entry.brandId === band.brand_id,
  ).length;

  return {
    ledgerEntries,
    runs: mine.length,
    examined: mine.reduce((sum, run) => sum + (run.items_examined ?? 0), 0),
    acted: mine.reduce((sum, run) => sum + (run.items_acted ?? 0), 0),
    escalated: mine.reduce((sum, run) => sum + (run.items_escalated ?? 0), 0),
    maxExamined: mine.reduce(
      (most, run) => Math.max(most, run.items_examined ?? 0),
      0,
    ),
    lastRunAt:
      mine
        .map((run) => run.started_at)
        .filter((value): value is string => typeof value === "string")
        .sort()
        .at(-1) ?? null,
  };
}

/**
 * Join the bands to the people who own them and the work their agents have
 * done. Nothing is computed that a row does not already carry; this only
 * puts three reads beside each other.
 */
export function buildBandRows(
  bands: readonly AutonomyBand[],
  runs: readonly AgentRun[],
  entries: readonly LedgerEntry[],
  peopleById: Map<string, AccountablePerson>,
): BandRow[] {
  return bands.map((band) => {
    const owner = band.owner_employee_id
      ? (peopleById.get(band.owner_employee_id) ?? null)
      : null;
    return {
      band,
      // The employee id is a true identifier even when the person record is
      // out of scope, so an unreadable owner degrades to the id rather than
      // to "unknown" -- an unattributed band is the one thing this table
      // must never appear to be.
      ownerName: owner?.fullName ?? band.owner_employee_id ?? null,
      ownerRole: owner ? (owner.role ?? humaniseRole(owner.appRole)) : null,
      activity: activityFor(band, runs, entries),
    };
  });
}

/** The cap, in whichever unit the band is expressed in. */
function capLabel(band: AutonomyBand): string {
  const pp = band.max_shift_pp;
  const inr = band.max_value_inr;
  if (pp !== null && pp > 0) return `acts under ${formatBandPp(pp)}`;
  if (inr !== null && inr > 0) return `acts at or below ${formatInr(inr)}`;
  if ((pp !== null && pp === 0) || (inr !== null && inr === 0)) {
    return "recommend-only";
  }
  return "no numeric cap";
}

/** "forecast_agent" reads as itself; it is the identifier in the table. */
function agentLabel(band: AutonomyBand): string {
  return band.agent_name;
}

/** Multiplication sign, kept in one place like the glyphs in format.ts. */
const TIMES = "×";

/**
 * The multiplication written out -- "0.27 × 0.27 × 0.27" -- rather than its
 * answer asserted, so a reader can follow it to the percentage beside it and
 * disagree with the rate rather than with a conclusion.
 */
function repeated(rate: number, times: number): string {
  return Array.from({ length: Math.max(1, times) }, () => rate.toFixed(2)).join(
    ` ${TIMES} `,
  );
}

/**
 * The forecast agent's escalation arithmetic, done on screen from the
 * primitives in constants.ts. Rendered only under that agent's band, and
 * only ever with the line saying no table carries it.
 */
function ForecastArithmetic({ activity }: { activity: BandActivity }) {
  const k = UNTABLED_FORECAST_ESCALATION;
  const atSpecK = Math.pow(k.chanceBreachRate, k.specK);
  const atShippedK = Math.pow(k.chanceBreachRate, k.shippedK);
  const seriesAtSpecK = Math.round(atSpecK * k.seriesScored);
  const seriesAtShippedK = Math.round(atShippedK * k.seriesScored);

  return (
    <div className="mt-[10px] rounded-inner bg-amberW px-[14px] py-[12px]">
      <div className="mb-[5px] flex flex-wrap items-center gap-[8px]">
        <Pill variant="amber">No table carries this</Pill>
        <span className="text-[12px] font-extrabold text-ink">
          Why the breach has to repeat, and how many times
        </span>
      </div>
      <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
        A single week&apos;s 1-WAPE has a standard deviation of{" "}
        <span className="tabular font-bold text-ink">
          {k.weeklySdPointsLow}&ndash;{k.weeklySdPointsHigh}
        </span>{" "}
        accuracy points on this data, so{" "}
        <span className="tabular font-bold text-ink">
          {(k.chanceBreachRateLow * 100).toFixed(0)}&ndash;
          {(k.chanceBreachRateHigh * 100).toFixed(0)}%
        </span>{" "}
        of individual weeks fall more than{" "}
        <span className="tabular font-bold text-ink">{k.driftPoints}</span> points
        below baseline by chance alone -- a rule that fired on one bad week
        would be reporting noise about a quarter of the time. Take{" "}
        <span className="tabular font-bold text-ink">
          {k.chanceBreachRate.toFixed(2)}
        </span>{" "}
        as the per-week rate. Breaches then land consecutively by variance alone
        in{" "}
        <span className="tabular font-bold text-ink">
          {repeated(k.chanceBreachRate, k.specK)} = {(atSpecK * 100).toFixed(1)}%
        </span>{" "}
        of series, about{" "}
        <span className="tabular font-bold text-ink">{seriesAtSpecK}</span> of{" "}
        <span className="tabular font-bold text-ink">{k.seriesScored}</span>, at
        k&nbsp;={k.specK} -- but in only{" "}
        <span className="tabular font-bold text-ink">
          {repeated(k.chanceBreachRate, k.shippedK)} ={" "}
          {(atShippedK * 100).toFixed(1)}%
        </span>
        , about{" "}
        <span className="tabular font-bold text-ink">{seriesAtShippedK}</span> of{" "}
        <span className="tabular font-bold text-ink">{k.seriesScored}</span>, at
        k&nbsp;={k.shippedK}. Three is therefore the smallest k at which an
        alert is more likely to be real degradation than noise, and the{" "}
        <span className="tabular font-bold text-ink">{k.driftPoints}</span>-point
        threshold itself does not move.
      </p>
      <Muted className="mt-[8px]">
        <span className="font-bold text-ink">Where this comes from, exactly. </span>
        The percentages above are computed here from one stored rate; that rate,
        the standard deviation and both values of k are quoted from the comment
        on <span className="font-mono text-[11px] text-ink">
          {UNTABLED_FORECAST_ESCALATION.symbol}
        </span>{" "}
        in{" "}
        <span className="font-mono text-[11px] text-ink">
          {UNTABLED_FORECAST_ESCALATION.source}
        </span>
        . They were measured against this dataset and never written to a row,
        which makes this box the one place on the screen with no query behind
        it &mdash; and the reason it is boxed and labelled rather than set in
        the same type as everything that was read.
      </Muted>
      <Muted className="mt-[6px]">
        <span className="font-bold text-ink">
          And the two numbers disagree, which is the finding.
        </span>{" "}
        The band text stored above says the breach must repeat over{" "}
        <span className="tabular text-ink">{k.specK}</span> consecutive weeks;
        the shipped agent sets{" "}
        <span className="font-mono text-[11px] text-ink">{k.symbol}</span> to{" "}
        <span className="tabular text-ink">{k.shippedK}</span> for the reason
        above. No table records which value the last run enforced, so this panel
        shows both and does not choose. The fix is in the pipeline, not here:
        have the run that writes the band write its own k and this arithmetic
        into <span className="font-mono text-[11px] text-ink">escalates_when</span>{" "}
        and the disagreement cannot recur.
      </Muted>
      <Muted className="mt-[6px]">
        One part of it can be checked against a table, so it is:{" "}
        <span className="tabular text-ink">{formatCount(k.seriesScored)}</span>{" "}
        series in the source comment against{" "}
        {activity.maxExamined > 0 ? (
          <>
            <span className="tabular text-ink">
              {formatCount(activity.maxExamined)}
            </span>{" "}
            on the largest run of this agent readable to you in agent_run
            {activity.maxExamined === k.seriesScored
              ? " -- they agree."
              : " -- they do not agree, and the run figure is the one to trust, since it was written by the run rather than typed into a comment."}
          </>
        ) : (
          "no readable run at all, so there is nothing in your scope to compare it with."
        )}
      </Muted>
    </div>
  );
}

function BandPanel({
  row,
  showArithmetic,
}: {
  row: BandRow;
  /**
   * The forecast arithmetic is identical for both brands -- it is a property
   * of the accuracy measure, not of a brand -- so it is printed under the
   * first forecast band on screen and pointed at from the second. Repeating
   * it would make the reader check whether the two copies differed.
   */
  showArithmetic: boolean;
}) {
  const { band, activity } = row;

  return (
    <div className="border-b border-rule py-[14px] last:border-b-0">
      <div className="flex flex-wrap items-center gap-[8px]">
        <span className="font-mono text-[12px] font-bold text-ink">
          {agentLabel(band)}
        </span>
        <Pill variant={band.enabled ? "violet" : "grey"}>
          {band.enabled ? "enabled" : "disabled"}
        </Pill>
        <Pill variant="grey" tabular>
          {capLabel(band)}
        </Pill>
      </div>

      <Muted className="mt-[5px]">
        Accountable:{" "}
        <span className="font-bold text-ink">
          {row.ownerName ?? "nobody named on the band"}
        </span>
        {row.ownerRole ? ` (${row.ownerRole})` : ""} {MIDDOT}{" "}
        {band.last_widened_at
          ? `widened ${formatTimestamp(band.last_widened_at)}${
              band.widened_by ? ` by ${band.widened_by}` : ""
            }`
          : "never widened -- a widening stamps last_widened_at and widened_by onto this row, so a band that moves says who moved it"}
      </Muted>

      <Quote className="mt-[8px]">
        <span className="font-bold text-ink">Acts within. </span>
        {band.acts_within}
      </Quote>
      <Quote className="mt-[6px]">
        <span className="font-bold text-ink">Escalates when. </span>
        {band.escalates_when}
      </Quote>

      {band.agent_name === "forecast_agent" ? (
        showArithmetic ? (
          <ForecastArithmetic activity={activity} />
        ) : (
          <Muted className="mt-[8px]">
            The escalation arithmetic behind the consecutive-week requirement is
            the same for both brands -- it is a property of the accuracy measure
            rather than of a brand -- and is printed once, under the first
            forecast band above.
          </Muted>
        )
      ) : null}

      <Muted className="mt-[8px]">
        {activity.runs === 0
          ? "No run of this agent is readable in your scope, so nothing can be said about what it has done."
          : `${plural(activity.runs, "run", "runs")} recorded, ${formatCount(
              activity.examined,
            )} examined, ${formatCount(activity.acted)} acted on, ${formatCount(
              activity.escalated,
            )} escalated${
              activity.lastRunAt ? `, last at ${formatTimestamp(activity.lastRunAt)}` : ""
            }.`}{" "}
        {activity.ledgerEntries > 0
          ? `${plural(activity.ledgerEntries, "entry", "entries")} in the trail you can read ${
              activity.ledgerEntries === 1 ? "was" : "were"
            } written by it.`
          : "It has written nothing into the part of the ledger you can read."}
        {activity.runs > 0 && activity.examined === 0 ? (
          <>
            {" "}
            <span className="font-bold text-amber">
              It has run and looked at nothing, on every run recorded.
            </span>{" "}
            The band above describes work that has not happened yet. On a
            governance screen that gap is a finding rather than a backlog item,
            so it is printed at the size of the promise it fails to keep.
          </>
        ) : null}
      </Muted>
    </div>
  );
}

export type AutonomyBandsProps = {
  rows: readonly BandRow[];
  /** The brand on the viewer's planner record, for the scoping sentence. */
  viewerBrandId: string | null;
};

export function AutonomyBands({ rows, viewerBrandId }: AutonomyBandsProps) {
  const brands = [
    ...new Set(rows.map((row) => row.band.brand_id ?? "unassigned")),
  ].sort();

  // Which forecast band gets the arithmetic printed under it: the first one
  // in render order, whichever brand that turns out to be.
  const firstForecastKey = rows
    .filter((row) => row.band.agent_name === "forecast_agent")
    .map((row) => `${row.band.brand_id ?? "unassigned"}-${row.band.agent_name}`)
    .sort()
    .at(0);

  return (
    <Card>
      <CardHeader
        title="Autonomy bands"
        subtitle="Data, not code. Widening is recorded."
      />
      <CardBody className="border-b border-rule">
        <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
          A band is what an agent may do without asking, the point at which it
          must ask instead, and the person who answers for both. All three are
          rows in <span className="font-mono text-[11px] text-ink">autonomy_band</span>,
          not constants in the agent code, which is what makes a widening an
          edit somebody signs rather than a deploy nobody reads.
        </p>
        <Muted className="mt-[8px]">
          {brands.length === 0
            ? "No band is readable, which would mean the table is empty rather than that one is hidden from you: the read policy on autonomy_band is USING (true)."
            : `Bands for ${brands.join(" and ")} are shown${
                viewerBrandId && brands.length > 1
                  ? `, not only ${viewerBrandId}`
                  : ""
              }. autonomy_band is readable to every authenticated user by policy, while the decision trail above it is scoped to what you may see -- so this panel can legitimately name a brand whose decisions you cannot read. The caps and the reasoning below are quoted from the rows themselves; nothing here is summarised.`}
        </Muted>
      </CardBody>

      {brands.length === 0 ? (
        <CardBody>
          <Muted>
            This panel would list every agent, the cap it acts within, the
            condition that makes it escalate, the person accountable for it and
            what it has actually done across its recorded runs.
          </Muted>
        </CardBody>
      ) : (
        brands.map((brandId) => (
          <CardBody key={brandId} className="border-b border-rule last:border-b-0">
            <div className="text-[12.5px] font-extrabold text-ink">{brandId}</div>
            {rows
              .filter((row) => (row.band.brand_id ?? "unassigned") === brandId)
              .map((row) => {
                const key = `${brandId}-${row.band.agent_name}`;
                return (
                  <BandPanel
                    key={key}
                    row={row}
                    showArithmetic={key === firstForecastKey}
                  />
                );
              })}
          </CardBody>
        ))
      )}
    </Card>
  );
}
