import type { ReactNode } from "react";

/**
 * ModelFacts -- the registry row behind the chart, rendered as facts rather
 * than as reassurance.
 *
 * production.html carries a short block in the Workbench's right column
 * ("Ensemble / Backtest / Horizon discipline / Version"). Every line of it was
 * static text in the mock. Here each line is a column of the model_registry
 * row whose model_version is stamped on the forecast rows the chart just
 * drew, so the panel cannot describe a model other than the one that produced
 * the numbers.
 *
 * The horizon-discipline line is the one worth reading twice. It is not an
 * assertion that features are lagged far enough; it is the minimum lag found
 * in the stored feature list, compared against the horizon the model was
 * trained for. If a feature ever appears with a shorter lag than the horizon,
 * this panel says so instead of claiming discipline it cannot see.
 */

import { Why } from "@/components";

export type ModelFactsProps = {
  modelVersion: string;
  engine: string;
  targetColumn: string;
  horizonWeeks: number;
  accuracyMetric: string;
  /** model_registry.features array length; null when the column is empty. */
  featureCount: number | null;
  /** Rows the model was fitted on. */
  trainRows: number | null;
  /** Smallest lag, in weeks, found across the stored feature names. */
  minLagWeeks: number | null;
  /** ISO timestamp on the forecast rows the chart drew. */
  generatedAt: string;
  /** Pre-formatted, because the page owns the timezone decision. */
  generatedAtLabel: string;
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-[9px] border-b border-rule last:border-b-0">
      <div className="text-[11px] font-bold text-mute">{label}</div>
      <div className="mt-[2px] text-[12px] font-semibold leading-[1.5] text-ink">
        {children}
      </div>
    </div>
  );
}

/** Integer with Indian grouping, arithmetic so server and client agree. */
function grouped(value: number): string {
  const digits = String(Math.round(Math.abs(value)));
  const out =
    digits.length <= 3
      ? digits
      : `${digits
          .slice(0, digits.length - 3)
          .replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${digits.slice(digits.length - 3)}`;
  return value < 0 ? `-${out}` : out;
}

export function ModelFacts({
  modelVersion,
  engine,
  targetColumn,
  horizonWeeks,
  accuracyMetric,
  featureCount,
  trainRows,
  minLagWeeks,
  generatedAt,
  generatedAtLabel,
}: ModelFactsProps) {
  const disciplined = minLagWeeks !== null && minLagWeeks >= horizonWeeks;

  return (
    <div>
      <Fact label="Engine">
        <span className="font-mono text-[11px]">{engine}</span>
        {featureCount === null ? null : (
          <>
            {" "}
            &middot; {featureCount} features
          </>
        )}
        {trainRows === null ? null : (
          <>
            {" "}
            &middot; <span className="tabular-nums">{grouped(trainRows)}</span>{" "}
            training rows
          </>
        )}
      </Fact>

      {/* Three facts a reader consults rather than reads. Engine, version
          and generated-at stay out because they identify the run; these
          describe how it was built. */}
      <Why
        lead="Target, scoring and horizon discipline"
        label="show"
        className="block border-t border-rule pt-[10px]"
      >
      <Fact label="Target">
        <span className="font-mono text-[11px]">{targetColumn}</span>
        <div className="mt-[2px] text-[11.5px] font-semibold text-mute leading-[1.55]">
          Recovered demand, not sales. A week that ran out of stock would
          otherwise teach the model that demand stopped when the shelf did.
        </div>
      </Fact>

      <Fact label="Scored as">
        <span className="text-[11.5px] font-semibold text-body leading-[1.55]">
          {accuracyMetric}
        </span>
      </Fact>

      <Fact label="Horizon discipline">
        {minLagWeeks === null ? (
          <span className="text-[11.5px] font-semibold text-mute leading-[1.55]">
            The registry row stores no feature list, so the lag structure
            cannot be checked from here and is not claimed.
          </span>
        ) : (
          <>
            <span className="tabular-nums">
              every lagged feature is {minLagWeeks} weeks old or older
            </span>
            <div className="mt-[2px] text-[11.5px] font-semibold text-mute leading-[1.55]">
              {disciplined ? (
                <>
                  The horizon is {horizonWeeks} weeks and the shortest lag in
                  the stored feature list is {minLagWeeks}, so nothing inside
                  the forecast window can reach the model. Read at scoring
                  time, not asserted.
                </>
              ) : (
                <>
                  The horizon is {horizonWeeks} weeks but the shortest stored
                  lag is {minLagWeeks}, which is inside the window. This is a
                  leakage risk and is shown rather than smoothed over.
                </>
              )}
            </div>
          </>
        )}
      </Fact>
      </Why>

      <Fact label="Version">
        <span className="font-mono text-[11px]">{modelVersion}</span>
        <div className="mt-[2px] text-[11.5px] font-semibold text-mute">
          <time dateTime={generatedAt}>generated {generatedAtLabel}</time>
        </div>
      </Fact>
    </div>
  );
}

export default ModelFacts;
