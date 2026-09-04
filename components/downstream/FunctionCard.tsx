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

/**
 * A mark, with its reasoning shown only the first time that reasoning appears
 * on this card.
 *
 * WHY THE SECOND ONE IS SHORTER. Several of these checks are STRUCTURAL: the
 * ratio-of-shares objection is true of the quantity, so it fires on every row
 * that carries one. Printing the same 60-word paragraph under six consecutive
 * rows does not make the objection six times stronger -- it pushes the six
 * insights apart and trains the reader to skip the amber block, which is the
 * one thing this panel cannot afford.
 *
 * The FLAG still appears on every row, because which rows are affected is a
 * fact about those rows and a reader acts on it. Only the reasoning, which is
 * identical, is said once.
 */
function MarkBlock({ mark, explain }: { mark: ReviewMark; explain: boolean }) {
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
        {explain ? null : (
          <span className="text-[10.5px] font-semibold text-mute">
            same objection as above
          </span>
        )}
      </div>
      {explain ? (
        <p className="mt-[5px] max-w-[86ch] text-[11.5px] leading-[1.55] text-body">
          {mark.detail}
        </p>
      ) : null}
    </div>
  );
}

const EMPTY_CODES: ReadonlySet<string> = new Set();

function InsightRow({
  row,
  explainedCodes,
}: {
  row: HandoffRow;
  /** Codes whose reasoning has already been printed higher up this card. */
  explainedCodes: ReadonlySet<string>;
}) {
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
          <MarkBlock
            key={`${row.id}-${mark.code}-${mark.label}`}
            mark={mark}
            explain={!explainedCodes.has(mark.code)}
          />
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

  // Which objections a reader has already been given the reasoning for by the
  // time each row is reached. Walked in the same order the rows render in, so
  // the explanation always lands on the FIRST row that carries it rather than
  // on an arbitrary one.
  const seen = new Set<string>();
  const explainedBefore = new Map<HandoffRow["id"], ReadonlySet<string>>();
  for (const brand of group.brands) {
    for (const row of brand.rows) {
      explainedBefore.set(row.id, new Set(seen));
      for (const mark of row.review) seen.add(mark.code);
    }
  }

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
              <InsightRow
                key={row.id}
                row={row}
                explainedCodes={explainedBefore.get(row.id) ?? EMPTY_CODES}
              />
            ))}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export default FunctionCard;
