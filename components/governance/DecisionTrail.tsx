import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardBody, CardHeader, Pill, SeriesName, Why } from "@/components";
import type { PillVariant } from "@/components";

import { TRAIL_PAGE_SIZE } from "./constants";
import { Muted, Quote } from "./Layout";
import {
  agentValues,
  resolveAccountable,
  type Accountable,
  type AccountablePerson,
  type BandOwnerKey,
  type LedgerEntry,
  type SeriesLabels,
} from "./data";
import {
  ARROW,
  DASH,
  MIDDOT,
  formatCount,
  formatInr,
  formatPp,
  formatTimestamp,
  formatUnits,
  humaniseRole,
} from "./format";

/**
 * THE DECISION TRAIL -- humans and agents in one ledger, newest first.
 *
 * ONE LIST, NOT TWO
 * -----------------
 * The temptation on this screen is a tab for people and a tab for agents,
 * because the agent rows outnumber the human ones seventeen to one and they
 * swamp the list. Splitting them would also quietly make the argument that
 * they are different KINDS of event, and they are not: they are entries in
 * the same append-only table, written by the same insert path, under the
 * same row level security, and every one of them names a person. The volume
 * imbalance is a true fact about the pilot -- most of what happens now
 * happens inside a band -- and hiding it behind a tab would hide the thing
 * worth knowing.
 *
 * WHAT THE VALUE COLUMNS DO AND DO NOT HOLD
 * -----------------------------------------
 * A human row carries recommended_value and accepted_value on the decision
 * itself. Every agent row in this ledger has NULL in both. That is a real
 * property of the fixture and it is stated rather than papered over: the
 * agent rows show the figures from the RECOMMENDATION they acted on. A zero
 * in those columns would have read as "the agent committed nothing", which
 * is a different and false statement.
 *
 * That caveat is stated ONCE, on the card header, not on each row. It is a
 * property of every agent entry in the table, so repeating it per row said
 * the same thing eighteen times and buried the eighteen things that actually
 * differed. Facts that vary by row stay on the row; facts about the ledger
 * live on the ledger.
 *
 * ACCOUNTABILITY IS THE POINT OF THE ROW
 * --------------------------------------
 * accountable_planner is NOT NULL on both kinds of row. An agent row
 * therefore always names a person, and this component renders that name in
 * the same position and the same weight for both -- "the agent acted, this
 * person is answerable". Where the name resolves to a dim_planner record
 * the job title is shown beside it, and the row says HOW it resolved,
 * because an agent row carries a name and not an employee id and a name is
 * not a key: this pilot has two people called Shreya Bose. See
 * resolveAccountable() in data.ts.
 */

/* Page size lives in constants.ts with the other authored values, so the
   provenance sentence at the top of the screen and this pager cannot drift
   apart. */

type StatusLook = { label: string; pill: PillVariant; dot: string };

/**
 * How a row is labelled and dotted. An agent row is violet whatever its
 * status, because "the agent executed inside its band" is a different event
 * from "a person approved", and the pilot's agent rows are all APPROVED.
 */
function statusLook(entry: LedgerEntry): StatusLook {
  if (entry.actorType === "agent") {
    return { label: "Agent executed", pill: "violet", dot: "border-violet" };
  }
  switch (entry.status) {
    case "APPROVED":
      return { label: "Approved", pill: "up", dot: "border-green" };
    case "MODIFIED":
      return { label: "Modified", pill: "amber", dot: "border-amber" };
    case "REJECTED":
      return { label: "Rejected", pill: "down", dot: "border-red" };
    default:
      return { label: "Scenario", pill: "grey", dot: "border-rule2" };
  }
}

function seriesLabel(entry: LedgerEntry, labels: SeriesLabels): string {
  const parts = [
    entry.categoryId ? (labels.category[entry.categoryId] ?? entry.categoryId) : null,
    entry.channelId ? (labels.channel[entry.channelId] ?? entry.channelId) : null,
    entry.regionId ? (labels.region[entry.regionId] ?? entry.regionId) : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(` ${MIDDOT} `) : "no series on the recommendation";
}

/**
 * "Buy quantity", "Allocation", "Exception" -- the rec_type enum, spelled
 * out. Those three are the whole enum: markdown recommendations live in
 * their own table and are not decided through planner_decision, so there is
 * no fourth case to write and a null only ever means the recommendation
 * behind this decision is outside what you may read.
 */
function recTypeLabel(entry: LedgerEntry): string {
  switch (entry.recType) {
    case "BUY_QUANTITY":
      return "Buy quantity";
    case "ALLOCATION":
      return "Allocation";
    case "EXCEPTION":
      return "Exception";
    default:
      return "Recommendation";
  }
}

function personLine(accountable: Accountable): string {
  const person = accountable.person;
  if (!person) return accountable.name;
  const role = person.role ?? humaniseRole(person.appRole);
  return role ? `${accountable.name} (${role})` : accountable.name;
}

/**
 * WHAT UNIT A DECISION ROW'S VALUE COLUMNS ARE IN, AND HOW THIS KNOWS.
 *
 * planner_decision.recommended_value is a bare numeric with no unit column,
 * and the write path fills it differently by recommendation type: a buy or
 * an allocation takes the units out of the recommendation payload, while an
 * exception has no quantity to commit, so the value it records is the rupees
 * the exception put on the table. The unit is therefore read from rec_type,
 * NOT guessed from how large the number is -- a 4,727,306 that happens to be
 * rupees and a 52,206 that happens to be units are indistinguishable by
 * magnitude, and a screen that guessed would eventually print money as
 * garments in an audit trail.
 *
 * A null rec_type would mean the recommendation behind the decision is not
 * readable, which row level security makes very nearly impossible here --
 * a decision is visible exactly when its recommendation is. If it ever
 * happens the number is printed bare, with the reason, rather than dressed
 * in a unit nobody can vouch for.
 */
type ValueUnit = "inr" | "units" | "unknown";

function valueUnit(entry: LedgerEntry): ValueUnit {
  if (entry.recType === "EXCEPTION") return "inr";
  if (entry.recType === null) return "unknown";
  return "units";
}

function formatDecisionValue(value: number | null, unit: ValueUnit): string {
  if (unit === "inr") return formatInr(value);
  if (unit === "units") return formatUnits(value);
  return value === null ? DASH : `${formatUnits(value)} (unit unknown)`;
}

/**
 * The two-row comparison. Human rows read from the decision; agent rows
 * read from the recommendation and say so, because the decision row itself
 * recorded no number.
 */
function Comparison({ entry }: { entry: LedgerEntry }) {
  if (entry.actorType === "human") {
    const unit = valueUnit(entry);
    const recommended = formatDecisionValue(entry.recommendedValue, unit);

    let committed: string;
    if (entry.status === "REJECTED") {
      committed = "Nothing committed";
    } else if (entry.acceptedValue === null) {
      committed = `${recommended} -- taken as recommended`;
    } else {
      committed = formatDecisionValue(entry.acceptedValue, unit);
    }

    return (
      <>
        <dl className="my-[10px] grid grid-cols-[auto_auto] justify-start gap-x-[18px] gap-y-[4px] text-copy">
          <dt className="font-semibold text-mute">Model recommended</dt>
          <dd className="font-extrabold text-ink tabular">{recommended}</dd>
          <dt className="font-semibold text-mute">Committed</dt>
          <dd className="font-extrabold text-ink tabular">{committed}</dd>
        </dl>
        {unit === "inr" ? (
          <Muted className="mb-[9px]">
            Both figures are rupees at stake rather than a quantity: an
            exception is a risk to be worked, not a number to commit, so the
            value recorded against the decision is what the exception put on
            the table. The unit is read from the recommendation type, never
            inferred from the size of the number.
          </Muted>
        ) : null}
        {unit === "unknown" ? (
          <Muted className="mb-[9px]">
            The recommendation behind this decision is not readable in your
            scope, so the unit of these figures cannot be established and they
            are printed bare rather than labelled with a guess.
          </Muted>
        ) : null}
      </>
    );
  }

  const values = agentValues(entry);
  const hasUnits = values.fromUnits !== null && values.toUnits !== null;

  return (
    <>
      <dl className="my-[10px] grid grid-cols-[auto_auto] justify-start gap-x-[18px] gap-y-[4px] text-copy">
        <dt className="font-semibold text-mute">Model recommended</dt>
        <dd className="font-extrabold text-ink tabular">
          {hasUnits
            ? `${formatUnits(values.fromUnits)} ${ARROW} ${formatUnits(values.toUnits)} units`
            : values.unitsAtRisk !== null
              ? `${formatUnits(values.unitsAtRisk)} units at risk, ${formatInr(entry.valueAtStakeInr)} at stake`
              : DASH}
        </dd>
        <dt className="font-semibold text-mute">Committed</dt>
        <dd className="font-extrabold text-ink tabular">
          Executed as recommended
          {values.shiftPp !== null ? ` (${formatPp(values.shiftPp)} share)` : ""}
        </dd>
      </dl>
    </>
  );
}

/** The accountability line. Rendered on every row, agent rows included. */
function AccountableLine({
  entry,
  accountable,
}: {
  entry: LedgerEntry;
  accountable: Accountable;
}) {
  if (entry.actorType === "agent") {
    return (
      <Muted className="mt-[9px]">
        <span className="font-bold text-ink">{entry.actorId ?? "An agent"}</span>{" "}
        executed this.{" "}
        <span className="font-bold text-ink">{personLine(accountable)}</span> is
        answerable for it.{" "}
        {/* Which of the two resolution paths produced that name is a fact
            about THIS row, so it stays on the row. Why the paths exist is a
            fact about the ledger, and it is stated once on the card header --
            it used to be repeated here, on all 22 of them. */}
        {accountable.via === "autonomy_band"
          ? "Name resolved through the autonomy band. "
          : accountable.via === "unresolved"
            ? "Name shown as written; no employee record readable in your scope. "
            : ""}
        <span className="font-mono text-[11px] text-ink">{entry.modelVersion}</span>
      </Muted>
    );
  }

  return (
    <Muted className="mt-[9px]">
      Accountable:{" "}
      <span className="font-bold text-ink">{personLine(accountable)}</span>
      {accountable.person?.regionId ? ` ${MIDDOT} ${accountable.person.regionId}` : ""}{" "}
      {MIDDOT}{" "}
      <span className="font-mono text-[11px] text-ink">{entry.modelVersion}</span>
    </Muted>
  );
}

function TrailEntry({
  entry,
  accountable,
  labels,
  last,
}: {
  entry: LedgerEntry;
  accountable: Accountable;
  labels: SeriesLabels;
  last: boolean;
}) {
  const look = statusLook(entry);

  return (
    <li
      className={`relative ml-[5px] border-l-2 pl-[24px] ${
        last ? "border-transparent pb-0" : "border-rule pb-[22px]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute -left-[7px] top-[3px] h-[12px] w-[12px] rounded-full border-[2.5px] bg-white ${look.dot}`}
      />

      <Muted>
        {formatTimestamp(entry.decidedAt)} {MIDDOT}{" "}
        {entry.actorType === "agent"
          ? `${entry.actorId ?? "agent"}, acting for ${accountable.name}`
          : personLine(accountable)}
      </Muted>

      <div className="mt-[5px] flex flex-wrap items-center gap-[9px]">
        <Pill variant={look.pill}>{look.label}</Pill>
        <SeriesName qualifier={`${MIDDOT} ${seriesLabel(entry, labels)}`}>
          {recTypeLabel(entry)}
        </SeriesName>
      </div>

      <Comparison entry={entry} />

      {entry.reason ? (
        <Quote>{entry.reason}</Quote>
      ) : (
        <Quote>
          No reason was recorded on this row. The schema allows it on an
          APPROVED decision -- agreeing with a recommendation needs no
          argument -- and requires one on anything that departs from it.
        </Quote>
      )}

      <AccountableLine entry={entry} accountable={accountable} />
    </li>
  );
}

// ------------------------------------------------------------- pagination

function pageHref(page: number): string {
  return page <= 1 ? "/governance#trail" : `/governance?trail=${page}#trail`;
}

const PAGE_LINK =
  "rounded-full bg-cream px-[11px] py-[5px] text-[11.5px] font-bold text-ink transition-colors duration-[120ms] hover:bg-hover";
const PAGE_LINK_OFF =
  "rounded-full px-[11px] py-[5px] text-[11.5px] font-bold text-mute opacity-55";

export type DecisionTrailProps = {
  entries: readonly LedgerEntry[];
  labels: SeriesLabels;
  peopleById: Map<string, AccountablePerson>;
  bandOwners: Map<BandOwnerKey, string>;
  page: number;
  /**
   * Right-hand slot in the card header. The kill switch itself is NOT put
   * here: it needs the line naming who may use it and what pausing does or
   * does not undo, and a control that consequential should not be a bare
   * button in a header. Its current state, which a reader of the ledger does
   * want at a glance, is passed here instead.
   */
  headerAction?: ReactNode;
};

export function DecisionTrail({
  entries,
  labels,
  peopleById,
  bandOwners,
  page,
  headerAction,
}: DecisionTrailProps) {
  const total = entries.length;
  const pages = Math.max(1, Math.ceil(total / TRAIL_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * TRAIL_PAGE_SIZE;
  const shown = entries.slice(start, start + TRAIL_PAGE_SIZE);

  const humans = entries.filter((entry) => entry.actorType === "human").length;
  const agents = total - humans;

  // WHERE THE PEOPLE ARE.
  //
  // Chronology is not negotiable on an audit trail, and in this pilot the
  // agents ran last, so the newest pages are solidly machine. A reader who
  // came to see the human decisions should not have to page seventeen times
  // to find them or, worse, conclude there are none. This is a pointer, not
  // a filter: the list stays one ledger in one order, and the link simply
  // says which page the most recent human entry is on.
  const firstHumanIndex = entries.findIndex((entry) => entry.actorType === "human");
  const firstHumanPage =
    firstHumanIndex < 0 ? null : Math.floor(firstHumanIndex / TRAIL_PAGE_SIZE) + 1;
  const humansOnThisPage = shown.some((entry) => entry.actorType === "human");

  return (
    <Card id="trail">
      <CardHeader
        title="Decision trail"
        subtitle="Humans and agents in one ledger, newest first"
        actions={headerAction}
      />
      <CardBody>
        <Muted className="mb-[14px] block">
          {total === 0
            ? "No decisions are readable in your scope."
            : `${formatCount(total)} entries readable in your scope: ${formatCount(humans)} written by people and ${formatCount(agents)} written by agents.`}{" "}
          {total > TRAIL_PAGE_SIZE ? (
            <>
              The ledger is append-only and nothing is filtered out of it, so it
              is paged rather than capped: this page holds entries{" "}
              <span className="tabular text-ink">
                {formatCount(start + 1)}
              </span>
              {ARROW}
              <span className="tabular text-ink">
                {formatCount(start + shown.length)}
              </span>{" "}
              of {formatCount(total)}, {TRAIL_PAGE_SIZE} to a page. Every entry
              is reachable; none of them has been summarised away.
            </>
          ) : (
            "Every entry readable to you is on this page."
          )}{" "}
          {firstHumanPage !== null && !humansOnThisPage ? (
            <>
              {" "}
              The agents ran more recently than anyone decided anything by hand,
              so the newest pages are entirely theirs; the most recent entry
              written by a person is on{" "}
              <Link
                href={pageHref(firstHumanPage)}
                className="font-bold text-orangeD underline underline-offset-2"
              >
                page {firstHumanPage}
              </Link>
              . Nothing is filtered -- that is a pointer into the same list, in
              the same order.
            </>
          ) : null}
        </Muted>

        {/* Everything here used to be printed on every row. It is one fact
            about how the ledger is built and one about what you can see, so
            it is stated once, and the rows carry only what differs between
            them. */}
        <Why
          lead="These are the counts in your scope, not the counts in the pilot"
          label="how the ledger is built"
          className="mb-[14px] block"
        >
          A decision is visible exactly when the recommendation it decided is
          visible, so a planner reads their own categories and region and a
          manager reads the brand. That is row level security deciding it, not
          this screen.{" "}
          {agents > 0 ? (
            <>
              On agent entries the decision row&apos;s own value columns are
              empty -- the agent wrote no number into the ledger -- so the
              figures shown are read from the recommendation it acted on, and
              labelled as what was on the table rather than as what the row
              recorded. Accountability does not transfer to software:
              accountable_planner is NOT NULL on an agent row for exactly that
              reason. The row stores that person as a name, resolved through
              the autonomy band the agent runs under, because two planners in
              this pilot share a name and a name is not a key. Where no
              employee record is readable in your scope, the name captured at
              write time is shown as it was written.
            </>
          ) : null}
        </Why>

        {shown.length === 0 ? (
          <Quote>
            Nothing has been decided against any recommendation you can see. If
            that is unexpected, it is worth checking which categories and
            region your planner record carries: this list is not filtered by
            date or by type, so an empty trail means no decision row exists on
            a recommendation in your scope rather than that a filter is hiding
            one.
          </Quote>
        ) : (
          <ol className="list-none">
            {shown.map((entry, index) => (
              <TrailEntry
                key={entry.id}
                entry={entry}
                accountable={resolveAccountable(entry, peopleById, bandOwners)}
                labels={labels}
                last={index === shown.length - 1}
              />
            ))}
          </ol>
        )}

        {pages > 1 ? (
          <nav
            aria-label="Decision trail pages"
            className="mt-[18px] flex flex-wrap items-center gap-[8px] border-t border-rule pt-[14px]"
          >
            {current > 1 ? (
              <Link href={pageHref(current - 1)} className={PAGE_LINK}>
                Newer
              </Link>
            ) : (
              <span className={PAGE_LINK_OFF}>Newer</span>
            )}
            <span className="text-[11.5px] font-semibold text-mute tabular">
              Page {current} of {pages}
            </span>
            {current < pages ? (
              <Link href={pageHref(current + 1)} className={PAGE_LINK}>
                Older
              </Link>
            ) : (
              <span className={PAGE_LINK_OFF}>Older</span>
            )}
            {current !== pages ? (
              <Link href={pageHref(pages)} className={`${PAGE_LINK} ml-auto`}>
                Oldest entry
              </Link>
            ) : null}
          </nav>
        ) : null}
      </CardBody>
    </Card>
  );
}
