"use client";

import { useId, useState } from "react";

// Imported from their own modules rather than through the "@/components"
// barrel, as the exception queue's row does: this is a client component, and
// the barrel would pull every other screen's components into its bundle.
import { formatUnits } from "../DriverBars";
// The rupee formatter is IMPORTED, not copied. It carries the app's crore /
// lakh cut and its arithmetic Indian grouping (the same string on the server
// and after hydration), and a second one living here would be free to drift
// from the one the exception queue and the buy plan already spell money with.
// components/exceptions/format only reaches for ../DriverBars, so nothing in
// this direction is circular.
import { formatInr } from "../exceptions/format";
import { Pill, type PillVariant } from "../Pill";
import { RoleGate } from "../RoleGate";

import { DecisionControls } from "./DecisionControls";
import { ChevronRightIcon } from "./icons";
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
 * Ports `.shift` / `.sb`: a label column, two bars on one shared scale, and a
 * signed delta column. Stone is the incumbent prior-year rule, orange is the
 * optimiser, so the pair reads left to right as "what the rule would do" and
 * then "what the model proposes" for the same region.
 *
 * The delta column carries the SHARE movement in percentage points rather
 * than the unit difference, because pp is the unit the autonomy band is
 * written in -- putting anything else there would invite the reader to
 * measure the band against a number the band does not use. The unit
 * difference is stated in the expansion, where it cannot be confused for the
 * band's measure.
 *
 * The rail down the left of each row is the band verdict: violet where the
 * agent commits the movement itself, orange where it stops and asks. That is
 * the whole governance claim of this screen, so it is a visual property of
 * the row and not a column a reader has to hunt for.
 *
 * WHY THE ROW COLLAPSED
 * ---------------------
 * Every row used to render all of itself at once -- two band pills, the moved
 * units, the decision status line, the full rationale paragraph and the
 * Approve / Modify / Reject controls -- which came to roughly 160px a row.
 * Four regions filled a screen, and a cell with eight regions could not be
 * compared against itself without scrolling: two bars are only worth drawing
 * on a shared scale if the reader can see them at the same time.
 *
 * Collapsed, a row is one line: the verdict rail, the region, both bars, the
 * signed movement and what the optimiser calls it. That is enough to read the
 * shape of a cell. NOTHING WAS DELETED to get there -- every figure listed
 * above is behind the row's own chevron, and the decision controls moved into
 * the expansion for the reason the exception queue moved its own: committing
 * a reallocation is not a thing to do while skimming, and an Approve button
 * on all eight visible rows invites exactly that.
 */

const RAIL_CLASS: Record<BandVerdict, string> = {
  within: "bg-violet",
  escalates: "bg-orange",
  unbanded: "bg-[#C9BDB2]",
};

const VERDICT_LABEL: Record<BandVerdict, string> = {
  within: "inside the band",
  escalates: "escalates to you",
  unbanded: "no band published",
};

const VERDICT_PILL: Record<BandVerdict, PillVariant> = {
  within: "violet",
  escalates: "orange",
  unbanded: "grey",
};

/**
 * The action pill's tone follows the direction units travel, so the column
 * agrees with the signed movement beside it rather than restating it in a
 * second colour language. Anything the optimiser calls something else -- a
 * risk flag reaching this board, or no action at all -- stays grey.
 */
const ACTION_PILL: Partial<Record<string, PillVariant>> = {
  SHIFT_IN: "up",
  SHIFT_OUT: "down",
  HOLD: "grey",
};

/** Roles the decision policy will actually accept an insert from. */
const DECIDING_ROLES = [
  "planner",
  "category_manager",
  "planning_manager",
  "coe_admin",
] as const;

/**
 * Region, both bars, the movement, what it is called, and the disclosure.
 * Declared once and shared by the heading row and every data row, so a
 * column heading cannot drift away from the column it names.
 */
const GRID =
  "grid grid-cols-[132px_1fr_1fr_58px_88px_26px] items-center gap-[10px]";

/** The expansion lines up under the bars, not under the region label. */
const PANEL_INDENT = "pl-[142px]";

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
      <div className={`${GRID} pb-[9px] pl-[13px] text-th font-bold text-mute`}>
        <span>Region</span>
        <span>Incumbent rule</span>
        <span className="text-orangeD">Optimiser</span>
        <span className="text-right">Shift pp</span>
        <span>Action</span>
        <span />
      </div>

      <ul className="list-none border-t border-rule">
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

/**
 * Width on the cell's shared scale. A zero or missing bound draws nothing
 * rather than a full bar, because a bar drawn against no scale is a claim
 * about a proportion nobody measured.
 */
function widthOf(value: number, max: number): string {
  if (max <= 0) return "0%";
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

function ShiftRow({
  shift,
  regionName,
  max,
  ceilingPp,
  role,
  revalidate,
}: ShiftRowProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const verdict = verdictFor(shift.sharePp, ceilingPp);
  const moved = shift.reallocatedUnits;
  const decidedAt = formatTimestamp(shift.decidedAt);
  const rowLabel = `${regionName} in ${shift.categoryId} ${shift.channelId}`;

  return (
    <li
      className={`flex gap-[10px] border-b border-rule last:border-b-0 transition-colors duration-[120ms] ${
        open ? "bg-shell" : "hover:bg-shell"
      }`}
    >
      <span
        aria-hidden="true"
        className={`my-[10px] w-[3px] flex-none rounded-full ${RAIL_CLASS[verdict]}`}
      />
      <span className="sr-only">{VERDICT_LABEL[verdict]}</span>

      <div className="min-w-0 flex-1 pr-[6px]">
        <div className={`${GRID} py-[9px] text-[12px] font-semibold text-ink`}>
          <span className="truncate">{regionName}</span>

          <span
            className="h-[16px] overflow-hidden rounded-full bg-cream"
            role="img"
            aria-label={`Incumbent rule ${formatUnits(shift.incumbentUnits)} units`}
          >
            <i
              className="block h-full rounded-full bg-[#D8CCC2]"
              style={{ width: widthOf(shift.incumbentUnits, max) }}
            />
          </span>

          <span
            className="h-[16px] overflow-hidden rounded-full bg-cream"
            role="img"
            aria-label={`Optimiser ${formatUnits(shift.recommendedUnits)} units`}
          >
            <i
              className="block h-full rounded-full bg-orange"
              style={{ width: widthOf(shift.recommendedUnits, max) }}
            />
          </span>

          <span
            className={`text-right font-extrabold tabular-nums ${
              shift.sharePp > 0
                ? "text-green"
                : shift.sharePp < 0
                  ? "text-red"
                  : "text-mute"
            }`}
          >
            {formatPp(shift.sharePp)}
          </span>

          <span>
            <Pill
              variant={
                (shift.action === null
                  ? undefined
                  : ACTION_PILL[shift.action]) ?? "grey"
              }
            >
              {actionLabel(shift.action)}
            </Pill>
          </span>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={
              open
                ? `Hide the reasoning for ${rowLabel}`
                : `Show the reasoning and decision for ${rowLabel}`
            }
            className="flex h-[24px] w-[24px] items-center justify-center rounded-full text-mute transition-colors duration-[120ms] hover:bg-white hover:text-ink"
          >
            <span
              aria-hidden="true"
              className={`block transition-transform duration-[120ms]${
                open ? " rotate-90" : ""
              }`}
            >
              <ChevronRightIcon />
            </span>
          </button>
        </div>

        {open ? (
          <div id={panelId} className={`pb-[13px] pr-[10px] ${PANEL_INDENT}`}>
            <div className="flex flex-wrap items-center gap-[7px]">
              <Pill variant={VERDICT_PILL[verdict]}>
                {VERDICT_LABEL[verdict]}
              </Pill>
              <span
                className={`text-[11.5px] font-extrabold tabular-nums ${
                  moved > 0 ? "text-green" : moved < 0 ? "text-red" : "text-mute"
                }`}
              >
                {moved > 0 ? "+" : ""}
                {formatUnits(moved)} units
              </span>
              {/*
                THE MONEY SITS HERE AND NOWHERE ELSE ON THIS SCREEN -- not in
                the collapsed row, not on a KPI card. It is a derived figure
                standing beside the units it was derived from, and a reader
                who has opened the row is a reader who will also read the
                sentence under it saying what it is and is not. Lifted onto a
                card it would become the headline of the page, which is a
                claim about allocation that neither the model nor the stored
                data makes.

                formatInr already returns the app's dash for a null, so an
                unpriced series degrades here without a branch.
              */}
              <span className="text-[11.5px] font-extrabold tabular-nums text-ink">
                {/* Named for a screen reader only. A sighted reader takes the
                    meaning from the sentence directly beneath, which has the
                    room to say what the figure is NOT; a listener reaching
                    this span hears a bare rupee amount unless it is named
                    here, and an unnamed money figure is the one thing this
                    row cannot afford. */}
                <span className="sr-only">
                  Revenue moving with those units, derived:{" "}
                </span>
                {formatInr(shift.valueAtStakeInr)}
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

            {/*
              THE LABEL MATTERS MORE THAN THE FIGURE. Three things have to be
              true of it and all three are said in one line: the number is
              derived on this screen rather than read from
              recommendation.value_at_stake_inr, which is null on every
              allocation row and stays null; it is the revenue that travels
              with the units, not margin; and it is not incremental, because
              a reallocation moves demand between regions instead of creating
              any. Without that last clause a planner would read this as the
              upside of approving, and it is not -- it is the size of what is
              being moved.
            */}
            <p className="mt-[6px] max-w-[76ch] text-[11.5px] font-semibold leading-[1.6] text-mute">
              {shift.valueAtStakeInr === null
                ? "No selling price is published for this series, so the units above carry no rupee figure here rather than one borrowed from the brand average."
                : "Derived on this screen from this series' demand-weighted selling price: the revenue that travels with those units, not margin and not new demand, since the move takes them from another region rather than creating them."}
            </p>

            {shift.rationale ? (
              <p className="mt-[8px] max-w-[76ch] text-[11.5px] font-semibold leading-[1.6] text-mute">
                {shift.rationale}
              </p>
            ) : null}

            {shift.overrideReason && shift.status !== "APPROVED" ? (
              <p className="mt-[8px] max-w-[64ch] rounded-quote bg-white px-[14px] py-[9px] text-[12.5px] leading-[1.55] text-body">
                {shift.overrideReason}
              </p>
            ) : null}

            <div className="mt-[10px]">
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
        ) : null}
      </div>
    </li>
  );
}

export default ShiftBoard;
