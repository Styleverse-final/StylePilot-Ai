/**
 * The glyphs on the markdown header cards.
 *
 * Hand-drawn for the same reason the buy plan's and the exception queue's
 * are: five 18px marks do not justify a dependency, and each one inherits
 * currentColor, so a mark takes the tone of the tile it sits in without a
 * second colour being declared anywhere.
 *
 * All of them are decorative. Every card names its own measure in text and
 * its tile carries aria-hidden, so nothing here is announced twice.
 */

const BASE = {
  viewBox: "0 0 18 18",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "h-[16px] w-[16px]",
} as const;

/** Styles in the window: a stack, because the measure is a count of them. */
export function LayersIcon() {
  return (
    <svg {...BASE}>
      <path d="M9 2.2 16 5.8 9 9.4 2 5.8z" />
      <path d="M2 9.2 9 12.8l7-3.6M2 12.6 9 16.2l7-3.6" />
    </svg>
  );
}

/** Cut this week: the shears, because the instruction is a price cut. */
export function ScissorsIcon() {
  return (
    <svg {...BASE}>
      <circle cx="4.4" cy="13.2" r="2.1" />
      <circle cx="13.6" cy="13.2" r="2.1" />
      <path d="M5.9 11.7 13.4 2.4M12.1 11.7 4.6 2.4" />
    </svg>
  );
}

/** Margin saved: the rupee, inside the coin it is denominated in. */
export function RupeeIcon() {
  return (
    <svg {...BASE}>
      <circle cx="9" cy="9" r="6.6" />
      <path d="M6.9 5.9h4.2M6.9 8.2h4.2M10.3 5.9c0 1.5-1 2.3-2.6 2.3l3.4 3.9" />
    </svg>
  );
}

/** Leftover at list: the swing ticket, because the valuation is at list. */
export function TagIcon() {
  return (
    <svg {...BASE}>
      <path d="M8.4 2.2H15v6.6l-6.9 6.9a1.3 1.3 0 0 1-1.9 0L2.2 11.7a1.3 1.3 0 0 1 0-1.9z" />
      <path d="M11.9 5.3v.1" />
    </svg>
  );
}

/** At the ceiling: the arrow that has run into the line above it. */
export function CeilingIcon() {
  return (
    <svg {...BASE}>
      <path d="M2.6 3.4h12.8" />
      <path d="M9 15.2V6.2M5.2 10 9 6.2l3.8 3.8" />
    </svg>
  );
}
