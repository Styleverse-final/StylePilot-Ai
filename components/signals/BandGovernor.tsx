import { Card, CardBody, CardHeader, DataTable, Pill } from "@/components";
import type { Column } from "@/components";

import { GRADE_CAP_RULE, type GradeCapRow } from "./contract";
import {
  formatCorrelation,
  formatCount,
  formatLead,
  formatMomentum,
  formatSharePct,
  joinNames,
  plural,
} from "./format";
import {
  TREND_BANDS,
  verdictFor,
  type BandBoundary,
  type GateRule,
  type SignalPair,
  type TrendBand,
} from "./types";

/**
 * TREND CONFIDENCE BAND AS A GOVERNOR.
 *
 * The point of this card is not that a rule exists. It is that the rule is
 * PUBLISHED: a planner can read it, look at the momentum on the chart above,
 * and say what the system will do before it does it. A system whose caps are
 * only discoverable from its own past behaviour is one nobody can plan
 * against, and "it graded that opportunity down and we never found out why"
 * is the complaint this card exists to prevent.
 *
 * THREE THINGS ARE KEPT SEPARATE HERE, AND CONFLATING ANY TWO WOULD BE A LIE.
 *
 *   1. The BAND, which is read from trend_confidence_band on every week of
 *      every series -- rows, not a rule.
 *   2. The CAP the band imposes, which no table records at all: nothing in
 *      this schema carries an opportunity grade, so there is no column the
 *      rule could be stored against. It is stated in contract.ts, printed
 *      here, and listed under "What has no table behind it".
 *   3. The BOUNDARY between bands on trend_momentum, which is neither read
 *      nor typed -- it is RECOVERED from the rows on screen, as the tightest
 *      bracket they allow, and the card says so rather than quoting a
 *      threshold that no table holds.
 *
 * THE GOVERNOR AND THE GATE ARE DIFFERENT AXES. A band says whether the
 * trend is holding its direction this week; the admission gate says whether
 * the signal has ever led demand at all. A pair can carry a High band on a
 * correlation that fails admission, and a pair that clears admission
 * comfortably can sit in a Low band today. Both happen in this data and both
 * are named below, because a reader who assumed the two moved together would
 * mispredict the system in exactly the cases that matter.
 */

const BAND_PILL: Record<TrendBand, "up" | "amber" | "down"> = {
  High: "up",
  Medium: "amber",
  Low: "down",
};

type RuleRow = GradeCapRow & { weeks: number; pairsNow: SignalPair[] };

export type BandGovernorProps = {
  pairs: readonly SignalPair[];
  boundary: BandBoundary;
  /** Weeks carrying each band across every series in scope. */
  weekTotals: Record<TrendBand, number>;
};

export function BandGovernor({ pairs, boundary, weekTotals }: BandGovernorProps) {
  const totalWeeks = TREND_BANDS.reduce((sum, band) => sum + weekTotals[band], 0);
  const unbanded = TREND_BANDS.filter((band) => weekTotals[band] === 0);

  const rows: RuleRow[] = GRADE_CAP_RULE.map((rule) => ({
    ...rule,
    weeks: weekTotals[rule.band],
    pairsNow: pairs.filter((pair) => pair.currentBand === rule.band),
  }));

  const columns: ReadonlyArray<Column<RuleRow>> = [
    {
      key: "band",
      header: "Band",
      headerClassName: "w-[110px]",
      cell: (row) => <Pill variant={BAND_PILL[row.band]}>{row.band}</Pill>,
    },
    {
      key: "weeks",
      header: "Weeks in your scope",
      align: "right",
      headerClassName: "w-[150px]",
      cell: (row) => (
        <div>
          <div className="tabular-nums text-[13px] font-extrabold text-ink">
            {formatCount(row.weeks)}
          </div>
          <div className="text-[11px] font-semibold text-mute tabular-nums">
            {formatSharePct(row.weeks, totalWeeks)} of weeks read
          </div>
        </div>
      ),
    },
    {
      key: "cap",
      header: "Ceiling it imposes",
      headerClassName: "w-[130px]",
      cell: (row) =>
        row.cap === null ? (
          <span className="text-[11.5px] font-semibold text-mute">None</span>
        ) : (
          <Pill variant="orange">Capped at {row.cap}</Pill>
        ),
    },
    {
      key: "effect",
      header: "What that means for a published grade",
      cell: (row) => (
        <span className="text-[11.5px] leading-[1.55] text-body">{row.effect}</span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        title="The confidence band as a governor"
        subtitle="Published as a rule, so the answer is predictable before the system gives it"
      />
      <CardBody>
        <p className="max-w-[100ch] text-copy leading-[1.6] text-body">
          <b className="text-ink">The rule.</b> A Low trend confidence band
          caps any opportunity grade at Medium, however strong the raw signal
          underneath it looks. It is a ceiling, not a downgrade: a grade that
          was already Medium or below is untouched, and a High band adds
          nothing on its own. The band answers a narrower question than the
          admission gate does -- not &ldquo;has this signal ever led
          demand&rdquo;, which is measured once over the full history, but
          &ldquo;is the trend holding its direction this week&rdquo;, which is
          re-read every week from{" "}
          <span className="font-mono text-[11.5px]">trend_confidence_band</span>.
        </p>
        <p className="mt-[10px] max-w-[100ch] text-copy leading-[1.6] text-body">
          <b className="text-ink">Why it is stated rather than stored.</b> The
          bands themselves are rows: {formatCount(totalWeeks)}{" "}
          {totalWeeks === 1 ? "week" : "weeks"} of them, read from
          signal_intelligence under your row level security, counted in the
          table below. What no table holds is the cap, because no relation in
          this schema carries an opportunity grade for it to apply to. So this
          is a rule the product publishes, not a rule this application
          executes, and saying otherwise would describe a mechanism a reader
          could go looking for and never find. It is listed as untabled under
          &ldquo;What has no table behind it&rdquo; below, with the other four.
        </p>

        <div className="mt-[16px] -mx-[20px]">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.band}
            caption="What each trend confidence band does to a published opportunity grade"
            empty="No band rule is in scope."
          />
        </div>

        {unbanded.length > 0 ? (
          <p className="mt-[14px] max-w-[100ch] text-copy leading-[1.6] text-mute">
            {joinNames(unbanded)} {unbanded.length === 1 ? "does" : "do"} not
            occur on any week you can read. The row stays in the table because
            the rule is published whether or not your scope exercises it --
            removing it would let a planner conclude the band cannot happen.
          </p>
        ) : null}

        <div className="mt-[16px] rounded-inner bg-shell px-[16px] py-[14px]">
          <div className="text-[12px] font-extrabold text-ink">
            Predicting the band from the momentum
          </div>
          {boundary.weeks === 0 ? (
            <p className="mt-[7px] max-w-[96ch] text-copy leading-[1.6] text-body">
              No week in your scope carries both a momentum value and a band,
              so there is nothing to bracket the boundary with. With those
              rows readable, this panel states the tightest range the data puts
              the cut-off in.
            </p>
          ) : boundary.separable ? (
            <>
              <p className="mt-[7px] max-w-[96ch] text-copy leading-[1.6] text-body">
                Across the {plural(boundary.weeks, "week", "weeks")} in your
                scope that carry both a band and a momentum value, the three
                bands never overlap. Every week labelled Low sits at or below{" "}
                <b className="text-ink tabular-nums">
                  {formatMomentum(boundary.lowCeiling)}
                </b>
                ; every week labelled High sits at or above{" "}
                <b className="text-ink tabular-nums">
                  {formatMomentum(boundary.highFloor)}
                </b>
                ; and every Medium week falls between{" "}
                <b className="text-ink tabular-nums">
                  {formatMomentum(boundary.mediumFloor)}
                </b>{" "}
                and{" "}
                <b className="text-ink tabular-nums">
                  {formatMomentum(boundary.mediumCeiling)}
                </b>
                . So a planner reading momentum off the chart above can say
                which band the week will carry, and therefore whether the cap
                applies, without waiting for the system to tell them.
              </p>
              <p className="mt-[8px] max-w-[96ch] text-copy leading-[1.6] text-body">
                Those four numbers are not a threshold read from a table --
                there is no threshold table for this, and the pipeline copies
                both columns across from the case dataset without publishing a
                rule connecting them. They are the tightest bracket the rows on
                this screen allow, recomputed from whatever your scope
                contains. The true cut-off lies somewhere inside each bracket
                and this card does not pretend to know where: quoting a single
                number would be inventing precision the rows do not carry.
              </p>
            </>
          ) : (
            <p className="mt-[7px] max-w-[96ch] text-copy leading-[1.6] text-body">
              The bands overlap on momentum in your scope, so no boundary can
              be recovered from these rows and none is quoted. That is the
              honest reading: momentum alone would not let you predict the
              band here, and a cut-off drawn anyway would be contradicted by
              weeks already on this screen. The bands stay readable week by
              week on the chart above.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------- in force

/**
 * WHAT THE GOVERNOR IS DOING RIGHT NOW.
 *
 * The rule table above is abstract until it is pointed at the series a
 * planner actually holds. This panel names them, and it names each one with
 * its measured lead AND the correlation that earned it -- the rule of this
 * screen holds inside the governor panel too, because a reader deciding how
 * much to mind a cap needs to know whether the signal being capped was worth
 * anything in the first place.
 */
export type BandInForceProps = {
  pairs: readonly SignalPair[];
  gates: Record<string, GateRule>;
};

export function BandInForce({ pairs, gates }: BandInForceProps) {
  const week = [...new Set(pairs.map((pair) => pair.currentWeek).filter(Boolean))]
    .sort()
    .at(-1);

  const byBand = TREND_BANDS.map((band) => ({
    band,
    pairs: pairs.filter((pair) => pair.currentBand === band),
  }));
  const unbanded = pairs.filter((pair) => pair.currentBand === null);

  // The two cases that prove band and gate are different axes. Both occur in
  // this data; neither is written into the prose as a fixed example, so if
  // the rows change the sentences disappear rather than becoming false.
  const cappedButWeighted = pairs.filter(
    (pair) =>
      pair.currentBand === "Low" && verdictFor(pair, gates[pair.brandId]) === "weighted",
  );
  const highButBelow = pairs.filter(
    (pair) =>
      pair.currentBand === "High" && verdictFor(pair, gates[pair.brandId]) === "below",
  );

  return (
    <Card>
      <CardHeader
        title="What the governor is doing this week"
        subtitle={
          week
            ? `Band in force on ${week}, the most recent week readable in your scope`
            : "Band in force on the most recent week readable in your scope"
        }
      />
      <CardBody>
        {pairs.length === 0 ? (
          <p className="max-w-[88ch] text-copy leading-[1.6] text-body">
            No series is readable in your scope, so no band is in force and
            nothing is capped. With a series in scope this panel names every
            brand-category by the band on its latest week, and says which of
            them the Low cap would apply to.
          </p>
        ) : (
          <>
            <div className="space-y-[12px]">
              {byBand.map(({ band, pairs: inBand }) => (
                <div key={band}>
                  <div className="flex items-center gap-[8px]">
                    <Pill variant={BAND_PILL[band]}>{band}</Pill>
                    <span className="text-[11px] font-extrabold tabular-nums text-mute">
                      {inBand.length}
                    </span>
                    {band === "Low" ? (
                      <span className="text-[11px] font-bold text-orangeD">
                        grade capped at Medium
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-mute">
                        no ceiling
                      </span>
                    )}
                  </div>
                  {inBand.length === 0 ? (
                    <p className="mt-[6px] text-[11.5px] leading-[1.55] text-mute">
                      No series carries this band this week. One that did would
                      be named here with its measured lead.
                    </p>
                  ) : (
                    <ul className="mt-[6px] space-y-[6px]">
                      {inBand.map((pair) => (
                        <li
                          key={pair.key}
                          className="flex items-baseline justify-between gap-[10px] border-b border-rule pb-[5px] last:border-b-0 last:pb-0"
                        >
                          <span className="text-[12px] font-bold text-ink">
                            {pair.categoryName}
                            <span className="ml-[6px] text-[10.5px] font-semibold text-mute">
                              {pair.brandName}
                            </span>
                          </span>
                          {/* Lead and correlation, together, always. */}
                          <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-body">
                            {formatLead(pair.leadWeeks)}
                            <span className="text-mute"> at r </span>
                            {formatCorrelation(pair.correlation)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {unbanded.length > 0 ? (
              <p className="mt-[12px] max-w-[88ch] text-copy leading-[1.6] text-mute">
                {plural(unbanded.length, "series carries", "series carry")} no
                band on the latest week, so the governor makes no claim about{" "}
                {unbanded.length === 1 ? "it" : "them"}: an unrecorded band is
                not a High one.
              </p>
            ) : null}

            {cappedButWeighted.length > 0 ? (
              <p className="mt-[14px] max-w-[88ch] text-copy leading-[1.6] text-body">
                <b className="text-ink">The case that shows the two rules are
                separate.</b>{" "}
                {joinNames(
                  cappedButWeighted.map(
                    (pair) =>
                      `${pair.brandName} ${pair.categoryName} (${formatLead(pair.leadWeeks)} at r ${formatCorrelation(pair.correlation)})`,
                  ),
                )}{" "}
                {cappedButWeighted.length === 1 ? "clears" : "clear"} the
                admission bar with a forward window, so the measured lead may
                be cited -- and{" "}
                {cappedButWeighted.length === 1 ? "sits" : "sit"} in a Low band
                this week, so any grade published from it is still capped at
                Medium. Admission is about whether the signal has ever led
                demand; the band is about whether the trend is holding right
                now. A reader who expected a strong correlation to override the
                cap would mispredict the system here.
              </p>
            ) : null}

            {highButBelow.length > 0 ? (
              <p className="mt-[10px] max-w-[88ch] text-copy leading-[1.6] text-body">
                The mirror case:{" "}
                {joinNames(
                  highButBelow.map(
                    (pair) =>
                      `${pair.brandName} ${pair.categoryName} (${formatLead(pair.leadWeeks)} at r ${formatCorrelation(pair.correlation)})`,
                  ),
                )}{" "}
                {highButBelow.length === 1 ? "carries" : "carry"} a High band
                on a correlation that fails admission outright. The trend is
                moving decisively; it has simply never been shown to move
                ahead of demand for this category. A High band lifts no
                ceiling and admits nothing, which is why the two are read
                separately rather than combined into a single strength score.
              </p>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default BandGovernor;
