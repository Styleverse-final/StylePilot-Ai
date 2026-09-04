import { Card, CardBody, CardHeader, Pill, Stat, StatBlock } from "@/components";

import type { OverrideAnalysis } from "./data";
import { DASH, formatFractionPct, plural } from "./format";
import {
  distinctCount,
  formatP,
  formatR,
  leastSquares,
  mean,
  pearson,
  sampleSizeForSignificance,
  stdev,
  type Correlation,
} from "./stats";

/**
 * Does learning reduce overriding? The honest answer, drawn.
 *
 * THIS IS THE PANEL MOST WORTH GETTING WRONG, SO READ THE RULES
 * ------------------------------------------------------------
 * The hypothesis is attractive and the case would love it to be true:
 * planners further through their capability path should trust the model
 * more and override it less. The data leans that way -- both coefficients
 * are negative, which is the hypothesised direction -- and neither one
 * survives a significance test on eleven planners. That is the finding, and
 * it is rendered as the finding.
 *
 * Four things this component deliberately does NOT do:
 *
 *   1. It does not hardcode a coefficient. r, the t statistic and the
 *      two-tailed p are all computed from the rows on screen, so committing
 *      one more decision anywhere in the product moves them.
 *   2. It does not filter to a flattering subset, drop an outlier, or
 *      winsorise. Every planner with both a learning path and a committed
 *      human decision is plotted.
 *   3. It does not jitter overlapping points to make the cloud look fuller.
 *      Eight of the eleven planners in the pilot sit on the same override
 *      rate; where points coincide the marker grows and carries the count,
 *      so the reader can see the pile rather than a scatter that is not
 *      there.
 *   4. It does not describe the relationship as evidence. The sentence
 *      beside the chart says the sample is too small, says what would be
 *      needed instead, and says it in the same visual weight as the
 *      coefficient itself.
 *
 * The reason the last one matters: the override rate barely varies. When a
 * variable takes two distinct values and eight of eleven observations sit on
 * one of them, there is almost nothing for a correlation to attach to, and
 * any coefficient that emerges is mostly a description of that imbalance.
 * Saying so is the difference between a finding and a claim that unravels
 * the first time somebody re-runs it.
 */

const W = 560;
const H = 340;
const PAD = { l: 52, r: 18, t: 18, b: 52 } as const;

const INK = "#231F1C";
const ORANGE = "#D04A02";
const ORANGE_DARK = "#A33A00";
const RULE = "#F0EBE5";
const RULE2 = "#E5DED7";
const MUTE = "#8D857D";
const STONE = "#B4A99F";

const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

type Marker = {
  x: number;
  y: number;
  count: number;
  names: string[];
};

function toMarkers(analysis: OverrideAnalysis): Marker[] {
  const byPosition = new Map<string, Marker>();
  for (const point of analysis.points) {
    // Round only for the coincidence test, never for the arithmetic: two
    // planners at the identical coordinate must render as one marker of two
    // rather than as two marks that hide each other.
    const key = `${point.completionRate.toFixed(4)}:${point.overrideRate.toFixed(4)}`;
    const existing = byPosition.get(key);
    const name = point.fullName ?? point.employeeId;
    if (existing) {
      existing.count += 1;
      existing.names.push(name);
    } else {
      byPosition.set(key, {
        x: point.completionRate,
        y: point.overrideRate,
        count: 1,
        names: [name],
      });
    }
  }
  return [...byPosition.values()].sort((a, b) => a.x - b.x || a.y - b.y);
}

function Scatter({ analysis }: { analysis: OverrideAnalysis }) {
  const markers = toMarkers(analysis);
  const xs = analysis.points.map((point) => point.completionRate);
  const ys = analysis.points.map((point) => point.overrideRate);
  const fit = leastSquares(xs, ys);

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const px = (value: number) => PAD.l + value * plotW;
  const py = (value: number) => PAD.t + (1 - value) * plotH;

  const fitLine =
    fit === null
      ? null
      : (() => {
          const x0 = Math.min(...xs);
          const x1 = Math.max(...xs);
          const clamp = (v: number) => Math.max(0, Math.min(1, v));
          return {
            x1: px(x0),
            y1: py(clamp(fit.intercept + fit.slope * x0)),
            x2: px(x1),
            y2: py(clamp(fit.intercept + fit.slope * x1)),
          };
        })();

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Scatter of ${analysis.points.length} planners: share of their learning path completed on the horizontal axis, share of their committed decisions that overrode the recommendation on the vertical axis.`}
      className="block"
    >
      {TICKS.map((tick) => (
        <g key={`y${tick}`}>
          <line
            x1={PAD.l}
            y1={py(tick)}
            x2={W - PAD.r}
            y2={py(tick)}
            stroke={tick === 0 ? RULE2 : RULE}
            strokeWidth={1}
          />
          <text
            x={PAD.l - 9}
            y={py(tick) + 4}
            textAnchor="end"
            fontSize={10.5}
            fontWeight={700}
            fill={MUTE}
          >
            {`${tick * 100}%`}
          </text>
        </g>
      ))}

      {TICKS.map((tick) => (
        <g key={`x${tick}`}>
          <line
            x1={px(tick)}
            y1={PAD.t}
            x2={px(tick)}
            y2={H - PAD.b}
            stroke={RULE}
            strokeWidth={1}
          />
          <text
            x={px(tick)}
            y={H - PAD.b + 17}
            textAnchor="middle"
            fontSize={10.5}
            fontWeight={700}
            fill={MUTE}
          >
            {`${tick * 100}%`}
          </text>
        </g>
      ))}

      {fitLine === null ? null : (
        <line
          x1={fitLine.x1}
          y1={fitLine.y1}
          x2={fitLine.x2}
          y2={fitLine.y2}
          stroke={STONE}
          strokeWidth={1.6}
          strokeDasharray="6 5"
        />
      )}

      {markers.map((marker) => {
        const radius = 5.5 + (marker.count - 1) * 3;
        return (
          <g key={`${marker.x}-${marker.y}`}>
            <circle
              cx={px(marker.x)}
              cy={py(marker.y)}
              r={radius}
              fill={ORANGE}
              fillOpacity={0.28}
              stroke={ORANGE_DARK}
              strokeWidth={1.6}
            >
              <title>
                {`${marker.names.join(", ")} -- ${(marker.x * 100).toFixed(0)}% of path complete, ${(marker.y * 100).toFixed(0)}% override rate`}
              </title>
            </circle>
            {marker.count > 1 ? (
              <text
                x={px(marker.x)}
                y={py(marker.y) + 3.5}
                textAnchor="middle"
                fontSize={10}
                fontWeight={800}
                fill={ORANGE_DARK}
              >
                {marker.count}
              </text>
            ) : null}
          </g>
        );
      })}

      <text
        x={PAD.l + plotW / 2}
        y={H - 10}
        textAnchor="middle"
        fontSize={11}
        fontWeight={800}
        fill={INK}
      >
        Share of their own learning path completed
      </text>
      <text
        x={-(PAD.t + plotH / 2)}
        y={13}
        transform="rotate(-90)"
        textAnchor="middle"
        fontSize={11}
        fontWeight={800}
        fill={INK}
      >
        Override rate
      </text>
    </svg>
  );
}

/** A coefficient counts as significant only with a p below the usual 5%. */
function isSignificant(correlation: Correlation | null): boolean {
  return correlation !== null && correlation.p !== null && correlation.p < 0.05;
}

function CoefficientRow({
  label,
  correlation,
  note,
}: {
  label: string;
  correlation: Correlation | null;
  note: string;
}) {
  const required =
    correlation === null ? null : sampleSizeForSignificance(correlation.r, 0.05);

  return (
    <div className="border-b border-rule py-[10px] last:border-b-0">
      <div className="flex items-baseline justify-between gap-[10px]">
        <span className="text-copy font-bold text-ink">{label}</span>
        <span className="text-copy font-extrabold tabular">
          {correlation === null ? DASH : `r = ${formatR(correlation.r)}`}
        </span>
      </div>
      <div className="mt-[3px] flex items-baseline justify-between gap-[10px] text-small font-semibold text-mute">
        <span>{note}</span>
        <span className="tabular whitespace-nowrap">
          {correlation === null
            ? DASH
            : `t = ${correlation.t.toFixed(2)}, df ${correlation.df}, p = ${formatP(correlation.p)}`}
        </span>
      </div>
      {correlation === null ? null : (
        <div className="mt-[3px] text-small font-semibold text-mute">
          {required === null
            ? "No sample size would make an effect this small detectable."
            : `An effect of this size reaches p < 0.05 at about ${required} planners with decision history.`}
        </div>
      )}
    </div>
  );
}

export function OverrideScatter({ analysis }: { analysis: OverrideAnalysis }) {
  const points = analysis.points;
  const completion = points.map((point) => point.completionRate);
  const overrides = points.map((point) => point.overrideRate);
  const hours = points.map((point) => point.completedHours);

  const byCompletion = pearson(completion, overrides);
  const byHours = pearson(hours, overrides);

  const meanCompletion = mean(completion);
  const meanOverride = mean(overrides);
  const overrideSpread = stdev(overrides);
  const overrideValues = distinctCount(overrides);
  const atCeiling = overrides.filter((value) => value >= 0.999).length;

  // The sample size quoted in the prose is the one for the relationship
  // ACTUALLY PLOTTED. The hours coefficient is larger and so needs fewer
  // planners; quoting the smaller requirement beside a chart of the weaker
  // relationship would understate what it takes to settle the question the
  // chart is asking. Both figures appear on their own coefficient rows.
  const requiredN =
    byCompletion === null ? null : sampleSizeForSignificance(byCompletion.r, 0.05);

  const significant = isSignificant(byCompletion) || isSignificant(byHours);

  if (points.length < 3) {
    return (
      <Card>
        <CardHeader
          title="Learning against overriding"
          subtitle="Completion rate plotted against override rate"
        />
        <CardBody>
          <p className="max-w-[88ch] text-copy leading-[1.6] text-body">
            {points.length === 0
              ? "No planner in your scope has both a learning path and a committed human decision, so there is nothing to correlate."
              : `Only ${plural(points.length, "planner", "planners")} in your scope has both a learning path and a committed human decision.`}{" "}
            A correlation needs at least three paired observations before it
            is even defined, so this panel shows nothing rather than a
            coefficient computed from one or two people. When the pilot
            accumulates more committed decisions, the scatter and its
            significance test appear here.{" "}
            {analysis.plannersWithoutDecisions > 0
              ? `${analysis.plannersWithoutDecisions} people in scope have a learning path but no committed decision yet; they are not plotted as zeros, because "has not decided anything" is not "never overrides".`
              : ""}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Learning against overriding"
        subtitle="Every planner with both a learning path and a committed human decision"
        actions={
          <Pill variant={significant ? "up" : "amber"}>
            {significant ? "significant" : "not significant"}
          </Pill>
        }
      />
      <CardBody>
        <div className="grid grid-cols-[1.15fr_1fr] gap-[20px] max-[1140px]:grid-cols-1">
          <div>
            <div className="overflow-x-auto">
              <Scatter analysis={analysis} />
            </div>
            <div className="mt-[6px] flex flex-wrap gap-x-[16px] gap-y-[5px] text-small font-semibold text-mute">
              <span>
                <i
                  aria-hidden="true"
                  className="mr-[6px] inline-block h-[9px] w-[9px] rounded-full border-[1.6px] border-orangeD bg-orange/30 align-[0px]"
                />
                One planner. A larger marker carrying a number is that many
                planners on the identical coordinate.
              </span>
              <span>
                <i
                  aria-hidden="true"
                  className="mr-[6px] inline-block h-[2px] w-[14px] bg-[#B4A99F] align-[3px]"
                />
                Least-squares fit, drawn for direction only.
              </span>
            </div>
          </div>

          <div>
            <StatBlock className="mt-0">
              <Stat label="Planners plotted" value={points.length} />
              <Stat label="Committed decisions" value={analysis.decisionCount} />
              <Stat
                label="Mean completion"
                value={formatFractionPct(meanCompletion, 1)}
              />
              <Stat
                label="Mean override rate"
                value={formatFractionPct(meanOverride, 1)}
                tone="orange"
              />
            </StatBlock>

            <div className="mt-[14px]">
              <CoefficientRow
                label="Completion rate vs override rate"
                correlation={byCompletion}
                note="Share of path finished"
              />
              <CoefficientRow
                label="Hours completed vs override rate"
                correlation={byHours}
                note="Hours, not modules"
              />
            </div>

            <p className="mt-[14px] max-w-[64ch] text-copy leading-[1.6] text-body">
              Both coefficients are{" "}
              {(byCompletion?.r ?? 0) < 0 && (byHours?.r ?? 0) < 0
                ? "negative, which is the direction the hypothesis predicts: more learning, fewer overrides."
                : "shown with their signs as computed; read the direction from the coefficients rather than from the hypothesis."}{" "}
              <b>
                Neither is statistically significant, and the sample is far too
                small to support the claim.
              </b>{" "}
              {plural(points.length, "planner", "planners")} and{" "}
              {plural(analysis.decisionCount, "decision", "decisions")} is not
              a test of anything; it is the beginning of one.
            </p>

            <p className="mt-[10px] max-w-[64ch] text-copy leading-[1.6] text-body">
              The second problem is worse than the first. The override rate
              takes {overrideValues === 1 ? "a single value" : `only ${overrideValues} distinct values`} across the
              whole sample
              {atCeiling > 0
                ? `, and ${atCeiling} of ${points.length} planners sit at a 100% override rate`
                : ""}
              {overrideSpread === null
                ? ""
                : ` (standard deviation ${overrideSpread.toFixed(3)})`}
              . A variable that barely moves gives a correlation almost
              nothing to attach to, so the coefficient above is as much a
              description of that imbalance as it is of any relationship.
            </p>

            <p className="mt-[10px] max-w-[64ch] text-copy leading-[1.6] text-body">
              To test this properly you would need two things, not one.{" "}
              {requiredN === null ? (
                <>
                  A sample large enough to detect an effect this small, and an
                  override rate with real variation in it.
                </>
              ) : (
                <>
                  The relationship in the chart reaches p &lt; 0.05 at about{" "}
                  <b className="tabular">{requiredN} planners</b> with decision
                  history -- against {points.length} here -- and that is the
                  easy half. The hard half is the override rate: it has to
                  vary before a correlation can be measured against it, which
                  means waiting until enough planners approve recommendations
                  as issued for the ceiling to break up.
                </>
              )}
            </p>

            <p className="mt-[10px] max-w-[64ch] text-small font-semibold leading-[1.6] text-mute">
              {/* The count is read separately from the decisions themselves,
                  and that read can fail or come back empty under row level
                  security. A null is not a nought: saying "there are none"
                  when nobody checked is the sentence that stops a reader
                  checking, so an unknown count says it is unknown. */}
              {analysis.scenariosExcluded === null
                ? "Scenario rows are excluded from every figure above. How many are in scope could not be read on this request, so this panel does not claim there are none. "
                : analysis.scenariosExcluded > 0
                  ? `${analysis.scenariosExcluded} scenario ${analysis.scenariosExcluded === 1 ? "row is" : "rows are"} excluded from every figure above. `
                  : "Scenario rows are excluded from every figure above, and the count came back as none in scope right now. "}
              A scenario is an exploration, not a decision: it lands in the
              same append-only ledger so the record stays complete, but
              counting it would pad the denominator with work nobody committed
              and drag every override rate down.{" "}
              {analysis.plannersWithoutDecisions > 0
                ? `${analysis.plannersWithoutDecisions} more people in scope have a learning path and no committed decision at all. They are absent from the chart rather than plotted at zero, because "has not decided anything yet" is not "never overrides", and a fabricated point is exactly how a weak correlation becomes a strong-looking one.`
                : ""}
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** The share of committed human decisions that departed from the model. */
export function overrideShare(analysis: OverrideAnalysis): string {
  return formatFractionPct(
    analysis.decisionCount > 0
      ? analysis.overrideCount / analysis.decisionCount
      : null,
    1,
  );
}
