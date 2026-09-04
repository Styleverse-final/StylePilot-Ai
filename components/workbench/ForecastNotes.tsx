/**
 * The two sentences the Workbench chart is not allowed to omit.
 *
 * Both are prose, both are built entirely from values the page read at
 * request time, and both exist because the chart above them shows something
 * a reader would otherwise mis-read.
 *
 *   CoverageNote  -- the P10-P90 band is calibrated, and the calibrated
 *                    figure rests on one fold fewer than the accuracy table.
 *                    Stating that here is cheaper than having someone
 *                    discover it in a model review.
 *
 *   CensoringNote -- greying a week is a claim about the data generating
 *                    process, so the claim is written out: below 95%
 *                    availability the shelf was empty, sales are a floor on
 *                    demand rather than a measurement of it, and that is why
 *                    the model's target column is recovered unconstrained
 *                    demand rather than sales.
 *
 * Neither component carries a default for any number. A missing figure
 * renders as an absent clause, never as a plausible one.
 */

import { Why } from "@/components";

export type CoverageNoteProps = {
  /** interval_coverage_calibrated, computed_value as a percentage. */
  coveragePct: number;
  /** The same row's applied_value as a percentage: the nominal band. */
  nominalPct: number | null;
  /** Folds behind the coverage figure -- one fewer than the accuracy table. */
  calibrationFolds: number;
  /** Folds behind the accuracy figure, for the contrast. */
  accuracyFolds: number;
  className?: string;
};

/** Percentage with one decimal, no locale, so SSR and hydration agree. */
function pct1(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function CoverageNote({
  coveragePct,
  nominalPct,
  calibrationFolds,
  accuracyFolds,
  className,
}: CoverageNoteProps) {
  return (
    <Why
      lead={
        <>
          <b className="text-ink">
            Band covers {pct1(coveragePct)} of realised weeks
          </b>
          {nominalPct === null ? null : <> against {pct1(nominalPct)} nominal</>}
        </>
      }
      label="how it is measured, and why 3 folds not 4"
      className={`block max-w-[88ch]${className ? ` ${className}` : ""}`}
    >
      Measured after split-conformal calibration rather than from the raw
      quantile heads. That figure is the mean of{" "}
      <b className="text-ink">{calibrationFolds} folds</b>, not the{" "}
      {accuracyFolds} behind the accuracy comparison beside it: conformal
      calibration fits its widening offset on the fold before, so the first
      fold has no prior fold to calibrate against and drops out. The two counts
      differ by design, and saying so is the only way the difference is not
      later read as an inconsistency.
    </Why>
  );
}

export type CensoringNoteProps = {
  /** Weeks on this axis with availability_ratio below the threshold. */
  censoredWeeks: number;
  /** Weeks of history drawn. */
  totalWeeks: number;
  /** The availability floor a week must clear to be treated as uncensored. */
  thresholdPct: number;
  /** Mean availability_ratio across the drawn history, as a percentage. */
  meanAvailabilityPct: number | null;
  /**
   * model_registry.target_column for the model that produced this forecast.
   * Null when the registry row could not be read; the sentence then makes the
   * general claim and drops the column name rather than guessing at it.
   */
  targetColumn: string | null;
  className?: string;
};

export function CensoringNote({
  censoredWeeks,
  totalWeeks,
  thresholdPct,
  meanAvailabilityPct,
  targetColumn,
  className,
}: CensoringNoteProps) {
  const share =
    totalWeeks > 0 ? (censoredWeeks / totalWeeks) * 100 : null;

  return (
    <Why
      lead={
        <>
          <b className="text-ink tabular-nums">
            {censoredWeeks} of {totalWeeks} weeks
          </b>{" "}
          demand-censored
          {share === null ? null : <> ({share.toFixed(1)}%)</>}
        </>
      }
      label="what that means for the history"
      className={`block max-w-[88ch]${className ? ` ${className}` : ""}`}
    >
      Those weeks ran below {pct1(thresholdPct)} availability
      {meanAvailabilityPct === null ? null : (
        <>, on a mean of {pct1(meanAvailabilityPct)}</>
      )}
      . The shelf was empty, so what sold is a floor on what was wanted rather
      than a measurement of it. That is why the model trains on{" "}
      {targetColumn === null ? (
        <>recovered unconstrained demand</>
      ) : (
        <span className="font-mono text-[11px] text-ink">{targetColumn}</span>
      )}{" "}
      and not on sales, and why a censored week is greyed rather than quietly
      averaged into the history.
    </Why>
  );
}
