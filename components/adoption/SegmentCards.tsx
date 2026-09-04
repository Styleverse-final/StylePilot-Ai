import Link from "next/link";

import { Card, CardBody, CardHeader, Pill } from "@/components";

import type { AxisCut, SegmentSummary, SegmentView } from "./data";
import { DASH, count, pct, plural, score } from "./format";

/**
 * THE FOUR READINESS SEGMENTS.
 *
 * Ports `.segc` from the production design system: a shell-tinted 18px tile
 * with a 26px count, a 13px name and a muted note, the highlighted tile in
 * peach.
 *
 * WHAT IS AND IS NOT DECIDED HERE
 * -------------------------------
 * Nothing numeric. Every count, score, range and share arrives already
 * computed from planner_adoption rows the caller read under row level
 * security. The segment ORDER is by mean adoption index, so the strongest
 * group leads without a list of names written into this file, and the
 * highlighted tile is simply the largest group -- which in this pilot is the
 * one that needs the most support, and that is worth the reader noticing.
 *
 * THE PROSE IS KEYED TO THE DATA, NOT TO THE LABEL
 * ------------------------------------------------
 * Each tile's sentence is chosen by which side of the two derived cuts the
 * segment sits on, not by matching its name against a string. If the cuts
 * cannot be read off the rows in scope, the sentence is omitted rather than
 * guessed: a segment description that contradicted the scores beside it
 * would be worse than no description.
 */

type Side = "high" | "low" | null;

function sideOf(value: number | null, cut: AxisCut | null): Side {
  if (value === null || cut === null) return null;
  return value >= cut.atOrAbove ? "high" : "low";
}

/**
 * The four corners of the two-by-two, in a planner's words. Prose only --
 * there is not a figure in here, and there must never be one.
 */
function note(readiness: Side, apprehension: Side): string | null {
  if (readiness === null || apprehension === null) return null;
  if (readiness === "high" && apprehension === "low") {
    return "Ready and unworried. These are the people who go first, and then coach the wave behind them -- which is why their curriculum is the shortest on the screen and not the longest.";
  }
  if (readiness === "high" && apprehension === "high") {
    return "Skill is not what is holding this group back. Pair them with a governance role so accountability feels held by somebody, because more training will not answer a question about whether the job still exists.";
  }
  if (readiness === "low" && apprehension === "low") {
    return "Open to it and short of practice. Hands-on hours are the whole answer here, which is why the curriculum sized for them is longer than the confident group's.";
  }
  return "The longest runway, and the group most easily lost. Rushing them is how trust breaks across the whole programme, so they are coached by people who have already been through it rather than pushed through a schedule.";
}

function Tile({
  summary,
  segments,
  view,
  highlight,
}: {
  summary: SegmentSummary;
  segments: readonly SegmentSummary[];
  view: SegmentView;
  highlight: boolean;
}) {
  const readiness = sideOf(summary.readinessMean, view.readinessCut);
  const apprehension = sideOf(summary.apprehensionMean, view.apprehensionCut);
  const sentence = note(readiness, apprehension);
  const multiBrand = view.brands.length > 1 && summary.byBrand.length > 1;

  return (
    <div
      className={`rounded-inner p-[16px] ${highlight ? "bg-peach" : "bg-shell"}`}
    >
      <div className="flex items-baseline gap-[8px]">
        <div className="text-[26px] font-extrabold tracking-[-0.02em] tabular">
          {count(summary.people)}
        </div>
        <div className="text-small font-bold text-mute tabular">
          {pct(summary.share, 0)} of {plural(view.people, "planner", "planners")}
        </div>
      </div>
      <div className="mb-[8px] mt-[2px] text-[13px] font-extrabold text-ink">
        {summary.segment}
      </div>

      {sentence === null ? (
        <p className="text-small leading-[1.55] text-mute">
          The two survey answers in your scope do not separate cleanly enough
          to say which side of each cut this group sits on, so this tile
          reports its scores and leaves the characterisation alone.
        </p>
      ) : (
        <p className="text-small leading-[1.55] text-mute">{sentence}</p>
      )}

      <div className="mt-[10px] flex flex-wrap gap-x-[12px] gap-y-[4px] text-[10.5px] font-bold text-mute">
        <span>
          Ready{" "}
          <b className="text-ink tabular">{score(summary.readinessMean)}</b>
          <span className="font-semibold">
            {" "}
            ({score(summary.readinessMin)}&ndash;{score(summary.readinessMax)})
          </span>
        </span>
        <span>
          Fear{" "}
          <b className="text-ink tabular">{score(summary.apprehensionMean)}</b>
          <span className="font-semibold">
            {" "}
            ({score(summary.apprehensionMin)}&ndash;{score(summary.apprehensionMax)})
          </span>
        </span>
        <span>
          Index{" "}
          <b className="text-ink tabular">
            {summary.indexMean === null ? DASH : summary.indexMean.toFixed(1)}
          </b>
        </span>
        <span>
          <b className="text-ink tabular">
            {summary.hours.length === 0
              ? DASH
              : summary.hours.map((hour) => hour.toFixed(0)).join(" / ")}
          </b>{" "}
          hrs recommended
        </span>
      </div>

      {multiBrand ? (
        <div className="mt-[7px] text-[10.5px] font-semibold text-mute tabular">
          {summary.byBrand
            .map((brand) => `${brand.brandId} ${count(brand.people)}`)
            .join(" · ")}
        </div>
      ) : null}

      {segments.length > 0 && summary.people === Math.max(...segments.map((s) => s.people)) ? (
        <div className="mt-[9px]">
          <Pill variant="orange">Largest group</Pill>
        </div>
      ) : null}
    </div>
  );
}

function CutLine({ label, cut }: { label: string; cut: AxisCut | null }) {
  if (cut === null) {
    return (
      <li>
        The {label} cut cannot be read off the rows in your scope -- either too
        few people or a segment missing -- so this screen does not name one.
      </li>
    );
  }
  return (
    <li>
      The {label} cut falls between{" "}
      <b className="tabular text-ink">{score(cut.below)}</b> and{" "}
      <b className="tabular text-ink">{score(cut.atOrAbove)}</b>: no planner in
      your scope sits between those two values and changes segment. Below it{" "}
      {cut.lowSegments.join(" and ")}; at or above it{" "}
      {cut.highSegments.join(" and ")}.
    </li>
  );
}

export function SegmentCards({ view }: { view: SegmentView }) {
  const largest =
    view.segments.length > 0
      ? Math.max(...view.segments.map((segment) => segment.people))
      : 0;

  return (
    <Card>
      <CardHeader
        title="Readiness against apprehension"
        subtitle="Measured from the workforce survey. Scoped by row level security, not by a filter on this page."
        actions={
          <Pill variant="grey">
            {plural(view.people, "planner", "planners")} readable
          </Pill>
        }
      />
      <CardBody>
        {view.segments.length === 0 ? (
          <p className="max-w-[88ch] text-copy leading-[1.6] text-body">
            No adoption rows are readable in your scope. That is a legitimate
            state rather than an error: planner_adoption is scoped to your
            brand unless you are a group CMPO or a CoE administrator, and a
            brand with no survey returns would show exactly this. What would
            appear here is one tile per readiness segment, carrying its
            headcount, the mean and range of both survey answers, the segment&apos;s
            mean adoption index and the learning hours the curriculum sizes
            for it.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-[12px] max-[900px]:grid-cols-1">
              {view.segments.map((segment) => (
                <Tile
                  key={segment.segment}
                  summary={segment}
                  segments={view.segments}
                  view={view}
                  highlight={segment.people === largest}
                />
              ))}
            </div>

            <ul className="mt-[16px] flex flex-col gap-[6px] border-t border-rule pt-[14px] text-small leading-[1.6] text-body">
              <CutLine label="readiness" cut={view.readinessCut} />
              <CutLine label="apprehension" cut={view.apprehensionCut} />
              <li>
                Neither cut is written into this page. Both are found by
                walking the distinct survey values in the rows on screen and
                taking the one split where no segment appears on both sides.
                If the rows stopped separating cleanly, this list would say so
                instead of naming a threshold.
              </li>
              <li>
                The hours on each tile are a size, not a syllabus. What they
                actually contain &mdash; which modules a segment&apos;s curriculum
                resolves to, in what order, and how far each person has got
                through theirs &mdash; is on{" "}
                <Link
                  href="/learning"
                  className="font-bold text-orangeD underline decoration-peach underline-offset-2 hover:decoration-orange"
                >
                  Learning
                </Link>
                , read from the same rows. It is not repeated here, because a
                second copy would drift from the first the day either changed.
              </li>
            </ul>

            {view.sampleRationale === null ? null : (
              <details className="mt-[12px] rounded-quote bg-shell px-[14px] py-[11px]">
                <summary className="cursor-pointer text-small font-bold text-ink">
                  How the adoption index behind these segments is built
                </summary>
                <p className="mt-[8px] text-small leading-[1.6] text-body">
                  Verbatim from the <code className="font-mono">rationale</code>{" "}
                  column of one planner_adoption row in your scope. Every row
                  carries its own, which is what makes the index re-derivable
                  by hand rather than a score you are asked to trust:
                </p>
                <p className="mt-[7px] text-small leading-[1.6] text-mute">
                  {view.sampleRationale}
                </p>
              </details>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default SegmentCards;
