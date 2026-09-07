/**
 * The StylePilot Ai mark and wordmark.
 *
 * THE MARK is three ascending chevrons with the middle one weighted and in
 * orange. It is doing three jobs at once, which is why it earns the space:
 *
 *   - a heading indicator, because "pilot" is the operative word -- this is a
 *     system for navigating a range through a season, not reporting on one
 *     afterwards;
 *   - P10 / P50 / P90, the outer chevrons being the interval and the solid one
 *     the central path. The system never issues a point estimate, and the mark
 *     says so before anyone reads a screen;
 *   - a rising trend, for anyone who knows neither of the above.
 *
 * WHY IT IS INLINE SVG AND NOT AN <img>. It ships in the same document as the
 * nav, so it paints on the first frame with no second request and no layout
 * shift -- the nav is sticky and a logo that arrives late shoves the tabs. It
 * also means the grey inherits `currentColor`, so the mark works on the white
 * nav pill, on the cream login card, and knocked out on a dark tile without a
 * second asset.
 *
 * The wordmark is set in the same Plus Jakarta Sans the app already loads at
 * 800, so there is no font file for a logo alone.
 */

const ORANGE = "#D04A02";

type MarkProps = {
  /** Rendered height in px. The mark is 40x47, so width follows. */
  size?: number;
  className?: string;
};

/**
 * The chevrons alone -- for tight spaces, favicons and the overlay.
 *
 * The outer two are drawn at 38% of the current text colour rather than a
 * fixed grey, so the same component is legible on cream, on white and on ink
 * without a variant for each.
 */
export function LogoMark({ size = 28, className }: MarkProps) {
  return (
    <svg
      viewBox="0 0 40 47"
      height={size}
      width={(size * 40) / 47}
      className={className}
      role="img"
      aria-label="StylePilot Ai"
      fill="none"
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 16 L20 4 L36 16" stroke="currentColor" opacity={0.38} />
      <path d="M4 29 L20 17 L36 29" stroke={ORANGE} />
      <path d="M4 42 L20 30 L36 42" stroke="currentColor" opacity={0.38} />
    </svg>
  );
}

type LockupProps = {
  /** Height of the mark; the wordmark scales with it. */
  size?: number;
  /** Wordmark size in px. Defaults to a ratio that matches the artwork. */
  wordSize?: number;
  className?: string;
};

/**
 * Mark plus wordmark, horizontally locked up.
 *
 * `aria-hidden` on the mark and a single accessible name on the wrapper: the
 * mark and the words are one thing, and a screen reader announcing
 * "StylePilot Ai StylePilot Ai" is the usual cost of labelling both.
 */
export function LogoLockup({ size = 26, wordSize, className }: LockupProps) {
  const word = wordSize ?? Math.round(size * 0.62);

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap ${className ?? ""}`}
      style={{ gap: Math.round(size * 0.34) }}
    >
      <span aria-hidden="true" className="inline-flex text-ink">
        <LogoMark size={size} />
      </span>
      <span
        className="font-extrabold text-ink"
        style={{ fontSize: word, lineHeight: 1.15, letterSpacing: "-0.015em" }}
      >
        StylePilot<span className="text-orange"> Ai</span>
      </span>
    </span>
  );
}
