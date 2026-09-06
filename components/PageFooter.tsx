import { Fragment } from "react";

/**
 * PageFooter -- the closing rule under a screen.
 *
 * A screen that ends on its last data row ends abruptly; the eye has nothing
 * to land on and no signal that the list is over rather than cut off. This is
 * that signal: a statement of what the screen was for on the left, and the
 * three words the programme is run by on the right, both at micro size in the
 * muted tone so neither competes with a number above it.
 *
 * It carries no data and makes no claim that could go stale, which is the
 * point -- everything on these screens that asserts something is read from
 * the database, and a line that is pure typography must be visibly pure
 * typography. The orange dashes are drawn, not typed, so no glyph gets
 * announced to a screen reader as punctuation.
 */

export type PageFooterProps = {
  /** The left-hand line. Rendered upper-case; write it in sentence case. */
  statement: string;
  /** The right-hand words, separated by hairlines. */
  words: readonly string[];
  className?: string;
};

const DASH = "h-[2px] w-[20px] flex-none rounded-pill bg-orange";
const LINE =
  "text-micro font-extrabold uppercase tracking-[0.14em] text-mute";

export function PageFooter({ statement, words, className }: PageFooterProps) {
  return (
    <footer
      className={`mt-[18px] flex flex-wrap items-center justify-between gap-x-[20px] gap-y-[10px] px-[8px] pb-[4px] pt-[14px]${
        className ? ` ${className}` : ""
      }`}
    >
      <div className="flex items-center gap-[12px]">
        <span aria-hidden="true" className={DASH} />
        <span className={LINE}>{statement}</span>
      </div>

      <div className="flex items-center gap-[12px]">
        <span aria-hidden="true" className={DASH} />
        <span className={`flex items-center gap-[10px] ${LINE}`}>
          {words.map((word, index) => (
            <Fragment key={word}>
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="h-[10px] w-px bg-rule2"
                />
              ) : null}
              {word}
            </Fragment>
          ))}
        </span>
      </div>
    </footer>
  );
}

export default PageFooter;
