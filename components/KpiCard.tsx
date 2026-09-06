"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

/**
 * KpiCard -- one tracked measure in the command centre header.
 *
 * WHAT A CARD IS FOR, AND WHY IT IS NOT THE FLAT <Kpi>
 * ---------------------------------------------------
 * The flat KPI row is right for the nine screens whose header carries two to
 * six reference figures a planner glances at. The dashboard is different: it
 * is the screen someone opens to find out how the programme is moving, and
 * four numbers with no direction on them do not answer that. A card gives
 * each measure room for the mark that shows its movement -- or, where nothing
 * has been measured twice, the mark that shows its position instead.
 *
 * COMPACT BY DEFAULT, AND DELIBERATELY SO. This strip sits above the hero
 * brief and the action queue, which are the work. Everything a reader needs
 * to decide whether to look further fits in ~140px; the rest -- the caveat on
 * a denominator, the fold count, the reason a figure has no history -- opens
 * on request and closes again. Nothing is deleted to achieve that.
 *
 * WHY A BUTTON AND NOT <details>
 * ------------------------------
 * Same reason <Why> gives: the native marker fights the design system, and
 * the disclosure state belongs in aria-expanded where a screen reader can
 * find it. This is the card-sized sibling of that component and behaves the
 * same way.
 *
 * TWO SURFACES. "tint" is the command centre's: the tone washed across the
 * whole card, which works when four cards each carry a different measure and
 * the reader is scanning for one of them. "plain" is the buy plan's: one
 * white surface for all five, a hairline rule, and the tone kept to the icon
 * tile alone. A strip of five differently tinted grounds reads as five
 * unrelated widgets; one surface reads as one instrument, and the colour
 * still tells you which measure you are looking at -- it is just carried by
 * the 34px tile instead of 260px of card.
 *
 * THE TONE IS NOT DECORATION. Green is the model against its benchmarks,
 * amber the money, violet the agents, orange the queue that needs a human,
 * red the thing that costs money if nobody moves -- the same colours those
 * things carry everywhere else in the app, so the strip teaches the palette
 * rather than inventing one for the header. Where a strip's cards are four
 * cuts of ONE subject rather than four subjects, that reasoning inverts and
 * `neutral` is the right tone for all of them; see its note below.
 *
 * TWO LAYOUTS, ONE CARD
 * ---------------------
 * "stacked" is the dashboard's: a tall card with room under the value for a
 * mark and the line that says what the mark plots. "inline" is the exception
 * queue's: the tile moves to the left of the label and value, and the card
 * collapses to about 80px, because those four measures have no series to
 * draw -- there is no retrain history behind a stockout count -- and a tall
 * card with nothing in its lower half is a card asking to be filled with
 * decoration. The disclosure, the mark and the basis all still work in both;
 * inline simply does not reserve the space when they are absent.
 */

export type KpiTone =
  | "green"
  | "amber"
  | "violet"
  | "orange"
  | "red"
  | "neutral";

/** Tile above the value (dashboard) or beside it (exception queue). */
export type KpiCardVariant = "stacked" | "inline";

/** Tone across the whole card, or tone on the tile over one white surface. */
export type KpiCardSurface = "tint" | "plain";

/**
 * How much room the card spends on its own chrome.
 *
 * "default" is what the buy plan and the allocation board use, and it is
 * right when five cards have around 1400px to share. "compact" is for a strip
 * that has to hold the same five in a narrower column: the tile drops from
 * 38px to 32, the padding from 14 to 11 and the disclosure from 20 to 18,
 * which is about 110px given back across five cards -- the difference between
 * one line and two.
 *
 * It also lets the label WRAP, which the default deliberately does not. That
 * pairing is the point: a nowrap label sets a floor under the card's width,
 * and a strip tuned to fit needs the label to be the thing that gives when an
 * estimate is off, rather than the thing that pushes a card onto a second
 * row. Nothing is truncated either way.
 *
 * Nothing shrinks that carries meaning: the value stays at 21px, the pill
 * beside it is untouched, and the basis line and disclosure are unchanged.
 */
export type KpiCardDensity = "default" | "compact";

type ToneStyle = {
  /** The card ground: the tone at low alpha, falling to white. */
  card: string;
  /** The icon tile. */
  tile: string;
  /** Colour the mark inherits. */
  mark: string;
};

const TONE: Record<KpiTone, ToneStyle> = {
  green: {
    card: "from-greenW/55 to-white",
    tile: "bg-greenW text-green",
    mark: "text-green",
  },
  amber: {
    card: "from-amberW/60 to-white",
    tile: "bg-amberW text-amber",
    mark: "text-amber",
  },
  violet: {
    card: "from-violetW/70 to-white",
    tile: "bg-violetW text-violet",
    mark: "text-violet",
  },
  orange: {
    card: "from-peach/60 to-white",
    tile: "bg-peach text-orange",
    mark: "text-orange",
  },
  red: {
    card: "from-redW/55 to-white",
    tile: "bg-redW text-red",
    mark: "text-red",
  },
  /**
   * No tint at all: a white card with the accent carried only by the tile.
   *
   * For a strip whose cards are FACETS OF ONE THING rather than four
   * different kinds of measure. The dashboard's four are a model score, a
   * money total, an agent rate and a queue depth -- four subjects, so four
   * colours teach the palette. The exception header's four are all counts of
   * the same queue, and giving each its own ground paints a rainbow that says
   * nothing: the reader has to learn that pink means stockout when the row's
   * own pill already says so in words. The icons stay distinct, because shape
   * can carry that distinction without spending a colour on it.
   */
  neutral: {
    card: "from-white to-white",
    tile: "bg-peach text-orange",
    mark: "text-orange",
  },
};

const CHEVRON = String.fromCharCode(0x2304); // down arrowhead

export type KpiCardProps = {
  /** Small muted label, e.g. "Forecast accuracy". */
  label: string;
  /** Pre-formatted display value. Rendered tabular. */
  value: ReactNode;
  /** Trailing badge beside the value, normally a <Pill>. */
  pill?: ReactNode;
  /** 18px glyph for the tile. Inherits the tone colour. */
  icon?: ReactNode;
  tone?: KpiTone;
  /** "stacked" is the tall dashboard card; "inline" puts the tile at left. */
  variant?: KpiCardVariant;
  /**
   * "tint" washes the tone across the card. "plain" keeps every card in a
   * strip on the same white surface and lets the tile carry the tone.
   */
  surface?: KpiCardSurface;
  /** "compact" gives back the chrome a five-card strip cannot spare. */
  density?: KpiCardDensity;
  /**
   * The movement or position mark: one of the four in ./Marks. Omitted when
   * the underlying series is empty -- a card with no mark is a card that has
   * nothing to show, which is information.
   */
  mark?: ReactNode;
  /**
   * One line under the mark naming what the mark plots, or what the value
   * rests on. Not a caption -- a basis.
   */
  basis?: ReactNode;
  /** Everything the compact card leaves out. Opens under it. */
  detail?: ReactNode;
  /** Where the figure is argued in full, normally "#panel-id" on this page. */
  href?: string;
  /** Link text in the opened panel. */
  hrefLabel?: string;
  className?: string;
};

const TOGGLE =
  "ml-auto flex flex-none items-center justify-center rounded-full leading-none text-mute transition-colors duration-[120ms] hover:bg-white hover:text-ink";
const TOGGLE_SIZE = "h-[20px] w-[20px] text-[13px]";
const TOGGLE_SIZE_COMPACT = "h-[18px] w-[18px] text-[12px]";

export function KpiCard({
  label,
  value,
  pill,
  icon,
  tone = "green",
  variant = "stacked",
  surface = "tint",
  density = "default",
  mark,
  basis,
  detail,
  href,
  hrefLabel,
  className,
}: KpiCardProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const style = TONE[tone];
  const hasPanel = detail !== undefined || href !== undefined;
  const inline = variant === "inline";
  const plain = surface === "plain";
  // Compact is an inline/plain refinement only. The stacked card has a mark
  // and a basis under its value and is never the thing fighting for width.
  const tight = density === "compact" && inline && plain;

  // The plain card lifts a little under the pointer. It is the only motion on
  // the strip and it is 160ms of shadow, which is what makes a surface feel
  // like an object rather than a rectangle; nothing moves that would shift
  // the figures under a reader's eye.
  const ground = plain
    ? "bg-white border border-rule shadow-raised transition-shadow duration-[160ms] hover:shadow-card"
    : `bg-gradient-to-br ${style.card} shadow-raised`;

  const tile =
    icon === undefined ? null : (
      <span
        aria-hidden="true"
        className={`flex flex-none items-center justify-center ${
          inline
            ? plain
              ? tight
                ? "h-[32px] w-[32px] rounded-[11px]"
                : "h-[38px] w-[38px] rounded-[13px]"
              : "h-[36px] w-[36px] rounded-[12px]"
            : "h-[30px] w-[30px] rounded-[10px]"
        } ${style.tile}`}
      >
        {icon}
      </span>
    );

  const toggle = hasPanel ? (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      aria-expanded={open}
      aria-controls={id}
      aria-label={open ? `Hide detail for ${label}` : `Detail for ${label}`}
      className={`${TOGGLE} ${tight ? TOGGLE_SIZE_COMPACT : TOGGLE_SIZE}`}
    >
      <span
        aria-hidden="true"
        className={`block transition-transform duration-[120ms]${
          open ? " rotate-180" : ""
        }`}
      >
        {CHEVRON}
      </span>
    </button>
  ) : null;

  const figure = (
    <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[4px]">
      <b
        className={`${
          inline
            ? `${plain ? "text-hero" : "text-kpi"} whitespace-nowrap`
            : "text-hero"
        } font-extrabold tabular-nums text-ink`}
      >
        {value}
      </b>
      {pill}
    </div>
  );

  return (
    <div
      className={`flex flex-col rounded-card ${ground} ${
        inline
          ? plain
            ? `justify-center ${tight ? "p-[11px]" : "p-[14px]"}`
            : "p-[12px]"
          : "p-[14px]"
      }${className ? ` ${className}` : ""}`}
    >
      {inline ? (
        <div className={`flex items-center ${tight ? "gap-[9px]" : "gap-[10px]"}`}>
          {tile}
          <div className="min-w-0">
            {/* The inline card is a fixed-width tile in a five-across strip:
                a label that wraps to two lines drags every card in the row
                taller than the one measure it belongs to. */}
            <span
              className={`block font-bold ${
                tight ? "leading-[1.25]" : "whitespace-nowrap"
              } ${
                plain
                  ? "text-micro font-extrabold uppercase text-mute"
                  : "text-label text-ink2"
              }`}
            >
              {label}
            </span>
            <div className="mt-[2px]">{figure}</div>
          </div>
          {toggle}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-[9px]">
            {tile}
            <span className="text-label font-bold text-ink2">{label}</span>
            {toggle}
          </div>
          <div className="mt-[7px]">{figure}</div>
        </>
      )}

      {mark === undefined ? null : (
        <div className={`mt-[9px] ${style.mark}`}>{mark}</div>
      )}

      {basis === undefined ? null : (
        <div className="mt-[7px] text-small font-semibold leading-[1.4] text-mute">
          {basis}
        </div>
      )}

      {hasPanel && open ? (
        <div
          id={id}
          className="mt-[10px] border-t border-rule2 pt-[9px] text-small font-semibold leading-[1.6] text-mute"
        >
          {detail}
          {href === undefined ? null : (
            <Link
              href={href}
              className="mt-[7px] inline-block rounded-pill bg-white px-[9px] py-[3px] text-[10.5px] font-extrabold text-ink shadow-raised transition-colors duration-[120ms] hover:bg-peach"
            >
              {hrefLabel ?? "See the full panel"}
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default KpiCard;
