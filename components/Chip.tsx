"use client";

import { useCallback, useState, type ReactNode } from "react";

/**
 * Chip / ChipRow
 *
 * Ports `.chip` and `.chips`. A chip is a real toggle button, so its state
 * lives in aria-pressed rather than a class name: pressed chips invert to
 * ink-on-white, unpressed sit white-on-cream.
 *
 * Works two ways so a server component can drop one in without becoming a
 * client component itself:
 *   - uncontrolled: pass `defaultPressed`
 *   - controlled:   pass `pressed` and `onPressedChange`
 */

export type ChipProps = {
  children?: ReactNode;
  /** Controlled state. When supplied, `onPressedChange` drives updates. */
  pressed?: boolean;
  /** Uncontrolled initial state. Ignored when `pressed` is supplied. */
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export function Chip({
  children,
  pressed,
  defaultPressed = false,
  onPressedChange,
  disabled = false,
  className,
}: ChipProps) {
  const [internal, setInternal] = useState<boolean>(defaultPressed);
  const isControlled = pressed !== undefined;
  const isPressed = isControlled ? pressed : internal;

  const handleClick = useCallback(() => {
    const next = !isPressed;
    if (!isControlled) setInternal(next);
    onPressedChange?.(next);
  }, [isControlled, isPressed, onPressedChange]);

  return (
    <button
      type="button"
      aria-pressed={isPressed}
      disabled={disabled}
      onClick={handleClick}
      className={`px-[14px] py-[7px] rounded-full text-[12px] font-bold whitespace-nowrap transition-colors duration-[120ms] ${
        isPressed ? "bg-ink text-white" : "bg-white text-body hover:bg-hover"
      }${disabled ? " opacity-50 cursor-not-allowed" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </button>
  );
}

export type ChipRowProps = {
  children?: ReactNode;
  className?: string;
};

/** Ports `.chips`: a 7px-gap wrapping row with a 16px tail margin. */
export function ChipRow({ children, className }: ChipRowProps) {
  return (
    <div className={`flex flex-wrap gap-[7px] mb-[16px]${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
