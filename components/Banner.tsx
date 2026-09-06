"use client";

import { useId, useState, type ReactNode } from "react";

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
 *
 * THREE OPTIONAL SLOTS, ALL ADDED FOR THE ALLOCATION BANNER
 * --------------------------------------------------------
 * `eyebrow` is the micro label over the assertion. A banner in the middle of
 * a screen full of white cards has no other way to say what KIND of block it
 * is before the reader has finished the sentence, and "KEY INSIGHT" is a
 * different promise from a threshold note.
 *
 * `aside` is the right-hand slot. The allocation derivation runs to about
 * sixty words and, set as one full-width paragraph, the eye has nothing to
 * stop against; the aside gives the block a second edge and states the
 * consequence of the derivation in four words. It is deliberately the only
 * decorative slot in this component -- everything it holds is typography, and
 * a caller putting a figure in there would be quoting a number from outside
 * the paragraph that derived it.
 *
 * `collapsible` closes the body until the reader asks for it, leaving the
 * eyebrow, the assertion and the aside on one line.
 *
 * WHY THAT IS SAFE HERE AND WOULD NOT BE UNDER <Why>. The rule this system
 * follows is that a reader who never clicks must still learn something true,
 * which is why <Why> always leaves the first CLAUSE of its sentence showing.
 * A banner is already built that way: the title is the whole assertion --
 * "The band the agent acts inside was derived, not chosen" -- and the body is
 * the evidence for it. Someone who never opens it has read the claim; someone
 * who wants to argue with the claim opens it and finds the derivation
 * unchanged, down to the distribution behind the number. Nothing is cut, and
 * the sixty words stop standing between the header and the board.
 *
 * All three default to absent or off, so every banner already on the other
 * screens renders exactly as it did.
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

/** The same arrowhead the KPI cards disclose with, rotated when open. */
const CHEVRON = String.fromCharCode(0x2304);

const TITLE_CLASS = "text-[13px] font-extrabold text-ink";
const EYEBROW_CLASS =
  "text-micro font-extrabold uppercase tracking-[0.1em] text-mute";

export type BannerProps = {
  variant: BannerVariant;
  /** Short glyph inside the 26px circle, e.g. "i" or "%". */
  icon?: ReactNode;
  /** Micro uppercase label over the title, e.g. "KEY INSIGHT". */
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  /** Measure cap on the body paragraph, in ch. Defaults to 88. */
  measureCh?: number;
  /** Right-hand slot: the consequence of the derivation, in a few words. */
  aside?: ReactNode;
  /**
   * Keep the body closed until the reader opens it. The assertion, the
   * eyebrow and the aside stay visible; only the evidence moves behind the
   * press. Off by default.
   */
  collapsible?: boolean;
  className?: string;
};

export function Banner({
  variant,
  icon,
  eyebrow,
  title,
  children,
  measureCh = 88,
  aside,
  collapsible = false,
  className,
}: BannerProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  const hasBody = children !== undefined;
  const disclosing = collapsible && hasBody;
  const bodyVisible = hasBody && (!disclosing || open);

  /*
    Closed, this is the whole banner, so it is set tight: the eyebrow sits
    2px off the assertion instead of 4, and the assertion carries no bottom
    margin because there is nothing under it to be spaced from. The 3px
    returns with the body.
  */
  const heading = (
    <>
      {eyebrow === undefined ? null : (
        <div className={`${EYEBROW_CLASS} ${bodyVisible ? "mb-[4px]" : "mb-[2px]"}`}>
          {eyebrow}
        </div>
      )}
      <div className={`${TITLE_CLASS}${bodyVisible ? " mb-[3px]" : ""}`}>
        {title}
      </div>
    </>
  );

  return (
    <div
      className={`flex items-start gap-[13px] rounded-inner px-[18px] mb-[16px] ${
        bodyVisible ? "py-[16px]" : "py-[11px]"
      } ${SURFACE_CLASS[variant]}${className ? ` ${className}` : ""}`}
    >
      {icon === undefined ? null : (
        <span
          aria-hidden="true"
          className={`flex shrink-0 items-center justify-center w-[26px] h-[26px] rounded-full text-white text-[14px] font-extrabold ${GLYPH_CLASS[variant]}`}
        >
          {icon}
        </span>
      )}

      <div className="min-w-0 flex-1">
        {disclosing ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={bodyId}
            /*
              The chevron sits against the assertion rather than out at the
              right edge of the row. Open, the banner already has something at
              that edge -- the aside -- and a mark pushed there lands in the
              middle of the block belonging to neither; closed, the row is one
              short sentence and a chevron eighty per cent of the way across
              an empty band reads as unrelated to it. Against the sentence it
              works in both states. The row stays the full width, so the whole
              line is still the target.
            */
            className="flex w-full items-center gap-[9px] text-left"
          >
            <span className="min-w-0">{heading}</span>
            <span
              aria-hidden="true"
              className="flex h-[20px] w-[20px] flex-none items-center justify-center rounded-full text-[13px] leading-none text-mute transition-colors duration-[120ms] hover:bg-white/70"
            >
              <span
                className={`block transition-transform duration-[120ms]${
                  open ? " rotate-180" : ""
                }`}
              >
                {CHEVRON}
              </span>
            </span>
          </button>
        ) : (
          heading
        )}

        {bodyVisible ? (
          <p
            id={disclosing ? bodyId : undefined}
            className="text-[12.5px] text-body leading-[1.6]"
            style={{ maxWidth: `${measureCh}ch` }}
          >
            {children}
          </p>
        ) : null}
      </div>

      {/*
        THE ASIDE OPENS WITH THE BODY. It is the consequence of the
        derivation, so on a closed banner it is a picture and a slogan with
        the argument they summarise nowhere on screen -- and it was the
        tallest thing in the row, holding a one-line headline open to about
        twice the height it needs. Closed, this banner is the assertion and
        nothing else; the mark and the four words come back the moment the
        evidence does.
      */}
      {aside === undefined || !bodyVisible ? null : (
        <div className="ml-[8px] hidden shrink-0 self-center min-[1180px]:block">
          {aside}
        </div>
      )}
    </div>
  );
}
