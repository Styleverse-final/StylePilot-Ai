import { Card, CardBody, CardHeader, Pill } from "@/components";

import { REMEASUREMENT_MONTHS } from "./contract";
import {
  formatCorrelation,
  formatLead,
  formatThreshold,
  formatTimestamp,
  joinNames,
  plural,
} from "./format";
import { verdictFor, type GateRule, type GateVerdict, type SignalPair } from "./types";

/**
 * THE ADMISSION GATE, AS A PUBLISHED RULE.
 *
 * This is the governance point of the screen, and it is worth being precise
 * about what kind of rule it is.
 *
 * It is NOT a filter inside the model. The pipeline that builds the design
 * matrix lags all four signals to the forecast horizon and joins them for
 * every category; it drops nothing on correlation grounds, so a weak
 * category's search interest still enters the gradient booster and the
 * booster decides for itself how much to lean on it. What the gate governs
 * is what may be SAID: which measured leads a recommendation is allowed to
 * cite, which categories get a campaign window in a marketing handoff, and
 * which pairs are shown here as weighted rather than merely displayed.
 *
 * Saying that plainly costs nothing and buys the reader the ability to
 * check. A screen that implied the model refused weak signals would be
 * describing a system that does not exist.
 *
 * THE THRESHOLD IS READ, NOT TYPED. It comes from
 * downstream_handoff.supporting_metric, written by the pipeline run that
 * measured the leads. When it cannot be read, no pair is marked either way
 * and this card says so instead of quoting a number from the web app.
 */

type Bucket = {
  verdict: GateVerdict;
  title: string;
  tone: "up" | "amber" | "grey";
  blurb: string;
  emptyLine: string;
};

const BUCKETS: readonly Bucket[] = [
  {
    verdict: "weighted",
    title: "Weighted",
    tone: "up",
    blurb:
      "Clears the correlation bar at a lag of at least one week, so there is a forward window and a recommendation may cite it.",
    emptyLine:
      "No pair in your scope clears the bar with a forward window. If one did it would be named here, with the lead and the correlation that earned it.",
  },
  {
    verdict: "concurrent",
    title: "Clears the bar, no forward window",
    tone: "amber",
    blurb:
      "Correlates strongly, but the peak sits at a lag of zero: the signal moves with demand rather than ahead of it, so it confirms and does not warn.",
    emptyLine:
      "No pair in your scope peaks at a lag of zero. One that did would sit here rather than among the weighted pairs, because a concurrent signal buys no planning time.",
  },
  {
    verdict: "below",
    title: "Displayed, not weighted",
    tone: "grey",
    blurb:
      "Falls under the bar. The series is still charted and still readable; it simply carries no weight in anything the system says.",
    emptyLine:
      "Every pair in your scope clears the bar. If one fell below it, it would be listed here rather than dropped from the screen.",
  },
];

function GateColumn({
  bucket,
  pairs,
}: {
  bucket: Bucket;
  pairs: readonly SignalPair[];
}) {
  return (
    <div className="rounded-inner bg-shell px-[16px] py-[14px]">
      <div className="flex items-center gap-[8px]">
        <Pill variant={bucket.tone}>{bucket.title}</Pill>
        <span className="text-[11px] font-extrabold text-mute tabular-nums">
          {pairs.length}
        </span>
      </div>
      <p className="mt-[8px] text-[11.5px] leading-[1.55] text-body">{bucket.blurb}</p>
      {pairs.length === 0 ? (
        <p className="mt-[10px] text-[11.5px] leading-[1.55] text-mute">
          {bucket.emptyLine}
        </p>
      ) : (
        <ul className="mt-[10px] space-y-[7px]">
          {pairs.map((pair) => (
            <li
              key={pair.key}
              className="flex items-baseline justify-between gap-[10px] border-b border-rule pb-[6px] last:border-b-0 last:pb-0"
            >
              <span className="text-[12px] font-bold text-ink">
                {pair.categoryName}
                <span className="ml-[6px] text-[10.5px] font-semibold text-mute">
                  {pair.brandName}
                </span>
              </span>
              {/* Lead and correlation together, in every list on this screen. */}
              <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-body">
                {formatLead(pair.leadWeeks)}
                <span className="text-mute"> at r </span>
                {formatCorrelation(pair.correlation)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type AdmissionGateProps = {
  pairs: readonly SignalPair[];
  gates: Record<string, GateRule>;
};

export function AdmissionGate({ pairs, gates }: AdmissionGateProps) {
  const rules = Object.values(gates).sort((a, b) =>
    a.brandId.localeCompare(b.brandId),
  );
  const thresholds = [...new Set(rules.map((rule) => rule.minCorrelation))];
  const signals = [
    ...new Set(rules.map((rule) => rule.leadSignal).filter((s): s is string => !!s)),
  ];
  const sources = [
    ...new Set(rules.map((rule) => rule.sourceTable).filter((s): s is string => !!s)),
  ];
  const stamped = rules
    .map((rule) => rule.generatedAt)
    .filter((value): value is string => typeof value === "string")
    .sort()
    .at(-1);

  const byVerdict = new Map<GateVerdict, SignalPair[]>();
  for (const pair of pairs) {
    const verdict = verdictFor(pair, gates[pair.brandId]);
    const list = byVerdict.get(verdict) ?? [];
    list.push(pair);
    byVerdict.set(verdict, list);
  }
  const unresolved = [
    ...(byVerdict.get("no-gate") ?? []),
    ...(byVerdict.get("unmeasured") ?? []),
  ];

  return (
    <Card>
      <CardHeader
        title="The signal admission gate"
        subtitle="What a signal has to prove before anything the system says is allowed to lean on it"
      />
      <CardBody>
        {rules.length === 0 ? (
          <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
            The admission threshold could not be read. It is not a constant in
            this application: the pipeline writes the bar it applied into{" "}
            <span className="font-mono text-[11.5px]">
              downstream_handoff.supporting_metric
            </span>{" "}
            as <span className="font-mono text-[11.5px]">min_actionable_corr</span>,
            and this screen reads it back so the gate drawn here is the gate the
            pipeline drew. No marketing handoff row is readable in your scope,
            so no pair below is marked passed or failed, and the measured leads
            and correlations are shown without a verdict rather than judged
            against a number typed into the web app. They would be marked the
            moment that row is readable again.
          </p>
        ) : (
          <>
            <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
              <b className="text-ink">The rule.</b> A signal is admitted for a
              brand-category when its deseasonalised cross-correlation with
              deseasonalised demand reaches{" "}
              {thresholds.length === 1 ? (
                <b className="text-ink tabular-nums">
                  r {formatThreshold(thresholds[0])}
                </b>
              ) : (
                <b className="text-ink tabular-nums">
                  the bar its own brand was scored against (
                  {joinNames(thresholds.map((t) => `r ${formatThreshold(t)}`))})
                </b>
              )}{" "}
              or better at a stated lag, measured per category rather than
              assumed for the brand, and re-measured every{" "}
              {REMEASUREMENT_MONTHS} months. Admission is not enough on its own:
              a signal that clears the bar at a lag of zero is confirmed, not
              leading, and buys no planning time, so it is separated out below.
            </p>
            <p className="mt-[10px] max-w-[96ch] text-copy leading-[1.6] text-body">
              <b className="text-ink">Where the bar comes from.</b> It is not a
              constant in this application. The pipeline run that measured
              these leads recorded the bar it applied them against, and this
              screen reads it back from{" "}
              <span className="font-mono text-[11.5px]">
                downstream_handoff.supporting_metric
              </span>{" "}
              so the two cannot drift apart
              {signals.length === 1 ? (
                <>
                  {" "}
                  -- along with the series the search ran on,{" "}
                  <span className="font-mono text-[11.5px]">{signals[0]}</span>
                </>
              ) : null}
              {sources.length > 0 ? (
                <>
                  , derived from{" "}
                  <span className="font-mono text-[11.5px]">
                    {joinNames(sources)}
                  </span>
                </>
              ) : null}
              {stamped ? `, stamped ${formatTimestamp(stamped)}` : ""}. The
              re-measurement cadence is the one part of this rule with no table
              behind it, and it is listed as such below.
            </p>
            <p className="mt-[10px] max-w-[96ch] text-copy leading-[1.6] text-body">
              <b className="text-ink">What the gate does and does not do.</b> It
              governs what may be SAID, not what the model may see. The design
              matrix joins every signal series to every category, lagged to the
              forecast horizon, and drops none of them on correlation grounds;
              the booster decides for itself how much weight a weak series
              earns. The gate decides which measured leads a recommendation may
              cite, which categories get a campaign window in a downstream
              handoff, and which pairs read as weighted here. Describing it as a
              filter inside the model would be describing a system that does
              not exist.
            </p>

            <div className="mt-[16px] grid grid-cols-3 gap-[14px] max-[1140px]:grid-cols-1">
              {BUCKETS.map((bucket) => (
                <GateColumn
                  key={bucket.verdict}
                  bucket={bucket}
                  pairs={byVerdict.get(bucket.verdict) ?? []}
                />
              ))}
            </div>

            {unresolved.length > 0 ? (
              <p className="mt-[14px] max-w-[96ch] text-copy leading-[1.6] text-body">
                {plural(unresolved.length, "pair is", "pairs are")} not placed in
                any of the {BUCKETS.length} columns above:{" "}
                {joinNames(
                  unresolved.map(
                    (pair) => `${pair.brandName} ${pair.categoryName}`,
                  ),
                )}
                . Either no measured lead reached the row, or no threshold is
                readable for that brand, and in both cases an unjudged pair is
                the honest answer rather than a default verdict.
              </p>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default AdmissionGate;
