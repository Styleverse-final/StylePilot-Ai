/**
 * The glyphs on the buy screen: five header-card marks, and the handful on
 * the table's own controls.
 *
 * Hand-drawn for the same reason the command centre's and the exception
 * queue's are: a dozen 18px marks do not justify a dependency, and every one
 * of these inherits currentColor, so a mark takes the tone of the tile it
 * sits in without a second colour being declared anywhere.
 *
 * All of them are decorative. Header cards label their own measure in text
 * and their tiles carry aria-hidden; the toolbar marks sit inside controls
 * that carry their own accessible names.
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

/** Reduce: the recommendation points below the manual plan. */
export function ArrowDownIcon() {
  return (
    <svg {...BASE}>
      <path d="M9 3v11M4.6 9.6 9 14l4.4-4.4" />
    </svg>
  );
}

/** Increase: the recommendation points above the manual plan. */
export function ArrowUpIcon() {
  return (
    <svg {...BASE}>
      <path d="M9 15V4M4.6 8.4 9 4l4.4 4.4" />
    </svg>
  );
}

/** Net units against the manual plan: three bars of unequal height. */
export function BarsIcon() {
  return (
    <svg {...BASE}>
      <path d="M3.6 14.4V9.8M9 14.4V4.2M14.4 14.4v-7" />
    </svg>
  );
}

/** Value at stake: a rupee inside the coin it is denominated in. */
export function RupeeIcon() {
  return (
    <svg {...BASE}>
      <circle cx="9" cy="9" r="6.6" />
      <path d="M6.9 5.9h4.2M6.9 8.2h4.2M10.3 5.9c0 1.5-1 2.3-2.6 2.3l3.4 3.9" />
    </svg>
  );
}

/** Forecast accuracy: the target the backtest was scored against. */
export function TargetIcon() {
  return (
    <svg {...BASE}>
      <circle cx="9" cy="9" r="6.4" />
      <circle cx="9" cy="9" r="2.6" />
    </svg>
  );
}

/** The horizon the buy covers: a calendar, because the plan has weeks. */
export function CalendarIcon() {
  return (
    <svg {...BASE}>
      <rect x="2.7" y="3.7" width="12.6" height="11.2" rx="2.4" />
      <path d="M2.7 7.2h12.6M6.4 2.4v2.6M11.6 2.4v2.6" />
    </svg>
  );
}

/** The search field. */
export function SearchIcon() {
  return (
    <svg {...BASE}>
      <circle cx="8.1" cy="8.1" r="4.9" />
      <path d="m11.7 11.7 3.1 3.1" />
    </svg>
  );
}

/** The filter panel: the sliders a planner narrows the list with. */
export function SlidersIcon() {
  return (
    <svg {...BASE}>
      <path d="M3.2 5.6h11.6M3.2 12.4h11.6" />
      <circle cx="7" cy="5.6" r="1.7" />
      <circle cx="11.6" cy="12.4" r="1.7" />
    </svg>
  );
}

/** The bulk approval control. */
export function CheckIcon() {
  return (
    <svg {...BASE}>
      <path d="m3.8 9.4 3.5 3.4 7-7.6" />
    </svg>
  );
}

/** Review: the row opens below. */
export function ArrowRightIcon() {
  return (
    <svg {...BASE} className="h-[12px] w-[12px]">
      <path d="M3.4 9h11.2M10.2 4.6 14.6 9l-4.4 4.4" />
    </svg>
  );
}
