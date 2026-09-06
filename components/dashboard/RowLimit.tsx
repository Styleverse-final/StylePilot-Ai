"use client";

import { useState, type ReactNode } from "react";

/**
 * RowLimit -- show the first few rows of a table, the rest on request.
 *
 * WHY IT WRAPS THE TABLE INSTEAD OF SLICING THE ROWS
 * -------------------------------------------------
 * Slicing would mean two tables, one for the visible rows and one for the
 * rest, and two tables size their columns independently: the seam would show
 * the moment the second one opened. Rendering one table and hiding the
 * overflow rows keeps a single set of column widths, so expanding moves
 * nothing that was already on screen.
 *
 * The rows are hidden with `display: none`, which takes them out of the
 * accessibility tree as well as off the screen -- a screen reader is told the
 * table has four rows and a button, which is what a sighted reader sees. They
 * are still server-rendered, so opening the list costs no request and no
 * layout shift beyond the growth itself.
 *
 * WHY FOUR AND NOT TWELVE. The queue is the work, but the screen above it is
 * a summary: four rows is enough to see what the top of the ranking looks
 * like without the card pushing everything below it off the page. A planner
 * who wants to work the list opens it, or opens the screen that owns it.
 */

export type RowLimitProps = {
  /** How many rows stay visible while collapsed. */
  visible: number;
  /** Total rows inside. Used for the button copy and to skip it entirely. */
  total: number;
  children: ReactNode;
};

const BUTTON =
  "inline-flex h-[30px] items-center gap-[7px] rounded-pill bg-cream px-[14px] text-[11.5px] font-bold text-ink transition-colors duration-[120ms] hover:bg-hover";

const CHEVRON = String.fromCharCode(0x2304); // down arrowhead

/**
 * WRITTEN OUT, NOT INTERPOLATED.
 *
 * Tailwind generates CSS by scanning source text for class names. A class
 * built at runtime -- `[&_tbody_tr:nth-child(n+${visible + 1})]:hidden` --
 * appears nowhere in the source, so no rule is emitted and the collapse
 * silently does nothing. Every cut-off the component supports is therefore
 * spelled out here as a literal the scanner can find.
 */
const HIDE_BEYOND: Readonly<Record<number, string>> = {
  3: "[&_tbody_tr:nth-child(n+4)]:hidden",
  4: "[&_tbody_tr:nth-child(n+5)]:hidden",
  5: "[&_tbody_tr:nth-child(n+6)]:hidden",
  6: "[&_tbody_tr:nth-child(n+7)]:hidden",
  8: "[&_tbody_tr:nth-child(n+9)]:hidden",
};

export function RowLimit({ visible, total, children }: RowLimitProps) {
  const [open, setOpen] = useState(false);
  const hidden = Math.max(0, total - visible);
  const collapseClass = HIDE_BEYOND[visible] ?? HIDE_BEYOND[4];

  // Nothing to collapse: render the table and no control, rather than a
  // button that expands to reveal the rows already on screen.
  if (hidden === 0) return <>{children}</>;

  return (
    <>
      <div className={open ? undefined : collapseClass}>{children}</div>

      <div className="flex items-center gap-[10px] border-t border-rule px-[20px] py-[11px]">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className={BUTTON}
        >
          {open ? "Show fewer" : `View ${hidden} more`}
          <span
            aria-hidden="true"
            className={`text-[12px] leading-none transition-transform duration-[120ms]${
              open ? " rotate-180" : ""
            }`}
          >
            {CHEVRON}
          </span>
        </button>
        <span className="text-small font-semibold text-mute">
          {open
            ? `All ${total} shown`
            : `Showing ${visible} of ${total} ranked by value`}
        </span>
      </div>
    </>
  );
}

export default RowLimit;
