import { Card, CardBody, CardHeader, DataTable } from "@/components";
import type { Column } from "@/components";

import { Finding } from "./Layout";
import {
  DASH,
  formatCount,
  formatCrore,
  formatPct,
  formatShare,
  joinWords,
  plural,
} from "./format";
import type { AdoptionFinding, AdoptionRow } from "./types";

/**
 * ADOPTION ACROSS THE FUNCTION.
 *
 * WHAT THIS PANEL IS FOR
 * ----------------------
 * Leadership asked what people are actually doing with the recommendations.
 * The answer is not one number. It is a shape, and the shape is the finding:
 * planners take the model's word readily where it POINTS AT A PROBLEM, and
 * argue with it hard where it COMMITS MONEY. Everything on this panel exists
 * to make that shape visible and then say it in a sentence.
 *
 * TWO RATES, NOT ONE, BECAUSE THEY MEAN DIFFERENT THINGS
 * ------------------------------------------------------
 * "Decided of raised" is engagement: did anyone open this at all. "Approved
 * of decided" is agreement: of the ones somebody looked at, how many went
 * through as issued. A single adoption percentage blends the two and can
 * make a type nobody has opened look identical to one everybody rejected.
 * They are drawn as two separate tracks for exactly that reason.
 *
 * THE NULL THAT MUST NEVER BECOME A ZERO
 * --------------------------------------
 * v_adoption_kpi returns approval_rate_pct as NULL where nothing has been
 * decided, and on the current rows one brand's buy plan is in precisely that
 * state: a full slate of recommendations raised and not one decided.
 * Rendering that as 0% would say the planners looked at their buy plan and
 * turned all of it down. What actually happened is that nobody has opened it,
 * which is a different problem with a different owner. It renders as "no
 * decisions yet", in mute, and the finding names it as an engagement gap
 * rather than a rejection.
 */

const TRACK = "h-[7px] rounded-pill bg-cream overflow-hidden";

function Track({
  fraction,
  color,
}: {
  fraction: number;
  color: string;
}) {
  return (
    <div className={TRACK}>
      <div
        className="h-full rounded-pill"
        style={{
          width: `${Math.max(0, Math.min(100, fraction * 100))}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

/** Engagement: recommendations somebody has decided, of those raised. */
function engagement(row: AdoptionRow): number | null {
  return row.totalRecs > 0 ? row.decided / row.totalRecs : null;
}

function TypeBlock({ row }: { row: AdoptionRow }) {
  const seen = engagement(row);
  const decided = row.decided > 0;

  return (
    <div className="border-b border-rule py-[13px] last:border-b-0">
      <div className="flex items-baseline justify-between gap-[10px]">
        <span className="text-copy font-extrabold text-ink">{row.recLabel}</span>
        <span className="shrink-0 text-small font-semibold text-mute tabular">
          {formatCount(row.totalRecs)} raised
        </span>
      </div>

      <div className="mt-[9px] grid grid-cols-2 gap-[16px] max-[900px]:grid-cols-1">
        <div>
          <div className="mb-[4px] flex items-baseline justify-between gap-[8px] text-label font-bold text-mute">
            <span>Opened by someone</span>
            <span className="tabular">
              {formatShare(row.decided, row.totalRecs)}
            </span>
          </div>
          <Track fraction={seen ?? 0} color="#5B4B8A" />
          <div className="mt-[4px] text-label font-semibold text-mute tabular">
            {formatCount(row.decided)} of {formatCount(row.totalRecs)} decided
          </div>
        </div>

        <div>
          <div className="mb-[4px] flex items-baseline justify-between gap-[8px] text-label font-bold text-mute">
            <span>Approved as issued</span>
            <span className="tabular">
              {/* NEVER 0%. A null rate is an absence, not a rejection. */}
              {row.approvalRatePct === null
                ? "no decisions yet"
                : formatPct(row.approvalRatePct)}
            </span>
          </div>
          {row.approvalRatePct === null ? (
            <div className="h-[7px] rounded-pill border border-dashed border-rule2" />
          ) : (
            <Track
              fraction={row.approvalRatePct / 100}
              color={row.approvalRatePct >= 50 ? "#2FA45B" : "#D04A02"}
            />
          )}
          <div className="mt-[4px] text-label font-semibold text-mute tabular">
            {decided ? (
              <>
                {formatCount(row.approved)} approved &middot;{" "}
                {formatCount(row.modified)} modified &middot;{" "}
                {formatCount(row.rejected)} rejected
              </>
            ) : (
              <>nothing decided, so there is no rate to show</>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- the sentence

/** The strongest contrast within one brand, named from the rows. */
function contrastFor(finding: AdoptionFinding): string | null {
  const { lowest, highest } = finding;
  if (!lowest || !highest || lowest.recType === highest.recType) return null;
  return (
    `${finding.brandLabel} approves ${formatPct(highest.approvalRatePct)} of the ` +
    `${highest.recLabel.toLowerCase()} recommendations it decides and ` +
    `${formatPct(lowest.approvalRatePct)} of the ${lowest.recLabel.toLowerCase()} ones`
  );
}

// ---------------------------------------------------------------- the panel

export type AdoptionPanelProps = {
  rows: readonly AdoptionRow[];
  findings: readonly AdoptionFinding[];
};

export function AdoptionPanel({ rows, findings }: AdoptionPanelProps) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Adoption across the function"
          subtitle="v_adoption_kpi, read with your own session"
        />
        <CardBody>
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            No adoption rows came back for your scope. What would appear here
            is, per brand and per recommendation type, how many were raised,
            how many anyone has decided, and of those how many went through as
            issued rather than being modified or rejected {DASH} which is the
            only honest measure of whether the function is using this.
          </p>
        </CardBody>
      </Card>
    );
  }

  const brands = [...new Set(rows.map((row) => row.brandId))].sort();

  // Types where planners have engaged but the value column is still empty:
  // the view sums value_at_stake over decided rows, so a dash there with
  // decisions behind it means those recommendations carry no value at stake.
  const decidedButUnvalued = rows.filter(
    (row) => row.decided > 0 && row.valueActionedInr === null,
  );

  const undecided = rows.filter((row) => row.decided === 0 && row.totalRecs > 0);

  const columns: Column<AdoptionRow>[] = [
    {
      key: "brand",
      header: "Brand",
      cell: (row) => (
        <span className="font-extrabold text-ink">{row.brandLabel}</span>
      ),
    },
    { key: "type", header: "Recommendation", cell: (row) => row.recLabel },
    {
      key: "raised",
      header: "Raised",
      numeric: true,
      cell: (row) => formatCount(row.totalRecs),
    },
    {
      key: "decided",
      header: "Decided",
      numeric: true,
      cell: (row) => formatCount(row.decided),
    },
    {
      key: "approved",
      header: "Approved",
      numeric: true,
      cell: (row) => formatCount(row.approved),
    },
    {
      key: "modified",
      header: "Modified",
      numeric: true,
      cell: (row) => formatCount(row.modified),
    },
    {
      key: "rejected",
      header: "Rejected",
      numeric: true,
      cell: (row) => formatCount(row.rejected),
    },
    {
      key: "rate",
      header: "Approved of decided",
      numeric: true,
      cell: (row) =>
        row.approvalRatePct === null ? (
          <span className="text-mute font-semibold">no decisions yet</span>
        ) : (
          <b>{formatPct(row.approvalRatePct)}</b>
        ),
    },
    {
      key: "value",
      header: "Value actioned",
      numeric: true,
      cell: (row) =>
        row.valueActionedInr === null ? (
          <span className="text-mute">{DASH}</span>
        ) : (
          formatCrore(row.valueActionedInr)
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-[16px]">
      <Card>
        <CardHeader
          title="What the function does with the recommendations"
          subtitle="Engagement and agreement kept apart, because they fail differently"
        />
        <CardBody>
          <div
            className={`grid gap-[26px] max-[1140px]:grid-cols-1 ${
              brands.length > 1 ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {brands.map((brandId) => {
              const mine = rows.filter((row) => row.brandId === brandId);
              return (
                <div key={brandId}>
                  <div className="mb-[2px] text-micro font-extrabold tracking-[0.06em] text-mute">
                    {(mine[0]?.brandLabel ?? brandId).toUpperCase()}
                  </div>
                  {mine.map((row) => (
                    <TypeBlock key={`${row.brandId}-${row.recType}`} row={row} />
                  ))}
                </div>
              );
            })}
          </div>

          <Finding label="The pattern leadership asked about">
            {findings.map(contrastFor).filter(Boolean).join("; ")}
            {findings.some((finding) => contrastFor(finding) !== null) ? ". " : ""}
            The shape is the same on both cuts and it is not about the model
            being better at one job than another: planners accept EXCEPTION
            DETECTION readily, because an exception is a claim that something
            deserves a look and the cost of agreeing is an hour of attention.
            They argue hard about COMMITTED BUYS, because a buy quantity is
            cash out of the door against a forecast twelve weeks long, and the
            cost of agreeing wrongly is inventory nobody wanted. Modification
            rather than rejection is what that argument looks like in the data
            {DASH} the recommendation is being used as a starting position,
            not refused.
          </Finding>

          {undecided.length > 0 ? (
            <Finding label="Where nobody has engaged at all">
              {joinWords(
                undecided.map(
                  (row) =>
                    `${row.brandLabel} ${row.recLabel.toLowerCase()} (${formatCount(row.totalRecs)} raised, none decided)`,
                ),
              )}
              . That is not a rejection rate of zero and it is not written down
              anywhere as a rate at all {DASH} the view returns null and this
              screen prints &quot;no decisions yet&quot;, because a plan nobody
              has opened and a plan everybody turned down are opposite problems
              with opposite fixes. This one is an engagement question for
              whoever owns that brand&apos;s buying calendar, and it is the
              single most actionable line on this page for a CMPO {DASH}
              though the acting happens elsewhere, not here.
            </Finding>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="The same rows, counted"
          subtitle="v_adoption_kpi, one row per brand and recommendation type"
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => `${row.brandId}-${row.recType}`}
          caption="Adoption by brand and recommendation type"
        />
        <CardBody>
          <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
            Approved, modified and rejected sum to decided; decided is a subset
            of raised. The approval rate is approved over DECIDED, not over
            raised, which is why a type with only a handful of decisions behind
            it can read as a perfect score and still mean almost nothing
            {DASH} read it against the decided column beside it.
            {decidedButUnvalued.length > 0 ? (
              <>
                {" "}
                Value actioned is a dash for{" "}
                {joinWords(
                  decidedButUnvalued.map(
                    (row) =>
                      `${row.brandLabel} ${row.recLabel.toLowerCase()}`,
                  ),
                )}{" "}
                even though{" "}
                {plural(
                  decidedButUnvalued.length,
                  "that type has decisions logged against it",
                  "those types have decisions logged against them",
                )}
                : the view sums value at stake over decided rows, so an empty
                cell there means those recommendations carry no value at stake
                to sum. It is a missing measurement, not zero rupees.
              </>
            ) : null}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

export default AdoptionPanel;
