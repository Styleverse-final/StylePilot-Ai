import type { ReactNode } from "react";

/**
 * KpiRow / Kpi
 *
 * Ports `.kpirow` and `.kpi` from the production design system: a wrapping
 * 24px-gap row of label-over-value pairs, the value at 19px/800 with an
 * optional trailing pill. Numeric values carry tabular figures so columns
 * of KPIs do not shimmer between renders.
 */

export type KpiRowProps = {
  children?: ReactNode;
  className?: string;
};

export function KpiRow({ children, className }: KpiRowProps) {
  return (
    <div className={`flex flex-wrap gap-x-[24px] gap-y-[12px]${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

export type KpiProps = {
  label: ReactNode;
  value: ReactNode;
  /** Trailing badge, normally a <Pill>. */
  pill?: ReactNode;
  /** Tabular figures on the value. On by default. */
  tabular?: boolean;
  className?: string;
};

export function Kpi({ label, value, pill, tabular = true, className }: KpiProps) {
  return (
    <div className={className}>
      <div className="text-[11px] text-mute font-bold">{label}</div>
      <div className="flex items-center gap-[7px] mt-[3px]">
        <b
          className={`text-[19px] font-extrabold text-ink${tabular ? " tabular-nums" : ""}`}
        >
          {value}
        </b>
        {pill}
      </div>
    </div>
  );
}
