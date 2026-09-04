import { Banner } from "@/components/Banner";
import type { PolicyParameter } from "@/lib/queries";

import { formatFractionPct, formatTimestamp } from "./format";

/**
 * The service level, and the gap between what the economics computes and
 * what the brand applies.
 *
 * This banner is the reason the buy screen is not a black box. The
 * newsvendor ratio Cu/(Cu+Co) is a real derivation from this brand's own
 * unit economics and it lands well under the level actually in force. That
 * is not a bug in the derivation and it is not a constant somebody buried
 * in the code: it is a costed commercial decision, because the ratio prices
 * an unsold unit at exactly one markdown and never prices the customer who
 * found the shelf empty and shopped elsewhere.
 *
 * Every word of the explanation comes out of policy_parameter -- basis for
 * how the computed value was derived, override_reason for why the applied
 * value differs, set_by and set_at for who put it there and when. Nothing
 * is written into this component. If the row ever changes, the banner
 * changes with it.
 */

export type ServiceLevelBannerProps = {
  /** The `service_level` row for the planner's brand. */
  parameter: PolicyParameter | null;
  className?: string;
};

export function ServiceLevelBanner({
  parameter,
  className,
}: ServiceLevelBannerProps) {
  if (!parameter) {
    return (
      <Banner
        variant="violet"
        icon="i"
        title="No service level is on record for your brand."
        className={className}
      >
        The safety stock in this table was produced against a service level
        held in policy_parameter, and that row is not readable in your scope.
        Ask a CoE administrator before committing against these quantities.
      </Banner>
    );
  }

  const applied = formatFractionPct(parameter.applied_value);
  const computed = formatFractionPct(parameter.computed_value, 2);

  return (
    <Banner
      variant={parameter.is_overridden ? "amber" : "violet"}
      icon="%"
      title={
        parameter.is_overridden
          ? `Service level is ${applied}. The unit economics computes ${computed}.`
          : `Service level is ${applied}, straight from the unit economics.`
      }
      className={className}
    >
      {parameter.override_reason ?? parameter.basis}
      <span className="mt-[7px] block text-small font-semibold text-mute leading-[1.6]">
        Derivation: {parameter.basis}
      </span>
      <span className="mt-[4px] block text-small font-semibold text-mute leading-[1.6]">
        {`Set by ${parameter.set_by ?? "an unrecorded author"} on ${formatTimestamp(parameter.set_at)}.`}
      </span>
    </Banner>
  );
}

export default ServiceLevelBanner;
