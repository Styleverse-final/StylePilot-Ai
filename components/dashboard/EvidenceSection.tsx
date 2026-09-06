"use client";

import { useState, type ReactNode } from "react";

/**
 * EvidenceSection -- one of the three arguments, open or closed.
 *
 * WHY THREE OF THESE AND NOT ONE DROPDOWN
 * ---------------------------------------
 * A single selector showed one panel and hid the existence of the other two:
 * a reader who never opened the list never learned there was an accuracy
 * backtest behind it. Three sections keep all three titles, subtitles and
 * headline figures on the page permanently and spend height only on what is
 * actually open -- which is the thing the collapse was for.
 *
 * They open independently. Accuracy and value answer different questions and
 * a reader defending a number is often reading both; an accordion that closed
 * one to open the other would make them flip back and forth to compare.
 *
 * WHY THE HEADER IS NOT ALL ONE BUTTON
 * ------------------------------------
 * The summary slot can contain its own control -- the accuracy line is
 * <AccuracyStatement variant="compact">, which carries a "detail" toggle,
 * because Part H does not allow that percentage to be printed here any other
 * way. A button inside a button is invalid markup and the inner one becomes
 * unclickable, so the toggle is the title block only and the summary sits
 * beside it as its own thing.
 */

/** Points down when open, right when closed. */
const CHEVRON = String.fromCharCode(0x2304);

export type EvidenceSectionProps = {
  /** Fragment the KPI band links to. Also the scroll target. */
  id: string;
  title: string;
  subtitle: string;
  /** Headline figure, shown whether the section is open or closed. */
  summary?: ReactNode;
  /** Decided on the server from ?evidence=, so a deep link arrives open. */
  defaultOpen?: boolean;
  children: ReactNode;
};

export function EvidenceSection({
  id,
  title,
  subtitle,
  summary,
  defaultOpen = false,
  children,
}: EvidenceSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `${id}-panel`;

  return (
    <div
      id={id}
      className="scroll-mt-[76px] overflow-hidden rounded-card bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-[18px] gap-y-[8px] px-[20px] py-[13px]">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex items-start gap-[10px] rounded-inner text-left transition-colors duration-[120ms]"
        >
          <span
            aria-hidden="true"
            className={`mt-[3px] text-[13px] leading-none text-mute transition-transform duration-[120ms] ${
              open ? "" : "-rotate-90"
            }`}
          >
            {CHEVRON}
          </span>
          <span className="block">
            <span className="block text-h3 font-extrabold text-ink">
              {title}
            </span>
            <span className="mt-[2px] block text-small font-semibold text-mute">
              {subtitle}
            </span>
          </span>
        </button>

        {summary === undefined ? null : (
          <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[3px] text-small font-semibold text-mute">
            {summary}
          </div>
        )}
      </div>

      {/* Not rendered while closed rather than hidden with CSS: the accuracy
          panel alone is a backtest chart and three benchmark bars, and there
          is no reason to build it for a reader who has not asked for it. */}
      {open ? (
        <div id={panelId} className="border-t border-rule">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export default EvidenceSection;
