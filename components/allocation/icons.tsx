/**
 * The glyphs on the allocation screen.
 *
 * Hand-drawn for the same reason the buy, exceptions and command centre sets
 * are: a handful of 18px marks do not justify a dependency, and these inherit
 * currentColor so a card sets its tone once and the mark follows without a
 * second colour being declared anywhere.
 *
 * Every one is decorative. The card or control beside a glyph names its own
 * measure in text and each tile carries aria-hidden, so nothing here is
 * announced twice.
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

/** Cells in scope: the category x channel x region grid itself. */
export function GridIcon() {
  return (
    <svg {...BASE}>
      <rect x="2.4" y="2.4" width="5.6" height="5.6" rx="1.6" />
      <rect x="10" y="2.4" width="5.6" height="5.6" rx="1.6" />
      <rect x="2.4" y="10" width="5.6" height="5.6" rx="1.6" />
      <rect x="10" y="10" width="5.6" height="5.6" rx="1.6" />
    </svg>
  );
}

/** Shift in: units arriving in the region. */
export function ArrowUpIcon() {
  return (
    <svg {...BASE}>
      <path d="M9 14.8V3.6" />
      <path d="M4.4 8.2 9 3.6l4.6 4.6" />
    </svg>
  );
}

/** Shift out: units leaving it. */
export function ArrowDownIcon() {
  return (
    <svg {...BASE}>
      <path d="M9 3.2v11.2" />
      <path d="M13.6 9.8 9 14.4 4.4 9.8" />
    </svg>
  );
}

/**
 * The agent band: two figures, because a band is a relationship between the
 * agent and the person accountable for it rather than a setting on a machine.
 */
export function UsersIcon() {
  return (
    <svg {...BASE}>
      <circle cx="7" cy="6.4" r="2.6" />
      <path d="M2.4 15.2c0-2.5 2.1-4.2 4.6-4.2s4.6 1.7 4.6 4.2" />
      <path d="M12.2 4.2a2.6 2.6 0 0 1 0 4.9M13.4 11.4c1.4.6 2.3 1.9 2.3 3.8" />
    </svg>
  );
}

/** Forecast accuracy: a target with the shot in it. */
export function TargetIcon() {
  return (
    <svg {...BASE}>
      <circle cx="9" cy="9" r="6.4" />
      <circle cx="9" cy="9" r="2.6" />
      <circle cx="9" cy="9" r="0.6" fill="currentColor" />
    </svg>
  );
}

/** The open cell: a garment, because the cell is a category of product. */
export function GarmentIcon() {
  return (
    <svg {...BASE}>
      <path d="M6.6 2.6 3 4.6l1.2 3 1.6-.7v7.5h6.4V6.9l1.6.7 1.2-3-3.6-2z" />
      <path d="M6.6 2.6a2.4 2.4 0 0 0 4.8 0" />
    </svg>
  );
}

/** Escalation triggers: the guard rail, not a warning. */
export function ShieldIcon() {
  return (
    <svg {...BASE}>
      <path d="M9 2.2 14.6 4.4v4.2c0 3.2-2.3 5.9-5.6 7.2-3.3-1.3-5.6-4-5.6-7.2V4.4z" />
      <path d="M6.6 8.8 8.4 10.6l3-3.2" />
    </svg>
  );
}

/** The key insight: a derivation someone would otherwise assume was chosen. */
export function BulbIcon() {
  return (
    <svg {...BASE}>
      <path d="M6.4 11.4a4.4 4.4 0 1 1 5.2 0v1.4H6.4z" />
      <path d="M7.2 15.2h3.6" />
    </svg>
  );
}

/** Beside the band pill: the claim is explained in the card below it. */
export function InfoIcon() {
  return (
    <svg {...BASE} className="h-[14px] w-[14px]">
      <circle cx="9" cy="9" r="6.6" />
      <path d="M9 8.2v4M9 5.8v.1" />
    </svg>
  );
}

/** The callout's lead-in mark. */
export function ArrowRightIcon() {
  return (
    <svg {...BASE} className="h-[15px] w-[15px]">
      <path d="M3.2 9h11.2" />
      <path d="M10.2 4.8 14.4 9l-4.2 4.2" />
    </svg>
  );
}

/** The disclosure on a shift row. Rotates a quarter turn when open. */
export function ChevronRightIcon() {
  return (
    <svg {...BASE} className="h-[15px] w-[15px]" strokeWidth={1.8}>
      <path d="M6.8 3.6 12.2 9l-5.4 5.4" />
    </svg>
  );
}

/**
 * The insight banner's illustration: a curve that settles.
 *
 * It plots nothing and claims nothing -- there is no series behind it, and
 * this file would not draw one if there were, because a mark that looks like
 * evidence must BE evidence. It is a shape, in the same register as the
 * orange rule under the caption beside it, and it carries no accessible name
 * for exactly that reason.
 */
export function SettlingCurve() {
  return (
    <svg
      viewBox="0 0 120 40"
      fill="none"
      aria-hidden="true"
      className="h-[40px] w-[120px]"
    >
      <path
        d="M2 30c10 0 14-18 24-18s13 14 22 14 14-16 24-16 12 6 22 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
