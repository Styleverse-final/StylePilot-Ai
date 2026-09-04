import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AccuracyStatement, Card, CardBody, ModelStrip, PageHeader } from "@/components";
import type { KpiItem } from "@/components";
import type { ModelConfidence } from "@/components/ModelStrip";
import { BuyTable } from "@/components/buy/BuyTable";
import { SafetyStockNote } from "@/components/buy/SafetyStockNote";
import { ServiceLevelBanner } from "@/components/buy/ServiceLevelBanner";
import {
  getDecisionHistory,
  getSeriesLabels,
  toBuyRows,
} from "@/components/buy/data";
import {
  formatFractionPct,
  formatInr,
  formatSignedFractionPct,
  formatSignedUnits,
  formatTimestamp,
  formatUnits,
} from "@/components/buy/format";
import { isOpenHold, type BuyRow } from "@/components/buy/types";
import { getAccuracyHeadline, type AccuracyHeadline } from "@/lib/accuracy";
import { getPolicyParameters, getRecommendations } from "@/lib/queries";
import type { PolicyParameter } from "@/lib/queries";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Buy plan",
};

/**
 * BUY PLAN
 *
 * A server component throughout. Every figure on this page is read at
 * request time through createServerAnonClient(), which carries the signed-in
 * planner's session cookie, so row level security decides what the page
 * contains. A planner who owns two categories in one region sees the
 * recommendations for those and no others -- and that is the correct number,
 * not a smaller one. Nothing here reaches for the service role to make a
 * count look better.
 *
 * The two banners exist because a buy quantity is only as trustworthy as the
 * thresholds behind it. The service level in force is not the one the unit
 * economics computes, and the safety stock rests on a conformally calibrated
 * interval whose coverage is measured over one fewer fold than the accuracy
 * figure beside it. Both of those are stated on the screen where the
 * quantities are committed, rather than in a governance tab.
 */

/** Fold the visible rows into the header KPIs. Nothing is typed in by hand. */
function headerKpis(rows: readonly BuyRow[]): KpiItem[] {
  const reduce = rows.filter((row) => row.action === "REDUCE_BUY").length;
  const increase = rows.filter((row) => row.action === "INCREASE_BUY").length;

  let netDelta = 0;
  let manualTotal = 0;
  let valueTotal = 0;
  for (const row of rows) {
    if (typeof row.deltaUnits === "number") netDelta += row.deltaUnits;
    if (typeof row.manualUnits === "number") manualTotal += row.manualUnits;
    if (typeof row.valueAtStakeInr === "number") valueTotal += row.valueAtStakeInr;
  }

  // A share of the manual plan, not an average of percentages: averaging the
  // per-row gaps would weight a 400-unit series the same as a 90,000-unit one.
  const netFraction = manualTotal > 0 ? netDelta / manualTotal : null;

  return [
    { label: "Reduce", value: formatUnits(reduce) },
    { label: "Increase", value: formatUnits(increase) },
    {
      label: "Net units vs manual",
      value: formatSignedFractionPct(netFraction),
      pill: `${formatSignedUnits(netDelta)} units`,
      tone: netFraction === null ? "grey" : netFraction < 0 ? "down" : "up",
    },
    { label: "Value at stake", value: formatInr(valueTotal) },
  ];
}

/**
 * The weakest confidence band on screen, not the average and not the mode.
 * A strip that says High while a Low-confidence row sits in the table is
 * worse than no strip at all.
 */
function weakestConfidence(rows: readonly BuyRow[]): ModelConfidence | undefined {
  const bands = new Set(rows.map((row) => row.confidence));
  if (bands.has("Low")) return "Low";
  if (bands.has("Medium")) return "Medium";
  if (bands.has("High")) return "High";
  return undefined;
}

/** What the holds have in common, stated from the holds themselves. */
function holdNote(rows: readonly BuyRow[]): string {
  const holds = rows.filter(isOpenHold);
  if (holds.length === 0) return "";
  const widest = holds.reduce((worst, row) => {
    const gap = Math.abs(row.deltaPct ?? 0);
    return gap > worst ? gap : worst;
  }, 0);
  return (
    `These are the rows where the recommended buy and the manual plan already ` +
    `agree: the widest gap among them is ${formatFractionPct(widest)} of the ` +
    `manual plan, so there is no quantity to argue about.`
  );
}

/** The accuracy for the model that actually produced the rows on screen. */
function accuracyForRows(
  headlines: readonly AccuracyHeadline[],
  rows: readonly BuyRow[],
  brandId: string | null,
): AccuracyHeadline | null {
  const versions = new Set(rows.map((row) => row.modelVersion));
  return (
    headlines.find((headline) => versions.has(headline.modelVersion)) ??
    headlines.find((headline) => headline.brandId === brandId) ??
    headlines[0] ??
    null
  );
}

function policy(
  parameters: readonly PolicyParameter[],
  name: string,
): PolicyParameter | null {
  return parameters.find((parameter) => parameter.param_name === name) ?? null;
}

function Explain({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardBody>
        <p className="max-w-[88ch] text-copy leading-[1.6] text-body">{children}</p>
      </CardBody>
    </Card>
  );
}

export default async function BuyPage() {
  const planner = await getSessionPlanner();
  const brandId = planner?.brandId ?? null;

  if (!brandId) {
    return (
      <>
        <PageHeader eyebrow="Buy quantity recommendations" title="Buy plan" />
        <Explain>
          You are signed in, but your account is not linked to a planner
          record, so there is no brand to scope a buy plan to. Every
          recommendation on this screen is filtered by the brand, region and
          categories on that record; without one there is nothing to show and
          nothing you could commit a decision against. Ask your workspace
          administrator to link your account.
        </Explain>
      </>
    );
  }

  const sb = await createServerAnonClient();

  let rows: BuyRow[] = [];
  let parameters: PolicyParameter[] = [];
  let headlines: AccuracyHeadline[] = [];
  let readError: string | null = null;

  try {
    const [recommendations, params, accuracy, labels] = await Promise.all([
      getRecommendations(sb, brandId, "BUY_QUANTITY"),
      getPolicyParameters(sb, brandId),
      getAccuracyHeadline(sb),
      getSeriesLabels(sb),
    ]);

    parameters = params;
    headlines = accuracy;

    const ids = recommendations
      .map((rec) => rec.id)
      .filter((id): id is number => typeof id === "number");
    const history = await getDecisionHistory(sb, ids);
    rows = toBuyRows(recommendations, labels, history);
  } catch (error) {
    readError = error instanceof Error ? error.message : String(error);
  }

  const accuracy = accuracyForRows(headlines, rows, brandId);
  const serviceLevel = policy(parameters, "service_level");
  const coverage = policy(parameters, "interval_coverage_calibrated");
  const spreadFactor = policy(parameters, "safety_spread_factor");

  // Provenance comes from the rows that were actually rendered. With no rows
  // there is nothing to stamp, so the strip falls back to the registry entry
  // and says which it is.
  const versions = [...new Set(rows.map((row) => row.modelVersion))].sort();
  const generatedAt = rows
    .map((row) => row.generatedAt)
    .filter((value): value is string => typeof value === "string")
    .sort()
    .at(-1);

  const stripVersion =
    versions.length > 0
      ? versions.join(" + ")
      : (accuracy?.modelVersion ?? "no model on record");
  const stripGeneratedAt = formatTimestamp(
    generatedAt ?? accuracy?.generatedAt ?? null,
  );

  return (
    <>
      <PageHeader
        eyebrow="Buy quantity recommendations"
        title="Buy plan"
        kpis={headerKpis(rows)}
      >
        {accuracy ? <AccuracyStatement accuracy={accuracy} /> : null}
      </PageHeader>

      <ServiceLevelBanner parameter={serviceLevel} />
      <SafetyStockNote
        coverage={coverage}
        spreadFactor={spreadFactor}
        accuracyFolds={accuracy?.foldCount ?? null}
      />

      {readError ? (
        <Explain>
          The buy plan could not be read: {readError}. Nothing has been hidden
          or approximated -- the screen is showing you the failure rather than
          an empty table that would look like a quiet week.
        </Explain>
      ) : rows.length === 0 ? (
        <Explain>
          There are no buy quantity recommendations in your scope. That is a
          legitimate state rather than an error: row level security filters
          this screen to the brand, region and categories on your planner
          record, and a planner scoped to one region will often see none in a
          week when the model and the manual plan agree across it. The
          thresholds above still apply to your brand and are shown so the
          screen stays honest about what it would be committing against.
        </Explain>
      ) : (
        <BuyTable rows={rows} holdNote={holdNote(rows)} />
      )}

      <ModelStrip
        className="mt-[16px]"
        modelVersion={stripVersion}
        generatedAt={stripGeneratedAt}
        confidence={weakestConfidence(rows)}
        why={
          <>
            {versions.length > 0
              ? `Every quantity above was produced by ${stripVersion} and stamped with the moment it was generated. `
              : `No recommendation rows are in scope, so this strip names the registered model that would produce them rather than a row that exists. `}
            The confidence shown is the WEAKEST band across the rows on screen,
            not an average, so a single low-confidence series cannot hide
            behind the rest.
            {accuracy
              ? ` Backtested accuracy for this model is stated in the header beside the margin over seasonal naive, which is the comparison that carries the proof; the headline is never shown on its own.`
              : ""}
            {coverage
              ? ` The safety stock in the table derives from the conformally calibrated p10-p90 interval, whose measured coverage is ${formatFractionPct(
                  coverage.computed_value,
                )}${
                  accuracy?.foldCount == null
                    ? ", over one fewer fold than the accuracy figure, because split conformal needs a prior fold to calibrate against"
                    : ` over ${Math.max(1, accuracy.foldCount - 1)} folds -- one fewer than the accuracy figure, because split conformal needs a prior fold to calibrate against`
                }.`
              : ""}
          </>
        }
      />
    </>
  );
}
