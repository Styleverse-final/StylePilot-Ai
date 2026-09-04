import Link from "next/link";

import { Card, CardBody, CardHeader, Pill } from "@/components";

import type { DecisionSample, TrustCurve as TrustCurveData, WaveCurve } from "./data";
import { count, formatDate, pct, plural } from "./format";

/**
 * THE TRUST CURVE, WITH THE PROJECTION DRAWN AS A PROJECTION.
 *
 * WHY THIS IS PROGRAMME PROGRESS AND NOT OVERRIDE RATE
 * ----------------------------------------------------
 * The obvious chart here is override rate falling wave by wave. It cannot be
 * drawn honestly: planner_decision holds a couple of dozen HUMAN decisions
 * across the whole pilot, and the earliest wave contributes a handful of
 * them. An override rate computed on three decisions is a number with the
 * shape of evidence and none of the content, and drawing it would be the
 * single fastest way to lose the argument this screen exists to win. So the
 * curve is drawn on the one wave-level time series the pilot really has --
 * cumulative curriculum completion, thousands of dated rows -- and the
 * decision count is printed underneath at its true size so the reader can
 * see why the other chart is absent.
 *
 * THE X AXIS IS EACH WAVE'S OWN CLOCK
 * -----------------------------------
 * Elapsed weeks since that wave's first recorded activity, not a calendar.
 * The waves were onboarded months apart. On a calendar axis the later waves
 * would sit to the right and lower, and every reader would conclude
 * something about the people in them that is really the rollout schedule.
 *
 * THE PROJECTION IS NOT AN OBSERVATION, AND THE DRAWING SAYS SO FOUR TIMES
 * -----------------------------------------------------------------------
 * A hatched band behind it. A dashed stroke. Hollow markers instead of
 * filled ones. A label on the plot itself, plus its own legend entry and a
 * pill in the card header. Measured points and projected points arrive in
 * separate arrays from the data layer, so this component cannot draw one
 * with the other's stroke even by accident.
 */

const W = 620;
const H = 290;
const PAD = { l: 46, r: 16, t: 18, b: 40 } as const;

const INK = "#231F1C";
const MUTE = "#8D857D";
const RULE = "#F0EBE5";
const AMBER = "#9A6B08";
const AMBER_WASH = "#FBF0D2";

/** Measured series colours, in wave order. */
const MEASURED = ["#D04A02", "#2FA45B", "#5B4B8A", "#C0392B"] as const;

function colourFor(index: number): string {
  return MEASURED[index % MEASURED.length];
}

function path(
  points: readonly { week: number; share: number }[],
  x: (week: number) => number,
  y: (share: number) => number,
): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.week)} ${y(point.share)}`)
    .join(" ");
}

function Chart({ curve }: { curve: TrustCurveData }) {
  const drawable = curve.waves.filter((wave) => wave.measured.length > 1);
  if (drawable.length === 0) return null;

  const horizon = Math.max(
    1,
    curve.horizonWeeks,
    ...drawable.map((wave) => wave.projected.at(-1)?.week ?? 0),
  );
  const peak = Math.max(
    ...drawable.map((wave) => wave.measured.at(-1)?.share ?? 0),
    ...drawable.map((wave) => wave.projected.at(-1)?.share ?? 0),
  );
  const ceiling = Math.min(1, Math.max(0.2, Math.ceil(peak * 5 + 0.001) / 5));

  const x = (week: number) =>
    PAD.l + ((W - PAD.l - PAD.r) * week) / horizon;
  const y = (share: number) =>
    PAD.t + (H - PAD.t - PAD.b) * (1 - share / ceiling);

  const ticks: number[] = [];
  for (let value = 0; value <= ceiling + 1e-9; value += 0.2) ticks.push(value);

  const weekTicks: number[] = [];
  const step = horizon <= 12 ? 2 : horizon <= 26 ? 4 : 8;
  for (let week = 0; week <= horizon; week += step) weekTicks.push(week);
  if (weekTicks.at(-1) !== horizon) weekTicks.push(horizon);

  const projectedWave = drawable.find((wave) => wave.projected.length > 1);
  const splitWeek = projectedWave?.projected[0]?.week ?? null;

  // THE IN-PLOT LABELS ARE SIZED AGAINST THE ROOM THEY ACTUALLY HAVE.
  //
  // Where the projection begins depends on the rows, so the band it occupies
  // is whatever the data leaves. A fixed left-anchored caption ran off the
  // right edge of the viewBox the moment the youngest wave had caught up --
  // silently, because SVG clips rather than complains, and the one label on
  // this chart that must never go missing is the one saying which half is
  // not an observation. Both captions are right- and left-anchored into
  // their own half and drop a line, then drop out, as that half narrows. The
  // hatch, the dashed stroke, the hollow markers, the legend entry and the
  // header pill all still carry the distinction if a caption cannot fit.
  const splitX = splitWeek === null ? null : x(splitWeek);
  const bandWidth = splitX === null ? 0 : Math.max(0, W - PAD.r - splitX);
  const measuredWidth = splitX === null ? 0 : Math.max(0, splitX - PAD.l);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-labelledby="trust-curve-title trust-curve-desc"
      className="block"
    >
      <title id="trust-curve-title">
        Cumulative curriculum completion by pilot wave, on each wave&apos;s own clock
      </title>
      <desc id="trust-curve-desc">
        {drawable
          .map(
            (wave) =>
              `${wave.wave} reaches ${pct(wave.share, 1)} of its curriculum after ${
                wave.measured.at(-1)?.week ?? 0
              } weeks${wave.projected.length > 1 ? ", then is projected forward" : ", measured"}.`,
          )
          .join(" ")}
      </desc>

      <defs>
        <pattern
          id="projected-hatch"
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="7" height="7" fill={AMBER_WASH} />
          <line x1="0" y1="0" x2="0" y2="7" stroke={AMBER} strokeWidth="1" opacity="0.35" />
        </pattern>
      </defs>

      {/* The projected region, marked out before anything is drawn over it. */}
      {splitX === null ? null : (
        <>
          <rect
            x={splitX}
            y={PAD.t}
            width={bandWidth}
            height={H - PAD.t - PAD.b}
            fill="url(#projected-hatch)"
          />
          <line
            x1={splitX}
            x2={splitX}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke={AMBER}
            strokeWidth="1.4"
            strokeDasharray="3 3"
          />
          {bandWidth < 62 ? null : (
            <text
              x={W - PAD.r - 5}
              y={PAD.t + 12}
              fontSize="9.5"
              fontWeight="800"
              fill={AMBER}
              textAnchor="end"
              letterSpacing="0.06em"
            >
              PROJECTED
            </text>
          )}
          {bandWidth < 96 ? null : (
            <text
              x={W - PAD.r - 5}
              y={PAD.t + 24}
              fontSize="9.5"
              fontWeight="800"
              fill={AMBER}
              textAnchor="end"
              letterSpacing="0.06em"
            >
              NOT OBSERVED
            </text>
          )}
          {measuredWidth < 62 ? null : (
            <text
              x={splitX - 7}
              y={PAD.t + 12}
              fontSize="9.5"
              fontWeight="800"
              fill={MUTE}
              textAnchor="end"
              letterSpacing="0.06em"
            >
              MEASURED
            </text>
          )}
        </>
      )}

      {ticks.map((value) => (
        <g key={`y-${value.toFixed(2)}`}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(value)}
            y2={y(value)}
            stroke={RULE}
          />
          <text
            x={PAD.l - 7}
            y={y(value) + 3}
            fontSize="8.5"
            fontWeight="700"
            fill={MUTE}
            textAnchor="end"
          >
            {Math.round(value * 100)}%
          </text>
        </g>
      ))}

      {weekTicks.map((week) => (
        <text
          key={`x-${week}`}
          x={x(week)}
          y={H - PAD.b + 15}
          fontSize="8.5"
          fontWeight="700"
          fill={MUTE}
          textAnchor="middle"
        >
          {week}
        </text>
      ))}
      <text
        x={(PAD.l + W - PAD.r) / 2}
        y={H - 8}
        fontSize="9"
        fontWeight="700"
        fill={MUTE}
        textAnchor="middle"
      >
        weeks since that wave&apos;s first recorded activity
      </text>

      {drawable.map((wave, index) => {
        const colour = colourFor(index);
        const last = wave.measured.at(-1);
        return (
          <g key={wave.wave}>
            <path
              d={path(wave.measured, x, y)}
              fill="none"
              stroke={colour}
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            {last ? (
              <circle cx={x(last.week)} cy={y(last.share)} r="3.2" fill={colour} />
            ) : null}
            {wave.projected.length > 1 ? (
              <>
                <path
                  d={path(wave.projected, x, y)}
                  fill="none"
                  stroke={AMBER}
                  strokeWidth="2.4"
                  strokeDasharray="5 4"
                  strokeLinejoin="round"
                />
                {wave.projected.slice(1).map((point) => (
                  <circle
                    key={`p-${point.week}`}
                    cx={x(point.week)}
                    cy={y(point.share)}
                    r="2.6"
                    fill="#FFFFFF"
                    stroke={AMBER}
                    strokeWidth="1.4"
                  />
                ))}
              </>
            ) : null}
          </g>
        );
      })}

      <line
        x1={PAD.l}
        x2={PAD.l}
        y1={PAD.t}
        y2={H - PAD.b}
        stroke={INK}
        strokeWidth="1"
        opacity="0.15"
      />
    </svg>
  );
}

function LegendSwatch({ colour, dashed }: { colour: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="mr-[6px] inline-block h-[3px] w-[16px] align-[3px]"
      style={
        dashed
          ? {
              backgroundImage: `repeating-linear-gradient(to right, ${colour} 0 5px, transparent 5px 9px)`,
            }
          : { background: colour }
      }
    />
  );
}

function WaveLine({ wave, colour }: { wave: WaveCurve; colour: string }) {
  const weeks = wave.measured.at(-1)?.week ?? 0;
  return (
    <li className="flex flex-wrap items-baseline gap-x-[8px] text-small leading-[1.6] text-body">
      <span className="font-bold text-ink">
        <LegendSwatch colour={colour} />
        {wave.wave}
      </span>
      <span className="tabular">
        {pct(wave.share, 1)} of {count(wave.modules)} curriculum rows
      </span>
      <span className="text-mute tabular">
        {plural(wave.people, "person", "people")} · {weeks} weeks in ·{" "}
        started {formatDate(wave.startedOn)}
      </span>
    </li>
  );
}

export function TrustCurve({
  curve,
  sample,
}: {
  curve: TrustCurveData;
  sample: DecisionSample;
}) {
  const drawable = curve.waves.filter((wave) => wave.measured.length > 1);
  const projected = curve.waves.find((wave) => wave.projected.length > 1) ?? null;
  const projectedEnd = projected?.projected.at(-1) ?? null;
  const projectedStart = projected?.projected[0] ?? null;

  return (
    <Card>
      <CardHeader
        title="Trust, as far as it is measured"
        subtitle="Cumulative curriculum completion by pilot wave, on each wave's own clock"
        actions={
          projected === null ? (
            <Pill variant="grey">All measured</Pill>
          ) : (
            <Pill variant="amber">{projected.wave} forward is projected</Pill>
          )
        }
      />
      <CardBody>
        {drawable.length === 0 ? (
          <p className="max-w-[88ch] text-copy leading-[1.6] text-body">
            No dated completion rows are readable in your scope, so there is no
            curve to draw. Completion across the cohort is visible to planning
            managers and above; row level security on learning_completion hands
            a planner their own rows and nobody else&apos;s, which is one row per
            module on your own path and not enough to trace a wave. What would
            appear here is one line per pilot wave, cumulative share of that
            wave&apos;s curriculum against weeks since the wave started.
          </p>
        ) : (
          <>
            <Chart curve={curve} />

            <ul className="mt-[12px] flex flex-col gap-[5px] border-t border-rule pt-[12px]">
              {drawable.map((wave, index) => (
                <WaveLine key={wave.wave} wave={wave} colour={colourFor(index)} />
              ))}
              {projected === null ? null : (
                <li className="flex flex-wrap items-baseline gap-x-[8px] text-small leading-[1.6] text-body">
                  <span className="font-bold text-amber">
                    <LegendSwatch colour={AMBER} dashed />
                    {projected.wave}, projected
                  </span>
                  <span className="tabular">
                    {pct(projectedStart?.share ?? 0, 1)} at week{" "}
                    {projectedStart?.week ?? 0} to{" "}
                    {pct(projectedEnd?.share ?? 0, 1)} at week{" "}
                    {projectedEnd?.week ?? 0}
                  </span>
                  <span className="text-mute">
                    not an observation of anybody&apos;s week
                  </span>
                </li>
              )}
            </ul>

            {projected === null ? (
              <p className="mt-[12px] max-w-[92ch] text-small leading-[1.6] text-body">
                Every line above is measured. Nothing on this chart is
                projected, because the waves readable in your scope have all
                been running long enough to speak for themselves.
              </p>
            ) : (
              <p className="mt-[12px] max-w-[92ch] text-small leading-[1.6] text-body">
                The dashed line is an assumption, and it is worth saying which
                one: {projected.wave} is carried forward at the mean weekly
                pace{" "}
                {curve.referenceWaves.length > 0
                  ? curve.referenceWaves.join(" and ")
                  : "the earlier waves"}{" "}
                recorded over the same elapsed weeks. It borrows their PACE and
                not their LEVEL, which is why it does not converge on the top
                line. Read the gap rather than the endpoint: at week{" "}
                {projectedStart?.week ?? 0} this wave sits at{" "}
                <b className="tabular text-ink">{pct(projectedStart?.share ?? 0, 1)}</b>{" "}
                while{" "}
                {drawable
                  .filter((wave) => wave.wave !== projected.wave)
                  .map(
                    (wave) =>
                      `${wave.wave} was at ${pct(
                        wave.measured.find(
                          (point) => point.week === (projectedStart?.week ?? 0),
                        )?.share ?? wave.share,
                        1,
                      )}`,
                  )
                  .join(" and ")}
                . The earlier waves had largely plateaued by then, so projecting
                their late pace onto this one does not close that gap and the
                chart does not pretend otherwise. Whether the gap is the
                rollout schedule or something about this cohort is not
                answerable from these rows, and this screen does not answer it.
                {curve.undatedCompletions > 0 ? (
                  <>
                    {" "}
                    {count(curve.undatedCompletions)} completion rows carry no
                    date and are counted in the headline shares but sit on no
                    week of the curve.
                  </>
                ) : null}
              </p>
            )}
          </>
        )}

        <div className="mt-[14px] border-t border-rule pt-[12px]">
          <h4 className="text-[13px] font-extrabold text-ink">
            Why this is not the override-rate chart
          </h4>
          <p className="mt-[4px] max-w-[92ch] text-small leading-[1.6] text-body">
            Trust would be better measured by how often a planner departs from
            the recommendation, and that chart is not drawable yet. The pilot
            has recorded{" "}
            <b className="tabular text-ink">
              {plural(sample.decisions, "human decision", "human decisions")}
            </b>{" "}
            in your scope
            {sample.byWave.length > 0 ? (
              <>
                {" "}
                &mdash;{" "}
                {sample.byWave
                  .map(
                    (wave) =>
                      `${wave.wave} ${count(wave.decisions)} (${count(wave.departed)} departed from the recommendation)`,
                  )
                  .join(", ")}
              </>
            ) : null}
            {sample.unattributed > 0 ? (
              <>
                , plus {count(sample.unattributed)} not attributable to a wave
              </>
            ) : null}
            . An override rate computed on that many rows would move several
            points if one planner changed their mind, so this screen reports
            the count and declines to draw the trend. It appears here at its
            real size rather than in a footnote, because the size is the
            finding.
          </p>
          <p className="mt-[8px] max-w-[92ch] text-small leading-[1.6] text-body">
            The relationship between how far somebody is through their
            curriculum and how often they override is tested properly on{" "}
            <Link
              href="/learning"
              className="font-bold text-orangeD underline decoration-peach underline-offset-2 hover:decoration-orange"
            >
              Learning
            </Link>
            , against the same decision log, with the significance test and the
            sample size it does not survive. That analysis lives there and is
            not copied here; a second copy would drift from the first the day
            one of them changed.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

export default TrustCurve;
