import { Card, CardBody, CardHeader, Pill } from "@/components";
import type { AgentRun } from "@/lib/queries";

import { Muted, Quote } from "./Layout";
import {
  JUDGEMENT_RULES,
  MODEL_GAP_RULE,
  reconciles,
  type ClassifiedOverride,
  type KeywordRule,
  type OverrideAnalysis,
} from "./classify";
import { MIDDOT, formatCount, formatShare, formatTimestamp, plural } from "./format";

/**
 * THE LEARNING LOOP -- and an honest account of who did the classifying.
 *
 * The autonomy band for learning_agent says it "classifies planner overrides
 * into judgement versus model gap and queues the model gaps for retraining".
 * Every run of that agent in agent_run has items_examined = 0. It has never
 * read an override. There is no bucket column, no tag table and no stored
 * classification anywhere in the schema; override_reason is free text.
 *
 * So the split below is computed ON READ by a keyword rule, and the rule is
 * printed beside its own output. That is a weaker artefact than a stored
 * classification and the panel says so at the top rather than in a footnote.
 * It is also the honest one: a chart labelled "18 planner judgement, 4 model
 * gap" with no way to see which words produced it is indistinguishable from
 * a chart somebody typed.
 *
 * WHY THE BUCKETS SIT ON THE JUDGEMENT SET
 * ----------------------------------------
 * competitor_activity, supplier_constraint and calendar_shift describe what
 * the PLANNER knew that the model could not: a rival's move, a lead time, a
 * festival that shifted. None of them describes a defect in the model, so
 * none of them belongs on the model-gap set. Attaching them there would also
 * be arithmetically impossible -- they cover seventeen rows and there are
 * four model gaps.
 */

export type LearningLoopProps = {
  analysis: OverrideAnalysis;
  /** learning_agent rows from agent_run, for the "has it ever run" line. */
  learningRuns: readonly AgentRun[];
};

/** One bar in the split. Ports `.arow` / `.ah` / `.bar` from the spec. */
function SplitBar({
  label,
  count,
  total,
  tone,
  children,
}: {
  label: string;
  count: number;
  total: number;
  tone: "gap" | "judgement";
  children?: React.ReactNode;
}) {
  const width = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="border-b border-rule py-[11px] last:border-b-0">
      <div className="mb-[7px] flex items-center justify-between gap-[10px] text-[12px]">
        <span className="font-bold text-ink">{label}</span>
        <span className="font-extrabold text-ink tabular">
          {formatCount(count)}
          <span className="ml-[6px] font-semibold text-mute">
            {formatShare(count, total)}
          </span>
        </span>
      </div>
      <div className="h-[8px] overflow-hidden rounded-pill bg-cream">
        <div
          className={`h-full rounded-pill ${tone === "gap" ? "bg-orange" : "bg-green"}`}
          style={{ width: `${Math.max(0, Math.min(100, width))}%` }}
        />
      </div>
      {children ? <div className="mt-[6px]">{children}</div> : null}
    </div>
  );
}

/** The rule itself, rendered so a reader can check any row against it. */
function RuleCard({
  rule,
  order,
  count,
}: {
  rule: KeywordRule;
  order: string;
  count: number;
}) {
  return (
    <div className="border-b border-rule py-[11px] last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
        <span className="text-[12px] font-extrabold text-ink">
          {order}. {rule.label}
        </span>
        <span className="text-[12px] font-extrabold text-ink tabular">
          {formatCount(count)}
        </span>
      </div>
      <div className="mt-[4px] flex flex-wrap gap-[5px]">
        {rule.keywords.map((keyword) => (
          <span
            key={keyword}
            className="rounded-[5px] bg-cream px-[6px] py-[2px] font-mono text-[10.5px] font-bold text-ink2"
          >
            {keyword}
          </span>
        ))}
      </div>
      <Muted className="mt-[5px]">{rule.meaning}</Muted>
    </div>
  );
}

/** One retraining candidate, with the phrase that put it there. */
function GapRow({ row }: { row: ClassifiedOverride }) {
  return (
    <div className="border-b border-rule py-[12px] last:border-b-0">
      <div className="flex flex-wrap items-center gap-[8px]">
        <Pill variant="orange">Retraining candidate</Pill>
        <span className="text-[12px] font-extrabold text-ink">
          {row.entry.accountableName}
        </span>
        <span className="text-small font-semibold text-mute">
          {MIDDOT} {formatTimestamp(row.entry.decidedAt)} {MIDDOT} decision{" "}
          <span className="tabular">{row.entry.id}</span> on recommendation{" "}
          <span className="tabular">{row.entry.recommendationId}</span>
        </span>
      </div>
      <Quote className="mt-[8px]">{row.entry.reason}</Quote>
      <Muted className="mt-[6px]">
        Matched{" "}
        {row.matched.map((keyword, index) => (
          <span key={keyword}>
            {index > 0 ? ", " : ""}
            <span className="font-mono text-[11px] text-ink">
              &ldquo;{keyword}&rdquo;
            </span>
          </span>
        ))}{" "}
        {MIDDOT} the planner is reporting something the model does not know,
        which is a feature request rather than a fact about the market.
      </Muted>
    </div>
  );
}

export function LearningLoop({ analysis, learningRuns }: LearningLoopProps) {
  const total = analysis.all.length;
  const examined = learningRuns.reduce(
    (sum, run) => sum + (run.items_examined ?? 0),
    0,
  );
  const balanced = reconciles(analysis);

  return (
    <Card>
      <CardHeader
        title="Learning loop"
        subtitle="Which overrides are the planner being right, and which are the model being wrong"
        actions={
          examined === 0 ? (
            <Pill variant="amber">Classified on read, not by the agent</Pill>
          ) : (
            <Pill variant="violet">
              {formatCount(examined)} examined by the learning agent
            </Pill>
          )
        }
      />

      <CardBody className="border-b border-rule">
        <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
          {examined === 0 ? (
            <>
              <span className="font-bold text-ink">
                Nothing in the database has classified these overrides.
              </span>{" "}
              override_reason is free text; there is no bucket column and no tag
              table. The learning agent&apos;s own autonomy band says it
              classifies overrides into judgement versus model gap and queues
              the gaps for retraining, and{" "}
              {learningRuns.length === 0
                ? "no run of it is readable in your scope"
                : `across ${plural(learningRuns.length, "recorded run", "recorded runs")} it has examined ${formatCount(examined)} items`}
              . On a governance screen that is the finding, not a footnote: the
              loop is specified and wired and has not yet closed once. The split
              below is therefore computed by this screen, at read time, using
              the keyword rule printed beside it -- so you can check any row
              against the rule instead of taking the number on trust.
            </>
          ) : (
            <>
              The learning agent has examined {formatCount(examined)} items
              across {plural(learningRuns.length, "run", "runs")}. The split
              below is still computed by this screen from the reason text,
              using the rule printed beside it, because there is no stored
              classification column to read; where the agent&apos;s own output
              lands in the schema it should replace this.
            </>
          )}
        </p>
      </CardBody>

      <div className="grid grid-cols-[1.1fr_1fr] items-start gap-x-[20px] max-[1140px]:grid-cols-1">
        <CardBody className="border-r border-rule max-[1140px]:border-r-0 max-[1140px]:border-b">
          <div className="mb-[4px] text-[12.5px] font-extrabold text-ink">
            {total === 0
              ? "No human overrides in your scope"
              : `${plural(total, "human override", "human overrides")} in your scope`}
          </div>
          <Muted className="mb-[10px]">
            An override is a committed human decision that departed from the
            recommendation as issued -- MODIFIED or REJECTED. The{" "}
            {plural(analysis.humanApprovals, "approval", "approvals")} among
            your {plural(analysis.humanDecisions, "human decision", "human decisions")}{" "}
            are not counted here: agreeing is not overriding, however carefully
            it was reasoned.
          </Muted>

          <SplitBar
            label="Planner judgement"
            count={analysis.judgement.length}
            total={total}
            tone="judgement"
          >
            <Muted>
              The planner knew something the model could not. Nothing to
              retrain; this is the collaboration working.
            </Muted>
          </SplitBar>
          <SplitBar
            label="Model gap"
            count={analysis.modelGaps.length}
            total={total}
            tone="gap"
          >
            <Muted>
              The reason names a gap in the MODEL. These are the retraining
              candidates, listed in full below.
            </Muted>
          </SplitBar>

          <div className="mt-[14px] border-t border-rule pt-[12px]">
            <div className="mb-[6px] text-[12px] font-extrabold text-ink">
              Where the judgement rows fall
            </div>
            {analysis.buckets.map((bucket) => (
              <div
                key={bucket.rule.key}
                className="flex items-baseline justify-between gap-[10px] py-[4px] text-copy"
              >
                <span className="font-semibold text-body">{bucket.rule.label}</span>
                <span className="font-extrabold text-ink tabular">
                  {formatCount(bucket.rows.length)}
                </span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-[10px] py-[4px] text-copy">
              <span className="font-semibold text-body">
                Matched no keyword
              </span>
              <span className="font-extrabold text-ink tabular">
                {formatCount(analysis.unbucketed.length)}
              </span>
            </div>

            {analysis.unbucketed.length > 0 ? (
              <div className="mt-[8px]">
                <Muted className="mb-[6px]">
                  {analysis.unbucketed.length === 1
                    ? "One judgement row matches none of the three buckets. It is shown rather than absorbed into the nearest one, because a bucket stretched to swallow a row it does not describe is how a classification stops meaning anything."
                    : "These judgement rows match none of the three buckets. They are shown rather than absorbed into the nearest one, because a bucket stretched to swallow rows it does not describe is how a classification stops meaning anything."}
                </Muted>
                {analysis.unbucketed.map((row) => (
                  <Quote key={row.entry.id} className="mb-[6px] last:mb-0">
                    {row.entry.reason ?? "No reason recorded."}
                    <span className="mt-[4px] block text-small font-semibold text-mute">
                      {row.entry.accountableName} {MIDDOT}{" "}
                      {formatTimestamp(row.entry.decidedAt)}
                    </span>
                  </Quote>
                ))}
              </div>
            ) : null}

            <Muted className="mt-[10px]">
              {balanced ? (
                <>
                  Every override is accounted for:{" "}
                  <span className="tabular text-ink">
                    {formatCount(analysis.modelGaps.length)}
                  </span>{" "}
                  model gap plus{" "}
                  <span className="tabular text-ink">
                    {formatCount(analysis.judgement.length)}
                  </span>{" "}
                  judgement makes{" "}
                  <span className="tabular text-ink">{formatCount(total)}</span>,
                  and the judgement set breaks into{" "}
                  {analysis.buckets
                    .map((b) => formatCount(b.rows.length))
                    .join(" + ")}{" "}
                  + {formatCount(analysis.unbucketed.length)} unbucketed ={" "}
                  <span className="tabular text-ink">
                    {formatCount(analysis.judgement.length)}
                  </span>
                  . No row has been dropped.
                </>
              ) : (
                <span className="font-bold text-red">
                  The parts do not sum to the whole. Something has been
                  double-counted or lost, and this line is saying so rather
                  than letting the chart above look tidy.
                </span>
              )}
            </Muted>
          </div>
        </CardBody>

        <CardBody>
          <div className="mb-[4px] text-[12.5px] font-extrabold text-ink">
            The rule, in full
          </div>
          <Muted className="mb-[8px]">
            Whole-phrase, case-insensitive, on word boundaries, tested in this
            order; the first match wins. Model gap is tested first and beats
            everything, because a reason that says the model missed something is
            a model gap even when it also names a competitor -- the claim about
            the SYSTEM is the one that decides whether the row belongs in a
            retraining queue. Order matters within the judgement rules too:
            &ldquo;market price has moved&rdquo; is competitor activity, and a
            calendar rule matching a loose word like &ldquo;moved&rdquo; would
            have taken it.
          </Muted>

          <RuleCard
            rule={MODEL_GAP_RULE}
            order="0"
            count={analysis.modelGaps.length}
          />
          {JUDGEMENT_RULES.map((rule, index) => (
            <RuleCard
              key={rule.key}
              rule={rule}
              order={String(index + 1)}
              count={
                analysis.buckets.find((b) => b.rule.key === rule.key)?.rows.length ?? 0
              }
            />
          ))}
        </CardBody>
      </div>

      <CardBody className="border-t border-rule">
        <div className="mb-[4px] text-[12.5px] font-extrabold text-ink">
          Retraining candidates
        </div>
        <Muted className="mb-[10px]">
          {analysis.modelGaps.length === 0
            ? "No override in your scope names a gap in the model. If one did, it would be listed here in full, with the phrase that classified it, ready to be argued with."
            : `Every model-gap row, in full. The learning agent's escalation rule is that three overrides sharing a root cause stop being planner judgement and start being a missing feature, so these are listed individually rather than counted -- the count is not the useful part, the repetition across them is.`}
        </Muted>
        {analysis.modelGaps.map((row) => (
          <GapRow key={row.entry.id} row={row} />
        ))}
      </CardBody>
    </Card>
  );
}
