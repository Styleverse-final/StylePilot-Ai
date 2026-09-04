"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * <Why> -- the first clause, then the rest on demand.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Every explanation in this system is load-bearing: the derivation behind a
 * threshold, the reason an agent acted, the caveat on a fold count. None of it
 * should be deleted. But rendering all of it inline turned the two screens a
 * planner actually works in into essays with a queue somewhere underneath --
 * 182 words before the first row on /exceptions, 302 on /buy.
 *
 * The resolution is not to cut the words. It is to stop making a reader
 * consume them before they can see their work. The first clause stays visible,
 * because a sentence fragment with no way to finish it is worse than either
 * extreme; the rest is one click away and stays exactly as it was.
 *
 * WHY NOT <details>
 * -----------------
 * <details> gives the summary and the body equal typographic weight, and the
 * native marker fights the design system. More importantly the summary tends
 * to become a label ("Why this threshold") rather than the first clause of the
 * actual sentence, so a reader who does not expand learns nothing. Here the
 * visible part IS the beginning of the explanation.
 */

export type WhyProps = {
  /**
   * The first clause -- shown always. Write the real opening of the sentence,
   * not a label for it. "Cover ceiling is category half-life" beats "Threshold
   * derivation", because the second tells a reader who does not click nothing
   * at all.
   */
  lead: ReactNode;
  /** Everything else. Unchanged from what used to be inline. */
  children: ReactNode;
  /** Optional label on the toggle. Defaults to "why". */
  label?: string;
  className?: string;
};

const ELLIPSIS = String.fromCharCode(0x2026);

export function Why({ lead, children, label = "why", className }: WhyProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={className}>
      <span className="text-small font-semibold leading-[1.55] text-mute">
        {lead}
        {open ? null : <span aria-hidden="true">{ELLIPSIS}</span>}{" "}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={id}
          className="rounded-pill bg-cream px-[7px] py-[1px] text-[10.5px] font-extrabold text-body transition-colors duration-[120ms] hover:bg-peach"
        >
          {open ? "less" : label}
        </button>
      </span>

      {open ? (
        <span
          id={id}
          className="mt-[6px] block text-small font-semibold leading-[1.6] text-mute"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

export default Why;
