import { Banner } from "../Banner";
import { DASH, formatWeeks } from "./format";
import type { CeilingView } from "./types";

/**
 * "10 weeks" / "1 week", or a dash where the policy row carries no value.
 * Spelled out rather than abbreviated because this one appears mid-sentence.
 */
function weeksWord(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return DASH;
  const spelled = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${spelled} ${value === 1 ? "week" : "weeks"}`;
}

/** The bare number, for the second half of a range that already said "weeks". */
function weeksNumber(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return DASH;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Where the cover ceiling comes from.
 *
 * The point of this banner is that the number an exception is measured
 * against was derived rather than chosen. Cover ceiling is half the
 * category's merchandisable life -- ten weeks for dresses up to seventeen
 * for accessories -- because in fashion the binding constraint is how long
 * the goods stay sellable, not what the shelf costs. Pure holding-cost
 * economics would allow an absurd amount of cover, which is exactly why the
 * discarded alternative is printed alongside the rule that won: a threshold
 * you can see the derivation of is a threshold you can argue with.
 *
 * Both strings come from policy_parameter -- `basis` is the derivation and
 * `override_reason` is the route that was costed and rejected -- and both
 * are rendered verbatim. The weeks in the summary sentence are read off the
 * same rows, so if a category's typical life is re-measured the sentence
 * changes with it.
 */

export type ThresholdBannerProps = {
  /** Ascending by ceiling. Empty when no policy rows are readable. */
  ceilings: readonly CeilingView[];
};

export function ThresholdBanner({ ceilings }: ThresholdBannerProps) {
  if (ceilings.length === 0) {
    return (
      <Banner
        variant="amber"
        icon="%"
        title="No cover ceiling is readable in your scope."
      >
        Exceptions below still carry the threshold they were raised against
        inside their own rationale, but the policy table that holds the
        derivation is not visible to your session, so this screen will not
        restate a number it cannot source.
      </Banner>
    );
  }

  const tightest = ceilings[0];
  const widest = ceilings[ceilings.length - 1];

  const range =
    ceilings.length === 1
      ? `${weeksWord(tightest.ceilingWeeks)} for ${tightest.categoryName.toLowerCase()}`
      : `${weeksWord(tightest.ceilingWeeks)} for ${tightest.categoryName.toLowerCase()}, ${weeksNumber(widest.ceilingWeeks)} for ${widest.categoryName.toLowerCase()}`;

  return (
    <>
      <Banner
        variant="amber"
        icon="%"
        title="Thresholds are derived, not set by hand."
      >
        Cover ceiling is category half-life -- {range} -- because in fashion
        the binding constraint is product life, not storage.{" "}
        {widest.discardedAlternative ?? ""}
      </Banner>

      <details className="mb-[16px] rounded-inner bg-white px-[18px] py-[14px]">
        <summary className="cursor-pointer text-[11.5px] font-extrabold text-orangeD">
          The {ceilings.length} category ceilings, with the derivation stored
          beside each one
        </summary>

        <div className="mt-[10px]">
          {ceilings.map((ceiling) => (
            <div
              key={ceiling.categoryId}
              className="py-[11px] border-b border-rule last:border-b-0"
            >
              <div className="flex flex-wrap items-baseline gap-[10px]">
                <span className="text-[12.5px] font-extrabold text-ink">
                  {ceiling.categoryName}
                </span>
                <span className="text-[11.5px] font-semibold text-mute tabular-nums">
                  cover ceiling {formatWeeks(ceiling.ceilingWeeks)} &middot;
                  stockout floor {formatWeeks(ceiling.floorWeeks)}
                </span>
              </div>
              <p
                className="mt-[4px] text-[11.5px] text-body leading-[1.6]"
                style={{ maxWidth: "96ch" }}
              >
                {ceiling.basis}
              </p>
              {ceiling.discardedAlternative === null ? null : (
                <p
                  className="mt-[3px] text-[11.5px] text-mute leading-[1.6]"
                  style={{ maxWidth: "96ch" }}
                >
                  {ceiling.discardedAlternative}
                </p>
              )}
            </div>
          ))}
        </div>
      </details>
    </>
  );
}

export default ThresholdBanner;
