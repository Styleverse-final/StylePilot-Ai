import { Banner, Card, CardBody, CardHeader, Pill } from "@/components";

import { CROSSING_BEFORE_BLEND_PCT, CROSSING_BEFORE_SOURCE } from "./constants";
import type { Calibration } from "./data";
import { integer, pct, pctPoints, plural, toNumber } from "./format";

/**
 * INTERVAL CALIBRATION -- the most misreadable pair of numbers in the schema,
 * put on one screen deliberately.
 *
 * THE TRAP
 * --------
 * model_registry.metrics.p10_p90_coverage is 56.1% for SPD. It is the
 * empirical coverage of the p10-p90 band AS THE THREE QUANTILE MODELS
 * EMITTED IT: raw, pre-calibration, against an 80% nominal. That band was
 * never shipped. It never sized a safety stock, never appeared on a chart and
 * never reached a planner. Quoted as "interval quality" it says the product's
 * intervals miss a fifth of the time when they claim to miss a fifth; quoted
 * anywhere without the word "pre-calibration" it is simply wrong.
 *
 * The real figure is policy_parameter.interval_coverage_calibrated -- 83.4%
 * for SPD, 83.8% for ECO -- and it is the coverage of the band the buy plan
 * actually uses.
 *
 * The raw figure is shown HERE, and only here, because this is the screen
 * about calibration and the before/after IS the point. Everywhere it appears
 * it is labelled as the band that was never shipped.
 *
 * THE FOLD-COUNT DIFFERENCE, SAID RATHER THAN DISCOVERED
 * -----------------------------------------------------
 * Accuracy is a FOUR-fold mean. Coverage is a THREE-fold mean. Split-conformal
 * calibration fits its widening offset on a PRIOR fold, so fold 1 has nothing
 * to calibrate against and drops out; folds 2, 3 and 4 are calibrated on folds
 * 1, 2 and 3. Anyone who lines the two figures up and assumes a common window
 * has been misled by the layout, so the panel states the difference in its own
 * banner, and it also computes the raw mean over the SAME three folds so the
 * before and after are like for like.
 */

const RAW_ALL = "#D8CCC2";
const RAW_CAL = "#B4A99F";
const SHIPPED = "#D04A02";
const NOMINAL = "#5B4B8A";
const RULE = "#F0EBE5";
const MUTE = "#8D857D";

type CoverageBar = {
  key: string;
  label: string;
  value: number;
  colour: string;
  note: string;
};

function CoverageChart({
  bars,
  nominal,
  brandId,
}: {
  bars: readonly CoverageBar[];
  nominal: number | null;
  brandId: string;
}) {
  const width = 460;
  const rowHeight = 42;
  const padTop = 16;
  const padBottom = 26;
  const left = 8;
  const right = 46;
  const height = padTop + bars.length * rowHeight + padBottom;
  const span = width - left - right;

  const x = (fraction: number) => left + span * Math.max(0, Math.min(1, fraction));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Prediction interval coverage for ${brandId}: ${bars
        .map((bar) => `${bar.label} ${(bar.value * 100).toFixed(1)} percent`)
        .join(", ")}${nominal === null ? "" : `, against a ${(nominal * 100).toFixed(0)} percent nominal band`}`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
        <g key={tick}>
          <line
            x1={x(tick)}
            x2={x(tick)}
            y1={padTop - 6}
            y2={height - padBottom + 4}
            stroke={RULE}
            strokeWidth={1}
          />
          <text
            x={x(tick)}
            y={height - padBottom + 16}
            fontSize={8.5}
            fill={MUTE}
            textAnchor="middle"
            fontWeight={700}
          >
            {`${tick * 100}%`}
          </text>
        </g>
      ))}

      {nominal === null ? null : (
        <g>
          <line
            x1={x(nominal)}
            x2={x(nominal)}
            y1={padTop - 10}
            y2={height - padBottom + 4}
            stroke={NOMINAL}
            strokeWidth={1.4}
            strokeDasharray="4 3"
          />
          <text
            x={x(nominal)}
            y={padTop - 14}
            fontSize={8.5}
            fill={NOMINAL}
            textAnchor="middle"
            fontWeight={800}
          >
            {`${(nominal * 100).toFixed(0)}% nominal`}
          </text>
        </g>
      )}

      {bars.map((bar, index) => {
        const y = padTop + index * rowHeight;
        return (
          <g key={bar.key}>
            <text x={left} y={y + 10} fontSize={9} fill={MUTE} fontWeight={800}>
              {bar.label}
            </text>
            <rect
              x={left}
              y={y + 15}
              width={Math.max(1, x(bar.value) - left)}
              height={13}
              fill={bar.colour}
              rx={3}
            />
            <text
              x={x(bar.value) + 6}
              y={y + 25}
              fontSize={10}
              fill={bar.colour === RAW_ALL ? MUTE : "#231F1C"}
              fontWeight={800}
            >
              {`${(bar.value * 100).toFixed(1)}%`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Figure({
  label,
  value,
  pill,
  pillTone,
  children,
}: {
  label: string;
  value: string;
  pill?: string;
  pillTone?: "up" | "amber" | "grey" | "violet" | "orange";
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-rule py-[11px] last:border-b-0">
      <div className="flex items-baseline justify-between gap-[10px]">
        <span className="text-copy font-bold text-ink">{label}</span>
        <span className="flex items-center gap-[7px]">
          <b className="text-copy font-extrabold tabular text-ink">{value}</b>
          {pill ? <Pill variant={pillTone ?? "grey"}>{pill}</Pill> : null}
        </span>
      </div>
      {children ? (
        <p className="mt-[4px] max-w-[92ch] text-small font-semibold leading-[1.6] text-mute">
          {children}
        </p>
      ) : null}
    </div>
  );
}

export type CalibrationPanelProps = {
  calibration: Calibration;
  brandName: string;
};

export function CalibrationPanel({ calibration, brandName }: CalibrationPanelProps) {
  const shipped = toNumber(calibration.calibrated?.computed_value);
  const nominal = toNumber(calibration.calibrated?.applied_value);
  const widening = toNumber(calibration.widening?.computed_value);

  const bars: CoverageBar[] = [];
  if (calibration.rawCoverageAllFolds !== null) {
    bars.push({
      key: "raw-all",
      label: `Raw p10-p90, all ${calibration.rawFoldCount} folds — never shipped`,
      value: calibration.rawCoverageAllFolds,
      colour: RAW_ALL,
      note: "pre-calibration",
    });
  }
  if (calibration.rawCoverageCalibratedFolds !== null) {
    bars.push({
      key: "raw-cal",
      label: `Raw p10-p90, the same ${calibration.calibratedFoldCount} folds — never shipped`,
      value: calibration.rawCoverageCalibratedFolds,
      colour: RAW_CAL,
      note: "pre-calibration, like for like",
    });
  }
  if (shipped !== null) {
    bars.push({
      key: "shipped",
      label: `Calibrated p10-p90, ${calibration.calibratedFoldCount} folds — the band in the product`,
      value: shipped,
      colour: SHIPPED,
      note: "shipped",
    });
  }

  const lift =
    shipped !== null && calibration.rawCoverageCalibratedFolds !== null
      ? shipped - calibration.rawCoverageCalibratedFolds
      : null;

  return (
    <Card>
      <CardHeader
        title={`${brandName} · interval calibration`}
        subtitle="Split conformal, alpha 0.20, offset applied to both bounds"
        actions={
          <Pill variant="violet">
            coverage over {calibration.calibratedFoldCount} folds
          </Pill>
        }
      />

      <CardBody>
        <Banner
          variant="violet"
          icon="!"
          title={`Coverage is a ${calibration.calibratedFoldCount}-fold mean. Accuracy is a ${calibration.accuracyFoldCount}-fold mean. They are not the same window.`}
        >
          Split-conformal calibration fits its widening offset on a PRIOR fold,
          so fold 1 has nothing to calibrate against and is excluded: folds 2,{" "}
          {calibration.calibratedFoldCount > 2 ? "3 and 4 are " : "and 3 are "}
          calibrated on folds 1
          {calibration.calibratedFoldCount > 2 ? ", 2 and 3" : " and 2"}{" "}
          respectively. The accuracy figures elsewhere on this screen are a
          mean of {calibration.accuracyFoldCount} folds. Lining the two up as
          if they described the same weeks would be wrong, so the raw coverage
          restricted to the same {calibration.calibratedFoldCount} folds is
          charted below alongside the {calibration.rawFoldCount}-fold figure
          the registry stores.
        </Banner>

        {bars.length === 0 ? (
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            Neither the registry row nor policy_parameter carries a coverage
            figure for this brand, so nothing is charted. When they do, the
            pre-calibration band and the shipped band appear here side by side
            against the nominal.
          </p>
        ) : (
          <>
            <CoverageChart
              bars={bars}
              nominal={nominal}
              brandId={calibration.brandId}
            />
            <div className="mt-[6px] flex flex-wrap gap-[14px] text-small font-semibold text-body">
              <span className="flex items-center gap-[5px]">
                <i
                  aria-hidden="true"
                  className="inline-block h-[9px] w-[9px] rounded-[2px]"
                  style={{ backgroundColor: RAW_CAL }}
                />
                Pre-calibration &mdash; a band that was never shipped
              </span>
              <span className="flex items-center gap-[5px]">
                <i
                  aria-hidden="true"
                  className="inline-block h-[9px] w-[9px] rounded-[2px]"
                  style={{ backgroundColor: SHIPPED }}
                />
                Calibrated &mdash; the band the buy plan uses
              </span>
            </div>
          </>
        )}
      </CardBody>

      <CardBody className="border-t border-rule">
        <Figure
          label="Raw coverage, as the quantile models emitted it"
          value={pct(calibration.rawCoverageAllFolds)}
          pill="never shipped"
          pillTone="grey"
        >
          model_registry.metrics.p10_p90_coverage, a mean of{" "}
          {calibration.rawFoldCount} {plural(calibration.rawFoldCount, "fold")}.
          This describes the p10-p90 band BEFORE calibration &mdash; a band
          that never sized a safety stock, never appeared on a chart and never
          reached a planner. It is on this screen because the screen is about
          calibration and the before is half of a before-and-after. It is not
          a statement of interval quality, and it must never be quoted as one.
        </Figure>

        {calibration.rawCoverageCalibratedFolds === null ? null : (
          <Figure
            label={`The same raw band, over the ${calibration.calibratedFoldCount} folds calibration could be measured on`}
            value={pct(calibration.rawCoverageCalibratedFolds)}
            pill="like for like"
            pillTone="grey"
          >
            Computed here from metrics.p10_p90_coverage_by_fold with fold 1
            dropped, so that the before and the after describe the same weeks.
            This is the figure the calibration parameter&rsquo;s own basis
            text quotes as the starting point.
          </Figure>
        )}

        <Figure
          label="Calibrated coverage, the band the product uses"
          value={pct(shipped)}
          pill={
            nominal === null
              ? undefined
              : `${pct(nominal, 0)} nominal`
          }
          pillTone="up"
        >
          policy_parameter.interval_coverage_calibrated for {calibration.brandId}
          , a mean of {calibration.calibratedFoldCount}{" "}
          {plural(calibration.calibratedFoldCount, "fold")}.
          {lift === null
            ? null
            : ` Calibration moved coverage by ${(lift * 100).toFixed(1)} points on the identical folds.`}
          {shipped !== null && nominal !== null && shipped > nominal
            ? ` It runs ABOVE the nominal rather than below it, so the band is slightly conservative -- the safe direction for a number a planner commits stock against, which is why it is recorded and left uncorrected rather than tuned back down.`
            : null}
        </Figure>

        {widening === null ? null : (
          <Figure
            label="Widening offset applied to both bounds"
            value={`${integer(widening)} units`}
            pill="brand fallback"
            pillTone="violet"
          >
            The conformity score is s = max(p10 &minus; actual, actual &minus;
            p90) on the calibration fold, and the offset is its
            ceil((n+1)(1&minus;alpha))/n empirical quantile. Series with fewer
            than the minimum the pipeline requires pool to category and then to
            brand; this row is the brand-level fallback, and its own basis
            text &mdash; quoted in full in the policy audit at the foot of this
            screen &mdash; states that minimum. Per-series offsets sit
            alongside the forecast rows, not here.
            {calibration.meanIntervalWidthUnits === null
              ? null
              : ` The uncalibrated band averaged ${integer(
                  calibration.meanIntervalWidthUnits,
                )} units wide, so the offset is a material widening rather than a rounding.`}
          </Figure>
        )}
      </CardBody>

      <CardBody className="border-t border-rule">
        <div className="mb-[8px] text-label font-bold text-mute">
          Quantile crossing
        </div>
        <Figure
          label={
            calibration.quantileCount === null
              ? "Rows where the quantiles came out of order"
              : `Rows where the ${calibration.quantileCount} quantiles came out of order`
          }
          value={pctPoints(calibration.crossingPct)}
          pill={`from ${CROSSING_BEFORE_BLEND_PCT}%`}
          pillTone="up"
        >
          p10, p50 and p90 are{" "}
          {calibration.quantileCount === null ? "" : `${calibration.quantileCount} `}
          independently fitted models, so LightGBM can and does cross them near
          the edges of the feature space; a
          crossed row is repaired by sorting, and the rate is reported rather
          than hidden. It fell to{" "}
          <b className="text-ink">{pctPoints(calibration.crossingPct)}</b> of
          backtest rows once the interval models were blended the same way as
          the point forecast &mdash; a level-only band drawn around a blended
          p50 is two estimators pretending to be one, and the p50 lands outside
          its own band constantly.{" "}
          <b className="text-ink">
            The {CROSSING_BEFORE_BLEND_PCT}% before figure is the one number in
            this panel with no table behind it
          </b>
          : it was measured during development and recorded in a comment in{" "}
          <span className="font-mono text-[10.5px]">
            {CROSSING_BEFORE_SOURCE}
          </span>
          . The after figure is read from
          model_registry.metrics.quantile_crossing_pct_backtest.
        </Figure>

        {calibration.crossingByFold.length === 0 ? null : (
          <div className="mt-[10px] flex flex-wrap gap-[8px]">
            {calibration.crossingByFold.map((fold) => (
              <span
                key={fold.fold}
                className="rounded-pill bg-cream px-[9px] py-[3px] text-[10.5px] font-extrabold tabular text-body"
              >
                {fold.label} {fold.pct.toFixed(2)}%
              </span>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default CalibrationPanel;
