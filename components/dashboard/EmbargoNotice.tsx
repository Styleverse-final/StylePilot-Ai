import { Banner, Pill } from "@/components";
import type { EmbargoStatus } from "@/lib/queries";

import { formatCount, formatDay, plural } from "./format";

/**
 * EmbargoNotice -- block 8.
 *
 * Forward weeks are sealed and unlock on a schedule. weeks_revealed is
 * computed against current_date inside the view, so the moment a week
 * unlocks this changes without anyone editing a constant.
 *
 * While nothing is revealed this is a quiet pill: it explains why every
 * accuracy figure in the product is a historical backtest rather than a
 * forward score. The instant weeks_revealed goes above zero it becomes an
 * amber banner, because that changes what may be claimed -- there is then a
 * forward number, and quoting the backtest as if it were the only evidence
 * would no longer be honest.
 */

export type EmbargoNoticeProps = {
  rows: readonly EmbargoStatus[];
};

export function EmbargoNotice({ rows }: EmbargoNoticeProps) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-[10px] rounded-pill bg-white px-[16px] py-[9px] text-[11.5px] font-semibold text-mute">
        <span className="font-bold text-mute">Forward actuals</span>
        <span>
          No embargo row is readable in your scope, so the reveal schedule
          cannot be stated here.
        </span>
      </div>
    );
  }

  const weeksTotal = rows.reduce((sum, row) => sum + (row.weeks_total ?? 0), 0);
  const weeksRevealed = rows.reduce(
    (sum, row) => sum + (row.weeks_revealed ?? 0),
    0,
  );

  const firstReveal = rows
    .map((row) => row.first_reveal_on)
    .filter((value): value is string => typeof value === "string")
    .sort()[0];
  const nextReveal = rows
    .map((row) => row.next_reveal_on)
    .filter((value): value is string => typeof value === "string")
    .sort()[0];

  if (weeksRevealed > 0) {
    const revealedWeeks = rows
      .map((row) => row.latest_revealed_week)
      .filter((value): value is string => typeof value === "string")
      .sort();
    const latest =
      revealedWeeks.length > 0
        ? revealedWeeks[revealedWeeks.length - 1]
        : undefined;

    return (
      <Banner
        variant="amber"
        icon="!"
        title={`${formatCount(weeksRevealed)} of ${formatCount(weeksTotal)} embargoed ${plural(weeksTotal, "week has", "weeks have")} been revealed.`}
      >
        Forward actuals now exist{latest ? ` up to ${latest}` : ""}, which
        changes what can be claimed on this screen. Every accuracy figure
        shown here is still a historical rolling-origin backtest, so it must
        not be quoted as a forward score until the revealed weeks have been
        scored on their own.
        {nextReveal ? ` The next week unlocks on ${formatDay(nextReveal)}.` : ""}
      </Banner>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px] rounded-pill bg-white px-[16px] py-[9px] text-[11.5px] font-semibold text-mute">
      <span className="font-bold text-mute">Forward actuals</span>
      <Pill variant="amber" tabular>
        {formatCount(weeksRevealed)} of {formatCount(weeksTotal)} weeks
        revealed
      </Pill>
      {firstReveal ? (
        <span>
          first reveal{" "}
          <span className="font-bold tabular-nums text-ink">
            {formatDay(firstReveal)}
          </span>
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className="inline-block h-[3px] w-[3px] shrink-0 rounded-full bg-rule2"
      />
      <span>
        Nothing forward has been scored yet, which is exactly why every
        accuracy number on this screen is a historical backtest.
      </span>
    </div>
  );
}

export default EmbargoNotice;
