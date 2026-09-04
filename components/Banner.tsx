import type { ReactNode } from "react";

/**
 * Banner
 *
 * Ports `.banner` and its two tones (.am amber, .vi violet). An 18px-radius
 * wash carrying a round glyph, a 13px/800 assertion and a 12.5px body
 * paragraph capped at a readable measure.
 *
 * Amber states a costed commercial override; violet states a derivation.
 * Both exist to say where a number came from, so the reader never has to
 * assume a constant was buried in the code.
 */

export type BannerVariant = "amber" | "violet";

const SURFACE_CLASS: Record<BannerVariant, string> = {
  amber: "bg-amberW",
  violet: "bg-violetW",
};

const GLYPH_CLASS: Record<BannerVariant, string> = {
  amber: "bg-amber",
  violet: "bg-violet",
};

export type BannerProps = {
  variant: BannerVariant;
  /** Short glyph inside the 26px circle, e.g. "i" or "%". */
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  /** Measure cap on the body paragraph, in ch. Defaults to 88. */
  measureCh?: number;
  className?: string;
};

export function Banner({
  variant,
  icon,
  title,
  children,
  measureCh = 88,
  className,
}: BannerProps) {
  return (
    <div
      className={`flex items-start gap-[13px] rounded-inner px-[18px] py-[16px] mb-[16px] ${
        SURFACE_CLASS[variant]
      }${className ? ` ${className}` : ""}`}
    >
      {icon === undefined ? null : (
        <span
          aria-hidden="true"
          className={`flex shrink-0 items-center justify-center w-[26px] h-[26px] rounded-full text-white text-[14px] font-extrabold ${GLYPH_CLASS[variant]}`}
        >
          {icon}
        </span>
      )}
      <div>
        <div className="text-[13px] font-extrabold text-ink mb-[3px]">{title}</div>
        {children === undefined ? null : (
          <p
            className="text-[12.5px] text-body leading-[1.6]"
            style={{ maxWidth: `${measureCh}ch` }}
          >
            {children}
          </p>
        )}
      </div>
    </div>
  );
}
