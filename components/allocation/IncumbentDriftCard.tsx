import { Card, CardBody, CardHeader, formatUnits } from "@/components";

import { MIDDOT, formatPp, type RegionShift } from "./model";

/**
 * Why the incumbent rule drifts.
 *
 * Two sentences, and the second one is evidence rather than assertion: the
 * widest gap the rule leaves anywhere in the caller's scope, named by region
 * and cell, with the units it would have put in the wrong place. If the
 * scope is empty there is no claim to make, so the card says that instead of
 * reaching for an illustrative figure.
 */

export type IncumbentDriftCardProps = {
  widest: RegionShift | null;
  regionNames: Record<string, string>;
  categoryNames: Record<string, string>;
  channelNames: Record<string, string>;
};

export function IncumbentDriftCard({
  widest,
  regionNames,
  categoryNames,
  channelNames,
}: IncumbentDriftCardProps) {
  return (
    <Card>
      <CardHeader
        title="Why the incumbent rule drifts"
        subtitle="Last year's mix, applied to this year's demand"
      />
      <CardBody>
        <p className="text-[12.5px] leading-[1.6] text-body">
          The incumbent rule splits a category total by last year&apos;s
          regional mix, so it carries last year&apos;s error forward and cannot
          see a region that has grown or faded since.
          {widest === null ? (
            <> Nothing is in scope this week, so there is no gap to quote.</>
          ) : (
            <>
              {" "}
              The widest gap it leaves in your scope is{" "}
              <b className="font-extrabold tabular-nums text-ink">
                {formatPp(widest.sharePp)} pp
              </b>{" "}
              on{" "}
              <b className="font-extrabold text-ink">
                {regionNames[widest.regionId] ?? widest.regionId}
              </b>{" "}
              in {categoryNames[widest.categoryId] ?? widest.categoryId}{" "}
              {MIDDOT} {channelNames[widest.channelId] ?? widest.channelId},
              worth{" "}
              <b className="font-extrabold tabular-nums text-ink">
                {formatUnits(Math.abs(widest.reallocatedUnits))}
              </b>{" "}
              units the rule would have sent to the wrong region.
            </>
          )}
        </p>
      </CardBody>
    </Card>
  );
}

export default IncumbentDriftCard;
