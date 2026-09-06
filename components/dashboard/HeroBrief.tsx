import Link from "next/link";

import { formatCrore, formatCount, plural, seriesLabel } from "./format";

/**
 * HeroBrief -- block 1 of the command centre.
 *
 * Ports `.hero`, `.heroT`, `.circ`, `.darkb` and `.float`.
 *
 * The headline count is the number of recommendations in THIS planner's scope
 * that carry no decision row at all, counted at request time. A planner scoped
 * to one region legitimately sees a small number, or zero. Zero is rendered as
 * a sentence, not as an empty card.
 *
 * WHAT THIS CARD USED TO SAY, AND WHY IT STOPPED
 * ---------------------------------------------
 * It carried a paragraph: what the agents settled and escalated, and what the
 * open rows are worth. Every one of those figures is now stated in the KPI
 * band directly above it, and the agents panel beside it draws the same
 * partition as a bar. Three statements of one fact in the first screenful is
 * not emphasis, it is noise, and the reader has to check whether the three
 * agree before trusting any of them.
 *
 * The one thing the band does NOT say survives here: that some open rows
 * carry no value figure at all, so the money total covers fewer rows than the
 * count. That line renders only when it is true, because a caveat that is
 * always on screen stops being read.
 */

const HERO_GRADIENT =
  "linear-gradient(165deg,#FCE4D2 0%,#F8D9CB 55%,#F6D3D9 100%)";

export type HeroHighlight = {
  seriesKey: string | null;
  brandId: string | null;
  headline: string;
  detail: string | null;
  valueInr: number | null;
  href: string;
  ctaLabel: string;
};

export type HeroBriefProps = {
  /** Recommendations in scope with no decision logged. */
  openCount: number;
  /** How many of those rows carry no value figure, so the sum is not the whole story. */
  openWithoutValue: number;
  /** The single highest-value open row, surfaced as the float card. */
  highlight: HeroHighlight | null;
  /** Deep link for the primary action. */
  queueHref: string;
};

const DARK_BUTTON =
  "mt-[14px] inline-flex h-[36px] items-center gap-[7px] self-start rounded-pill bg-ink px-[16px] text-[12px] font-bold text-white transition-colors duration-[120ms] hover:bg-ink2";

export function HeroBrief({
  openCount,
  openWithoutValue,
  highlight,
  queueHref,
}: HeroBriefProps) {
  const hasWork = openCount > 0;

  return (
    <div
      className="flex flex-col rounded-card px-[20px] py-[22px]"
      style={{ background: HERO_GRADIENT }}
    >
      <div className="flex items-start justify-between gap-[10px]">
        <div className="text-[21px] font-extrabold leading-[1.2] tracking-[-0.01em] text-ink">
          {hasWork ? (
            <>
              {formatCount(openCount)}{" "}
              {plural(openCount, "decision", "decisions")}
              <br />
              {plural(openCount, "needs", "need")} you
            </>
          ) : (
            <>
              Nothing is
              <br />
              waiting on you
            </>
          )}
        </div>
        <span
          aria-hidden="true"
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-white/70 text-[13px]"
        >
          &#8599;
        </span>
      </div>

      {openWithoutValue > 0 ? (
        <p
          className="mt-[8px] text-[11.5px] font-semibold leading-[1.5]"
          style={{ color: "#8A6A55" }}
        >
          {formatCount(openWithoutValue)} of them carry no value figure, so the
          money beside the count covers{" "}
          {formatCount(openCount - openWithoutValue)}
          {plural(openCount - openWithoutValue, " row", " rows")}, not all of
          them.
        </p>
      ) : null}

      <Link href={queueHref} className={DARK_BUTTON}>
        <span aria-hidden="true">+</span>
        {hasWork ? "Review queue" : "Open the queue"}
      </Link>

      {highlight === null ? null : (
        <div className="mt-[14px] rounded-inner bg-white p-[14px] shadow-card">
          <div className="flex items-center justify-between gap-[8px]">
            <div className="text-[12.5px] font-extrabold text-ink">
              {seriesLabel(highlight.seriesKey)}
            </div>
            <span
              aria-hidden="true"
              className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-ink text-[12px] text-white"
            >
              &#8943;
            </span>
          </div>
          <div className="mt-[4px] text-[11.5px] font-semibold leading-[1.6] text-mute">
            {highlight.headline}
            {highlight.brandId ? <> &middot; {highlight.brandId}</> : null}
            <br />
            {highlight.detail ??
              `Value at stake ${formatCrore(highlight.valueInr)}`}
          </div>
          <Link
            href={highlight.href}
            className="mt-[10px] inline-flex h-[28px] items-center gap-[6px] rounded-pill bg-peach px-[11px] text-[11.5px] font-bold text-ink transition-colors duration-[120ms] hover:bg-[#F6D3BC]"
          >
            <span aria-hidden="true">&#9656;</span>
            {highlight.ctaLabel}
          </Link>
        </div>
      )}
    </div>
  );
}

export default HeroBrief;
