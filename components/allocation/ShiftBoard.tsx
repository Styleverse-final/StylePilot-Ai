import { AllocBar, Pill, RoleGate, formatUnits } from "@/components";

import { DecisionControls } from "./DecisionControls";
import {
  MIDDOT,
  actionLabel,
  formatPp,
  formatTimestamp,
  statusLabel,
  verdictFor,
  type BandVerdict,
  type RegionShift,
  type SeriesGroup,
} from "./model";

/**
 * ShiftBoard -- the paired regional bars, and the band drawn through them.
 *
 * Ports `.shift` / `.sb`: a 126px label, two bars on one shared scale, and a
 * signed delta column. Stone is the incumbent prior-year rule, orange is the
 * optimiser, so the pair reads left to right as "what the rule would do" and
 * then "what the model proposes" for the same region.
 *
 * The delta column carries the SHARE movement in percentage points rather
 * than the unit difference, because pp is the unit the autonomy band is
 * written in -- putting anything else there would invite the reader to
 * measure the band against a number the band does not use. The unit
 * difference is stated beside it, where it cannot be confused for the band's
 * measure.
 *
 * The rail down the left of each row is the band verdict: violet where the
 * agent commits the movement itself, orange where it stops and asks. That is
 * the whole governance claim of this screen, so it is a visual property of
 * the row and not a column a reader has to hunt for.
 */

const RAIL_CLASS: Record<BandVerdict, string> = {
  within: "bg-violet",
  escalates: "bg-orange",
  unbanded: "bg-[#C9BDB2]",
};

/** Roles the decision policy will actually accept an insert from. */
const DECIDING_ROLES = [
  "planner",
  "category_manager",
  "planning_manager",
  "coe_admin",
] as const;

export type ShiftBoardProps = {
  group: SeriesGroup;
  /** region_id -> region_name, read from dim_region. */
  regionNames: Record<string, string>;
  /** autonomy_band.max_shift_pp for this brand's allocation agent. */
  ceilingPp: number | null;
  /** The caller's app_role, from the session. */
  role: string | null;
  /** Path revalidated after a decision. */
  revalidate: string;
};

export function ShiftBoard({
  group,
  regionNames,
  ceilingPp,
  role,
  revalidate,
}: ShiftBoardProps) {
  return (
    <div>
      <div className="grid grid-cols-[126px_1fr_1fr_44px] items-end gap-[10px] pb-[8px] pl-[13px] text-[10.5px] font-bold tracking-[0.04em] text-mute">
        <span>Region</span>
        <span>Incumbent rule</span>
        <span className="text-orangeD">Optimiser</span>
        <span className="text-right">Shift pp</span>
      </div>

      <ul className="list-none">
        {group.rows.map((shift) => (
          <ShiftRow
            key={shift.id}
            shift={shift}
            regionName={regionNames[shift.regionId] ?? shift.regionId}
            max={group.maxUnits}
            ceilingPp={ceilingPp}
            role={role}
            revalidate={revalidate}
          />
        ))}
      </ul>
    </div>
  );
}

type ShiftRowProps = {
  shift: RegionShift;
  regionName: string;
  max: number;
  ceilingPp: number | null;
  role: string | null;
  revalidate: string;
};

function ShiftRow({
  shift,
  regionName,
  max,
  ceilingPp,
  role,
  revalidate,
}: ShiftRowProps) {
  const verdict = verdictFor(shift.sharePp, ceilingPp);
  const moved = shift.reallocatedUnits;
  const decidedAt = formatTimestamp(shift.decidedAt);
  const rowLabel = `${regionName} in ${shift.categoryId} ${shift.channelId}`;

  return (
    <li className="flex gap-[10px] border-b border-rule last:border-b-0">
      <span
        aria-hidden="true"
        className={`mb-[12px] mt-[10px] w-[3px] flex-none rounded-full ${RAIL_CLASS[verdict]}`}
      />

      <div className="min-w-0 flex-1 [&>div:first-child]:border-b-0">
        <AllocBar
          row={{
            label: regionName,
            now: shift.incumbentUnits,
            next: shift.recommendedUnits,
          }}
          max={max}
          unitLabel="units"
          formatDelta={() => formatPp(shift.sharePp)}
        />

        <div className="pb-[12px] pl-[136px]">
          <div className="flex flex-wrap items-center gap-[7px]">
            <Pill variant={verdict === "escalates" ? "orange" : verdict === "within" ? "violet" : "grey"}>
              {verdict === "within"
                ? "inside the band"
                : verdict === "escalates"
                  ? "escalates to you"
                  : "no band published"}
            </Pill>
            <Pill variant="grey">{actionLabel(shift.action)}</Pill>
            <span
              className={`text-[11.5px] font-extrabold tabular-nums ${
                moved > 0 ? "text-green" : moved < 0 ? "text-red" : "text-mute"
              }`}
            >
              {moved > 0 ? "+" : ""}
              {formatUnits(moved)} units
            </span>
            {shift.status === null ? null : (
              <span className="text-[11.5px] font-semibold text-mute">
                {statusLabel(shift.status)}
                {shift.accountablePlanner
                  ? ` ${MIDDOT} ${shift.accountablePlanner} accountable`
                  : ""}
                {decidedAt ? ` ${MIDDOT} ${decidedAt}` : ""}
              </span>
            )}
          </div>

          {shift.rationale ? (
            <p className="mt-[7px] max-w-[76ch] text-[11.5px] font-semibold leading-[1.6] text-mute">
              {shift.rationale}
            </p>
          ) : null}

          {shift.overrideReason && shift.status !== "APPROVED" ? (
            <p className="mt-[7px] max-w-[64ch] rounded-quote bg-shell px-[14px] py-[9px] text-[12.5px] leading-[1.55] text-body">
              {shift.overrideReason}
            </p>
          ) : null}

          <div className="mt-[9px]">
            <RoleGate
              role={role}
              allow={DECIDING_ROLES}
              action="commit an allocation decision"
            >
              <DecisionControls
                recommendationId={shift.id}
                recommendedUnits={shift.recommendedUnits}
                rowLabel={rowLabel}
                revalidate={revalidate}
              />
            </RoleGate>
          </div>
        </div>
      </div>
    </li>
  );
}

export default ShiftBoard;
