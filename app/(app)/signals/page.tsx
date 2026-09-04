import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  AccuracyStatement,
  Banner,
  Card,
  CardBody,
  CardHeader,
  ModelStrip,
  PageHeader,
  type KpiItem,
} from "@/components";
import { AdmissionGate } from "@/components/signals/AdmissionGate";
import { BandGovernor, BandInForce } from "@/components/signals/BandGovernor";
import {
  ProductionContract,
  UntabledFigures,
} from "@/components/signals/DataContract";
import { LeadTable } from "@/components/signals/LeadTable";
import { SignalHistory } from "@/components/signals/SignalHistory";
import {
  readSignalScope,
  strongestPair,
  totalBandCounts,
  weakestCurrentBand,
} from "@/components/signals/data";
import {
  formatCorrelation,
  formatCount,
  formatLead,
  formatOutOf,
  formatThreshold,
  formatTimestamp,
  joinNames,
  pairLabel,
  plural,
} from "@/components/signals/format";
import {
  verdictFor,
  type SignalScope,
} from "@/components/signals/types";
import { getAccuracyHeadline, type AccuracyHeadline } from "@/lib/accuracy";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Signals",
};

/**
 * SIGNALS -- external demand drivers, and what a measured lead is worth.
 *
 * A server component throughout. Every figure is read at request time
 * through createServerAnonClient(), so row level security decides the scope:
 * signal_intelligence hands a group CMPO or a CoE administrator both brands,
 * a planning manager or CMPO their whole brand, and a category planner only
 * the categories on their planner record. The read carries no brand
 * predicate of its own, deliberately -- pinning the session's brand_id would
 * have quietly halved the portfolio for somebody entitled to all of it.
 *
 * THE RULE THIS SCREEN IS ORGANISED AROUND
 * ----------------------------------------
 * A measured lead never appears without the correlation that earned it. Not
 * in the table, not in the chart header, not in a pill, not in the KPI row
 * at the top of this page. A three-week lead at r 0.26 and a four-week lead
 * at r 0.84 are different claims about the world, and the moment they are
 * allowed to look alike a planner starts briefing campaigns against the
 * first one. The types enforce it -- leadWeeks and correlation live on one
 * object and are never exported apart -- and every renderer on the screen
 * prints them in the same breath.
 *
 * WHAT THE SCREEN IS ACTUALLY FOR
 * -------------------------------
 * Five of the twelve brand-category pairs in this dataset fall below the
 * admission bar. They are on the screen, greyed and badged, because they are
 * the most informative rows here: they are what a measurement looks like
 * when it comes back negative. A signals screen that showed only the
 * categories where external data leads demand would be asserting that
 * external data leads demand, which this dataset says it does not.
 *
 * PART H
 * ------
 * The only accuracy figure on this page reaches the screen through
 * <AccuracyStatement variant="bars"/>, and through
 * <ModelStrip accuracy={AccuracyHeadline}/> when exactly one model is in
 * scope. Both print the margin over seasonal naive in the same breath as the
 * headline. It appears at all because the obvious question after "this
 * category leads by four weeks" is "and does using that actually forecast
 * better", and the answer is +4.8 to +5.5 points over a benchmark nobody
 * constructed -- not the flattering +24 over an authored baseline.
 */

function Explain({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardBody>
        <p className="max-w-[88ch] text-copy leading-[1.6] text-body">{children}</p>
      </CardBody>
    </Card>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-[8px] pb-[14px] pt-[26px]">
      <div className="text-small font-bold text-mute">{eyebrow}</div>
      <h2 className="mt-[2px] text-hero font-extrabold text-ink">{title}</h2>
      {children === undefined ? null : (
        <p className="mt-[7px] max-w-[92ch] text-copy leading-[1.6] text-body">
          {children}
        </p>
      )}
    </div>
  );
}

/**
 * The header figures, counted from the rows on screen.
 *
 * The lead KPI carries its correlation INSIDE the value string rather than
 * in the pill beside it. A pill can be dropped by a later edit and the value
 * would still render; a value that reads "4 wks at r 0.836" cannot lose half
 * of itself.
 */
function headerKpis(scope: SignalScope): KpiItem[] {
  const { pairs, gates, populated, weekCounts } = scope;

  const verdicts = pairs.map((pair) => verdictFor(pair, gates[pair.brandId]));
  const weighted = verdicts.filter((verdict) => verdict === "weighted").length;
  const concurrent = verdicts.filter((verdict) => verdict === "concurrent").length;
  const below = verdicts.filter((verdict) => verdict === "below").length;

  const best = strongestPair(pairs);

  const kpis: KpiItem[] = [
    {
      label: "Series tracked",
      value: formatCount(populated.length),
      pill:
        weekCounts.length === 1 && weekCounts[0] !== undefined
          ? `${plural(weekCounts[0], "week", "weeks")} each`
          : weekCounts.length > 1
            ? `${weekCounts[0]}-${weekCounts[weekCounts.length - 1]} weeks`
            : undefined,
    },
  ];

  if (best) {
    kpis.push({
      label: "Strongest measured lead",
      value: `${formatLead(best.leadWeeks)} at r ${formatCorrelation(best.correlation)}`,
      pill: pairLabel(best.brandName, best.categoryName),
      tone: "up",
    });
  }

  kpis.push(
    {
      label: "Weighted leads",
      value: formatOutOf(weighted, pairs.length),
      // A concurrent pair clears the correlation bar and peaks at lag zero,
      // so it is neither weighted nor below. Naming it here stops the two
      // KPI counts reading as a partition that leaves rows unaccounted for.
      pill: concurrent > 0 ? `${concurrent} more, no forward window` : undefined,
      tone: weighted > 0 ? "up" : "grey",
    },
    {
      label: "Below the bar",
      value: formatOutOf(below, pairs.length),
      pill: "displayed, not weighted",
      tone: below > 0 ? "down" : "grey",
    },
  );

  return kpis;
}

/**
 * ACCURACY, AND WHAT IT DOES NOT SAY.
 *
 * The registry records one accuracy per brand for the whole planning-grain
 * model. It does not decompose it by feature group, and nothing in this
 * schema does, so there is no honest way to say how many of those points the
 * signals on this screen are responsible for. The card says that outright.
 * The alternative -- putting the headline under a signals heading and
 * letting the adjacency do the arguing -- is the kind of claim that survives
 * exactly as long as nobody checks.
 */
function AccuracyPanel({ headlines }: { headlines: readonly AccuracyHeadline[] }) {
  return (
    <Card>
      <CardHeader
        title="What the admitted signals are worth to the forecast"
        subtitle="The model these series feed, scored against the benchmark nobody constructed"
      />
      <CardBody>
        <p className="max-w-[100ch] text-copy leading-[1.6] text-body">
          The lagged signals above enter the design matrix for every category,
          weak ones included -- the gate governs what may be said, not what
          the model may see. So the fair question is not whether the strongest
          correlation in the table above looks impressive on its own -- a
          correlation is easy to admire and hard to bank -- but whether the
          model carrying these features beats a forecast that uses none of
          them.
        </p>
        {headlines.length === 0 ? (
          <p className="mt-[10px] max-w-[100ch] text-copy leading-[1.6] text-body">
            No registry row is readable in your scope, so no accuracy is shown
            and none is estimated from the rows on this screen. With the
            registry readable, this panel carries the backtested accuracy for
            each brand&apos;s planning-grain model beside seasonal naive and
            the authored manual baseline, on three bars at the same scale.
          </p>
        ) : (
          <>
            <div
              className={`mt-[14px] grid gap-[20px] max-[1140px]:grid-cols-1 ${
                headlines.length > 1 ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {headlines.map((headline) => (
                <div key={headline.modelVersion}>
                  <div className="mb-[8px] flex items-center gap-[8px]">
                    <span className="text-[12px] font-extrabold text-ink">
                      {headline.brandId}
                    </span>
                    <span className="font-mono text-[10.5px] text-mute">
                      {headline.modelVersion}
                    </span>
                  </div>
                  {/* Part H: the headline only ever leaves lib/accuracy.ts
                      inside this component, which prints the seasonal-naive
                      margin beside it. There is no bare-number form. */}
                  <AccuracyStatement accuracy={headline} variant="bars" />
                </div>
              ))}
            </div>
            <p className="mt-[14px] max-w-[100ch] text-copy leading-[1.6] text-body">
              <b className="text-ink">
                None of that margin is attributed to these signals.
              </b>{" "}
              The registry records one accuracy per brand for the whole
              planning-grain model and decomposes it by fold, not by feature
              group, so nothing here can say how many of those points the
              search, social and competitor series are responsible for. An
              ablation -- refitting with the signal block removed and scoring
              on the identical row mask -- is the measurement that would
              answer it, and it has not been run. The number above is the
              model these features are part of, quoted as that and no more.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default async function SignalsPage() {
  const planner = await getSessionPlanner();
  const sb = await createServerAnonClient();

  let scope: SignalScope | null = null;
  let scopeError: string | null = null;
  try {
    scope = await readSignalScope(sb);
  } catch (error) {
    scopeError = error instanceof Error ? error.message : String(error);
  }

  // The registry is annotation, not substance. Its failure costs the
  // accuracy panel and nothing else, so it reads separately.
  let headlines: AccuracyHeadline[] = [];
  try {
    headlines = await getAccuracyHeadline(sb);
  } catch {
    headlines = [];
  }

  if (scopeError !== null || scope === null) {
    return (
      <>
        <PageHeader eyebrow="External demand drivers" title="Signals" />
        <Explain>
          The signal series could not be read: {scopeError ?? "unknown error"}.
          Nothing has been approximated in their place -- an empty screen here
          would look exactly like a portfolio with no external signals in it,
          which is a different and much stronger claim than the one this
          failure supports.
        </Explain>
      </>
    );
  }

  const { pairs, gates, boundary, populated } = scope;

  if (pairs.length === 0) {
    return (
      <>
        <PageHeader eyebrow="External demand drivers" title="Signals" />
        <Explain>
          No signal series is readable in your scope. signal_intelligence is
          scoped by row level security to your brand and, unless you are a
          planning manager or above, to the categories on your planner record
          -- so this is what an entitlement boundary looks like, not an empty
          dataset. With a series in scope this screen shows its measured lead
          against demand and the correlation at that lag, which of the
          brand-category pairs clear the admission bar, the full weekly
          history of every external series, and the confidence band rule that
          caps what any of it is allowed to claim.
        </Explain>
      </>
    );
  }

  // Everything below is counted from the rows, never typed in.
  const verdicts = pairs.map((pair) => verdictFor(pair, gates[pair.brandId]));
  const belowPairs = pairs.filter((_, index) => verdicts[index] === "below");
  const weightedCount = verdicts.filter((verdict) => verdict === "weighted").length;
  const bandTotals = totalBandCounts(pairs);
  const confidence = weakestCurrentBand(pairs);

  const rules = Object.values(gates);
  const thresholds = [...new Set(rules.map((rule) => rule.minCorrelation))].sort(
    (a, b) => a - b,
  );
  // WHICH CLOCK THE STRIP IS SHOWING, AND SAYING SO.
  //
  // The leads on this screen were measured by the pipeline run that also
  // wrote the admission bar, and downstream_handoff.generated_at is the only
  // stamp on that run -- signal_intelligence carries no measured_at of its
  // own. So that is the timestamp the strip should show. If the handoff rows
  // are unreadable the strip falls back to the registry's training stamp,
  // which is a DIFFERENT event, and the "why" panel names whichever one it
  // actually used rather than asserting the first case unconditionally.
  const measuredAt = rules
    .map((rule) => rule.generatedAt)
    .filter((value): value is string => typeof value === "string")
    .sort()
    .at(-1);
  const stampedFrom: "handoff" | "registry" | "none" = measuredAt
    ? "handoff"
    : headlines[0]?.generatedAt
      ? "registry"
      : "none";

  const brands = [...new Set(pairs.map((pair) => pair.brandName))].sort();
  const strongest = strongestPair(pairs);

  // THE CONTRAST IN THE BANNER IS TWO REAL ROWS, NOT AN ILLUSTRATION.
  //
  // The opening claim of this screen is that two leads of similar length can
  // be worth wildly different amounts, and it would be poor form to make that
  // case with numbers typed into the sentence. So it is made with the widest
  // pair the reader's own scope contains: the strongest correlation anywhere,
  // against the weakest correlation that still carries a forward window --
  // which is precisely the row a planner is most at risk of acting on,
  // because it looks like a lead until you read the r beside it. If the scope
  // holds no such pair the sentence drops rather than reaching for a stand-in.
  const weakestLeading = pairs.reduce<typeof pairs[number] | null>((worst, pair) => {
    if (pair.correlation === null || pair.leadWeeks === null || pair.leadWeeks < 1) {
      return worst;
    }
    if (worst === null) return pair;
    return Math.abs(pair.correlation) < Math.abs(worst.correlation ?? Infinity)
      ? pair
      : worst;
  }, null);
  const contrast =
    strongest && weakestLeading && strongest.key !== weakestLeading.key
      ? { weak: weakestLeading, strong: strongest }
      : null;

  // The strip carries an accuracy only when one model is unambiguously the
  // model in scope. Handing it one brand's figure while the tables below
  // show two brands would attach the wrong number to half the screen.
  const singleHeadline = headlines.length === 1 ? headlines[0] : undefined;
  const modelVersion =
    headlines.length > 0
      ? headlines.map((headline) => headline.modelVersion).join(" + ")
      : "no registry row readable in your scope";

  return (
    <>
      <PageHeader
        eyebrow="External demand drivers"
        title="Signals"
        kpis={headerKpis(scope)}
      />

      <Banner
        variant="violet"
        icon="r"
        title="No lead on this screen appears without the correlation that earned it."
        measureCh={100}
      >
        {contrast ? (
          <>
            In your own scope, {contrast.weak.brandName}{" "}
            {contrast.weak.categoryName} leads by{" "}
            {formatLead(contrast.weak.leadWeeks)} at r{" "}
            {formatCorrelation(contrast.weak.correlation)} and{" "}
            {contrast.strong.brandName} {contrast.strong.categoryName} leads by{" "}
            {formatLead(contrast.strong.leadWeeks)} at r{" "}
            {formatCorrelation(contrast.strong.correlation)}. Those are not the
            same claim, and a screen that let them look alike would have a
            planner briefing a campaign against the first one.
          </>
        ) : (
          <>
            A lead of a given length can be worth almost anything depending on
            the correlation at that lag, and a screen that let two of them look
            alike would have a planner briefing a campaign against the weaker
            one.
          </>
        )}{" "}
        So the two are printed together everywhere -- in the table, in the
        chart header, in the lists, in the figures at the top of this page --
        and the correlation is drawn as a bar whose length is the correlation
        itself, so the difference survives being glanced at.{" "}
        {belowPairs.length > 0 ? (
          <>
            {formatOutOf(belowPairs.length, pairs.length)} pairs in your scope
            fall below the admission bar. They stay on the screen, greyed,
            because a measurement that came back weak is evidence.
          </>
        ) : (
          <>
            Every pair in your scope clears the admission bar. One that did not
            would still be shown, greyed rather than removed.
          </>
        )}
      </Banner>

      <div className="mb-[16px]">
        <LeadTable pairs={pairs} gates={gates} />
      </div>

      <div className="mb-[16px]">
        <AdmissionGate pairs={pairs} gates={gates} />
      </div>

      <div className="mb-[16px]">
        <AccuracyPanel headlines={headlines} />
      </div>

      <SectionHeading
        eyebrow="Weekly history"
        title="The series behind every correlation above"
      >
        {plural(populated.length, "series", "series")} per brand-category,{" "}
        {scope.weekCounts.length === 1 && scope.weekCounts[0] !== undefined
          ? plural(scope.weekCounts[0], "week", "weeks")
          : `${scope.weekCounts[0]} to ${scope.weekCounts[scope.weekCounts.length - 1]} weeks`}{" "}
        each
        {scope.firstWeek && scope.lastWeek
          ? `, ${scope.firstWeek} to ${scope.lastWeek}`
          : ""}
        . Every correlation in the table above was measured on these rows, so
        the chart is not an illustration of the finding -- it is the evidence
        the finding was computed from, and a reader who disbelieves a lead can
        go and look at the weeks that produced it.
      </SectionHeading>

      <div className="mb-[16px]">
        <SignalHistory
          pairs={pairs}
          gates={gates}
          populated={populated}
          boundary={boundary}
        />
      </div>

      <SectionHeading
        eyebrow="The governor"
        title="What a Low confidence band does, published before it does it"
      >
        The admission gate decides whether a signal may be cited at all. The
        confidence band decides how far a published grade may go this week,
        and it is a different question answered from different rows --{" "}
        {formatCount(bandTotals.High)} High, {formatCount(bandTotals.Medium)}{" "}
        Medium and {formatCount(bandTotals.Low)} Low weeks across the series
        you can read. A planner should be able to predict the cap from the
        chart above rather than discover it from the system&apos;s behaviour,
        so the rule and the momentum bracket it turns on are both on screen.
      </SectionHeading>

      <div className="mb-[16px] grid grid-cols-[1.35fr_1fr] items-start gap-[16px] max-[1140px]:grid-cols-1">
        <BandGovernor
          pairs={pairs}
          boundary={boundary}
          weekTotals={bandTotals}
        />
        <BandInForce pairs={pairs} gates={gates} />
      </div>

      <SectionHeading
        eyebrow="Beyond the pilot"
        title="What would have to be true for these signals to arrive from outside"
      >
        The pilot reads all {plural(populated.length, "series", "series")} out
        of the case dataset&apos;s own signals sheet. That is what makes the
        causal relationship on this screen testable at all: signal and demand
        come from one dataset, so every correlation above can be recomputed
        from rows a reader can query. The section below describes what a live
        feed would have to provide instead, and is marked as a plan
        throughout, because none of it is built.
      </SectionHeading>

      <div className="mb-[16px]">
        <ProductionContract populated={populated} />
      </div>

      <div className="mb-[16px]">
        <UntabledFigures />
      </div>

      <ModelStrip
        modelVersion={modelVersion}
        generatedAt={formatTimestamp(
          measuredAt ?? headlines[0]?.generatedAt ?? null,
        )}
        confidence={confidence}
        accuracy={singleHeadline}
        why={
          <>
            {stampedFrom === "handoff" ? (
              <>
                The leads and correlations on this screen were measured by the
                pipeline run stamped on this strip -- the same run that wrote
                the admission bar the screen reads back -- so the timestamp
                comes from{" "}
                <span className="font-mono text-[11px]">
                  downstream_handoff.generated_at
                </span>{" "}
                rather than from a model training record.{" "}
                <span className="font-mono text-[11px]">
                  signal_intelligence
                </span>{" "}
                carries no measured_at of its own, which is also why the
                re-measurement cadence has no table behind it.
              </>
            ) : stampedFrom === "registry" ? (
              <>
                No marketing handoff row is readable in your scope, so the
                stamp above is the model registry&apos;s training time, not the
                moment these leads were measured. Those are different events
                and the gap between them is not shown here, because nothing
                readable records when the lead-lag search ran.
              </>
            ) : (
              <>
                Neither a handoff row nor a registry row is readable in your
                scope, so there is no stamp for when these leads were measured
                and none is guessed at.
              </>
            )}{" "}
            Scope is{" "}
            {joinNames(brands)}:{" "}
            {plural(pairs.length, "brand-category pair", "brand-category pairs")}
            , of which {weightedCount} carry a weighted lead with a forward
            window
            {thresholds.length === 1 && thresholds[0] !== undefined
              ? ` against a bar of r ${formatThreshold(thresholds[0])}`
              : thresholds.length > 1
                ? ` against the bar each brand was scored at (${joinNames(thresholds.map((value) => `r ${formatThreshold(value)}`))})`
                : " against no readable bar"}
            .{" "}
            {strongest
              ? `The strongest is ${pairLabel(strongest.brandName, strongest.categoryName)} at ${formatLead(strongest.leadWeeks)} and r ${formatCorrelation(strongest.correlation)}.`
              : ""}{" "}
            The confidence shown is the weakest band in force anywhere in your
            scope, not the average and not the most common one: a strip
            reading High while a Low-banded series sits in the table below it
            would be worse than no strip at all.{" "}
            {singleHeadline
              ? "The accuracy is the whole planning-grain model's, quoted with the seasonal-naive margin attached, and none of it is attributed to these signals -- see the panel above."
              : headlines.length > 1
                ? `Accuracy is not on this strip because ${headlines.length} models are in scope and one figure would be wrong for the other brand; both are shown in full in the accuracy panel above.`
                : "No registry row is readable in your scope, so no accuracy is quoted here."}
          </>
        }
      />

      <p className="mt-[12px] max-w-[100ch] px-[8px] text-small font-semibold leading-[1.55] text-mute">
        Everything above was read as{" "}
        <span className="font-mono text-[11px]">
          {planner?.appRole ?? "an unresolved app role"}
        </span>{" "}
        under row level security, which is why the scope is{" "}
        {joinNames(brands)} and{" "}
        {plural(pairs.length, "brand-category pair", "brand-category pairs")}.
        A category planner reading this page sees fewer rows and every count
        on it is smaller -- and each of those smaller counts is the correct
        answer for them, not a truncated version of somebody else&apos;s.
      </p>
    </>
  );
}
