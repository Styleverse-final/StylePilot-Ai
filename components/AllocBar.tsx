import type { ReactNode } from "react";

/**
 * AllocBarList / AllocBar
 *
 * Ports `.shift` and `.sb`. A four-column grid -- label, the current split,
 * the proposed split, and the signed delta -- on a shared scale so the two
 * bars in a row are directly comparable and so rows are comparable to each
 * other. Stone fill is today, orange is what the model proposes.
 *
 * The delta column is the whole point of the component: green when the
 * proposal adds, red when it takes away, always tabular so the column reads
 * as a column.
 */

export type AllocRow = {
  label: string;
  /** Current value. */
  now: number;
  /** Proposed value. */
  next: number;
};

export type AllocBarProps = {
  row: AllocRow;
  /** Shared upper bound for both bars. */
  max: number;
  /** Renders the delta. Defaults to a signed integer. */
  formatDelta?: (delta: number) => string;
  /** Accessible unit name for the two bars, e.g. "hours per week". */
  unitLabel?: string;
};

function defaultFormatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

export function AllocBar({
  row,
  max,
  formatDelta = defaultFormatDelta,
  unitLabel,
}: AllocBarProps) {
  const delta = row.next - row.now;
  const pct = (value: number): string =>
    `${max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0}%`;
  const suffix = unitLabel ? ` ${unitLabel}` : "";

  return (
    <div className="grid grid-cols-[126px_1fr_1fr_44px] gap-[10px] items-center py-[10px] border-b border-rule last:border-b-0 text-[12px] font-semibold text-ink">
      <span>{row.label}</span>
      <span
        className="h-[18px] bg-cream rounded-full overflow-hidden"
        role="img"
        aria-label={`Now ${row.now}${suffix}`}
      >
        <i
          className="block h-full rounded-full bg-[#D8CCC2]"
          style={{ width: pct(row.now) }}
        />
      </span>
      <span
        className="h-[18px] bg-cream rounded-full overflow-hidden"
        role="img"
        aria-label={`Next ${row.next}${suffix}`}
      >
        <i
          className="block h-full rounded-full bg-orange"
          style={{ width: pct(row.next) }}
        />
      </span>
      <span
        className={`text-right font-extrabold tabular-nums ${
          delta > 0 ? "text-green" : delta < 0 ? "text-red" : "text-mute"
        }`}
      >
        {formatDelta(delta)}
      </span>
    </div>
  );
}

export type AllocBarListProps = {
  rows: ReadonlyArray<AllocRow>;
  /**
   * Shared upper bound across every bar. Defaults to the largest value in
   * the set so the widest bar fills its track.
   */
  max?: number;
  /** Optional column captions rendered above the grid. */
  nowLabel?: ReactNode;
  nextLabel?: ReactNode;
  /** Muted trailing note, normally the formula behind the shift. */
  footnote?: ReactNode;
  formatDelta?: (delta: number) => string;
  unitLabel?: string;
  className?: string;
};

export function AllocBarList({
  rows,
  max,
  nowLabel,
  nextLabel,
  footnote,
  formatDelta,
  unitLabel,
  className,
}: AllocBarListProps) {
  const bound =
    max ??
    rows.reduce((acc, row) => Math.max(acc, row.now, row.next), 0);

  return (
    <div className={className}>
      {nowLabel === undefined && nextLabel === undefined ? null : (
        <div className="grid grid-cols-[126px_1fr_1fr_44px] gap-[10px] items-center pb-[8px] text-[10.5px] font-bold tracking-[0.04em] text-mute">
          <span />
          <span>{nowLabel}</span>
          <span>{nextLabel}</span>
          <span />
        </div>
      )}
      {rows.map((row) => (
        <AllocBar
          key={row.label}
          row={row}
          max={bound}
          formatDelta={formatDelta}
          unitLabel={unitLabel}
        />
      ))}
      {footnote === undefined ? null : (
        <div className="text-[11.5px] text-mute font-semibold leading-[1.6] mt-[12px]">
          {footnote}
        </div>
      )}
    </div>
  );
}
