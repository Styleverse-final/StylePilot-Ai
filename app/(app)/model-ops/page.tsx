import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  AccuracyStatement,
  Card,
  CardBody,
  ModelStrip,
  PageHeader,
  type KpiItem,
} from "@/components";
import { Architecture } from "@/components/modelops/Architecture";
import { CalibrationPanel } from "@/components/modelops/CalibrationPanel";
import { ColdStartPanel } from "@/components/modelops/ColdStartPanel";
import { DriftMonitor } from "@/components/modelops/DriftMonitor";
import { PolicyAudit } from "@/components/modelops/PolicyAudit";
import { Provenance } from "@/components/modelops/Provenance";
import { RegistryPanel } from "@/components/modelops/RegistryPanel";
import { Roadmap } from "@/components/modelops/Roadmap";
import { UNTABLED } from "@/components/modelops/constants";
import {
  benchmarksFor,
  buildCalibration,
  buildDrift,
  getModelOpsData,
  type Calibration,
  type ModelOpsData,
  type Registry,
} from "@/components/modelops/data";
import { integer, plural, timestamp, toNumber } from "@/components/modelops/format";
import { getAccuracyHeadline, type AccuracyHeadline } from "@/lib/accuracy";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Model ops",
};

/**
 * MODEL OPS
 *
 * The screen that answers "is this AI, or a planning system?" -- and the one
 * a sceptical reader opens first, because it is where a product either shows
 * its working or fails to.
 *
 * A server component throughout. Every figure is read at request time through
 * createServerAnonClient(), which carries the signed-in planner's session
 * cookie, so Postgres row level security decides what the page contains. That
 * matters unevenly here and the screen says so where it bites:
 * model_registry, policy_parameter and autonomy_band are readable to every
 * authenticated planner, so the registry and the threshold audit show both
 * pilot brands; agent_run is brand-scoped, so the drift monitor shows one
 * brand to a brand planner and both to a group role. Nothing reaches for the
 * service role to make a panel look fuller than the reader is entitled to.
 *
 * THE MODEL IS SCORED OFFLINE. There is no prediction endpoint behind this
 * page and no model call at request time. Everything here is rows.
 *
 * PART H
 * ------
 * No accuracy figure on this screen is rendered alone. The header statement,
 * the per-model bars and the strip at the foot all go through
 * <AccuracyStatement/> or ModelStrip's AccuracyHeadline prop, which carry the
 * seasonal-naive margin in the same breath as the headline. The cold-start
 * accuracy is kept in its own card, never pooled with planning grain.
 *
 * THE TRAP, HANDLED IN THE OPEN
 * -----------------------------
 * metrics.p10_p90_coverage is raw, pre-calibration coverage of a band that
 * was never shipped. It appears on this screen -- and only on this screen --
 * because this is the calibration screen and the before/after is the point.
 * It is labelled as pre-calibration everywhere it appears, and the
 * three-versus-four fold difference between coverage and accuracy is stated
 * in its own banner rather than left to be discovered.
 */

function Explain({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardBody>
        <p className="max-w-[92ch] text-copy leading-[1.6] text-body">{children}</p>
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
 * The registry figures the section prose quotes, counted from the rows.
 *
 * The alternative is a sentence with the numbers written into it, which is
 * true on the day it is typed and silently false the first time a brand or a
 * model joins the pilot. A horizon shared by every row of a grain is quoted;
 * where the rows disagree the sentence says "the registered horizon" rather
 * than picking one of them.
 */
function registrySummary(registry: Registry) {
  const distinct = (rows: { entry: { horizon_weeks: number | null } }[]) => {
    const values = [
      ...new Set(
        rows
          .map((row) => row.entry.horizon_weeks)
          .filter((value): value is number => typeof value === "number"),
      ),
    ];
    return values.length === 1 ? values[0] : null;
  };

  const first = registry.planning[0] ?? null;

  return {
    models: registry.planning.length + registry.coldStart.length,
    planning: registry.planning.length,
    coldStart: registry.coldStart.length,
    brands: registry.brandIds.length,
    planningHorizon: distinct(registry.planning),
    coldStartHorizon: distinct(registry.coldStart),
    // Counted from the benchmark set the card below actually renders, so the
    // heading cannot claim four while the table shows three.
    benchmarks: first === null ? 0 : benchmarksFor(first.entry).length,
  };
}

/** A percentage, or a range when the brands on screen do not agree. */
function pctRange(
  values: readonly (number | null)[],
  decimals = 1,
): string | null {
  const ok = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (ok.length === 0) return null;
  const lo = Math.min(...ok) * 100;
  const hi = Math.max(...ok) * 100;
  return Math.abs(hi - lo) < 0.05 / Math.pow(10, decimals - 1)
    ? `${hi.toFixed(decimals)}%`
    : `${lo.toFixed(decimals)}–${hi.toFixed(decimals)}%`;
}

/** One value when every model agrees on it, null when they do not. */
function agreed(values: readonly (number | null)[]): number | null {
  const set = new Set(
    values.filter((value): value is number => typeof value === "number"),
  );
  return set.size === 1 ? [...set][0] : null;
}

/**
 * The coverage figures the interval heading quotes, folded out of the same
 * Calibration objects the panels below render from -- so the summary and the
 * detail cannot disagree.
 */
function coverageSummary(calibrations: readonly Calibration[]) {
  return {
    raw: pctRange(calibrations.map((c) => c.rawCoverageAllFolds)),
    shipped: pctRange(
      calibrations.map((c) => toNumber(c.calibrated?.computed_value)),
    ),
    nominal: pctRange(
      calibrations.map((c) => toNumber(c.calibrated?.applied_value)),
      0,
    ),
    quantiles: agreed(calibrations.map((c) => c.quantileCount)),
    coverageFolds: agreed(calibrations.map((c) => c.calibratedFoldCount)),
    accuracyFolds: agreed(calibrations.map((c) => c.accuracyFoldCount)),
  };
}

/**
 * The header figures, folded out of the rows that were actually read. A
 * count that row level security withheld is absent rather than estimated.
 */
function headerKpis(
  data: ModelOpsData,
  seriesExamined: number | null,
  seriesEscalated: number | null,
  /** Brands whose agent_run rows this session could actually read. */
  driftBrands: number,
): KpiItem[] {
  const models = data.registry.planning.length + data.registry.coldStart.length;
  const overridden = data.parameters.filter((parameter) => parameter.is_overridden);

  const kpis: KpiItem[] = [
    {
      label: "Registered models",
      value: integer(models),
      pill: `${data.registry.planning.length} planning · ${data.registry.coldStart.length} cold start`,
      tone: "grey",
    },
  ];

  if (seriesExamined !== null) {
    kpis.push({
      // Named for what it is: the latest run of EACH brand the session can
      // read, summed. A group role sees two runs here and a brand planner
      // one, so the label says "per brand" rather than implying one run
      // produced the whole figure.
      label:
        driftBrands > 1
          ? `Series watched, latest run × ${driftBrands} brands`
          : "Series watched, latest run",
      value: integer(seriesExamined),
      pill:
        seriesEscalated === null
          ? undefined
          : `${integer(seriesEscalated)} escalated`,
      tone: seriesEscalated && seriesEscalated > 0 ? "amber" : "up",
    });
  }

  kpis.push({
    label: "Thresholds overridden",
    value: integer(overridden.length),
    pill: `of ${integer(data.parameters.length)}, each with a reason`,
    tone: overridden.length > 0 ? "amber" : "up",
  });

  return kpis;
}

export default async function ModelOpsPage() {
  const planner = await getSessionPlanner();
  const brandId = planner?.brandId ?? null;

  const sb = await createServerAnonClient();

  let data: ModelOpsData | null = null;
  let headlines: AccuracyHeadline[] = [];
  let readError: string | null = null;

  try {
    const [modelOps, accuracy] = await Promise.all([
      getModelOpsData(sb),
      getAccuracyHeadline(sb),
    ]);
    data = modelOps;
    headlines = accuracy;
  } catch (error) {
    readError = error instanceof Error ? error.message : String(error);
  }

  if (readError !== null || data === null) {
    return (
      <>
        <PageHeader eyebrow="Machine learning operations" title="Model ops" />
        <Explain>
          The model registry could not be read: {readError ?? "no rows returned"}.
          Nothing has been hidden or approximated &mdash; this screen exists to
          show where every number came from, so a failed read is reported as a
          failed read rather than as an empty registry, which would look like a
          system with no models in it.
        </Explain>
      </>
    );
  }

  const drift = buildDrift(data.runs, data.bands);

  // Built once and used twice: the summary sentence and the panels below it
  // read the same objects, so the heading cannot quote a figure the cards
  // then contradict.
  const calibrations = data.registry.planning.map((row) =>
    buildCalibration(row, data.parameters),
  );
  const registryCounts = registrySummary(data.registry);
  const coverage = coverageSummary(calibrations);

  // Only the latest run per brand counts toward the header: earlier rows are
  // re-runs of the same pass, and summing them would inflate the figure.
  const seriesExamined = drift.reduce<number | null>((total, brand) => {
    const value = brand.latest?.items_examined;
    return typeof value === "number" ? (total ?? 0) + value : total;
  }, null);
  const seriesEscalated = drift.reduce<number | null>((total, brand) => {
    const value = brand.latest?.items_escalated;
    return typeof value === "number" ? (total ?? 0) + value : total;
  }, null);

  // The accuracy statement in the header belongs to ONE model, so it is shown
  // only when the session resolves to one brand. A group role sees every
  // registered planning model at once and no single headline is honest for
  // all of them, so the header says nothing about accuracy and the per-model
  // cards carry it instead.
  const headline = brandId
    ? (headlines.find((entry) => entry.brandId === brandId) ?? null)
    : null;

  const brandName = (id: string) => data.brandNames[id] ?? id;

  const stripVersion = headline
    ? headline.modelVersion
    : ([...data.registry.planning, ...data.registry.coldStart]
        .map((row) => row.entry.model_version)
        .join(" + ") || "no model on record");

  const latestTrained = [...data.registry.planning, ...data.registry.coldStart]
    .map((row) => row.entry.trained_at)
    .filter((value): value is string => typeof value === "string")
    .sort()
    .at(-1);

  return (
    <>
      <PageHeader
        eyebrow="Machine learning operations"
        title="Model ops"
        kpis={headerKpis(data, seriesExamined, seriesEscalated, drift.length)}
      >
        {headline ? (
          <div className="min-w-[210px]">
            <AccuracyStatement accuracy={headline} />
            <div className="mt-[4px] text-label font-semibold text-mute">
              {brandName(headline.brandId)} planning grain
            </div>
          </div>
        ) : null}
      </PageHeader>

      <Provenance />

      <Architecture
        registry={data.registry}
        parameters={data.parameters}
        bands={data.bands}
      />

      <SectionHeading eyebrow="model_registry" title="What is registered, and what it beats">
        {registryCounts.models === 0 ? (
          <>
            The registry is empty in your scope, so there is nothing to
            describe. When models are registered they appear below in two
            groups, planning grain and cold start, because the two grains are
            scored on different targets and must never be averaged together.
          </>
        ) : (
          <>
            {registryCounts.models}{" "}
            {plural(registryCounts.models, "model is", "models are")} registered
            across {registryCounts.brands} pilot{" "}
            {plural(registryCounts.brands, "brand")}, and they are shown in two
            groups because they are not comparable. The{" "}
            {registryCounts.planning} planning-grain{" "}
            {plural(registryCounts.planning, "model forecasts", "models forecast")}{" "}
            unconstrained demand{" "}
            {registryCounts.planningHorizon === null
              ? "over the horizon each row registers"
              : `${registryCounts.planningHorizon} weeks out`}{" "}
            at
            brand&nbsp;&gt;&nbsp;category&nbsp;&gt;&nbsp;channel&nbsp;&gt;&nbsp;region&nbsp;&gt;&nbsp;week,
            scored against {registryCounts.benchmarks} benchmarks on the
            identical row mask. The {registryCounts.coldStart} cold-start{" "}
            {plural(registryCounts.coldStart, "model predicts", "models predict")}{" "}
            {registryCounts.coldStartHorizon === null
              ? "launch volume"
              : `first-${registryCounts.coldStartHorizon}-week volume`}{" "}
            for styles with no history at all, and their accuracy sits far
            lower &mdash; so it is kept in its own card and never averaged into
            anything.
          </>
        )}
      </SectionHeading>

      {data.registry.planning.length === 0 ? (
        <Explain>
          No planning-grain model is readable in your scope. model_registry is
          selectable by any authenticated planner, so an empty registry here
          means the table itself is empty rather than that something has been
          filtered from you &mdash; and a screen about model operations with no
          models says so rather than drawing a card of dashes.
        </Explain>
      ) : (
        <div className="flex flex-col gap-[16px]">
          {data.registry.planning.map((row) => (
            <RegistryPanel
              key={row.entry.model_id}
              row={row}
              accuracy={
                headlines.find(
                  (entry) => entry.modelVersion === row.entry.model_version,
                ) ?? null
              }
              brandName={brandName(row.brandId)}
            />
          ))}
        </div>
      )}

      <div className="mt-[16px]">
        <ColdStartPanel
          rows={data.registry.coldStart}
          brandNames={data.brandNames}
          planningFoldCount={agreed(
            data.registry.planning.map((row) => row.folds.length || null),
          )}
        />
      </div>

      <SectionHeading
        eyebrow="Prediction intervals"
        title="Raw to calibrated, and why the fold counts differ"
      >
        The buy plan sizes safety stock off the p10&ndash;p90 band, so the band
        has to cover what it claims to cover.
        {coverage.raw === null ? (
          <>
            {" "}
            No registry row in your scope records a raw coverage figure, so
            nothing is claimed about what the band did before calibration.
          </>
        ) : (
          <>
            {" "}
            Raw, as the{" "}
            {coverage.quantiles === null ? "" : `${coverage.quantiles} `}quantile
            models emitted it, it did not: it sat at{" "}
            <b className="tabular">{coverage.raw}</b>
            {coverage.nominal === null
              ? ""
              : ` against the ${coverage.nominal} nominal`}
            , a band too narrow to chart honestly.
          </>
        )}{" "}
        Split-conformal calibration widens both bounds by an offset fitted on a
        prior fold
        {coverage.shipped === null ? (
          <>, and the shipped coverage appears on the cards below.</>
        ) : (
          <>
            , and the shipped band covers{" "}
            <b className="tabular">{coverage.shipped}</b>.
          </>
        )}{" "}
        Both figures are below, the raw one labelled as the band that was never
        shipped, because this is the screen where the before and the after
        belong together and nowhere else.
        {coverage.coverageFolds === null || coverage.accuracyFolds === null ? null : (
          <>
            {" "}
            The coverage figures are a {coverage.coverageFolds}-fold mean where
            the accuracy figures above are a {coverage.accuracyFolds}-fold one,
            because fold 1 has no prior fold to fit an offset on and drops out
            of the calibrated measurement.
          </>
        )}
      </SectionHeading>

      {calibrations.length === 0 ? (
        <Explain>
          Interval calibration is measured against a planning-grain backtest,
          and no planning-grain model is readable in your scope, so there is
          nothing to compare. When one is registered, the raw coverage, the
          calibrated coverage, the widening offset and the quantile crossing
          rate appear here with the fold counts each was measured over.
        </Explain>
      ) : (
        <div className="flex flex-col gap-[16px]">
          {calibrations.map((calibration) => (
            <CalibrationPanel
              key={calibration.modelVersion}
              calibration={calibration}
              brandName={brandName(calibration.brandId)}
            />
          ))}
        </div>
      )}

      <SectionHeading eyebrow="agent_run" title="Drift, and the rule that fires it">
        The forecast agent is the only agent whose job is to notice the model
        getting worse. What it examined and what it referred to a human are
        rows in agent_run; the rule it applied is code, and it is printed in
        full below along with the noise measurement that set it.
      </SectionHeading>

      <DriftMonitor
        brands={drift}
        brandNames={data.brandNames}
        registryBrandIds={data.registry.brandIds}
      />

      <SectionHeading
        eyebrow="policy_parameter"
        title="Every threshold, and every place the applied value left its derivation"
      >
        A recommendation is only as defensible as the thresholds behind it, so
        every one of them is a row carrying both the value its derivation
        produced and the value actually running. Where those differ, the row
        carries the reason. That gap is the governance story rather than an
        embarrassment: a service level held above what the unit economics alone
        would justify is a commercial decision someone made, dated and signed,
        and this table is where you go to argue with it.
      </SectionHeading>

      <PolicyAudit parameters={data.parameters} brandNames={data.brandNames} />

      <SectionHeading eyebrow="Delivery" title="Six-month build">
        The only card on this screen where nothing at all came out of a query,
        placed last so everything measured sits above it.
        {UNTABLED.length > 1 ? (
          <>
            {" "}
            It is not the only untabled figure: the provenance panel at the top
            lists all {UNTABLED.length}, and the other{" "}
            {UNTABLED.length - 1 === 1
              ? "one is named in the panel that uses it"
              : `${UNTABLED.length - 1} are named in the panels that use them`}
            .
          </>
        ) : null}
      </SectionHeading>

      <Roadmap />

      <ModelStrip
        className="mt-[16px]"
        modelVersion={stripVersion}
        generatedAt={timestamp(latestTrained ?? headline?.generatedAt ?? null)}
        accuracy={headline ?? undefined}
        why={
          <>
            {headline
              ? `This strip names the planning-grain model registered to your brand, and the accuracy beside it is that model's -- the headline never appears without the margin over seasonal naive, which is the comparison that carries the proof.`
              : `Your session does not resolve to a single brand, so this strip names every registered model rather than one, and states no accuracy at all: ${registryCounts.planning} planning ${plural(registryCounts.planning, "model is", "models are")} in scope and no single figure would be honest for ${registryCounts.planning === 1 ? "it and the cold-start model together" : "all of them"}. Each model's accuracy is on its own card above, beside its own benchmark set.`}{" "}
            The timestamp is the most recent training run in the registry, not
            the moment this page rendered. Every figure above was scored
            offline in batch and read here as rows &mdash; nothing on this page
            calls a model.{" "}
            {data.registry.coldStart.length > 0
              ? `The ${data.registry.coldStart.length} cold-start ${plural(
                  data.registry.coldStart.length,
                  "model",
                )} in the registry ${plural(
                  data.registry.coldStart.length,
                  "is",
                  "are",
                )} deliberately excluded from any accuracy stated here: a different target on a different grain, and pooling the two would produce a mean describing nothing.`
              : ""}
          </>
        }
      />
    </>
  );
}
