import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  Card,
  CardBody,
  ModelStrip,
  PageHeader,
  Why,
  type KpiItem,
} from "@/components";
import { DepthCurve } from "@/components/markdown/DepthCurve";
import { ElasticityPanel } from "@/components/markdown/ElasticityPanel";
import { RationaleList } from "@/components/markdown/RationaleList";
import { RecommendationTable } from "@/components/markdown/RecommendationTable";
import { TimingBuckets } from "@/components/markdown/TimingBuckets";
import {
  DELAY_WEEKS,
  LIFE_ELAPSED_TRIGGER,
  MAX_DEPTH,
  NOW_MARGIN_TRIGGER_PCT,
  PIPELINE_SOURCE,
  fitLedgerFor,
} from "@/components/markdown/constants";
import { buildDepthCurve, type DepthCurve as Curve } from "@/components/markdown/curve";
import {
  getCategoryNames,
  getStyleListPrices,
  toCategoryFits,
  toMarkdownRows,
} from "@/components/markdown/data";
import {
  DASH,
  formatCount,
  formatFractionPct,
  formatInr,
  formatTimestamp,
} from "@/components/markdown/format";
import type { CategoryFit, MarkdownRow } from "@/components/markdown/types";
import { getAccuracyHeadline, type AccuracyHeadline } from "@/lib/accuracy";
import { getElasticity, getMarkdownRecs } from "@/lib/queries";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";
import { redirectCmpoToPortfolio } from "@/lib/guards";

export const metadata: Metadata = {
  title: "Markdown optimiser",
};

/**
 * MARKDOWN OPTIMISER
 *
 * The case attributes 20% of markdown loss to slow in-season response: not
 * to buying the wrong quantity and not to putting it in the wrong region,
 * but to taking four weeks to react once the sell-down went wrong. This
 * screen is the answer to that specific 20%, and its whole argument is one
 * identity: waiting does not make the pile smaller, it makes the cut deeper.
 *
 * A server component throughout. Every figure is read at request time
 * through createServerAnonClient(), which carries the signed-in planner's
 * session cookie, so row level security decides what the page contains. The
 * recommendation rows and the style prices behind them are scoped to the
 * planner's brand and category list by the same RLS predicate, so the screen
 * can never quote a price for a style whose recommendation it is not allowed
 * to show. Nothing here reaches for the service role to make a count look
 * larger, and no model is called at request time: the elasticity was fitted
 * offline and the recommendations were scored offline. This page reads rows.
 *
 * WHAT THE SCREEN HAS TO EARN
 * ---------------------------
 * A depth recommendation is a price instruction. The number itself is the
 * easy part; what makes it actionable is knowing how much of it is measured.
 * So the curve is drawn from the fitted coefficient rather than sketched,
 * the marked week is derived from the pipeline's own reduction of its margin
 * trigger, and the provenance panel says, per category, whether the depth
 * rests on that category's own promotions or on the brand's pooled average.
 * The two rows in this brand that rest on a pooled coefficient are marked as
 * such in three separate places, because a planner who misses that has been
 * misled by the screen rather than by the model.
 *
 * PART H
 * ------
 * The headline accuracy never appears alone. It reaches this page only
 * through <ModelStrip accuracy={...}/>, whose prop is the whole
 * AccuracyHeadline and which therefore cannot render the percentage without
 * the margin over seasonal naive beside it. The "why" panel says plainly
 * that the accuracy stamps the run that produced these rows and does not
 * measure the depth arithmetic, which consumes observed weeks of supply and
 * a fitted elasticity rather than the demand forecast.
 */

/** How many styles the curve selector offers before it becomes a wall. */
const MAX_CURVE_CHOICES = 8;

/**
 * The one sentence the screen was making the reader derive.
 *
 * The table has always carried everything needed to reach it -- depth against
 * the ceiling, cover against remaining life, the timing call -- and left the
 * reader to hold six rows in their head and notice the pattern. Most will not,
 * and the pattern is the finding: where the depth is already at the policy
 * cap, markdown TIMING is not the lever, because the cut is as deep as policy
 * allows at both dates and only the runway moves.
 *
 * Everything here is folded from rows already on the page. No new query, no
 * stored figure, and no number that is not visible in the table beneath it.
 */
function inference(rows: readonly MarkdownRow[]): string | null {
  if (rows.length === 0) return null;

  const atCap = rows.filter((row) => row.recommendedDepth >= MAX_DEPTH - 1e-9);
  const now = rows.filter((row) => row.timing === "NOW");

  // The worst overstock on the page, by cover against the life left to sell
  // it in. Guarded: a style with no remaining life would divide by zero, and
  // it is a real state rather than a bad row, so it is skipped rather than
  // clamped into a ratio that would sort to the top.
  const ranked = rows
    .filter((row) => row.remainingLifeWeeks > 0)
    .map((row) => ({ row, ratio: row.coverWeeks / row.remainingLifeWeeks }))
    .sort((a, b) => b.ratio - a.ratio);
  const worst = ranked[0] ?? null;

  const parts: string[] = [];
  if (atCap.length > 0) {
    parts.push(
      `${atCap.length} of ${rows.length} ${
        atCap.length === 1 ? "style is" : "styles are"
      } already at the ${formatFractionPct(MAX_DEPTH, 0)} cap, where timing is not the lever`,
    );
  }
  if (worst && worst.ratio >= 2) {
    parts.push(
      `${worst.row.styleId} holds ${worst.ratio.toFixed(1)}x the cover its remaining life can clear`,
    );
  }
  parts.push(
    `${now.length} of ${rows.length} clear the ${formatFractionPct(
      NOW_MARGIN_TRIGGER_PCT,
      0,
    )} trigger`,
  );
  return `${parts.join(". ")}.`;
}

type Chartable = { row: MarkdownRow; curve: Curve };

function Explain({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardBody>
        <p className="max-w-[88ch] text-copy leading-[1.6] text-body">{children}</p>
      </CardBody>
    </Card>
  );
}

/** Header KPIs, folded from the rows on screen. Nothing is typed in by hand. */
function headerKpis(rows: readonly MarkdownRow[]): KpiItem[] {
  const now = rows.filter((row) => row.timing === "NOW");
  const saved = rows.reduce((sum, row) => sum + row.marginSaved, 0);

  // The leftover can only be valued at list where BOTH the projected
  // leftover and the style's list price came back. A row missing either is
  // left OUT of the total and counted on the pill instead of being folded
  // in as a zero: a zero is a claim that the row is worth nothing, and the
  // table below honestly renders the same row as a dash. The headline and
  // the table must not disagree about the same missing figure.
  const priced = rows.filter(
    (row) => row.listPriceInr !== null && row.projectedLeftoverUnits !== null,
  );
  const unpriced = rows.length - priced.length;
  const exposed = priced.reduce(
    (sum, row) => sum + (row.listPriceInr ?? 0) * (row.projectedLeftoverUnits ?? 0),
    0,
  );

  return [
    { label: "Styles in the window", value: formatCount(rows.length) },
    {
      label: "Cut this week",
      value: formatCount(now.length),
      pill: now.length > 0 ? "depth rising" : "none over trigger",
      tone: now.length > 0 ? "down" : "grey",
    },
    {
      label: `Margin saved vs acting ${DELAY_WEEKS} weeks late`,
      value: formatInr(saved),
    },
    {
      label:
        unpriced > 0
          ? `Leftover at list, ${formatCount(priced.length)} of ${formatCount(
              rows.length,
            )} styles`
          : "Leftover at list",
      value: rows.length > 0 && priced.length === 0 ? DASH : formatInr(exposed),
      pill:
        unpriced > 0
          ? `${formatCount(unpriced)} unpriced, not counted`
          : undefined,
      tone: unpriced > 0 ? "amber" : undefined,
    },
  ];
}

/**
 * The accuracy for the model that actually produced the rows on screen.
 *
 * NEVER ACROSS BRANDS. getAccuracyHeadline returns every planning-grain
 * registry row the session can read, sorted by brandId, so an unguarded
 * `headlines[0]` would stamp an SPD screen with ECO's accuracy -- a number
 * measured on another brand's demand, presented as this brand's proof. The
 * brand filter comes first and there is no last-resort fallback: where no
 * headline belongs to the brand on screen the page renders no accuracy at
 * all, and the strip says why.
 */
function accuracyForRows(
  headlines: readonly AccuracyHeadline[],
  rows: readonly MarkdownRow[],
  brandId: string,
): AccuracyHeadline | null {
  const forBrand = headlines.filter((headline) => headline.brandId === brandId);
  if (forBrand.length === 0) return null;
  const versions = new Set(rows.map((row) => row.modelVersion));
  return (
    forBrand.find((headline) => versions.has(headline.modelVersion)) ??
    forBrand[0] ??
    null
  );
}

/** First query-string value, or "" -- never a default that names a style. */
function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * The rows whose curve can honestly be drawn.
 *
 * buildDepthCurve returns null where the style's current price point cannot
 * be recovered from its own stored row -- a depth clamped at the ceiling or
 * at zero carries no information about what it was clamped from. Those rows
 * keep every stored figure in the table; only the drawing is withheld.
 */
function chartable(rows: readonly MarkdownRow[]): Chartable[] {
  const out: Chartable[] = [];
  for (const row of rows) {
    const coefficient = row.fit?.coefficient;
    if (typeof coefficient !== "number") continue;
    const curve = buildDepthCurve({
      coverWeeks: row.coverWeeks,
      remainingLifeWeeks: row.remainingLifeWeeks,
      weeksSinceLaunch: row.weeksSinceLaunch,
      recommendedDepth: row.recommendedDepth,
      recommendedWeek: row.recommendedWeek,
      coefficient,
    });
    if (curve !== null) out.push({ row, curve });
  }
  return out;
}

export default async function MarkdownPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await redirectCmpoToPortfolio();
  const planner = await getSessionPlanner();
  const brandId = planner?.brandId ?? null;
  const params = await searchParams;

  if (!brandId) {
    return (
      <>
        <PageHeader eyebrow="20% of markdown loss" title="Markdown optimiser" />
        <Explain>
          You are signed in, but your account is not linked to a planner
          record, so there is no brand to scope a markdown plan to. Every
          depth, every cover figure and every fitted curve on this screen is
          filtered by the brand, region and categories on that record; without
          one there is nothing to show and no price instruction you could act
          on. Ask your workspace administrator to link your account.
        </Explain>
      </>
    );
  }

  const sb = await createServerAnonClient();

  let rows: MarkdownRow[] = [];
  let fits: CategoryFit[] = [];
  let headlines: AccuracyHeadline[] = [];
  let readError: string | null = null;

  try {
    const [recommendations, elasticity, accuracy, categoryNames] =
      await Promise.all([
        getMarkdownRecs(sb, brandId),
        getElasticity(sb, brandId),
        getAccuracyHeadline(sb),
        getCategoryNames(sb),
      ]);

    headlines = accuracy;
    fits = toCategoryFits(elasticity, categoryNames);

    const styleIds = [
      ...new Set(
        recommendations
          .map((rec) => rec.style_id)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const prices = await getStyleListPrices(sb, styleIds);
    rows = toMarkdownRows(recommendations, fits, prices, categoryNames);
  } catch (error) {
    readError = error instanceof Error ? error.message : String(error);
  }

  const accuracy = accuracyForRows(headlines, rows, brandId);
  const ledger = fitLedgerFor(brandId);

  // The curve, resolved against what the planner can actually see.
  //
  // A ?style= is answered or refused, never quietly swapped. Six rows in
  // this dataset are in scope and carry every stored figure but cannot be
  // charted, because their stored depth is clamped and the inversion has no
  // anchor to recover. Falling back to drawable[0] there would draw a
  // DIFFERENT style's curve under the style id the reader asked for, with
  // nothing on the page saying so -- the one substitution a screen about
  // provenance must not make. So the requested style either gets its own
  // curve or gets told why it has none.
  const drawable = chartable(rows);
  const wanted = one(params.style);
  const requestedEntry =
    wanted === ""
      ? null
      : (drawable.find((entry) => entry.row.styleId === wanted) ?? null);
  /** Asked for by name, in scope, but with no curve to draw. */
  const requestedRow =
    wanted === "" || requestedEntry !== null
      ? null
      : (rows.find((row) => row.styleId === wanted) ?? null);
  const refusedRequest = wanted !== "" && requestedEntry === null;
  const focus = requestedEntry ?? (wanted === "" ? (drawable[0] ?? null) : null);

  let choices = drawable.slice(0, MAX_CURVE_CHOICES).map((entry) => entry.row);
  if (focus && !choices.some((row) => row.styleId === focus.row.styleId)) {
    choices = [focus.row, ...choices.slice(0, MAX_CURVE_CHOICES - 1)];
  }

  // Provenance comes from the rows that were actually rendered, so a run that
  // produced nothing in scope cannot be stamped with a version it did not
  // write here.
  const versions = [...new Set(rows.map((row) => row.modelVersion))].sort();
  const generatedAt = rows
    .map((row) => row.generatedAt)
    .sort()
    .at(-1);
  const stripVersion =
    versions.length > 0
      ? versions.join(" + ")
      : (accuracy?.modelVersion ?? "no model on record");

  const nowCount = rows.filter((row) => row.timing === "NOW").length;

  return (
    <>
      <PageHeader
        eyebrow="20% of markdown loss"
        title="Markdown optimiser"
        kpis={headerKpis(rows)}
      />

      {readError ? (
        <Explain>
          The markdown plan could not be read: {readError}. Nothing has been
          hidden or approximated -- the screen is showing you the failure
          rather than an empty table that would look like a quiet week.
        </Explain>
      ) : (
        <>
          {/* The thesis of the screen, in one sentence, immediately above the
              rows it applies to. The mechanism behind it is 157 words and it
              used to sit between the reader and the table. */}
          <Why
            lead="Waiting does not make the pile smaller. It makes the cut deeper."
            label="the mechanism"
            className="mb-[12px] block max-w-[104ch]"
          >
            A style holding more weeks of cover than it has weeks of life left
            will strand the difference unless the sell rate is lifted. Clearing
            it this week needs the rate multiplied by cover over remaining life;
            clearing it at the next review needs it multiplied by{" "}
            <span className="font-mono text-[11px] text-ink">
              (cover - {DELAY_WEEKS}) / (life - {DELAY_WEEKS})
            </span>
            . {DELAY_WEEKS} weeks of ordinary trading take {DELAY_WEEKS} weeks
            off both the pile and the runway, and because the runway is the
            smaller number it loses proportionally more -- so on every
            overstocked style the second ratio is strictly the larger, and the
            depth that answers it is strictly deeper. That is the entire
            mechanism behind this screen, and the {DELAY_WEEKS}-week lag being
            priced is the case&apos;s own description of an in-season cycle: a
            weekly report, a meeting, then an execution window. It is a premise
            of the case study, taken from {PIPELINE_SOURCE}, not something
            measured in this data.
          </Why>

          {/* The finding, stated rather than left to be derived from the rows
              below it. Folded from those same rows, so it cannot disagree
              with them. */}
          {inference(rows) === null ? null : (
            <p className="mb-[12px] max-w-[104ch] text-[13px] font-bold leading-[1.55] text-ink">
              {inference(rows)}
            </p>
          )}

          <RecommendationTable rows={rows} />

          <div className="mt-[16px]">
            <TimingBuckets rows={rows} />
          </div>

          <div className="mt-[16px]">
            <ElasticityPanel
              fits={fits}
              rows={rows}
              brandId={brandId}
              ledger={ledger}
            />
          </div>

          {/* Below the fold from here: the curve, the per-style rationales and
              the empty-state note. All of it is worth having and none of it is
              worth crossing to reach three rows of recommendations. */}
          <div className="mt-[16px]">
            {focus ? (
              <DepthCurve
                row={focus.row}
                curve={focus.curve}
                choices={choices}
                chartableCount={drawable.length}
                totalCount={rows.length}
              />
            ) : refusedRequest ? (
              <Card>
                <CardBody>
                  <Why
                    lead={
                      requestedRow
                        ? `${wanted} is in your scope and in the table, but has no curve.`
                        : `No recommendation for ${wanted} is readable in your scope.`
                    }
                    label="why"
                    className="block max-w-[88ch]"
                  >
                    {requestedRow ? (
                      <>
                        <b className="text-ink">{wanted}</b> is in your scope
                        and every figure stored for it is in the table below,
                        but it has no curve. The curve is the fitted elasticity
                        inverted around the depth the style trades at today,
                        and that depth is not stored -- it is recovered from
                        the recommendation&apos;s own arithmetic. This
                        row&apos;s stored depth was clamped, at the{" "}
                        {formatFractionPct(MAX_DEPTH, 0)} ceiling or at zero,
                        and a clamped value carries no information about the
                        price point it was clamped from, so there is no anchor
                        to invert around. No curve is drawn rather than another
                        style&apos;s curve being shown under this one&apos;s
                        name.
                      </>
                    ) : (
                      <>
                        No recommendation for{" "}
                        <b className="text-ink">{wanted}</b> is readable in
                        your scope, so there is no curve to draw for it. Either
                        that style has no markdown question this cycle or your
                        planner record does not cover its brand or categories;
                        this screen cannot tell you which, and it will not put
                        a different style&apos;s curve under the id you asked
                        for.
                      </>
                    )}{" "}
                    {drawable.length > 0
                      ? `${drawable.length} of the ${rows.length} ${
                          rows.length === 1 ? "style" : "styles"
                        } in scope can be charted.`
                      : "No style in your scope can be charted at all."}
                  </Why>
                  {choices.length > 0 ? (
                    <div className="mt-[12px] flex flex-wrap gap-[6px]">
                      {choices.map((choice) => (
                        <Link
                          key={choice.styleId}
                          href={`/markdown?style=${encodeURIComponent(choice.styleId)}`}
                          className="rounded-full bg-cream px-[11px] py-[5px] text-[11px] font-bold text-body transition-colors duration-[120ms] hover:bg-hover"
                        >
                          {choice.styleId}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            ) : (
              <Card>
                <CardBody>
                  <Why
                    lead={`No curve: every style in scope is at the ${formatFractionPct(MAX_DEPTH, 0)} ceiling.`}
                    label="why that stops a curve being drawn"
                    className="block max-w-[88ch]"
                  >
                    No curve is drawn because no style in your scope carries a
                    recoverable price point. The curve is the fitted elasticity
                    inverted around the depth a style trades at today, and that
                    depth is not stored on the recommendation -- it is recovered
                    from the recommendation&apos;s own arithmetic. Where the
                    stored depth was clamped, at the{" "}
                    {formatFractionPct(MAX_DEPTH, 0)} ceiling or at zero, the
                    clamp destroyed the information the inversion needs. Drawing
                    a curve anyway would mean choosing an anchor, which is a
                    drawing rather than a derivation, so the screen shows you
                    the stored figures instead and stops there.
                  </Why>
                </CardBody>
              </Card>
            )}
          </div>

          <div className="mt-[16px]">
            <RationaleList rows={rows} />
          </div>

          {rows.length === 0 ? (
            <div className="mt-[16px]">
              <Explain>
                No style in your scope currently has a markdown question. That
                is a scope and a calendar result rather than an error: a style
                enters this window only once{" "}
                {formatFractionPct(LIFE_ELAPSED_TRIGGER, 0)} of its planned
                life has elapsed, it is carrying more cover than its
                category&apos;s ceiling allows, and it still has at least one
                trading week left. Anything overstocked but earlier in its life
                is a buy or allocation problem and is answered on those
                screens. The fitted curves below still apply to your brand and
                are shown so the screen stays honest about what it would be
                pricing against.
              </Explain>
            </div>
          ) : null}
        </>
      )}

      <ModelStrip
        className="mt-[16px]"
        modelVersion={stripVersion}
        generatedAt={formatTimestamp(generatedAt ?? accuracy?.generatedAt ?? null)}
        accuracy={accuracy ?? undefined}
        why={
          <>
            {versions.length > 0
              ? `Every depth and every timing call above was written by ${stripVersion} in one batch run and stamped with the moment it was produced. `
              : `No markdown rows are in scope, so this strip names the registered model that would produce them rather than a row that exists. `}
            No model is called when you load this page: the elasticity was
            fitted offline into{" "}
            <span className="font-mono text-[11px]">elasticity</span> and the
            recommendations were scored offline into{" "}
            <span className="font-mono text-[11px]">
              markdown_recommendation
            </span>
            .{" "}
            {accuracy
              ? `The backtested accuracy shown here is the planning-grain forecast accuracy for this model version, quoted only alongside its ${accuracy.vsSeasonalNaivePoints.toFixed(
                  1,
                )}-point margin over seasonal naive, which is the comparison that carries the proof. It stamps the run; it does not measure the depths. The depth arithmetic consumes observed weeks of supply from the weekly fact and a fitted elasticity, not the demand forecast, so a better forecast would not by itself move a number on this screen. `
              : `No accuracy figure is shown, and the gap is deliberate: the model registry carries no planning-grain row for ${brandId} that this session can read. ${
                  headlines.length > 0
                    ? `The ${headlines.length} ${
                        headlines.length === 1 ? "row it can read belongs" : "rows it can read belong"
                      } to other brands, and one of those quoted here would be a different brand's model scored against a different brand's demand. `
                    : ""
                }An accuracy borrowed across brands would be worse than none, so the page renders none. `}
            No confidence band is shown because the pipeline publishes none
            for markdown rows -- unlike a buy recommendation, which carries
            one. The strength of a row here is stated instead as whether its
            category fitted its own elasticity or fell back to the pooled
            coefficient, which is in the Fit column and in the provenance
            panel.{" "}
            {nowCount > 0
              ? `${nowCount} of ${rows.length} rows cross the ${formatFractionPct(
                  NOW_MARGIN_TRIGGER_PCT,
                  0,
                )} trigger and read Now.`
              : ""}
          </>
        }
      />
    </>
  );
}
