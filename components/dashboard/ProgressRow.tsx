import type { ReactNode } from "react";

/**
 * ProgressRow
 *
 * Ports `.arow`, `.ah` and `.bar` from the production design system: a
 * label-and-value line over a 8px pill track, ruled underneath except on the
 * last row. Used by the impact tracker and the markdown attribution panel,
 * which are the two places the dashboard states a share rather than a count.
 *
 * `fraction` is 0..1 and is clamped, so a bar can never run past its track
 * and a missing denominator draws an empty track rather than a NaN width.
 */

export type ProgressTone = "orange" | "mute" | "violet";

const FILL_CLASS: Record<ProgressTone, string> = {
  orange: "bg-orange",
  mute: "bg-[#D8CCC2]",
  violet: "bg-violet",
};

export type ProgressRowProps = {
  label: ReactNode;
  /** Right-hand figure. Rendered tabular. */
  value: ReactNode;
  /** 0..1. Clamped. */
  fraction: number;
  tone?: ProgressTone;
  /** Muted line under the track: where the number comes from, or what covers it. */
  note?: ReactNode;
};

export function ProgressRow({
  label,
  value,
  fraction,
  tone = "orange",
  note,
}: ProgressRowProps) {
  const width =
    Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100;

  return (
    <div className="py-[11px] border-b border-rule last:border-b-0">
      <div className="mb-[7px] flex items-center justify-between gap-[10px] text-[12px]">
        <span className="font-bold text-ink">{label}</span>
        <span className="tabular-nums text-ink">{value}</span>
      </div>
      <div className="h-[8px] overflow-hidden rounded-pill bg-cream">
        <div
          className={`h-full rounded-pill ${FILL_CLASS[tone]}`}
          style={{ width: `${width}%` }}
        />
      </div>
      {note === undefined ? null : (
        <div className="mt-[4px] text-[11.5px] font-semibold leading-[1.6] text-mute">
          {note}
        </div>
      )}
    </div>
  );
}

export default ProgressRow;
