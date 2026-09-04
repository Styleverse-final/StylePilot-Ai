"use client";

import { useMemo, useState } from "react";

import { Button, ButtonRow, Card, CardBody, CardHeader, Pill } from "@/components";

import {
  formatCorrelation,
  formatIndex,
  formatLead,
  formatMomentum,
  formatRatio,
  plural,
} from "./format";
import {
  SIGNAL_KINDS,
  verdictFor,
  type BandBoundary,
  type GateRule,
  type SignalKind,
  type SignalPair,
  type SignalWeek,
  type TrendBand,
} from "./types";

/**
 * THE SIGNAL HISTORY -- 104 weeks, drawn once, with the governor underneath.
 *
 * Inline SVG with a viewBox, like every chart in this application. There is
 * no charting library in the project and there is not going to be one.
 *
 * TWO PANELS, ONE X AXIS, ON PURPOSE. The upper panel is the four external
 * series. The lower panel is trend momentum, tinted week by week with the
 * confidence band that week carried, and ruled with the boundary recovered
 * from the rows. Stacking them on a shared axis is the argument: a reader
 * can watch momentum cross the rule and see the band change colour in the
 * same column, which is what turns "a Low band caps the grade" from an
 * assertion into something predictable.
 *
 * TWO Y AXES, ALSO ON PURPOSE. Search, social and competitor activity are
 * indices on a 0-100 scale. Competitor price is a ratio that lives near
 * 1.00. Drawing the ratio on the index axis would flatten it into a
 * horizontal line at the bottom of the chart and imply it never moves; it
 * gets the right-hand axis instead, and the axis is only drawn when the
 * series is on, so nobody reads a scale that has nothing on it.
 */

const W = 740;
const H = 404;

const PAD_L = 46;
const PAD_R = 50;

const MAIN_TOP = 20;
const MAIN_H = 208;
const MAIN_BOTTOM = MAIN_TOP + MAIN_H;

const MOM_TOP = 274;
const MOM_H = 96;
const MOM_BOTTOM = MOM_TOP + MOM_H;

const INK = "#231F1C";
const ORANGE = "#D04A02";
const VIOLET = "#5B4B8A";
const STONE = "#B4A99F";
const GREEN = "#2FA45B";
const RULE = "#F0EBE5";
const RULE2 = "#E5DED7";
const MUTE = "#8D857D";

const BAND_WASH: Record<TrendBand, string> = {
  High: "#DFF3E3",
  Medium: "#FBF0D2",
  Low: "#F9DEDA",
};

const BAND_PILL: Record<TrendBand, "up" | "amber" | "down"> = {
  High: "up",
  Medium: "amber",
  Low: "down",
};

type SeriesStyle = {
  kind: SignalKind;
  stroke: string;
  width: number;
  dash?: string;
};

const SERIES_STYLE: Record<SignalKind, SeriesStyle> = {
  search: { kind: "search", stroke: ORANGE, width: 2.4 },
  social: { kind: "social", stroke: VIOLET, width: 1.6 },
  competitorActivity: { kind: "competitorActivity", stroke: STONE, width: 1.6 },
  competitorPrice: {
    kind: "competitorPrice",
    stroke: GREEN,
    width: 1.6,
    dash: "5 3",
  },
};

function valueOf(week: SignalWeek, kind: SignalKind): number | null {
  switch (kind) {
    case "search":
      return week.search;
    case "social":
      return week.social;
    case "competitorActivity":
      return week.competitorActivity;
    case "competitorPrice":
      return week.competitorPrice;
  }
}

type Point = { x: number; y: number };

/** A polyline that BREAKS at a gap rather than bridging one. */
function linePath(points: readonly (Point | null)[]): string {
  let out = "";
  let pen = false;
  for (const point of points) {
    if (point === null) {
      pen = false;
      continue;
    }
    out += `${pen ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    pen = true;
  }
  return out;
}

export type SignalHistoryProps = {
  pairs: readonly SignalPair[];
  gates: Record<string, GateRule>;
  /** Only the series that carry a value somewhere in scope are offered. */
  populated: readonly SignalKind[];
  boundary: BandBoundary;
};

export function SignalHistory({
  pairs,
  gates,
  populated,
  boundary,
}: SignalHistoryProps) {
  const [selectedKey, setSelectedKey] = useState<string>(pairs[0]?.key ?? "");
  const [hidden, setHidden] = useState<ReadonlySet<SignalKind>>(
    // Everything except the price ratio, which owns the second axis and is
    // off by default so the first read of the chart is the three indices.
    () => new Set<SignalKind>(["competitorPrice"]),
  );

  const pair = useMemo(
    () => pairs.find((candidate) => candidate.key === selectedKey) ?? pairs[0] ?? null,
    [pairs, selectedKey],
  );

  const offered = SIGNAL_KINDS.filter((meta) => populated.includes(meta.kind));
  const shown = offered.filter((meta) => !hidden.has(meta.kind));

  const geometry = useMemo(() => {
    if (!pair || pair.weeks.length < 2) return null;
    const n = pair.weeks.length;
    const x = (index: number) => PAD_L + ((W - PAD_L - PAD_R) * index) / (n - 1);

    // Index axis: floored at zero, because these are indices and a zero
    // baseline is the honest one. The top is the largest value drawn, so
    // turning a series off can rescale the axis -- which is correct: the
    // axis describes what is on the chart, not what could be.
    let indexTop = 0;
    for (const week of pair.weeks) {
      for (const meta of shown) {
        if (meta.axis !== "index") continue;
        const value = valueOf(week, meta.kind);
        if (value !== null && value > indexTop) indexTop = value;
      }
    }
    const indexMax = indexTop > 0 ? indexTop * 1.08 : 1;
    const yIndex = (value: number) =>
      MAIN_TOP + MAIN_H * (1 - value / indexMax);

    // Ratio axis: bracketed around the values themselves, never around 0.
    let ratioLow = Infinity;
    let ratioHigh = -Infinity;
    for (const week of pair.weeks) {
      const value = week.competitorPrice;
      if (value === null) continue;
      if (value < ratioLow) ratioLow = value;
      if (value > ratioHigh) ratioHigh = value;
    }
    const ratioDrawable = Number.isFinite(ratioLow) && Number.isFinite(ratioHigh);
    const ratioPad = ratioDrawable ? Math.max((ratioHigh - ratioLow) * 0.12, 0.005) : 0;
    const ratioMin = ratioDrawable ? ratioLow - ratioPad : 0;
    const ratioMax = ratioDrawable ? ratioHigh + ratioPad : 1;
    const yRatio = (value: number) =>
      MAIN_TOP + MAIN_H * (1 - (value - ratioMin) / (ratioMax - ratioMin || 1));

    // Momentum: symmetric around zero so the sign reads off the midline, and
    // wide enough to contain the recovered boundary rules.
    let momentumTop = 0;
    for (const week of pair.weeks) {
      if (week.momentum === null) continue;
      const magnitude = Math.abs(week.momentum);
      if (magnitude > momentumTop) momentumTop = magnitude;
    }
    for (const edge of [boundary.highFloor, boundary.lowCeiling]) {
      if (edge !== null && Math.abs(edge) > momentumTop) momentumTop = Math.abs(edge);
    }
    const momentumMax = momentumTop > 0 ? momentumTop * 1.12 : 1;
    const yMomentum = (value: number) =>
      MOM_TOP + (MOM_H / 2) * (1 - value / momentumMax);

    return {
      n,
      x,
      yIndex,
      indexMax,
      yRatio,
      ratioMin,
      ratioMax,
      ratioDrawable,
      yMomentum,
      momentumMax,
      step: (W - PAD_L - PAD_R) / Math.max(n - 1, 1),
    };
  }, [pair, shown, boundary]);

  if (!pair) {
    return (
      <Card>
        <CardHeader title="Signal history" subtitle="Weekly, per brand and category" />
        <CardBody>
          <p className="max-w-[88ch] text-copy leading-[1.6] text-body">
            No signal series is readable in your scope, so there is nothing to
            chart. With a series in scope this panel draws its full weekly
            history -- search interest, social trend, competitor activity and
            the competitor price ratio -- over a momentum track tinted by the
            confidence band each week carried.
          </p>
        </CardBody>
      </Card>
    );
  }

  const verdict = verdictFor(pair, gates[pair.brandId]);
  const weeks = pair.weeks;

  const tickIndexes =
    weeks.length > 1
      ? [...new Set([0, 1, 2, 3, 4].map((k) => Math.round((k * (weeks.length - 1)) / 4)))]
      : [0];

  return (
    <Card>
      <CardHeader
        title={`${pair.categoryName} signal history`}
        subtitle={`${pair.brandName} ${MIDDOT_SEP} ${plural(weeks.length, "week", "weeks")}${
          weeks.length > 0
            ? ` ${MIDDOT_SEP} ${weeks[0]?.isoWeek} to ${weeks[weeks.length - 1]?.isoWeek}`
            : ""
        }`}
        actions={
          <div className="flex items-center gap-[8px]">
            {/* The lead never appears on this screen without its correlation,
                including in a chart header. */}
            <Pill
              variant={
                verdict === "weighted"
                  ? "up"
                  : verdict === "concurrent"
                    ? "amber"
                    : "grey"
              }
              tabular
            >
              {formatLead(pair.leadWeeks)} at r {formatCorrelation(pair.correlation)}
            </Pill>
            {pair.currentBand ? (
              <Pill variant={BAND_PILL[pair.currentBand]}>
                {pair.currentBand} band
              </Pill>
            ) : null}
          </div>
        }
      />
      <CardBody>
        <div className="mb-[12px]">
          <div className="mb-[6px] text-[10.5px] font-extrabold tracking-[0.04em] text-mute">
            SERIES
          </div>
          <ButtonRow>
            {offered.map((meta) => {
              const on = !hidden.has(meta.kind);
              return (
                <Button
                  key={meta.kind}
                  size="sm"
                  variant={on ? "dark" : "default"}
                  aria-pressed={on}
                  title={`Column ${meta.column}`}
                  onClick={() =>
                    setHidden((previous) => {
                      const next = new Set(previous);
                      if (next.has(meta.kind)) next.delete(meta.kind);
                      else next.add(meta.kind);
                      return next;
                    })
                  }
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-[3px] w-[12px] rounded-pill"
                    style={{ background: SERIES_STYLE[meta.kind].stroke }}
                  />
                  {meta.label}
                </Button>
              );
            })}
          </ButtonRow>
        </div>

        {geometry === null ? (
          <p className="max-w-[88ch] text-copy leading-[1.6] text-body">
            This series carries fewer than two weeks, so there is nothing to
            join into a line. Nothing is drawn rather than a chart drawn from
            one point and an assumption.
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label={`${plural(weeks.length, "week", "weeks")} of ${pair.brandName} ${pair.categoryName} signal history, over a trend momentum track tinted by the weekly confidence band`}
          >
            {/* ---- 1. band wash, drawn first so every line sits above it */}
            {weeks.map((week, index) =>
              week.band === null ? null : (
                <rect
                  key={`band-${week.isoWeek}`}
                  x={geometry.x(index) - geometry.step / 2}
                  y={MOM_TOP}
                  width={geometry.step}
                  height={MOM_H}
                  fill={BAND_WASH[week.band]}
                />
              ),
            )}

            {/* ---- 2. gridlines on the index axis */}
            {[0, 1, 2, 3, 4].map((k) => {
              const value = (geometry.indexMax * k) / 4;
              return (
                <g key={`grid-${k}`}>
                  <line
                    x1={PAD_L}
                    x2={W - PAD_R}
                    y1={geometry.yIndex(value)}
                    y2={geometry.yIndex(value)}
                    stroke={RULE}
                  />
                  <text
                    x={PAD_L - 8}
                    y={geometry.yIndex(value) + 3}
                    fontSize="9"
                    fill={MUTE}
                    textAnchor="end"
                    fontWeight="700"
                  >
                    {value.toFixed(0)}
                  </text>
                </g>
              );
            })}

            {/* ---- 3. the right-hand ratio axis, only when it carries a line */}
            {shown.some((meta) => meta.axis === "ratio") && geometry.ratioDrawable ? (
              <>
                {[0, 1, 2].map((k) => {
                  const value =
                    geometry.ratioMin + ((geometry.ratioMax - geometry.ratioMin) * k) / 2;
                  return (
                    <text
                      key={`ratio-${k}`}
                      x={W - PAD_R + 8}
                      y={geometry.yRatio(value) + 3}
                      fontSize="9"
                      fill={GREEN}
                      fontWeight="700"
                    >
                      {value.toFixed(2)}
                    </text>
                  );
                })}
                <text
                  x={W - PAD_R + 8}
                  y={MAIN_TOP - 7}
                  fontSize="8.5"
                  fill={GREEN}
                  fontWeight="800"
                >
                  ratio
                </text>
              </>
            ) : null}

            {/* ---- 4. the series themselves */}
            {shown.map((meta) => {
              const style = SERIES_STYLE[meta.kind];
              const points = weeks.map((week, index) => {
                const value = valueOf(week, meta.kind);
                if (value === null) return null;
                return {
                  x: geometry.x(index),
                  y: meta.axis === "ratio" ? geometry.yRatio(value) : geometry.yIndex(value),
                };
              });
              return (
                <path
                  key={meta.kind}
                  d={linePath(points)}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={style.width}
                  strokeDasharray={style.dash}
                  strokeLinejoin="round"
                />
              );
            })}

            {/* ---- 5. x axis ticks, shared by both panels */}
            {tickIndexes.map((index) => (
              <text
                key={`tick-${index}`}
                x={geometry.x(index)}
                y={H - 8}
                fontSize="9"
                fill={MUTE}
                fontWeight="700"
                textAnchor={
                  index === 0 ? "start" : index === weeks.length - 1 ? "end" : "middle"
                }
              >
                {weeks[index]?.isoWeek}
              </text>
            ))}

            {/* ---- 6. the momentum panel */}
            <text
              x={PAD_L}
              y={MOM_TOP - 9}
              fontSize="9.5"
              fill={INK}
              fontWeight="800"
            >
              Trend momentum, tinted by the confidence band that week carried
            </text>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={geometry.yMomentum(0)}
              y2={geometry.yMomentum(0)}
              stroke={RULE2}
            />
            {/* The recovered boundary, ruled across the momentum track. It is
                not read from a threshold table -- there is none -- it is the
                tightest bracket the rows on this screen allow. */}
            {boundary.separable && boundary.highFloor !== null ? (
              <>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={geometry.yMomentum(boundary.highFloor)}
                  y2={geometry.yMomentum(boundary.highFloor)}
                  stroke={GREEN}
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={W - PAD_R - 2}
                  y={geometry.yMomentum(boundary.highFloor) - 4}
                  fontSize="8.5"
                  fill={GREEN}
                  fontWeight="800"
                  textAnchor="end"
                >
                  High above {formatMomentum(boundary.highFloor)}
                </text>
              </>
            ) : null}
            {boundary.separable && boundary.lowCeiling !== null ? (
              <>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={geometry.yMomentum(boundary.lowCeiling)}
                  y2={geometry.yMomentum(boundary.lowCeiling)}
                  stroke="#C0392B"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={W - PAD_R - 2}
                  y={geometry.yMomentum(boundary.lowCeiling) + 11}
                  fontSize="8.5"
                  fill="#C0392B"
                  fontWeight="800"
                  textAnchor="end"
                >
                  Low below {formatMomentum(boundary.lowCeiling)}
                </text>
              </>
            ) : null}
            <path
              d={linePath(
                weeks.map((week, index) =>
                  week.momentum === null
                    ? null
                    : { x: geometry.x(index), y: geometry.yMomentum(week.momentum) },
                ),
              )}
              fill="none"
              stroke={INK}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />

            {/* ---- 7. one hover target per week, carrying every value in it */}
            {weeks.map((week, index) => (
              <rect
                key={`hit-${week.isoWeek}`}
                x={geometry.x(index) - geometry.step / 2}
                y={MAIN_TOP}
                width={geometry.step}
                height={MOM_BOTTOM - MAIN_TOP}
                fill="transparent"
              >
                <title>
                  {`${week.isoWeek}  search ${formatIndex(week.search)}  social ${formatIndex(
                    week.social,
                  )}  competitor activity ${formatIndex(
                    week.competitorActivity,
                  )}  competitor price ${formatRatio(
                    week.competitorPrice,
                  )}  momentum ${formatMomentum(week.momentum)}  band ${week.band ?? "unrecorded"}`}
                </title>
              </rect>
            ))}

            {/* panel separator */}
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={MAIN_BOTTOM + 18}
              y2={MAIN_BOTTOM + 18}
              stroke={RULE}
            />
          </svg>
        )}

        <div className="mt-[10px] flex flex-wrap gap-[16px] text-small font-semibold text-body">
          {shown.map((meta) => (
            <span key={meta.kind}>
              <i
                aria-hidden="true"
                className="mr-[6px] inline-block align-[3px]"
                style={{
                  width: 16,
                  height: SERIES_STYLE[meta.kind].width,
                  background: SERIES_STYLE[meta.kind].stroke,
                }}
              />
              {meta.label}
              <span className="ml-[5px] font-mono text-[10.5px] text-mute">
                {meta.column}
              </span>
            </span>
          ))}
          {(["High", "Medium", "Low"] as const).map((band) => (
            <span key={band}>
              <i
                aria-hidden="true"
                className="mr-[6px] inline-block align-[-1px]"
                style={{ width: 16, height: 9, background: BAND_WASH[band] }}
              />
              {band} band, {pair.bandCounts[band]} of{" "}
              {plural(weeks.length, "week", "weeks")}
            </span>
          ))}
        </div>

        <div className="mt-[14px]">
          <div className="mb-[6px] text-[10.5px] font-extrabold tracking-[0.04em] text-mute">
            SERIES IN YOUR SCOPE
          </div>
          <ButtonRow>
            {pairs.map((candidate) => {
              const on = candidate.key === pair.key;
              return (
                <Button
                  key={candidate.key}
                  size="sm"
                  variant={on ? "orange" : "default"}
                  aria-pressed={on}
                  onClick={() => setSelectedKey(candidate.key)}
                  title={`${candidate.brandName} ${candidate.categoryName}: ${formatLead(
                    candidate.leadWeeks,
                  )} at r ${formatCorrelation(candidate.correlation)}`}
                >
                  {candidate.categoryName}
                  <span
                    className={`text-[10px] font-extrabold tabular-nums ${
                      on ? "text-white/75" : "text-mute"
                    }`}
                  >
                    {candidate.brandId} r {formatCorrelation(candidate.correlation)}
                  </span>
                </Button>
              );
            })}
          </ButtonRow>
        </div>

        <p className="mt-[12px] max-w-[100ch] text-copy leading-[1.6] text-body">
          The two panels share one time axis so the governor can be read
          against the series that triggers it: momentum crossing a rule in the
          lower panel is the same week the band changes colour behind it. The
          upper panel&apos;s left axis is the 0-100 index scale the three index
          series use; competitor price is a ratio around 1.00 and takes the
          right-hand axis, drawn only when that series is on, because a scale
          with nothing on it invites a reading it cannot support.
        </p>
      </CardBody>
    </Card>
  );
}

const MIDDOT_SEP = "·";

export default SignalHistory;
