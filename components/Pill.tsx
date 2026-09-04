import type { ReactNode } from "react";

/**
 * Pill
 *
 * Ports `.pill` and its six tone modifiers (.pUp .pDn .pOr .pAm .pGy .pVi).
 * 999px radius, 3px/9px padding, 10.5px/800, never wraps.
 */

export type PillVariant =
  | "up"
  | "down"
  | "orange"
  | "amber"
  | "grey"
  | "violet";

const VARIANT_CLASS: Record<PillVariant, string> = {
  up: "bg-greenW text-green",
  down: "bg-redW text-red",
  orange: "bg-peach text-orangeD",
  amber: "bg-amberW text-amber",
  grey: "bg-cream text-mute",
  violet: "bg-violetW text-violet",
};

export type PillProps = {
  children?: ReactNode;
  variant?: PillVariant;
  /** Tabular figures for numeric pills such as "+4.6" or "-8.1". */
  tabular?: boolean;
  className?: string;
  title?: string;
};

export function Pill({
  children,
  variant = "grey",
  tabular = false,
  className,
  title,
}: PillProps) {
  return (
    <span
      title={title}
      className={`inline-block rounded-full px-[9px] py-[3px] text-[10.5px] font-extrabold whitespace-nowrap ${
        VARIANT_CLASS[variant]
      }${tabular ? " tabular-nums" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
    </span>
  );
}
