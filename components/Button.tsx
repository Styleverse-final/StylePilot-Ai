import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Button
 *
 * Ports `.btn` and its modifiers (.btnO .btnP .btnD .btnS). Pill shaped,
 * 32px tall at md and 28px at sm, 12px/700 label with a 6px icon gap.
 *
 * `buttonClasses` is exported so navigation elements (next/link anchors)
 * can wear the identical treatment without duplicating the token map.
 */

export type ButtonVariant = "default" | "orange" | "peach" | "dark";
export type ButtonSize = "md" | "sm";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: "bg-cream text-ink hover:bg-hover",
  orange: "bg-orange text-white hover:bg-orangeD",
  peach: "bg-peach text-ink hover:bg-[#F6D3BC]",
  dark: "bg-ink text-white hover:bg-ink2",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "h-[32px] px-[14px] text-[12px]",
  sm: "h-[28px] px-[11px] text-[11.5px]",
};

export function buttonClasses(
  variant: ButtonVariant = "default",
  size: ButtonSize = "md",
  className?: string,
): string {
  return `inline-flex items-center gap-[6px] rounded-full font-bold whitespace-nowrap transition-colors duration-[120ms] ${
    SIZE_CLASS[size]
  } ${VARIANT_CLASS[variant]}${className ? ` ${className}` : ""}`;
}

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children"
> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
  className?: string;
};

export function Button({
  variant = "default",
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export type ButtonRowProps = {
  children?: ReactNode;
  className?: string;
};

/** Ports `.brow`: a 7px-gap wrapping row of buttons. */
export function ButtonRow({ children, className }: ButtonRowProps) {
  return (
    <div className={`flex flex-wrap gap-[7px]${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
