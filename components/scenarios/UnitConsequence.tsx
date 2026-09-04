import { Pill } from "@/components/Pill";

import {
  ARROW,
  TIMES,
  formatInr,
  formatSignedFractionPct,
  formatSignedInr,
  formatSignedUnits,
  formatUnits,
} from "./format";
import type { PlanEconomics, ScenarioComparison } from "./model";

/**
 * The unit consequence, given the weight the case gives it.
 *
 * This panel is the reason the screen exists. A scenario that lifts gross
 * margin by buying more inventory has not found free money -- it has moved
 * the cost into a line the margin figure does not contain, and the case
 * constrains that line. So the unit change is stated at the same visual
 * weight as the margin change, and the holding cost it implies is stated
 * immediately beside it with its arithmetic written out.
 *
 * The two are NOT netted. sv/value.py reports the holding cost beside the
 * margin rather than subtracting it, because holding cost is a constraint
 * with its own ceiling and not a margin adjustment, and netting them would
 * let a big enough margin swallow a unit problem the planner is supposed to
 * see. This panel keeps that discipline: two figures, side by side, both
 * signed, neither hiding the other.
 */

export type UnitConsequenceProps = {
  baseUnits: number;
  scenarioUnits: number;
  comparison: ScenarioComparison;
  economics: PlanEconomics;
  /** True when the levers are neutral, so there is nothing to compare yet. */
  atBase: boolean;
  className?: string;
};

function tone(value: number): "up" | "down" | "grey" {
  if (Math.round(value) === 0) return "grey";
  return value > 0 ? "up" : "down";
}

export function UnitConsequence({
  baseUnits,
  scenarioUnits,
  comparison,
  economics,
  atBase,
  className,
}: UnitConsequenceProps) {
  const { unitChange, unitChangePct, holdingCostChangeInr, marginChangeInr } =
    comparison;

  // A unit change and a holding-cost change always share a sign, so the
  // holding pill is toned by whether it HELPS: fewer units is a saving.
  const holdingTone =
    Math.round(holdingCostChangeInr) === 0
      ? "grey"
      : holdingCostChangeInr > 0
        ? "down"
        : "up";

  return (
    <div className={className}>
      <div className="flex flex-wrap items-end gap-x-[26px] gap-y-[14px]">
        <div>
          <div className="text-[10.5px] font-bold text-mute">
            Plan units, base {ARROW} scenario
          </div>
          <div className="mt-[2px] flex items-baseline gap-[9px]">
            <b className="text-[21px] font-extrabold tabular-nums text-mute">
              {formatUnits(baseUnits)}
            </b>
            <span className="text-[15px] font-bold text-mute">{ARROW}</span>
            <b className="text-[21px] font-extrabold tabular-nums text-ink">
              {formatUnits(scenarioUnits)}
            </b>
          </div>
        </div>

        <div>
          <div className="text-[10.5px] font-bold text-mute">Unit change</div>
          <div className="mt-[2px] flex items-baseline gap-[8px]">
            <b className="text-[21px] font-extrabold tabular-nums text-ink">
              {formatSignedUnits(unitChange)}
            </b>
            <Pill variant={tone(unitChange)} tabular>
              {formatSignedFractionPct(unitChangePct)}
            </Pill>
          </div>
        </div>

        <div>
          <div className="text-[10.5px] font-bold text-mute">
            Implied holding cost
          </div>
          <div className="mt-[2px] flex items-baseline gap-[8px]">
            <b className="text-[21px] font-extrabold tabular-nums text-ink">
              {formatSignedInr(holdingCostChangeInr)}
            </b>
            <Pill variant={holdingTone} tabular>
              {holdingCostChangeInr > 0 ? "more to carry" : "freed"}
            </Pill>
          </div>
        </div>

        <div>
          <div className="text-[10.5px] font-bold text-mute">
            Gross margin change
          </div>
          <div className="mt-[2px]">
            <b className="text-[21px] font-extrabold tabular-nums text-ink">
              {formatSignedInr(marginChangeInr)}
            </b>
          </div>
        </div>
      </div>

      <p className="mt-[13px] max-w-[96ch] text-copy leading-[1.6] text-body">
        {atBase ? (
          <>
            Both sides are the base plan, so there is nothing to weigh yet. Move
            a lever and this row fills in: the unit change and the holding cost
            it implies always appear beside the margin, never underneath it.
          </>
        ) : (
          <>
            <b className="text-ink">
              {formatSignedUnits(unitChange)} units {TIMES}{" "}
              {formatInr(economics.holdingCostPerUnitWeekInr)} per unit-week{" "}
              {TIMES} {economics.horizonWeeks} weeks ={" "}
              {formatSignedInr(holdingCostChangeInr)}.
            </b>{" "}
            That is stated beside the margin and not subtracted from it, because
            the case constrains inventory holding cost as its own ceiling rather
            than pricing it into margin -- and because a margin big enough to
            absorb the netting is exactly the case where the unit consequence
            most needs to stay visible.
            {marginChangeInr > 0 && unitChange > 0 ? (
              <>
                {" "}
                <b className="text-amber">
                  This scenario buys margin with inventory.
                </b>{" "}
                The margin is real, and so are the {formatSignedUnits(unitChange)}{" "}
                units sitting in a warehouse to earn it. Both numbers have to
                clear the review, not just the first one.
              </>
            ) : null}
            {marginChangeInr > 0 && unitChange < 0 ? (
              <>
                {" "}
                <b className="text-green">
                  This scenario lifts margin on fewer units.
                </b>{" "}
                Margin up and inventory down is the only shape of win that needs
                no argument about the holding-cost ceiling.
              </>
            ) : null}
          </>
        )}
      </p>

      <p className="mt-[8px] max-w-[96ch] text-[11px] font-semibold leading-[1.6] text-mute">
        The per-unit-week rate is read from policy_parameter, not typed in: it is
        quoted inside the cover-ceiling override reason, which is the same
        sentence the exceptions screen prints under its threshold banner. The
        horizon is {economics.horizonWeeks} weeks because that is how many
        horizon weeks the stored forecast rows behind this plan actually carry.
      </p>
    </div>
  );
}

export default UnitConsequence;
