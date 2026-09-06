/**
 * The four glyphs on the command centre KPI cards.
 *
 * Hand-drawn rather than pulled from an icon package: four 18px marks do not
 * justify a dependency, and these inherit currentColor so each one takes its
 * card's tone without a second colour being declared anywhere.
 *
 * Each is decorative. The card labels its own measure in text, and the tile
 * carries aria-hidden, so nothing here is announced twice.
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

/** Margin protected: a stack of coins. */
export function CoinsIcon() {
  return (
    <svg {...BASE}>
      <ellipse cx="9" cy="4.6" rx="5.6" ry="2.2" />
      <path d="M3.4 4.6v3.6c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2V4.6" />
      <path d="M3.4 8.2v3.6c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2V8.2" />
    </svg>
  );
}

/** Touchless: a pointer, lifted off the surface. */
export function PointerIcon() {
  return (
    <svg {...BASE}>
      <path d="M6.4 3.2v7.1l1.9-1.6 1.5 3.4 1.8-.8-1.4-3.3 2.4-.4z" />
      <path d="M13.6 12.6l1.4 1.4M4.4 12.6L3 14" />
    </svg>
  );
}

/** Awaiting your decision: an hourglass, because the queue is time passing. */
export function HourglassIcon() {
  return (
    <svg {...BASE}>
      <path d="M4.8 2.6h8.4M4.8 15.4h8.4" />
      <path d="M6 2.6v2.6L9 9l3-3.8V2.6" />
      <path d="M6 15.4v-2.6L9 9l3 3.8v2.6" />
    </svg>
  );
}

/** The generated-at card in the header. */
export function CalendarIcon() {
  return (
    <svg {...BASE} className="h-[15px] w-[15px]">
      <rect x="2.6" y="3.6" width="12.8" height="11.4" rx="2.2" />
      <path d="M2.6 7.2h12.8M6.2 2.2v2.6M11.8 2.2v2.6" />
    </svg>
  );
}
