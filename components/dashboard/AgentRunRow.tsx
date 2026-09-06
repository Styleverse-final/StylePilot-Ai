"use client";

import Link from "next/link";
import { useId, useState } from "react";

/**
 * AgentRunRow -- one agent's most recent run, in two lines.
 *
 * Line one names the agent and states what that run examined, acted on and
 * handed back. Line two draws the handback share, because the counts differ by
 * an order of magnitude between agents and cannot be compared down the column
 * while the share can.
 *
 * WHY THIS IS NOT <Why>
 * ---------------------
 * <Why> always shows a lead, and it is right to: there the visible part is the
 * first clause of an explanation, and a toggle labelled "why" over nothing
 * teaches a reader who does not click absolutely nothing.
 *
 * What is behind this toggle is different in kind. It is provenance -- which
 * version ran, who carries the decisions, which band was enabled -- and the
 * row above it is already complete without it. There is no sentence to begin,
 * so there is no lead, and the row costs two lines instead of three.
 *
 * It takes primitives rather than the AgentRun row so the feed around it can
 * stay a server component: only this row needs state.
 */

const CHEVRON = String.fromCharCode(0x2304);

export type AgentRunRowProps = {
  /** Two-letter badge, e.g. "EA". */
  badge: string;
  /** Already humanised, e.g. "Exception agent". */
  name: string;
  brandId: string | null;
  version: string | null;
  examined: string;
  acted: string;
  escalated: string;
  /** Share of examined handed back to a human, 0..100. */
  sharePct: number;
  /** Where the escalated rows are worked. */
  escalatedHref: string;
  /** The agent's own sentence, with its count restatement already trimmed. */
  summary: string;
  /** How many runs this row stands for. */
  runsInWindow: number;
};

export function AgentRunRow({
  badge,
  name,
  brandId,
  version,
  examined,
  acted,
  escalated,
  sharePct,
  escalatedHref,
  summary,
  runsInWindow,
}: AgentRunRowProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const width = Math.max(0, Math.min(100, sharePct));

  return (
    <div className="grid grid-cols-[24px_1fr] items-start gap-[10px] border-b border-rule py-[8px] last:border-b-0">
      <span
        aria-hidden="true"
        className="mt-[1px] flex h-[24px] w-[24px] items-center justify-center rounded-[7px] bg-violetW text-[11px] font-extrabold text-violet"
      >
        {badge}
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-[12px] gap-y-[1px]">
          <span className="text-[12.5px] font-bold text-ink">
            {name}
            {brandId ? (
              <span className="font-semibold text-mute">
                {" "}
                &middot; {brandId}
              </span>
            ) : null}
          </span>
          <span className="text-[11.5px] font-semibold tabular-nums text-body">
            {examined} examined &middot; {acted} acted &middot;{" "}
            <Link
              href={escalatedHref}
              className="font-bold text-orangeD underline decoration-peach underline-offset-2 hover:decoration-orange"
            >
              {escalated} escalated
            </Link>
          </span>
        </div>

        <div className="mt-[5px] flex items-center gap-[9px]">
          {/* Orange, because handing work back is the thing that lands on a
              person, and that is what orange means everywhere else here. */}
          <span
            role="img"
            aria-label={`${sharePct.toFixed(0)} per cent of what this run examined was handed back to a human`}
            className="h-[5px] flex-1 overflow-hidden rounded-pill bg-cream"
          >
            <span
              className="block h-full rounded-pill bg-orange"
              style={{ width: `${width}%` }}
            />
          </span>
          <span className="shrink-0 text-[11.5px] font-extrabold tabular-nums text-ink">
            {sharePct.toFixed(0)}% handed back
          </span>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${open ? "Hide" : "Show"} run detail for ${name}`}
            className="flex shrink-0 items-center gap-[4px] rounded-pill bg-cream px-[8px] py-[2px] text-[10.5px] font-extrabold text-body transition-colors duration-[120ms] hover:bg-peach"
          >
            {open ? "less" : "detail"}
            <span
              aria-hidden="true"
              className={`text-[10px] leading-none transition-transform duration-[120ms]${
                open ? " rotate-180" : ""
              }`}
            >
              {CHEVRON}
            </span>
          </button>
        </div>

        {open ? (
          <div
            id={panelId}
            className="mt-[6px] text-[11.5px] font-semibold leading-[1.55] text-mute"
          >
            {version ? (
              <span className="mr-[6px] rounded-pill bg-cream px-[7px] py-[1px] font-mono text-[10px] font-bold text-mute">
                v{version}
              </span>
            ) : null}
            {summary}
            {runsInWindow > 1 ? (
              <>
                {summary.length > 0 ? " " : null}
                Most recent of {runsInWindow} runs in the window; the counts are
                that run, not a sum across runs.
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default AgentRunRow;
