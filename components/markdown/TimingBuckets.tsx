import { Card, CardBody, CardHeader, Pill, Why } from "@/components";

import { DELAY_WEEKS, NOW_MARGIN_TRIGGER_PCT } from "./constants";
import { formatCount, formatFractionPct, formatInr } from "./format";
import { isKnownTiming, type MarkdownRow, type Timing } from "./types";

/**
 * TWO BUCKETS, AND THE REASON THERE IS NO THIRD.
 *
 * `timing` is text in the schema and the batch scorer can write three
 * values: NOW, WEEK_4 and HOLD. Only two of them can ever occur, and the
 * screen says so rather than leaving a permanently empty column that reads
 * as missing data.
 *
 * WHY WEEK_4 IS UNREACHABLE (sv/markdown.py, the E3 comment)
 * ----------------------------------------------------------
 * The margin definition in force scores only the incremental volume a cut
 * shifts inside the window that survives. Waiting DELAY_WEEKS weeks leaves a
 * window that is a STRICT SUBSET of the current one -- same start rate,
 * fewer weeks, and a deeper required cut -- so the delayed plan can never
 * clear more of the leftover, and can never clear it at a shallower depth.
 * margin_if_delayed therefore cannot exceed margin_if_now, and the branch
 * that would emit WEEK_4 tests exactly that. It is kept in the pipeline
 * because it is a correct guard, and because a future revision that prices
 * the base volume as well would break the dominance -- but on today's
 * definition it is arithmetic, not an empty result set.
 */

export type TimingBucketsProps = {
  rows: readonly MarkdownRow[];
};

type Bucket = {
  timing: Timing;
  label: string;
  blurb: string;
  tone: "down" | "grey";
  fill: string;
};

const BUCKETS: readonly Bucket[] = [
  {
    timing: "NOW",
    label: "Cut this week",
    blurb: "the wait costs more than the trigger allows",
    tone: "down",
    fill: "bg-orange",
  },
  {
    timing: "HOLD",
    label: "Hold the current depth",
    blurb: "the wait is cheaper than the trigger, so the depth stands",
    tone: "grey",
    fill: "bg-[#D8CCC2]",
  },
];

export function TimingBuckets({ rows }: TimingBucketsProps) {
  const total = rows.length;
  const totalSaved = rows.reduce((sum, row) => sum + row.marginSaved, 0);
  const unexpected = rows.filter((row) => !isKnownTiming(row.timing));

  return (
    <Card>
      <CardHeader
        title="Timing"
        subtitle={`NOW or HOLD, on a ${DELAY_WEEKS}-week review cycle`}
      />
      <CardBody>
        {BUCKETS.map((bucket) => {
          const inBucket = rows.filter((row) => row.timing === bucket.timing);
          const saved = inBucket.reduce((sum, row) => sum + row.marginSaved, 0);
          const share = total > 0 ? inBucket.length / total : 0;
          return (
            <div
              key={bucket.timing}
              className="py-[12px] border-b border-rule last:border-b-0"
            >
              <div className="flex items-baseline justify-between gap-[10px] mb-[6px]">
                <span className="text-copy font-bold text-ink">
                  {bucket.label}
                </span>
                <span className="flex items-center gap-[8px]">
                  <b className="text-[15px] font-extrabold tabular-nums text-ink">
                    {formatCount(inBucket.length)}
                  </b>
                  <Pill variant={bucket.tone} tabular>
                    {formatInr(saved)}
                  </Pill>
                </span>
              </div>
              <div className="h-[8px] rounded-pill bg-cream overflow-hidden">
                <div
                  className={`h-full rounded-pill ${bucket.fill}`}
                  style={{ width: `${(share * 100).toFixed(1)}%` }}
                />
              </div>
              <div className="mt-[5px] text-small font-semibold text-mute">
                {formatFractionPct(share, 0)} of the styles in scope --{" "}
                {bucket.blurb}.
              </div>
            </div>
          );
        })}

        {/* Two paragraphs of argument for a two-bar chart. The bars carry the
            counts; the reason the third bar does not exist is worth having and
            is not worth 170 words above the table it belongs to. */}
        <Why
          lead="NOW or HOLD only."
          label={`why WEEK_${DELAY_WEEKS} can never fire`}
          className="mt-[14px] block max-w-[62ch]"
        >
          There is no third bucket, and its absence is arithmetic rather than a
          quiet week. The scorer can also write{" "}
          <span className="font-mono text-[11px] text-ink">
            WEEK_{DELAY_WEEKS}
          </span>{" "}
          -- &ldquo;waiting is genuinely the better plan&rdquo; -- but on the
          margin definition in force it can never fire. The delayed window is
          a strict subset of the current one: fewer trading weeks against a
          pile that {DELAY_WEEKS} weeks of ordinary trading has barely dented,
          and a
          deeper cut needed to move it. So the delayed plan cannot clear more
          units, cannot clear them at a shallower depth, and its margin cannot
          exceed acting today&apos;s. The branch stays in the pipeline because
          it is a correct guard and because a revision that also prices base
          volume would break that dominance. Until then a third column here
          would be permanently empty, which reads as broken rather than as
          proven.
          <span className="mt-[8px] block">
            The split between the two is the{" "}
            {formatFractionPct(NOW_MARGIN_TRIGGER_PCT, 0)} trigger and nothing
            else: cut now where waiting costs more than that share of the
            leftover&apos;s value at list, hold where it costs less.
          </span>
        </Why>

        {/* The one figure from that paragraph a planner acts on stays out. */}
        <p className="mt-[8px] max-w-[62ch] text-small leading-[1.6] text-mute">
          Worth <b className="text-ink tabular-nums">{formatInr(totalSaved)}</b>{" "}
          across {formatCount(total)} {total === 1 ? "style" : "styles"}.
        </p>

        {unexpected.length > 0 ? (
          <p className="mt-[10px] max-w-[62ch] text-copy leading-[1.6] text-red font-semibold">
            {unexpected.length}{" "}
            {unexpected.length === 1 ? "row carries" : "rows carry"} a timing
            value this screen does not recognise (
            {[...new Set(unexpected.map((row) => row.timing))].join(", ")}). It
            is surfaced rather than dropped: an unexpected label is a pipeline
            change the screen has not caught up with, and hiding it would make
            the two counts above wrong without saying so.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
