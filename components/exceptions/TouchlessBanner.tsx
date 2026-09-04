import { Banner } from "../Banner";
import { DASH, formatCount, formatRatePct } from "./format";
import type { TouchlessRate } from "@/lib/queries";

/**
 * The touchless rate, stated the way the view states it.
 *
 * Two rates exist and quoting either one alone is a distortion: within the
 * work the agents are actually allowed to touch the rate is high, and across
 * every decision the product makes it is low, because the buy recommendations
 * are deliberately outside agent scope. The view already carries a sentence
 * that says exactly this, with the current numbers in it, and that sentence
 * is rendered here WORD FOR WORD. Rewriting it in the component would create
 * a second version of a governance claim that has to stay stable.
 *
 * v_touchless_rate moves every time the agents run. Nothing here is a
 * constant; if the view is empty the banner says the agents have not run
 * rather than printing a remembered figure.
 */

export type TouchlessBannerProps = {
  touchless: TouchlessRate | null;
};

export function TouchlessBanner({ touchless }: TouchlessBannerProps) {
  if (touchless === null) {
    return (
      <Banner variant="violet" icon="i" title="No agent run has been recorded.">
        The touchless rate is computed from the agent run log, and that log is
        empty, so there is no rate to state. Every recommendation below is
        waiting on a person.
      </Banner>
    );
  }

  const inScope = formatRatePct(touchless.in_scope_rate);
  const overall = formatRatePct(touchless.overall_rate);
  const acted = formatCount(touchless.agent_acted);
  const total = formatCount(touchless.recommendations_total);

  return (
    <Banner
      variant="violet"
      icon="i"
      title={`Touchless: ${inScope} in scope, ${overall} across all decisions -- ${acted} of ${total} closed without a person.`}
    >
      {touchless.framing ?? DASH}
    </Banner>
  );
}

export default TouchlessBanner;
