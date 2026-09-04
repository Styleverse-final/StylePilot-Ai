import { Card, CardBody, CardHeader, DataTable, Pill } from "@/components";
import type { Column } from "@/components";

import type {
  CoverageRow,
  PullForwardCheck,
  RequirementCheck,
  TransferCheck,
} from "./data";
import { ARROW, DASH, corr, pct, plural, units, weeks } from "./format";

/**
 * THE ARITHMETIC INSIDE THE SENTENCES, DONE AGAIN.
 *
 * A handoff is read by somebody who will not open the warehouse. That is the
 * point of it and it is also its weakness: every figure arrives already
 * divided, and a division nobody repeats is a division nobody can dispute.
 *
 * Three of these sentences can be checked without leaving the row. A
 * pull-forward is a lead time's share of a horizon. A transfer is the gap
 * between one store's cover and its regional median, priced at that store's
 * own sell rate. A channel split either accounts for the whole requirement or
 * it does not. So the panels below repeat those three, from the metric
 * strings on screen, and print what they get -- including where what they get
 * is less than the sentence suggests.
 *
 * The fourth panel asks the opposite question: not whether a sentence is
 * sound, but whether one is missing.
 */

// ------------------------------------------------------------ pull-forward

export type PullForwardPanelProps = {
  checks: readonly PullForwardCheck[];
  requirements: readonly RequirementCheck[];
  brandLabel: (brandId: string | null) => string;
};

export function PullForwardPanel({
  checks,
  requirements,
  brandLabel,
}: PullForwardPanelProps) {
  const columns: Column<PullForwardCheck>[] = [
    {
      key: "channel",
      header: "Channel",
      cell: (check) => (
        <div>
          <div className="font-bold text-ink">{check.channel}</div>
          <div className="text-[10.5px] font-semibold text-mute">
            {brandLabel(check.brandId)}
          </div>
        </div>
      ),
    },
    {
      key: "lead",
      header: "Lead time",
      numeric: true,
      cell: (check) => `${check.leadWeeks} wk`,
    },
    {
      key: "horizon",
      header: `Units in the horizon`,
      numeric: true,
      cell: (check) => units(check.horizonUnits),
    },
    {
      key: "share",
      header: "Share of the buy",
      numeric: true,
      cell: (check) => pct(check.storedShare),
    },
    {
      key: "stored",
      header: "Commit early, as stated",
      numeric: true,
      cell: (check) => (
        <span className="font-bold text-ink">{units(check.storedPullForward)}</span>
      ),
    },
    {
      key: "recomputed",
      header: "Recomputed here",
      numeric: true,
      cell: (check) => (
        <span className="text-body">
          {units(check.recomputed)}{" "}
          <span className="text-[10px] font-semibold text-mute">
            {`(${check.leadWeeks}/${check.horizonWeeks})`}
          </span>
        </span>
      ),
    },
    {
      key: "verdict",
      header: "Agrees",
      cell: (check) =>
        check.agrees ? (
          <Pill variant="up">Same figure</Pill>
        ) : (
          <Pill variant="amber">
            {`Off by ${units(Math.abs(check.recomputed - check.storedPullForward))}`}
          </Pill>
        ),
    },
  ];

  const horizonWeeks = [...new Set(checks.map((check) => check.horizonWeeks))];

  return (
    <Card className="mb-[16px]">
      <CardHeader
        title="The capacity call, recomputed"
        subtitle="Each pull-forward is a lead time's share of the horizon, and the share is short enough to check"
        actions={
          checks.length > 0 && checks.every((check) => check.agrees) ? (
            <Pill variant="up">All reproduce</Pill>
          ) : null
        }
      />
      <CardBody>
        <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
          Manufacturing is asked to commit part of the buy before the buying
          horizon opens, because goods with a lead time cannot land in the
          opening weeks of{" "}
          {horizonWeeks.length === 1
            ? `a ${horizonWeeks[0]}-week horizon`
            : "the horizon"}
          . The size of that early commitment is the channel&apos;s units
          multiplied by its lead time over the length of the horizon, and every
          term in that sentence is in the row. The right-hand columns do the
          multiplication again so the reader does not have to take it on
          trust&nbsp;&mdash; and the lead times themselves are a property of the
          channel, recorded on dim_channel rather than chosen for this
          calculation.
        </p>
      </CardBody>

      <DataTable
        columns={columns}
        rows={checks}
        rowKey={(check) => String(check.rowId)}
        caption="Channel pull-forward, as stated in the handoff and recomputed from the same row"
        empty="No channel rows are in scope, so there is no pull-forward to check. What would appear is one row per channel, with the lead time, the units inside the horizon, and the early commitment recomputed from both."
      />

      {requirements.length === 0 ? null : (
        <CardBody className="border-t border-rule">
          {requirements.map((requirement) => (
            <p
              key={requirement.brandId ?? "unscoped"}
              className="max-w-[96ch] text-[11.5px] leading-[1.6] text-body [&:not(:first-child)]:mt-[7px]"
            >
              <span className="font-bold text-ink">
                {brandLabel(requirement.brandId)}:
              </span>{" "}
              {requirement.channelTotal === null ||
              requirement.requirementUnits === null ? (
                <>
                  the channel rows and the requirement row cannot be added
                  together in your scope&nbsp;&mdash; one of the two is missing,
                  so whether the split is exhaustive is not something this
                  screen can say.
                </>
              ) : (
                <>
                  the {plural(requirement.channelCount, "channel", "channels")}{" "}
                  carry {units(requirement.channelTotal)} units between them
                  against a stated requirement of{" "}
                  {units(requirement.requirementUnits)}
                  {requirement.agrees ? (
                    <>
                      {" "}
                      &mdash; the same number, so the split is exhaustive and no
                      part of the buy is sitting without a lead time attached to
                      it.
                    </>
                  ) : (
                    <>
                      , a difference of{" "}
                      {units(
                        Math.abs(
                          requirement.requirementUnits - requirement.channelTotal,
                        ),
                      )}{" "}
                      units. Some of the requirement therefore has no lead time
                      against it, and this screen cannot say which part.
                    </>
                  )}
                  {requirement.shareTotal === null ? null : (
                    <>
                      {" "}
                      The stated shares add to {pct(requirement.shareTotal, 1)}.
                    </>
                  )}
                </>
              )}
            </p>
          ))}
        </CardBody>
      )}
    </Card>
  );
}

// --------------------------------------------------------------- transfers

export type TransferPanelProps = {
  checks: readonly TransferCheck[];
  candidates: number;
  brandLabel: (brandId: string | null) => string;
};

export function TransferPanel({
  checks,
  candidates,
  brandLabel,
}: TransferPanelProps) {
  const reaching = checks.filter((check) => check.reachesMedian).length;

  const columns: Column<TransferCheck>[] = [
    {
      key: "region",
      header: "Region",
      cell: (check) => (
        <div>
          <div className="font-bold text-ink">{check.region}</div>
          <div className="text-[10.5px] font-semibold text-mute">
            {brandLabel(check.brandId)}
          </div>
        </div>
      ),
    },
    {
      key: "move",
      header: "The move",
      cell: (check) => (
        <span className="font-mono text-[11px] text-body">
          {check.fromStore} {ARROW} {check.toStore}
        </span>
      ),
    },
    {
      key: "movable",
      header: "Units",
      numeric: true,
      cell: (check) => units(check.movableUnits),
    },
    {
      key: "before",
      header: "Receiver, now",
      numeric: true,
      cell: (check) => weeks(check.toCover, 2),
    },
    {
      key: "after",
      header: "Receiver, after",
      numeric: true,
      cell: (check) => (
        <span className="font-bold text-ink">{weeks(check.coverAfter, 2)}</span>
      ),
    },
    {
      key: "median",
      header: "Regional median",
      numeric: true,
      cell: (check) => weeks(check.median, 2),
    },
    {
      key: "verdict",
      header: "Where it lands",
      cell: (check) =>
        check.reachesMedian ? (
          <Pill variant="up">On the median</Pill>
        ) : (
          <Pill variant="amber">
            {`${weeks(check.shortfallWeeks, 2)} short`}
          </Pill>
        ),
    },
  ];

  const shortfalls = checks.filter((check) => !check.reachesMedian);

  return (
    <Card className="mb-[16px]">
      <CardHeader
        title="What each transfer actually achieves"
        subtitle="The receiving store's cover, before and after the move, at its own sell rate"
        actions={
          checks.length > 0 ? (
            <Pill variant={reaching === checks.length ? "up" : "amber"}>
              {`${reaching} of ${checks.length} reach the median`}
            </Pill>
          ) : null
        }
      />
      <CardBody>
        <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
          Each retail row proposes moving units between two stores and says the
          move levels both TOWARD the regional median. Toward is doing real work
          in that sentence, and the row carries enough to see how much: cover is
          units over a weekly sell rate, so adding the units moved to the
          receiving store and dividing by the same rate says exactly where it
          lands.{" "}
          {checks.length === 0 ? null : reaching === checks.length ? (
            <>
              All {plural(checks.length, "move", "moves")} on screen land the
              receiving store on its regional median.
            </>
          ) : (
            <>
              {reaching} of {checks.length} land the receiving store on its
              regional median. The rest stop short, and the reason is not in the
              row: the donor&apos;s own sell rate is not carried, so the point at
              which the donor would itself drop under that median cannot be
              checked here. The move is still worth making&nbsp;&mdash; it is
              simply smaller than &ldquo;levels both toward the median&rdquo;
              sounds.
            </>
          )}
        </p>
      </CardBody>

      <DataTable
        columns={columns}
        rows={checks}
        rowKey={(check) => String(check.rowId)}
        caption="Proposed store transfers with the receiving store's cover recomputed after the move"
        empty="No transfer rows are readable in your scope. What would appear is one row per proposed move, with the receiving store's cover before and after it and the regional median it is being levelled toward."
      />

      <CardBody className="border-t border-rule">
        <p className="max-w-[96ch] text-[11.5px] leading-[1.6] text-mute">
          {candidates === checks.length
            ? `All ${plural(candidates, "transfer row", "transfer rows")} in scope carry every field this recomputation needs.`
            : `${checks.length} of ${plural(candidates, "transfer row", "transfer rows")} in scope carry every field this recomputation needs; the rest are rendered in the Retail Operations card without a landing point, because a row missing its sell rate cannot be checked and a guessed rate would be worse than none.`}
          {shortfalls.length === 0
            ? ""
            : ` Closing the ${shortfalls.length === 1 ? "one" : shortfalls.length} shortfall${shortfalls.length === 1 ? "" : "s"} at the receiving stores' own rates would take a further ${units(
                shortfalls.reduce((total, check) => total + check.shortfallUnits, 0),
              )} units, which is arithmetic on this screen rather than a proposal from the pipeline.`}
        </p>
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------- what was not said

export type CoveragePanelProps = {
  rows: readonly CoverageRow[];
  cut: number | null;
  brandLabel: (brandId: string | null) => string;
  categoryLabel: (categoryId: string) => string;
};

export function CoveragePanel({
  rows,
  cut,
  brandLabel,
  categoryLabel,
}: CoveragePanelProps) {
  const missing = rows.filter(
    (row) => row.namedIn === null && row.qualifies === true,
  );
  const unnamed = rows.filter((row) => row.namedIn === null);

  const columns: Column<CoverageRow>[] = [
    {
      key: "category",
      header: "Category",
      cell: (row) => (
        <div>
          <div className="font-bold text-ink">{categoryLabel(row.categoryId)}</div>
          <div className="text-[10.5px] font-semibold text-mute">
            {brandLabel(row.brandId)}
          </div>
        </div>
      ),
    },
    {
      key: "lead",
      header: "Measured lead",
      numeric: true,
      cell: (row) =>
        row.leadWeeks === null ? DASH : `${row.leadWeeks} wk`,
    },
    {
      key: "corr",
      header: "Correlation",
      numeric: true,
      cell: (row) => corr(row.correlation),
    },
    {
      key: "qualifies",
      header: "Clears the cut and leads",
      cell: (row) =>
        row.qualifies === null ? (
          <span className="text-mute">no cut on screen</span>
        ) : row.qualifies ? (
          <Pill variant="up">Yes</Pill>
        ) : (
          <Pill variant="grey">No</Pill>
        ),
    },
    {
      key: "named",
      header: "Named in the handoff",
      cell: (row) =>
        row.namedIn !== null ? (
          <span className="text-[11.5px] text-body">
            yes, row{" "}
            <span className="font-mono text-[11px] text-ink">{row.namedIn}</span>
          </span>
        ) : row.qualifies === true ? (
          <Pill variant="amber">No, and it qualifies</Pill>
        ) : (
          <Pill variant="grey">No</Pill>
        ),
    },
  ];

  return (
    <Card className="mb-[16px]">
      <CardHeader
        title="Categories the campaign calendar does not name"
        subtitle="Every signal series in your scope, against the rows that decide a campaign window"
        actions={
          missing.length > 0 ? (
            <Pill variant="amber">
              {plural(missing.length, "gap", "gaps")}
            </Pill>
          ) : rows.length > 0 ? (
            <Pill variant="up">Complete</Pill>
          ) : null
        }
      />
      <CardBody>
        <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
          Every other check on this screen asks whether a sentence that is here
          is sound. This one asks whether one is missing, which is the harder
          failure to notice: nobody downstream re-runs the query, so a category
          quietly absent from the calendar leaves nothing on the page to
          disagree with. The marketing rows quote a measured lead and a
          correlation per category; signal_intelligence holds that same pair for
          every category, so the population is knowable and the comparison is
          just a join.
          {cut === null ? (
            <>
              {" "}
              The rows on screen do not agree on a single correlation cut, so
              this table reports the measured leads and declines to say which
              of them would have qualified.
            </>
          ) : (
            <>
              {" "}
              A series qualifies on the same two tests the handoff rows are
              written against: a correlation of at least {cut.toFixed(2)}, and a
              lead of at least one week, since a signal that moves with demand
              offers no forward window to brief into.
            </>
          )}
        </p>
      </CardBody>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => `${row.brandId}|${row.categoryId}`}
        caption="Signal series in scope against the categories the campaign rows name"
        empty="No signal series are readable in your scope, so this check cannot run. What would appear is one row per brand and category, with its measured lead, its correlation, and whether the handoff names it."
        rowClassName={(row) =>
          row.namedIn === null && row.qualifies === true ? "bg-amberW" : undefined
        }
      />

      <CardBody className="border-t border-rule">
        <p className="max-w-[96ch] text-[11.5px] leading-[1.6] text-mute">
          {missing.length === 0 ? (
            <>
              Every series in your scope that clears the cut is named in the
              handoff. That is a statement about your scope and not about the
              week: signal_intelligence is read under a policy that also filters
              by category for category-scoped roles, while the handoff rows
              arrive whole for the brand, so a reader with a narrower signal
              scope sees fewer candidates than the handoff covers. This check
              can therefore miss a gap. It cannot invent one.
            </>
          ) : (
            <>
              {missing
                .map(
                  (row) =>
                    `${categoryLabel(row.categoryId)} on ${brandLabel(row.brandId)}`,
                )
                .join(", ")}{" "}
              {missing.length === 1 ? "clears" : "clear"} both tests and{" "}
              {missing.length === 1 ? "is" : "are"} named nowhere in the
              campaign rows. That is not necessarily an error&nbsp;&mdash; a
              planner may have reason to leave a category out&nbsp;&mdash; but
              the handoff gives no reason, and a reader who assumed the four
              named rows were the complete set would never learn there was a
              fifth to argue about. The comparison runs against the series your
              role can read: signal_intelligence filters by category for
              category-scoped roles while the handoff arrives whole for the
              brand, so this check can miss a gap and cannot invent one.
              {unnamed.length > missing.length ? (
                <>
                  {" "}
                  The other unnamed series on this table do not clear the cut,
                  which is the same reason the handoff gives for the ones it
                  dismisses by name.
                </>
              ) : null}
            </>
          )}
        </p>
      </CardBody>
    </Card>
  );
}
