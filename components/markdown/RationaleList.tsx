import { Card, CardBody, CardHeader } from "@/components";

import { formatFractionPct, formatInr, MIDDOT } from "./format";
import { timingDisplay, type MarkdownRow } from "./types";

/**
 * THE STORED RATIONALE, VERBATIM.
 *
 * `markdown_recommendation.rationale` is assembled by the pipeline from the
 * numbers that produced the decision -- weeks into life, cover against the
 * category ceiling, projected leftover, the depth today, the depth now, the
 * depth after the wait, the units each shifts, and what the gap is worth
 * against the leftover at list. Every clause is a computed quantity, so a
 * planner can re-derive the recommendation from the sentence alone.
 *
 * It is reproduced here without editing. Paraphrasing it would put a second
 * author between the number and the reader, which is the one thing the
 * sentence exists to prevent.
 *
 * Disclosure is a plain <details> element: no client component, no
 * hydration, and it still works with JavaScript off.
 */

export type RationaleListProps = {
  rows: readonly MarkdownRow[];
};

export function RationaleList({ rows }: RationaleListProps) {
  return (
    <Card>
      <CardHeader
        title="Why each row says what it says"
        subtitle="The stored rationale, as the batch scorer wrote it"
      />
      {rows.length === 0 ? (
        <CardBody>
          <p className="max-w-[88ch] text-copy leading-[1.6] text-body">
            With no recommendations in scope there are no derivations to
            open. When rows appear here, each one carries the sentence the
            pipeline assembled from its own arithmetic -- cover against
            ceiling, projected leftover, the depth today and the depth after
            the wait -- so the recommendation can be checked without leaving
            the screen.
          </p>
        </CardBody>
      ) : (
        <div>
          {rows.map((row) => {
            const timing = timingDisplay(row.timing, "cut now", "hold");
            return (
            <details
              key={row.id}
              className="group border-b border-rule last:border-b-0"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-[12px] px-[20px] py-[12px] transition-colors duration-[120ms] hover:bg-shell [&::-webkit-details-marker]:hidden">
                <span className="text-[12.5px] font-extrabold text-ink">
                  {row.styleId}
                  <span className="ml-[8px] font-semibold text-mute">
                    {row.styleName} {MIDDOT} {row.categoryLabel} {MIDDOT}{" "}
                    {formatFractionPct(row.recommendedDepth, 0)} {MIDDOT}{" "}
                    <span className={timing.known ? undefined : "text-red"}>
                      {timing.label}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-[11.5px] font-extrabold tabular-nums text-orangeD">
                  {formatInr(row.marginSaved)}
                  <span
                    aria-hidden="true"
                    className="ml-[8px] text-[9px] font-extrabold text-mute"
                  >
                    open
                  </span>
                </span>
              </summary>
              <p className="max-w-[96ch] px-[20px] pb-[14px] text-copy leading-[1.6] text-body">
                {row.rationale}
              </p>
            </details>
            );
          })}
        </div>
      )}
    </Card>
  );
}
