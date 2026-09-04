import type { ReactNode } from "react";

/**
 * StatBlock / Stat
 *
 * Ports `.stats` and `.st`. A wrapping 22px-gap row of small label-over-value
 * pairs: 10.5px/700 mute label, 14px/800 value. Used underneath exception
 * cards and buy rows to state cover, ceiling and units at risk without
 * promoting them to KPI weight.
 */

export type StatBlockProps = {
  children?: ReactNode;
  className?: string;
};

export function StatBlock({ children, className }: StatBlockProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-[22px] gap-y-[10px] mt-[12px]${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </div>
  );
}

export type StatTone = "default" | "orange" | "green" | "red" | "mute";

const TONE_CLASS: Record<StatTone, string> = {
  default: "text-ink",
  orange: "text-orange",
  green: "text-green",
  red: "text-red",
  mute: "text-mute",
};

export type StatProps = {
  label: ReactNode;
  value: ReactNode;
  tone?: StatTone;
  /** Tabular figures on the value. On by default. */
  tabular?: boolean;
  className?: string;
};

export function Stat({
  label,
  value,
  tone = "default",
  tabular = true,
  className,
}: StatProps) {
  return (
    <div className={className}>
      <div className="text-[10.5px] text-mute font-bold">{label}</div>
      <div
        className={`text-[14px] font-extrabold mt-[1px] ${TONE_CLASS[tone]}${
          tabular ? " tabular-nums" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
