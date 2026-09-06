/**
 * The glyphs on the workbench header strip.
 *
 * Hand-drawn for the same reason the buy, allocation, exceptions and command
 * centre sets are: a handful of 18px marks do not justify a dependency, and
 * these inherit currentColor so a card sets its tone once and the mark
 * follows without a second colour being declared anywhere.
 *
 * Every one is decorative. The card beside a glyph names its own measure in
 * text and each tile carries aria-hidden, so nothing here is announced twice.
 *
 * The five are drawn to be told apart at 16px by SHAPE rather than by their
 * tone, because two of the cards on this strip share a colour on purpose --
 * the interval and the accuracy are both the model measured against realised
 * weeks -- and the reader still has to know which card is which at a glance.
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

/**
 * Series in scope: the category x channel x region grid, one cell of which
 * is the series currently drawn. The filled corner is that cell.
 */
export function GridIcon() {
  return (
    <svg {...BASE}>
      <rect x="2.4" y="2.4" width="5.6" height="5.6" rx="1.6" />
      <rect x="10" y="2.4" width="5.6" height="5.6" rx="1.6" />
      <rect x="2.4" y="10" width="5.6" height="5.6" rx="1.6" />
      <rect
        x="10"
        y="10"
        width="5.6"
        height="5.6"
        rx="1.6"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/**
 * Horizon: the "now" edge and the weeks to the right of it. Dashed, because
 * everything past that edge is forecast rather than observed -- the same
 * distinction the chart draws with its own vertical rule.
 */
export function HorizonIcon() {
  return (
    <svg {...BASE}>
      <path d="M5.2 2.8v12.4" />
      <path d="M8.2 9h1.6" strokeWidth="1.7" />
      <path d="M12 9h1.6" strokeWidth="1.7" />
      <path d="M12.6 5.6 16 9l-3.4 3.4" />
    </svg>
  );
}

/** History: realised weeks, running backwards from now. */
export function HistoryIcon() {
  return (
    <svg {...BASE}>
      <path d="M2.9 7.6A6.3 6.3 0 1 1 2.7 10.4" />
      <path d="M2.4 3.9v3.9h3.9" />
      <path d="M9 5.7V9l2.4 1.5" />
    </svg>
  );
}

/**
 * Interval: a P50 line running through a band, the band drawn as the two
 * quantile edges it actually is rather than as a shaded blob.
 */
export function BandIcon() {
  return (
    <svg {...BASE}>
      <path d="M2.2 5.4c3.4 0 4.1-2 7.4-2 2.1 0 4.4 1.1 6.2 1.6" />
      <path d="M2.2 12.6c3.4 0 4.1 2 7.4 2 2.1 0 4.4-1.1 6.2-1.6" />
      <path d="M2.2 9h13.6" strokeDasharray="0.1 3.1" strokeWidth="1.8" />
    </svg>
  );
}

/** Forecast accuracy: the benchmark hit, scored on the same rows. */
export function TargetIcon() {
  return (
    <svg {...BASE}>
      <circle cx="9" cy="9" r="6.4" />
      <circle cx="9" cy="9" r="2.7" />
      <circle cx="9" cy="9" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
