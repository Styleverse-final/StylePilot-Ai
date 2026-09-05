import Link from "next/link";

import { Card, CardBody, CardHeader, Why } from "@/components";
import type { TouchlessRate } from "@/lib/queries";

import { formatCount, formatCrore } from "./format";

/**
 * DecisionThreads -- block 2.
 *
 * The disposition of every recommendation in the brand's programme, from
 * v_touchless_rate, which is a view over the decision log and moves on every
 * agent run:
 *
 *   agent-executed  = agent_acted
 *   escalated       = agent_escalated
 *   planner review  = everything the agents did not close, which includes
 *                     the buy recommendations they are not allowed to touch
 *
 * The three add to recommendations_total by construction, so the bar is a
 * true partition rather than three counts that happen to sit together.
 *
 * WHY ONE BAR AND NOT 299 THREADS
 * -------------------------------
 * This used to draw one thread per recommendation -- 299 marks, coloured by
 * disposition. It was distinctive and it did not communicate: the eye cannot
 * count 299 of anything, and the number that matters, the escalated slice,
 * was the hardest thing to extract from a field of near-identical strokes.
 *
 * A stacked bar carries the same partition in a shape the eye reads in one
 * pass, and only the escalated segment is coloured, because it is the only
 * one anybody acts on. Same data, same argument, one shape.
 *
 * WHY THE HEADLINE DOES NOT SAY "NEED YOU"
 * ----------------------------------------
 * Because these are brand programme totals and the panel says so on its last
 * line. agent_escalated is a counter on agent_run, not a flag on any
 * recommendation -- there is no set of 53 rows anywhere in the schema, and a
 * planner scoped to a few categories owns nothing like 53 of them. "53
 * decisions need you" over a footnote reading "not the size of your own
 * queue" would be the panel contradicting itself in two lines.
 *
 * So the count says "need a human", which is what it measures, and the
 * figures that ARE the reader's -- the exceptions in their scope with no
 * decision on them, and what those are worth -- are labelled as theirs and
 * carry the link. The bar argues about the programme; the link goes to work.
 */

/** Segment colours, lifted from `.th.a`, `.th.b` and `.th.c`. */
const AGENT_COLOR = "#E5DED7";
const REVIEW_COLOR = "#CDBFB4";
const ESCALATED_COLOR = "#D04A02";

/**
 * Floor on a segment's rendered width. A slice worth a fraction of a percent
 * would otherwise be a hairline nobody can see and, on the escalated segment,
 * nobody can click. It distorts the widths very slightly; a segment too thin
 * to hit is worse.
 */
const MIN_SEGMENT_PCT = 4;

/** Where the escalated segment goes: the exceptions with no decision yet. */
export const OPEN_EXCEPTIONS_HREF = "/exceptions?status=open";

export type DecisionThreadsProps = {
  touchless: TouchlessRate | null;
  /**
   * Exceptions in THIS reader's scope carrying no decision row, and what they
   * are worth. Not a slice of the counts above -- those are brand totals --
   * which is why they are labelled separately wherever they appear.
   */
  openExceptionCount?: number;
  openExceptionValueInr?: number | null;
};

function share(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** "17.7%" -- one decimal, because 53/299 is not a round number. */
function pct(part: number, whole: number): string {
  return `${share(part, whole).toFixed(1)}%`;
}

function Legend({
  color,
  label,
  count,
  total,
}: {
  color: string;
  label: string;
  count: number;
  total: number;
}) {
  return (
    <span className="flex items-baseline gap-[7px]">
      <span
        aria-hidden="true"
        className="inline-block h-[10px] w-[10px] shrink-0 translate-y-[1px] rounded-[3px]"
        style={{ background: color }}
      />
      <span className="text-[12.5px] font-bold text-ink tabular">
        {formatCount(count)}
      </span>
      <span className="text-[12.5px] font-semibold text-body">{label}</span>
      <span className="text-[12.5px] font-semibold text-mute tabular">
        {pct(count, total)}
      </span>
    </span>
  );
}

export function DecisionThreads({
  touchless,
  openExceptionCount,
  openExceptionValueInr,
}: DecisionThreadsProps) {
  const acted = Math.max(0, touchless?.agent_acted ?? 0);
  const escalated = Math.max(0, touchless?.agent_escalated ?? 0);
  const reported = Math.max(0, touchless?.recommendations_total ?? 0);

  // The view's agent counters and its recommendation total are not always
  // narrowed by row level security to the identical row set: for a planner
  // whose categories exclude some of what the agents examined, agent_acted +
  // agent_escalated can exceed recommendations_total. Taking the larger of
  // the two as the whole keeps the bar an honest partition -- no reported
  // count is altered, and "planner review" is only ever the remainder, which
  // then correctly falls to zero rather than going negative.
  const total = Math.max(reported, acted + escalated);
  const review = total - acted - escalated;

  // Widths are floored so nothing vanishes, then renormalised so they still
  // sum to 100 and the bar has no gap at its end.
  const raw = [acted, review, escalated].map((n) =>
    n === 0 ? 0 : Math.max(MIN_SEGMENT_PCT, share(n, total)),
  );
  const scale = raw.reduce((a, b) => a + b, 0) || 1;
  const [actedW, reviewW, escalatedW] = raw.map((w) => (w / scale) * 100);

  const hasOpen = typeof openExceptionCount === "number" && openExceptionCount > 0;

  return (
    <Card>
      <CardHeader
        title="This week's decisions"
        subtitle="Every recommendation in the brand's programme, by how it was disposed of"
      />
      <CardBody>
        {total === 0 ? (
          <p className="text-[12.5px] leading-[1.6] text-body">
            No recommendations are visible in your scope, so there is no week
            to draw. This is what a planner scoped to a region with no open
            work sees; it is a scope result, not a failure.
          </p>
        ) : (
          <>
            {/* The one number worth taking from the panel, in the largest
                type on it, with what the reader can actually act on beside
                it. Two different scopes, so both say which they are. */}
            <div className="flex flex-wrap items-baseline gap-x-[14px] gap-y-[3px]">
              <span className="text-[25px] font-extrabold leading-[1.15] tracking-[-0.01em] text-ink">
                {formatCount(escalated)} decisions need a human
              </span>
              {hasOpen ? (
                <span className="text-[12.5px] font-bold text-mute">
                  {openExceptionValueInr ? (
                    <>
                      <span className="text-orangeD">
                        {formatCrore(openExceptionValueInr)}
                      </span>{" "}
                      at stake in the {formatCount(openExceptionCount)} you can
                      act on
                    </>
                  ) : (
                    <>
                      {formatCount(openExceptionCount)} of them in your scope
                    </>
                  )}
                </span>
              ) : null}
            </div>

            <div
              role="img"
              aria-label={`${total} decisions: ${acted} agent-executed, ${review} planner review, ${escalated} escalated`}
              className="mt-[13px] flex h-[32px] w-full overflow-hidden rounded-[8px]"
            >
              {acted > 0 ? (
                <span style={{ width: `${actedW}%`, background: AGENT_COLOR }} />
              ) : null}
              {review > 0 ? (
                <span style={{ width: `${reviewW}%`, background: REVIEW_COLOR }} />
              ) : null}
              {escalated > 0 ? (
                <Link
                  href={OPEN_EXCEPTIONS_HREF}
                  style={{ width: `${escalatedW}%`, background: ESCALATED_COLOR }}
                  className="group flex items-center justify-center transition-opacity duration-[120ms] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orangeD"
                  aria-label={`${escalated} escalated. Open the exceptions in your scope awaiting a decision.`}
                >
                  <span className="px-[6px] text-[11px] font-extrabold text-white opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100">
                    Open
                  </span>
                </Link>
              ) : null}
            </div>

            <div className="mt-[10px] flex flex-wrap gap-x-[20px] gap-y-[5px]">
              <Legend
                color={AGENT_COLOR}
                label="agent-executed"
                count={acted}
                total={total}
              />
              <Legend
                color={REVIEW_COLOR}
                label="planner review"
                count={review}
                total={total}
              />
              <Legend
                color={ESCALATED_COLOR}
                label="escalated"
                count={escalated}
                total={total}
              />
            </div>

            {/* The two-rate sentence, composed from the same columns the
                view's own `framing` string is composed from, so it cannot
                drift from the arithmetic. The verbatim original is kept
                behind the toggle rather than discarded -- it is the sentence
                written next to the SQL, and it is the one to check against.

                ONE TEXT NODE, NOT A SPAN PER NUMBER. Bolding each figure in
                its own <span> made React stream them as separate Suspense
                slots -- `<div hidden id="S:2">` in the markup and an inline
                script to move it into place -- so the sentence read "agents
                have scope over of recommendations" until JavaScript ran. It
                is a sentence, not a table; it does not need four elements,
                and it should not depend on a script to be legible. */}
            {touchless ? (
              <p className="mt-[13px] max-w-[88ch] text-[12.5px] leading-[1.6] text-body">
                {[
                  `Agents have scope over ${formatCount(touchless.in_scope_denominator)}`,
                  ` of ${formatCount(total)} recommendations.`,
                  ` Within scope ${touchless.in_scope_rate}% run touchless;`,
                  ` across all decisions ${touchless.overall_rate}%.`,
                  " Buy quantities are excluded because a planner owns every",
                  " committed buy.",
                ].join("")}
              </p>
            ) : null}

            {touchless?.framing ? (
              <Why
                lead={`${formatCount(touchless.buy_out_of_agent_scope)} buy recommendations are the exclusion`}
                label="the framing in full, as the view writes it"
                className="mt-[6px] block max-w-[88ch]"
              >
                {touchless.framing}
              </Why>
            ) : null}

            {/* Kept deliberately. A planner reading 299 has to know it is the
                brand's programme and not their in-tray, or the panel has
                quietly inflated their workload by an order of magnitude. */}
            <p className="mt-[7px] max-w-[88ch] text-[12px] font-semibold leading-[1.55] text-mute">
              These are programme totals for the brand, not the size of your
              own queue.
              {hasOpen ? (
                <>
                  {" "}
                  <Link
                    href={OPEN_EXCEPTIONS_HREF}
                    className="font-bold text-orangeD underline underline-offset-2"
                  >
                    Open the {formatCount(openExceptionCount)} exception
                    {openExceptionCount === 1 ? "" : "s"} awaiting your decision
                  </Link>
                  .
                </>
              ) : null}
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default DecisionThreads;
