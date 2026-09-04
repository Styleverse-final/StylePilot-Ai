import { Card, CardBody, CardHeader, Pill } from "@/components";

import type { FunctionGroup, HandoffRow } from "./data";
import {
  ARROW,
  FUNCTION_LABEL,
  FUNCTION_REMIT,
  FUNCTION_USE,
  MIDDOT,
  plural,
} from "./format";
import type { ReviewMark } from "./review";

/**
 * One function's handoff, grouped by brand underneath.
 *
 * THREE THINGS EVERY ROW CARRIES, AND WHY
 * ---------------------------------------
 * The insight is the sentence somebody outside planning will read. Under it
 * sits source_table, which is the only thing that makes the sentence
 * checkable, and the supporting metric verbatim, which is the arithmetic the
 * sentence was written from. The metric is not hidden behind a disclosure:
 * a receipt filed one click away is a receipt nobody reads, and this screen's
 * entire argument is that a handoff should travel with its workings.
 *
 * WHERE A ROW IS MARKED
 * ---------------------
 * A row the editorial checks caught is still rendered, with the objection
 * directly beneath it at the same size. Withholding it would leave the reader
 * unable to see what was suppressed or to disagree with the suppression;
 * passing it through unmarked would make this screen the place a wrong claim
 * was laundered. So it is rendered, and it argues with itself in public.
 */

function MarkBlock({ mark }: { mark: ReviewMark }) {
  const flagged = mark.level === "flag";
  return (
    <div
      className={`mt-[7px] rounded-quote px-[11px] py-[9px] ${
        flagged ? "bg-amberW" : "bg-shell"
      }`}
    >
      <div className="flex flex-wrap items-center gap-[7px]">
        <Pill variant={flagged ? "amber" : "grey"}>{mark.label}</Pill>
        {mark.quote ? (
          <span className="font-mono text-[10.5px] font-bold text-ink">
            &ldquo;{mark.quote}&rdquo;
          </span>
        ) : null}
      </div>
      <p className="mt-[5px] max-w-[86ch] text-[11.5px] leading-[1.55] text-body">
        {mark.detail}
      </p>
    </div>
  );
}

function InsightRow({ row }: { row: HandoffRow }) {
  const flagged = row.review.some((mark) => mark.level === "flag");
  return (
    <div className="flex gap-[9px] border-b border-rule py-[10px] last:border-b-0">
      <span
        aria-hidden="true"
        className={`shrink-0 font-extrabold ${flagged ? "text-amber" : "text-orange"}`}
      >
        {ARROW}
      </span>
      <div className="min-w-0 flex-1">
        <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
          {row.insight}
        </p>

        {row.review.map((mark) => (
          <MarkBlock key={`${row.id}-${mark.code}-${mark.label}`} mark={mark} />
        ))}

        <div className="mt-[7px] flex flex-wrap items-center gap-x-[7px] gap-y-[3px] text-[10px] font-bold text-mute">
          <span className="uppercase tracking-[0.06em]">Source</span>
          <span className="font-mono text-[10px] font-bold text-ink2">
            {row.sourceTable ?? "not recorded"}
          </span>
          <span aria-hidden="true">{MIDDOT}</span>
          <span className="tabular-nums">{row.isoWeek}</span>
        </div>

        {row.metricRaw ? (
          <div className="mt-[4px] break-words font-mono text-[10px] leading-[1.5] text-mute">
            {row.metricRaw}
          </div>
        ) : (
          <div className="mt-[4px] text-[10px] font-semibold text-mute">
            This row carries no supporting metric, so the sentence above cannot
            be checked against its own arithmetic here.
          </div>
        )}
      </div>
    </div>
  );
}

export type FunctionCardProps = {
  group: FunctionGroup;
  brandLabel: (brandId: string | null) => string;
  /** Whether to print the brand sub-heading. Pointless when there is one. */
  showBrands: boolean;
};

export function FunctionCard({ group, brandLabel, showBrands }: FunctionCardProps) {
  const flagged = group.rows.filter((row) =>
    row.review.some((mark) => mark.level === "flag"),
  ).length;

  return (
    <Card>
      <CardHeader
        title={FUNCTION_LABEL[group.fn]}
        subtitle={FUNCTION_REMIT[group.fn]}
        actions={
          <>
            {flagged > 0 ? (
              <Pill variant="amber">{plural(flagged, "flagged", "flagged")}</Pill>
            ) : null}
            <Pill variant="grey">
              {plural(group.rows.length, "insight", "insights")}
            </Pill>
          </>
        }
      />
      <CardBody>
        <p className="max-w-[88ch] text-[11.5px] leading-[1.6] text-mute">
          {FUNCTION_USE[group.fn]}
        </p>

        {group.brands.map((brand) => (
          <div key={brand.brandId ?? "unscoped"} className="mt-[12px]">
            {showBrands ? (
              <div className="mb-[2px] flex items-baseline gap-[7px] border-b border-rule2 pb-[6px]">
                <span className="text-[11px] font-extrabold text-ink">
                  {brandLabel(brand.brandId)}
                </span>
                <span className="text-[10.5px] font-semibold text-mute">
                  {plural(brand.rows.length, "insight", "insights")}
                </span>
              </div>
            ) : null}
            {brand.rows.map((row) => (
              <InsightRow key={row.id} row={row} />
            ))}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export default FunctionCard;
