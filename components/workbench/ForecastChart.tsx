"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { Button, ButtonRow, Card, CardBody, CardHeader } from "@/components";

/**
 * ForecastChart -- the argument of the Workbench, drawn once.
 *
 * There is no charting library in this project and there is not going to be
 * one. production.html draws every chart as inline SVG with a viewBox and
 * this is a direct port of its mainChart builder: same 740x300 canvas, same
 * 42/14/16/30 padding, same z-order.
 *
 * The z-order is the argument, so it is written down rather than left to the
 * order the JSX happens to fall in:
 *
 *   1. gridlines and the forecast-horizon wash
 *   2. censored weeks, greyed, when the reader asks for them
 *   3. the P10-P90 band, orange at 0.14
 *   4. actual demand, solid ink 1.8
 *   5. seasonal naive, when the reader asks for it
 *   6. the manual baseline, dashed grey
 *   7. P50, solid orange 2.6, on top
 *
 * The gap between the orange P50 and the dashed grey manual line is what the
 * screen exists to show, so those two are the last things drawn and the only
 * two carrying weight above 1.6.
 *
 * Every number arrives as a prop. Nothing here invents a series -- including
 * seasonal naive, which is the value at t-52 lifted out of the history the
 * chart is already drawing.
 */

const W = 740;
const H = 300;
const PAD = { l: 42, r: 14, t: 16, b: 30 } as const;

const INK = "#231F1C";
const ORANGE = "#D04A02";
const ORANGE_DARK = "#A33A00";
const STONE = "#B4A99F";
const PEACH = "#FBE3D4";
const RULE = "#F0EBE5";
const MUTE = "#8D857D";
const VIOLET = "#5B4B8A";

export type ChartHistoryWeek = {
  isoWeek: string;
  /** Unconstrained demand for the week. Null where the row carries none. */
  actual: number | null;
  /** availability_ratio < 0.95: the week is demand-censored. */
  censored: boolean;
};

export type ChartForwardWeek = {
  isoWeek: string;
  horizonWeek: number;
  p10: number | null;
  /** The point forecast. */
  p50: number;
  p90: number | null;
  manual: number | null;
  /** Value at t-52, read out of `history`. Null when history is too short. */
  seasonalNaive: number | null;
};

export type ForecastChartProps = {
  title: string;
  subtitle: string;
  history: readonly ChartHistoryWeek[];
  forward: readonly ChartForwardWeek[];
  /** Rendered under the legend: the censored-week line and the coverage note. */
  children?: ReactNode;
};

type Point = { x: number; y: number };

/** A polyline through points, breaking rather than bridging a gap. */
function linePath(points: readonly (Point | null)[]): string {
  let out = "";
  let pen = false;
  for (const p of points) {
    if (p === null) {
      pen = false;
      continue;
    }
    out += `${pen ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    pen = true;
  }
  return out;
}

/** Indian-grouped integer, arithmetic rather than locale, so SSR agrees. */
function units(value: number): string {
  const digits = String(Math.round(Math.abs(value)));
  const grouped =
    digits.length <= 3
      ? digits
      : `${digits
          .slice(0, digits.length - 3)
          .replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${digits.slice(digits.length - 3)}`;
  return value < 0 ? `-${grouped}` : grouped;
}

function LegendSwatch({ style }: { style: CSSProperties }) {
  return (
    <i
      aria-hidden="true"
      className="inline-block mr-[6px] align-[3px]"
      style={style}
    />
  );
}

export function ForecastChart({
  title,
  subtitle,
  history,
  forward,
  children,
}: ForecastChartProps) {
  const [showBenchmark, setShowBenchmark] = useState<boolean>(false);
  const [showCensored, setShowCensored] = useState<boolean>(false);

  const censoredCount = useMemo(
    () => history.filter((h) => h.censored).length,
    [history],
  );
  const benchmarkAvailable = useMemo(
    () => forward.some((f) => f.seasonalNaive !== null),
    [forward],
  );

  const geometry = useMemo(() => {
    const n = history.length + forward.length;
    if (n < 2) return null;

    const values: number[] = [];
    for (const h of history) if (h.actual !== null) values.push(h.actual);
    for (const f of forward) {
      values.push(f.p50);
      if (f.p10 !== null) values.push(f.p10);
      if (f.p90 !== null) values.push(f.p90);
      if (f.manual !== null) values.push(f.manual);
      if (f.seasonalNaive !== null) values.push(f.seasonalNaive);
    }
    if (values.length === 0) return null;

    let top = 0;
    for (const v of values) if (v > top) top = v;
    const mx = top > 0 ? top * 1.06 : 1;

    const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * i) / (n - 1);
    const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / mx);

    return { n, mx, x, y };
  }, [history, forward]);

  const toggles = (
    <ButtonRow>
      <Button
        size="sm"
        variant={showBenchmark ? "dark" : "default"}
        aria-pressed={showBenchmark}
        disabled={!benchmarkAvailable}
        className={benchmarkAvailable ? undefined : " opacity-50 cursor-not-allowed"}
        onClick={() => setShowBenchmark((v) => !v)}
        title={
          benchmarkAvailable
            ? "Overlay the value at t-52, taken from the history already drawn"
            : "History is shorter than 52 weeks before the horizon, so there is no t-52 value to draw"
        }
      >
        {showBenchmark ? "Hide benchmark" : "Show benchmark"}
      </Button>
      <Button
        size="sm"
        variant={showCensored ? "dark" : "default"}
        aria-pressed={showCensored}
        disabled={censoredCount === 0}
        className={censoredCount === 0 ? " opacity-50 cursor-not-allowed" : undefined}
        onClick={() => setShowCensored((v) => !v)}
        title="Grey the weeks that ran below 95% availability"
      >
        {showCensored ? "Hide censored weeks" : "Show censored weeks"}
      </Button>
    </ButtonRow>
  );

  if (geometry === null) {
    return (
      <Card>
        <CardHeader title={title} subtitle={subtitle} />
        <CardBody>
          <p className="text-[12.5px] text-body leading-[1.6] max-w-[70ch]">
            This series carries no plottable weeks. Nothing is drawn rather
            than a chart drawn from an assumption.
          </p>
          {children}
        </CardBody>
      </Card>
    );
  }

  const { n, mx, x, y } = geometry;
  const j = history.length - 1;

  const lastActual =
    j >= 0
      ? (history[j]?.actual ??
        [...history].reverse().find((h) => h.actual !== null)?.actual ??
        null)
      : null;
  const anchor: Point | null =
    lastActual === null ? null : { x: x(j), y: y(lastActual) };

  const tick = (v: number) => (mx >= 2000 ? `${(v / 1000).toFixed(0)}k` : units(v));

  const historyPoints = history.map((h, i) =>
    h.actual === null ? null : { x: x(i), y: y(h.actual) },
  );

  const forwardX = (k: number) => x(history.length + k);

  const bandDrawable =
    forward.length > 0 && forward.every((f) => f.p10 !== null && f.p90 !== null);
  const bandPath = bandDrawable
    ? forward
        .map((f, k) => `${k ? "L" : "M"}${forwardX(k).toFixed(2)} ${y(f.p90 ?? 0).toFixed(2)}`)
        .join("") +
      [...forward]
        .reverse()
        .map((f, k) =>
          `L${forwardX(forward.length - 1 - k).toFixed(2)} ${y(f.p10 ?? 0).toFixed(2)}`,
        )
        .join("") +
      "Z"
    : "";

  const p50Path = linePath([
    anchor,
    ...forward.map((f, k) => ({ x: forwardX(k), y: y(f.p50) })),
  ]);

  const manualDrawable = forward.some((f) => f.manual !== null);
  const manualPath = linePath([
    anchor,
    ...forward.map((f, k) =>
      f.manual === null ? null : { x: forwardX(k), y: y(f.manual) },
    ),
  ]);

  const naivePath = linePath(
    forward.map((f, k) =>
      f.seasonalNaive === null ? null : { x: forwardX(k), y: y(f.seasonalNaive) },
    ),
  );

  const bandWidth = (W - PAD.l - PAD.r) / (n - 1);

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} actions={toggles} />
      <CardBody>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`${history.length} weeks of actual demand, then ${forward.length} weeks of P50 forecast with its P10 to P90 interval and the manual baseline`}
        >
          {/* 1. gridlines */}
          {[0, 1, 2, 3, 4].map((g) => {
            const v = (mx * g) / 4;
            return (
              <g key={g}>
                <line
                  x1={PAD.l}
                  x2={W - PAD.r}
                  y1={y(v)}
                  y2={y(v)}
                  stroke={RULE}
                />
                <text
                  x={PAD.l - 7}
                  y={y(v) + 3}
                  fontSize="9"
                  fill={MUTE}
                  textAnchor="end"
                  fontWeight="700"
                >
                  {tick(v)}
                </text>
              </g>
            );
          })}

          {/* 1b. the forecast horizon wash */}
          {forward.length > 0 ? (
            <>
              <rect
                x={x(Math.max(j, 0))}
                y={PAD.t}
                width={W - PAD.r - x(Math.max(j, 0))}
                height={H - PAD.t - PAD.b}
                fill={PEACH}
                opacity="0.35"
                rx="8"
              />
              <text
                x={x(Math.max(j, 0)) + 9}
                y={PAD.t + 13}
                fontSize="9.5"
                fill={ORANGE_DARK}
                fontWeight="800"
              >
                {`Forecast horizon - ${forward.length} weeks`}
              </text>
            </>
          ) : null}

          {/* 2. censored weeks */}
          {showCensored
            ? history.map((h, i) =>
                h.censored ? (
                  <rect
                    key={`c${h.isoWeek}`}
                    x={x(i) - bandWidth / 2}
                    y={PAD.t}
                    width={bandWidth}
                    height={H - PAD.t - PAD.b}
                    fill={MUTE}
                    opacity="0.16"
                  >
                    <title>{`${h.isoWeek} ran below 95% availability: demand-censored`}</title>
                  </rect>
                ) : null,
              )
            : null}

          {/* 3. the P10-P90 band */}
          {bandDrawable ? (
            <path d={bandPath} fill={ORANGE} opacity="0.14" />
          ) : null}

          {/* 4. actual demand */}
          <path
            d={linePath(historyPoints)}
            fill="none"
            stroke={INK}
            strokeWidth="1.8"
          />

          {/* 5. seasonal naive, the benchmark nobody constructed */}
          {showBenchmark && naivePath ? (
            <path
              d={naivePath}
              fill="none"
              stroke={VIOLET}
              strokeWidth="1.6"
              strokeDasharray="2 3"
            />
          ) : null}

          {/* 6. the manual baseline */}
          {manualDrawable ? (
            <path
              d={manualPath}
              fill="none"
              stroke={STONE}
              strokeWidth="1.6"
              strokeDasharray="5 3"
            />
          ) : null}

          {/* 7. P50 */}
          <path d={p50Path} fill="none" stroke={ORANGE} strokeWidth="2.6" />
          {forward.map((f, k) => (
            <circle
              key={f.isoWeek}
              cx={forwardX(k)}
              cy={y(f.p50)}
              r="3"
              fill={ORANGE}
            >
              <title>
                {`${f.isoWeek} - P50 ${units(f.p50)} units` +
                  (f.p10 !== null && f.p90 !== null
                    ? ` (P10 ${units(f.p10)} to P90 ${units(f.p90)})`
                    : "") +
                  (f.manual !== null ? ` - manual ${units(f.manual)}` : "")}
              </title>
            </circle>
          ))}

          {/* axis */}
          {history.length > 0 ? (
            <text
              x={PAD.l}
              y={H - 8}
              fontSize="9"
              fill={MUTE}
              fontWeight="700"
            >
              {history[0]?.isoWeek}
            </text>
          ) : null}
          {j >= 0 ? (
            <text
              x={x(j)}
              y={H - 8}
              fontSize="9"
              fill={MUTE}
              textAnchor="middle"
              fontWeight="700"
            >
              now
            </text>
          ) : null}
          {forward.length > 0 ? (
            <text
              x={W - PAD.r}
              y={H - 8}
              fontSize="9"
              fill={MUTE}
              textAnchor="end"
              fontWeight="700"
            >
              {forward[forward.length - 1]?.isoWeek}
            </text>
          ) : null}
        </svg>

        <div className="flex flex-wrap gap-[16px] mt-[10px] text-[11.5px] font-semibold text-body">
          <span>
            <LegendSwatch style={{ width: 16, height: 2, background: INK }} />
            Actual demand, {history.length} weeks
          </span>
          <span>
            <LegendSwatch style={{ width: 16, height: 3, background: ORANGE }} />
            P50 forecast
          </span>
          <span>
            <LegendSwatch
              style={{
                width: 16,
                height: 9,
                background: ORANGE,
                opacity: 0.2,
                verticalAlign: -1,
              }}
            />
            P10-P90
          </span>
          <span>
            <LegendSwatch style={{ width: 16, height: 2, background: STONE }} />
            Manual baseline, dashed
          </span>
          {showBenchmark ? (
            <span>
              <LegendSwatch
                style={{ width: 16, height: 2, background: VIOLET }}
              />
              Seasonal naive (t-52)
            </span>
          ) : null}
          {showCensored ? (
            <span>
              <LegendSwatch
                style={{
                  width: 16,
                  height: 9,
                  background: MUTE,
                  opacity: 0.22,
                  verticalAlign: -1,
                }}
              />
              Demand-censored week
            </span>
          ) : null}
        </div>

        {showBenchmark ? (
          <p className="mt-[10px] text-[12.5px] text-body leading-[1.6] max-w-[88ch]">
            The benchmark is the same week last year, read at t-52 out of the
            history already on this axis. It is not a second model and nothing
            was fitted to produce it, which is exactly why it is the
            comparison worth beating.
          </p>
        ) : null}

        {children}
      </CardBody>
    </Card>
  );
}

export default ForecastChart;
