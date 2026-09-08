import { Card, CardBody, CardHeader } from "@/components";

import type { DecisionRead, PersonProgress } from "./data";
import { formatFractionPct, formatHoursBare, plural } from "./format";

/**
 * The two panels that keep the completion-versus-override question honest
 * when a brand cannot answer it.
 *
 * THE GATE. Correlating learning completion with override behaviour needs
 * committed human decisions, and a correlation drawn over a handful of them
 * is a shape looking for a believer. Below MIN_DECISIONS_TO_CORRELATE the
 * scatter is not rendered at all; the two inputs it would have been built
 * from are shown instead, each with its own n. Two real numbers beat a blank
 * panel apologising -- and beat a fabricated trend line by more.
 *
 * DO NOT POOL BRANDS TO GET PAST THE GATE. EcoWeave's committed decisions
 * are not made by SpeedStyle's planners, and a correlation manufactured by
 * mixing them would attribute one brand's behaviour to the other's learning.
 * The group view renders each brand through this same gate separately.
 */

export const MIN_DECISIONS_TO_CORRELATE = 8;

function completionShare(people: readonly PersonProgress[]): number | null {
  let modules = 0;
  let completed = 0;
  for (const row of people) {
    modules += row.modules;
    completed += row.completed;
  }
  return modules > 0 ? completed / modules : null;
}

export function OverrideInputs({
  brandLabel,
  people,
  decisionCount,
  overrideCount,
}: {
  brandLabel: string;
  people: readonly PersonProgress[];
  decisionCount: number;
  overrideCount: number;
}) {
  const completion = completionShare(people);

  return (
    <Card>
      <CardHeader
        title={`${brandLabel}: the two inputs, uncorrelated`}
        subtitle={`${decisionCount} committed ${decisionCount === 1 ? "decision" : "decisions"} in this brand -- below the ${MIN_DECISIONS_TO_CORRELATE} the correlation needs`}
      />
      <CardBody>
        <div className="grid grid-cols-2 gap-[14px] max-[720px]:grid-cols-1">
          <div className="rounded-inner bg-shell px-[14px] py-[12px]">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-mute">
              Learning completion
            </div>
            <div className="mt-[3px] text-[22px] font-extrabold tabular-nums text-ink">
              {completion === null ? "--" : formatFractionPct(completion)}
            </div>
            <div className="mt-[2px] text-[10.5px] font-semibold text-mute">
              modules finished across{" "}
              {plural(people.length, "person", "people")} with a visible path
            </div>
          </div>
          <div className="rounded-inner bg-shell px-[14px] py-[12px]">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-mute">
              Override rate
            </div>
            <div className="mt-[3px] text-[22px] font-extrabold tabular-nums text-ink">
              {decisionCount === 0
                ? "--"
                : formatFractionPct(overrideCount / decisionCount)}
            </div>
            <div className="mt-[2px] text-[10.5px] font-semibold text-mute">
              {decisionCount === 0
                ? "no committed human decisions in this brand yet"
                : `${overrideCount} of ${plural(decisionCount, "decision", "decisions")} departed from the recommendation`}
            </div>
          </div>
        </div>
        <p className="mt-[10px] text-[11.5px] font-semibold leading-[1.55] text-mute">
          Too few decisions in this brand to correlate; both inputs are shown
          instead. The correlation panel appears on its own once{" "}
          {MIN_DECISIONS_TO_CORRELATE} committed decisions exist -- brands are
          never pooled to manufacture it sooner.
        </p>
      </CardBody>
    </Card>
  );
}

/**
 * One side-by-side row for the group role: the gap between brands is the
 * finding a group role exists to see, and it should not live behind a
 * switcher that shows one brand at a time.
 */
export function BrandComparison({
  people,
  read,
}: {
  people: readonly PersonProgress[];
  read: DecisionRead | null;
}) {
  const brands = ["SPD", "ECO"] as const;

  const rows = brands.map((brand) => {
    const cohort = people.filter((row) => row.person.brandId === brand);
    const ids = new Set(cohort.map((row) => row.person.employeeId));
    let decisions = 0;
    let overrides = 0;
    for (const decision of read?.decisions ?? []) {
      if (!ids.has(decision.plannerId)) continue;
      decisions += 1;
      if (decision.status !== "APPROVED") overrides += 1;
    }
    let hours = 0;
    for (const row of cohort) hours += row.completedHours;
    return {
      brand,
      people: cohort.length,
      completion: completionShare(cohort),
      hours,
      decisions,
      overrides,
    };
  });

  return (
    <Card className="mb-[16px]">
      <CardHeader
        title="SpeedStyle against EcoWeave"
        subtitle="Same measures, same denominator rules -- the gap is the finding"
      />
      <CardBody>
        <div className="grid grid-cols-2 gap-[14px] max-[720px]:grid-cols-1">
          {rows.map((row) => (
            <div key={row.brand} className="rounded-inner bg-shell px-[14px] py-[12px]">
              <div className="text-[12px] font-extrabold text-ink">
                {row.brand === "SPD" ? "SpeedStyle" : "EcoWeave"}
                <span className="ml-[7px] text-[10.5px] font-bold text-mute">
                  {plural(row.people, "person", "people")} with a visible path
                </span>
              </div>
              <div className="mt-[8px] grid grid-cols-3 gap-[8px]">
                <div>
                  <div className="text-[17px] font-extrabold tabular-nums text-ink">
                    {row.completion === null ? "--" : formatFractionPct(row.completion)}
                  </div>
                  <div className="text-[9.5px] font-bold uppercase tracking-[0.03em] text-mute">
                    Completion
                  </div>
                </div>
                <div>
                  <div className="text-[17px] font-extrabold tabular-nums text-ink">
                    {formatHoursBare(row.hours)}h
                  </div>
                  <div className="text-[9.5px] font-bold uppercase tracking-[0.03em] text-mute">
                    Delivered
                  </div>
                </div>
                <div>
                  <div className="text-[17px] font-extrabold tabular-nums text-ink">
                    {row.decisions === 0
                      ? "--"
                      : formatFractionPct(row.overrides / row.decisions)}
                  </div>
                  <div className="text-[9.5px] font-bold uppercase tracking-[0.03em] text-mute">
                    {row.decisions === 0
                      ? "No decisions"
                      : `Override (n=${row.decisions})`}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
