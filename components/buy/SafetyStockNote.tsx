import { Banner } from "@/components/Banner";
import type { PolicyParameter } from "@/lib/queries";

import { formatFractionPct } from "./format";

/**
 * Where the safety stock in this table comes from, and how good the
 * interval behind it actually is.
 *
 * THE TRAP THIS COMPONENT EXISTS TO AVOID. model_registry.metrics carries a
 * p10_p90_coverage of about 56%, and that number is RAW -- it is the
 * coverage of the band before split-conformal calibration widened it, over
 * four folds. Quoting it as the interval quality would understate the
 * product; quoting the calibrated figure without saying what it is would
 * overstate it. The calibrated figure lives in policy_parameter under
 * `interval_coverage_calibrated` and it is the only one shown here.
 *
 * It is also a mean over one fewer fold than the accuracy table beside it,
 * and that is said out loud rather than left to be discovered: split
 * conformal fits its widening offset on a PRIOR fold, so the first fold has
 * nothing to calibrate against and drops out. Accuracy is four folds,
 * coverage is three, and the difference is structural rather than a
 * reporting choice.
 *
 * `safety_spread_factor` is the second half of the story. The derived value
 * and the value the live safety-stock path actually multiplies by differ,
 * and policy_parameter records the gap as open and dated rather than
 * closing it quietly inside a release. Where the row says so, this says so.
 */

export type SafetyStockNoteProps = {
  /** policy_parameter `interval_coverage_calibrated` for the brand. */
  coverage: PolicyParameter | null;
  /** policy_parameter `safety_spread_factor` for the brand. */
  spreadFactor: PolicyParameter | null;
  /**
   * Folds behind the accuracy headline on this screen, read from the model
   * registry. Coverage is calibrated on one fewer, for the reason above.
   */
  /** Null when the registry row carries no by_fold. The note then states
   *  the one-fold difference without inventing either count. */
  accuracyFolds: number | null;
  className?: string;
};

export function SafetyStockNote({
  coverage,
  spreadFactor,
  accuracyFolds,
  className,
}: SafetyStockNoteProps) {
  if (!coverage) {
    return (
      <Banner
        variant="violet"
        icon="i"
        title="Safety stock is derived from the forecast interval, not from a fixed multiplier."
        className={className}
      >
        The calibrated coverage of that interval is held in policy_parameter
        and is not readable in your scope, so the interval quality behind
        these quantities cannot be stated here. The raw pre-calibration
        coverage in the model registry is not a substitute for it and is
        deliberately not shown.
      </Banner>
    );
  }

  const measured = formatFractionPct(coverage.computed_value);
  const nominal = formatFractionPct(coverage.applied_value);
  const coverageFolds =
    accuracyFolds === null ? null : Math.max(1, accuracyFolds - 1);

  return (
    <Banner
      variant="violet"
      icon="i"
      title={`Safety stock comes from the calibrated interval. Coverage measures ${measured} against a nominal ${nominal}.`}
      className={className}
    >
      {coverageFolds === null ? (
        <>That coverage is measured over one fold fewer than the accuracy figure above reports.{" "}</>
      ) : (
        <>
          That coverage is a mean over {coverageFolds} folds, not the{" "}
          {accuracyFolds} the accuracy figure above reports.{" "}
        </>
      )}
      Split-conformal
      calibration fits its widening offset on a prior fold, so the first fold
      has nothing to calibrate against and is excluded; the two counts differ
      by design. The raw pre-calibration coverage in the model registry is a
      much lower number and is not the interval quality -- it describes a band
      that was never shipped.
      {spreadFactor?.is_overridden ? (
        <span className="mt-[7px] block text-small font-semibold text-mute leading-[1.6]">
          {`Open gap, recorded rather than closed: the derived spread factor is ${spreadFactor.computed_value} and the live safety-stock path still applies ${spreadFactor.applied_value}. ${spreadFactor.override_reason ?? ""}`}
        </span>
      ) : null}
    </Banner>
  );
}

export default SafetyStockNote;
