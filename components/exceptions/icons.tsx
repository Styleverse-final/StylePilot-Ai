/**
 * The glyphs on the exception header cards, plus the two toolbar marks.
 *
 * Hand-drawn for the same reason the command centre's are: a handful of 18px
 * marks do not justify a dependency, and these inherit currentColor so each
 * one takes its card's tone without a second colour being declared.
 *
 * Every one is decorative. The card labels its own measure in text and the
 * tile carries aria-hidden, so nothing here is announced twice; the two
 * toolbar icons sit inside controls that carry their own accessible names.
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

/** Stockout risk: a carton, because the shelf is what runs out. */
export function BoxIcon() {
  return (
    <svg {...BASE}>
      <path d="M9 1.9 15.2 5v8L9 16.1 2.8 13V5z" />
      <path d="M2.8 5 9 8.1 15.2 5M9 8.1v8" />
    </svg>
  );
}

/** Overstock risk: the warning triangle, because the stock is already bought. */
export function AlertTriangleIcon() {
  return (
    <svg {...BASE}>
      <path d="M9 2.6 16.2 15H1.8z" />
      <path d="M9 7v3.6M9 12.9v.1" />
    </svg>
  );
}

/** Awaiting your decision: a clock, because the queue is time passing. */
export function ClockIcon() {
  return (
    <svg {...BASE}>
      <circle cx="9" cy="9" r="6.6" />
      <path d="M9 5.2V9l2.6 1.6" />
    </svg>
  );
}

/** High priority: stacked layers, the rows that sit at the top of the pile. */
export function LayersIcon() {
  return (
    <svg {...BASE}>
      <path d="M9 2.2 15.6 5.4 9 8.6 2.4 5.4z" />
      <path d="M2.4 9 9 12.2 15.6 9M2.4 12.4 9 15.6l6.6-3.2" />
    </svg>
  );
}

/** The search field's leading mark. */
export function SearchIcon() {
  return (
    <svg {...BASE} className="h-[14px] w-[14px]">
      <circle cx="8" cy="8" r="5.2" />
      <path d="M11.8 11.8 15.4 15.4" />
    </svg>
  );
}

/** The sort panel's toggle: three sliders. */
export function SlidersIcon() {
  return (
    <svg {...BASE} className="h-[15px] w-[15px]">
      <path d="M3 5.2h4.6M10.6 5.2H15M3 12.8h2.4M8.4 12.8H15" />
      <circle cx="9.1" cy="5.2" r="1.5" />
      <circle cx="6.9" cy="12.8" r="1.5" />
    </svg>
  );
}
