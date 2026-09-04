import Link from "next/link";

import { Card, CardBody, CardHeader, Pill } from "@/components";

import {
  DELAY_WEEKS,
  MAX_DEPTH,
  MIN_R2,
  NOW_MARGIN_TRIGGER_PCT,
  PIPELINE_SOURCE,
} from "./constants";
import type { DepthCurve as Curve } from "./curve";
import {
  formatCoefficient,
  formatCount,
  formatFittedForm,
  formatFractionPct,
  formatInr,
  formatPoints,
  formatR2,
  formatUnits,
  formatWeeks,
  MIDDOT,
} from "./format";
import { timingDisplay, type MarkdownRow } from "./types";

/**
 * DEPTH REQUIRED AGAINST WEEK OF LIFE.
 *
 * Inline SVG with a viewBox, like every other chart in this app. There is no
 * charting library in the project and there is not going to be one; this is
 * built the same way production.html builds its mdCurve, at a size that can
 * carry the annotation the picture needs to be read correctly.
 *
 * WHAT IS DRAWN IS NOT A TREND LINE. Every point is the pipeline's own
 * clearing-depth identity evaluated one week later than the point before it:
 * wait a week and the pile loses a week of cover while the runway loses a
 * week of life, and because the runway is the smaller number the ratio, and
 * with it the cut, gets worse. The batch scorer evaluates that identity at
 * exactly two weeks -- 0 and DELAY_WEEKS -- and stores the answer; this
 * chart fills in the weeks between them and to the end of the style's life
 * so the shape of the escalation is visible rather than inferred from two
 * numbers in a table.
 *
 * THE MARKED POINT. sv/markdown.py notes that where the cut clears the pile
 * at both dates, the "waiting costs more than 5% of the leftover's list
 * value" test reduces exactly to "waiting would cost more than five points
 * of depth", because the two branches then move identical units and the
 * unit cost cancels. So the week marked on the curve is the first week whose
 * four-week-later depth is more than five points deeper. That is the point
 * where acting now beats acting later, derived rather than eyeballed.
 */

const TRIGGER_POINTS = Math.round(NOW_MARGIN_TRIGGER_PCT * 100);

const W = 700;
const H = 310;
const PAD = { l: 46, r: 20, t: 24, b: 40 } as const;

const ORANGE = "#D04A02";
const ORANGE_DARK = "#A33A00";
const RULE = "#F0EBE5";
const MUTE = "#8D857D";
const STONE = "#B4A99F";
const PEACH = "#FBE3D4";
const GREEN = "#2FA45B";
const RED = "#C0392B";
const INK = "#231F1C";

export type DepthCurveProps = {
  row: MarkdownRow;
  curve: Curve;
  /** The styles offered in the selector, highest margin at stake first. */
  choices: readonly MarkdownRow[];
  /** How many rows in scope can be charted at all. */
  chartableCount: number;
  /** Total rows in scope, for the same sentence. */
  totalCount: number;
};

export function DepthCurve({
  row,
  curve,
  choices,
  chartableCount,
  totalCount,
}: DepthCurveProps) {
  const last = curve.points[curve.points.length - 1];
  const span = Math.max(1, last.weeksWaited);

  const x = (weeksWaited: number) =>
    PAD.l + ((W - PAD.l - PAD.r) * weeksWaited) / span;
  const y = (depth: number) =>
    PAD.t + (H - PAD.t - PAD.b) * (1 - Math.min(depth, MAX_DEPTH) / MAX_DEPTH);

  const path = curve.points
    .map((p, i) => `${i ? "L" : "M"}${x(p.weeksWaited).toFixed(2)} ${y(p.depth).toFixed(2)}`)
    .join("");

  const reviewPoint = curve.points.find((p) => p.weeksWaited === DELAY_WEEKS);
  const actHereWaited =
    curve.actHereWeekOfLife === null
      ? null
      : curve.actHereWeekOfLife - row.weeksSinceLaunch;

  // Ticks every whole number of weeks where the window is short, thinned out
  // where it is long, so the axis never overprints itself.
  const tickEvery = Math.max(1, Math.ceil(curve.points.length / 9));
  const ticks = curve.points.filter(
    (p, i) => i % tickEvery === 0 || p.weeksWaited === span,
  );

  const fit = row.fit;
  // Three outcomes, not two: an unexpected timing label is surfaced as
  // itself rather than collapsing into "hold", which is what TimingBuckets
  // does with the same value.
  const timing = timingDisplay(row.timing, "Cut now", "Hold this cycle");
  const ceilingReached = curve.points.some((p) => p.atCeiling);

  // LABEL PLACEMENT. Three rules, each fixing a collision that actually
  // occurs on a real row in this dataset rather than a hypothetical one.
  //
  //   - "trading at N% off today" is anchored to the RIGHT edge. Left-anchored
  //     it sits on top of the "this week" callout whenever the style already
  //     trades close to the cut it needs (ECO-DRES-0132, ECO-DRES-0155).
  //   - "this week N%" flips above its marker when the marker is near the
  //     floor, so the callout cannot land on the week axis (ECO-BOTT-0172,
  //     which needs a 1% cut).
  //   - "act here" drops to the foot of its green line when that line is close
  //     to the week-4 marker, so the two callouts cannot overprint each other
  //     (ECO-DRES-0120, where the trigger is crossed one week from today).
  const nowLabelY =
    y(curve.depthNow) > H - PAD.b - 26
      ? y(curve.depthNow) - 9
      : y(curve.depthNow) + 16;
  const actLabelCrowded =
    actHereWaited !== null &&
    reviewPoint !== undefined &&
    Math.abs(x(actHereWaited) - x(DELAY_WEEKS)) < 170;
  const actLabelY = actLabelCrowded ? H - PAD.b - 8 : PAD.t + 12;

  return (
    <Card>
      <CardHeader
        title="Depth required against week of life"
        subtitle={`${row.styleName} ${MIDDOT} ${row.styleId} ${MIDDOT} ${row.categoryLabel} ${MIDDOT} ${formatWeeks(row.coverWeeks)} weeks of cover against ${formatCount(row.remainingLifeWeeks)} weeks of life left`}
        actions={
          choices.length > 1 ? (
            <div className="flex flex-wrap justify-end gap-[6px]">
              {choices.map((choice) => {
                const active = choice.styleId === row.styleId;
                return (
                  <Link
                    key={choice.styleId}
                    href={`/markdown?style=${encodeURIComponent(choice.styleId)}`}
                    aria-current={active ? "true" : undefined}
                    className={`rounded-full px-[11px] py-[5px] text-[11px] font-bold whitespace-nowrap transition-colors duration-[120ms] ${
                      active
                        ? "bg-ink text-white"
                        : "bg-cream text-body hover:bg-hover"
                    }`}
                  >
                    {choice.styleId}
                  </Link>
                );
              })}
            </div>
          ) : undefined
        }
      />
      <CardBody>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`Cut required to clear ${row.styleId}'s projected leftover, rising from ${formatFractionPct(
            curve.depthNow,
          )} this week to ${formatFractionPct(
            last.depth,
          )} in week ${last.weekOfLife} of its life as the remaining runway shortens.`}
        >
          {/* 1. gridlines, in depth points */}
          {[0, 0.2, 0.4, 0.6, 0.8].map((level) => (
            <g key={level}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(level)}
                y2={y(level)}
                stroke={level === MAX_DEPTH ? RED : RULE}
                strokeDasharray={level === MAX_DEPTH ? "5 4" : undefined}
              />
              <text
                x={PAD.l - 7}
                y={y(level) + 3}
                fontSize="9"
                fill={level === MAX_DEPTH ? RED : MUTE}
                textAnchor="end"
                fontWeight="700"
              >
                {`${Math.round(level * 100)}%`}
              </text>
            </g>
          ))}
          <text
            x={W - PAD.r}
            y={y(MAX_DEPTH) - 6}
            fontSize="9"
            fill={RED}
            textAnchor="end"
            fontWeight="800"
          >
            {`${Math.round(MAX_DEPTH * 100)}% policy ceiling -- past here the pile cannot be cleared at all`}
          </text>

          {/* 2. the region where a four-week wait already costs more than the trigger */}
          {actHereWaited !== null ? (
            <>
              <rect
                x={x(actHereWaited)}
                y={PAD.t}
                width={W - PAD.r - x(actHereWaited)}
                height={H - PAD.t - PAD.b}
                fill={PEACH}
                opacity="0.5"
                rx="6"
              />
              <line
                x1={x(actHereWaited)}
                x2={x(actHereWaited)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke={GREEN}
                strokeDasharray="3 3"
              />
              <text
                x={x(actHereWaited) + (actHereWaited > span * 0.6 ? -6 : 6)}
                y={actLabelY}
                fontSize="9.5"
                fill={GREEN}
                fontWeight="800"
                textAnchor={actHereWaited > span * 0.6 ? "end" : "start"}
              >
                {actHereWaited === 0
                  ? "act here -- already past the trigger"
                  : `act here -- week ${curve.actHereWeekOfLife} of life`}
              </text>
            </>
          ) : null}

          {/* 3. the depth this style trades at today, recovered from its own row */}
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(curve.currentDepth)}
            y2={y(curve.currentDepth)}
            stroke={STONE}
            strokeDasharray="2 4"
          />
          <text
            x={W - PAD.r - 4}
            y={y(curve.currentDepth) - 5}
            fontSize="9"
            fill={STONE}
            textAnchor="end"
            fontWeight="800"
          >
            {`trading at ${formatFractionPct(curve.currentDepth, 0)} off today`}
          </text>

          {/* 4. the curve itself */}
          <path d={path} fill="none" stroke={ORANGE} strokeWidth="2.6" />
          {curve.points.map((p) => (
            <circle
              key={p.weeksWaited}
              cx={x(p.weeksWaited)}
              cy={y(p.depth)}
              r="2"
              fill={ORANGE}
              opacity="0.55"
            />
          ))}

          {/* 5. the two weeks the batch scorer actually evaluated */}
          {reviewPoint ? (
            <>
              <line
                x1={x(0)}
                x2={x(DELAY_WEEKS)}
                y1={y(curve.depthNow)}
                y2={y(curve.depthNow)}
                stroke={ORANGE_DARK}
                strokeDasharray="2 3"
              />
              <line
                x1={x(DELAY_WEEKS)}
                x2={x(DELAY_WEEKS)}
                y1={y(curve.depthNow)}
                y2={y(reviewPoint.depth)}
                stroke={ORANGE_DARK}
                strokeWidth="1.8"
              />
              <text
                x={x(DELAY_WEEKS) + 7}
                y={(y(curve.depthNow) + y(reviewPoint.depth)) / 2 + 3}
                fontSize="9.5"
                fill={ORANGE_DARK}
                fontWeight="800"
              >
                {`${formatPoints(curve.gapNowToReview)} for a ${DELAY_WEEKS}-week wait`}
              </text>
              <circle
                cx={x(DELAY_WEEKS)}
                cy={y(reviewPoint.depth)}
                r="4.5"
                fill="#FFFFFF"
                stroke={ORANGE}
                strokeWidth="2"
              />
              <text
                x={x(DELAY_WEEKS)}
                y={y(reviewPoint.depth) - 10}
                fontSize="9.5"
                fill={INK}
                textAnchor="middle"
                fontWeight="800"
              >
                {`week-${DELAY_WEEKS} review ${formatFractionPct(reviewPoint.depth, 0)}`}
              </text>
            </>
          ) : null}

          <circle cx={x(0)} cy={y(curve.depthNow)} r="4.5" fill={ORANGE} />
          <text
            x={x(0) + 6}
            y={nowLabelY}
            fontSize="9.5"
            fill={ORANGE}
            fontWeight="800"
          >
            {`this week ${formatFractionPct(curve.depthNow, 0)}`}
          </text>

          {/* 6. the axis: week of the style's own life */}
          {ticks.map((p) => (
            <text
              key={p.weeksWaited}
              x={x(p.weeksWaited)}
              y={H - 20}
              fontSize="9"
              fill={MUTE}
              textAnchor="middle"
              fontWeight="700"
            >
              {`w${p.weekOfLife}`}
            </text>
          ))}
          <text
            x={PAD.l}
            y={H - 6}
            fontSize="9"
            fill={MUTE}
            textAnchor="start"
            fontWeight="700"
          >
            week of product life
          </text>
          <text
            x={W - PAD.r}
            y={H - 6}
            fontSize="9"
            fill={MUTE}
            textAnchor="end"
            fontWeight="700"
          >
            {`planned end of life at w${row.weeksSinceLaunch + row.remainingLifeWeeks}`}
          </text>
        </svg>

        <div className="mt-[14px] flex flex-wrap items-center gap-[8px]">
          <Pill variant={timing.variant}>{timing.label}</Pill>
          <Pill variant={fit?.isPooled ? "amber" : "up"}>
            {fit?.isPooled
              ? `${row.categoryId} on the pooled coefficient`
              : `${row.categoryId} fitted on its own promotions`}
          </Pill>
          <span className="text-[11.5px] font-semibold text-mute tabular-nums">
            waiting {DELAY_WEEKS} weeks costs{" "}
            <b className="text-ink">{formatInr(row.marginSaved)}</b>
            {row.waitCostShare === null
              ? ""
              : `, ${formatFractionPct(row.waitCostShare)} of the leftover's ${formatInr(
                  (row.projectedLeftoverUnits ?? 0) * (row.listPriceInr ?? 0),
                )} at list, against a ${formatFractionPct(NOW_MARGIN_TRIGGER_PCT, 0)} trigger`}
          </span>
        </div>

        {timing.known ? null : (
          <p className="mt-[10px] max-w-[92ch] text-copy leading-[1.6] font-semibold text-red">
            This row carries a timing value this screen does not recognise (
            {row.timing}), so it is shown as itself rather than read as a hold.
            An unexpected label is a pipeline change the screen has not caught
            up with, and the curve below still describes what the depth does
            with time -- it does not tell you what the scorer decided.
          </p>
        )}

        <p className="mt-[12px] max-w-[92ch] text-copy leading-[1.6] text-body">
          The curve is the fitted elasticity inverted, not a shape chosen to
          look like one. {row.categoryLabel} was fitted log-log on{" "}
          <span className="tabular-nums">{formatCount(fit?.nObservations)}</span>{" "}
          executed promotions as{" "}
          <span className="font-mono text-[11px] text-ink">
            {formatFittedForm(fit?.intercept, fit?.coefficient)}
          </span>
          , R-squared <span className="tabular-nums">{formatR2(fit?.rSquared)}</span>
          {fit?.isPooled
            ? ` -- below the ${MIN_R2.toFixed(
                2,
              )} floor, so the coefficient shipped on this row is the pooled one and the depth above is correspondingly weaker evidence`
            : ""}
          . Clearing {formatUnits(row.projectedLeftoverUnits)} projected
          leftover units across{" "}
          <span className="tabular-nums">{formatCount(row.remainingLifeWeeks)}</span>{" "}
          remaining weeks needs the sell rate multiplied by cover over
          remaining life. Placing this style&apos;s own price point on the
          curve first and inverting collapses the intercept out entirely, so
          each point above is{" "}
          <span className="font-mono text-[11px] text-ink">
            depth(w) = 1 - (1 - {curve.currentDepth.toFixed(3)}) x ((
            {formatWeeks(row.coverWeeks)} - w) / ({formatCount(
              row.remainingLifeWeeks,
            )}{" "}
            - w)) ^ (1 / {formatCoefficient(fit?.coefficient)})
          </span>
          . The dashed grey line is where this style trades today, recovered
          from its own stored recommendation by the same algebra run
          backwards.
        </p>

        <p className="mt-[10px] max-w-[92ch] text-copy leading-[1.6] text-body">
          {curve.actHereWeekOfLife === null ? (
            <>
              No week left in this style&apos;s life pushes the{" "}
              {DELAY_WEEKS}-week escalation past {TRIGGER_POINTS} points of
              depth, so
              there is no week on this curve to mark: the row reads{" "}
              {timing.known ? (row.timing === "NOW" ? "Now" : "Hold") : row.timing} and the shaded region is
              absent because nothing crosses the trigger, not because the
              chart is incomplete.{" "}
              {ceilingReached
                ? `Read the top of the curve carefully. Once both dates are pinned at the ${Math.round(
                    MAX_DEPTH * 100,
                  )}% ceiling the depth gap closes to nothing, so the ${TRIGGER_POINTS}-point reduction stops describing the decision -- what the wait costs there is stranded stock rather than margin per unit, and the stored margin test weighs that while this reading of the curve cannot.`
                : ""}
            </>
          ) : actHereWaited === 0 ? (
            <>
              The green line sits at week {curve.actHereWeekOfLife}, which is
              this week: the {DELAY_WEEKS}-week wait already costs{" "}
              {formatPoints(curve.gapNowToReview)} of depth, more than the{" "}
              {TRIGGER_POINTS} points the trigger allows, so everything to the
              right of it
              is more expensive than acting today. Where the cut clears the
              pile at both dates the trigger reduces exactly to that{" "}
              {TRIGGER_POINTS}-point test, because both plans then move identical
              units
              and unit cost cancels out of the comparison. Where the ceiling
              binds instead, the two plans strand different amounts and the
              stored margin test weighs that too -- which is why a ceiling row
              can read NOW at a narrower depth gap than this one.
            </>
          ) : (
            <>
              The green line sits at week {curve.actHereWeekOfLife} of life,{" "}
              {actHereWaited} {actHereWaited === 1 ? "week" : "weeks"} from
              today: that is the first week whose {DELAY_WEEKS}-week-later
              depth is more than {TRIGGER_POINTS} points deeper, which is what
              the {formatFractionPct(NOW_MARGIN_TRIGGER_PCT, 0)} margin trigger
              reduces to when the cut clears the pile at both dates. Before it, waiting is cheap enough that the depth holds
              and the style returns at the next review; after it, every cycle
              of delay costs more than the rule tolerates.
            </>
          )}{" "}
          {ceilingReached
            ? `The curve flattens where it meets the ${Math.round(
                MAX_DEPTH * 100,
              )}% ceiling. That is not a deeper cut being recommended: it is the point past which depth stops being the variable and stranded stock becomes the variable instead.`
            : ""}
        </p>

        <p className="mt-[10px] max-w-[92ch] text-small leading-[1.6] text-mute">
          {chartableCount} of the {totalCount}{" "}
          {totalCount === 1 ? "style" : "styles"} in your scope can be charted
          this way
          {choices.length < chartableCount
            ? `, and the ${choices.length} carrying the most margin are offered above`
            : ""}
          .
          {totalCount - chartableCount > 0
            ? ` The other ${
                totalCount - chartableCount
              } cannot: their stored depth sits on the ${Math.round(
                MAX_DEPTH * 100,
              )}% ceiling or at zero, and a clamped value carries no information about the price point it was clamped from, so today's depth cannot be recovered from it. Those rows keep every stored figure in the table below; only the curve is withheld, because drawing one would mean guessing the anchor.`
            : ""}{" "}
          The {DELAY_WEEKS}-week lag, the{" "}
          {formatFractionPct(NOW_MARGIN_TRIGGER_PCT, 0)} trigger and the{" "}
          {Math.round(MAX_DEPTH * 100)}% ceiling are pipeline constants read
          from {PIPELINE_SOURCE}; they are not rows in{" "}
          <span className="font-mono text-[10.5px]">policy_parameter</span> and
          this screen does not pretend otherwise.
        </p>
      </CardBody>
    </Card>
  );
}
