import type { Metadata } from "next";

import {
  AccuracyStatement,
  ModelStrip,
  PageHeader,
  type KpiItem,
  type ModelConfidence,
} from "@/components";
import { ExceptionQueue } from "@/components/exceptions/ExceptionQueue";
import { ThresholdBanner } from "@/components/exceptions/ThresholdBanner";
import { TouchlessBanner } from "@/components/exceptions/TouchlessBanner";
import { formatCount, formatInr } from "@/components/exceptions/format";
import type {
  CeilingView,
  ExceptionView,
  SeverityLevel,
} from "@/components/exceptions/types";
import {
  getAccuracyHeadline,
  type AccuracyHeadline,
  type BrandId,
} from "@/lib/accuracy";
import {
  committedStatus,
  getExceptions,
  getPolicyParameters,
  getTouchlessRate,
  type PolicyParameter,
  type RecommendationPayload,
  type RecommendationState,
} from "@/lib/queries";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient, type StyleverseClient } from "@/lib/supabase";

/**
 * EXCEPTIONS -- the screen the case study is really about.
 *
 * The complaint in the case is that corrective action starts only once a
 * problem has already shown up in a weekly report. These rows fire off the
 * forward forecast instead, before the week happens, and they are ranked by
 * money rather than by recency so a planner works down the list and stops
 * when the remaining value stops justifying the attention.
 *
 * THREE THINGS THIS FILE REFUSES TO DO
 * ------------------------------------
 * 1. It writes no number of its own. Every figure -- the rates, the
 *    thresholds, the weeks of cover, the units at risk, the money -- is read
 *    at request time and formatted, never typed. The rationale on each row
 *    is printed exactly as recommend.py composed it, because it is already a
 *    sentence containing the real numbers; a second phrasing would be a
 *    second version of the truth.
 *
 * 2. It never widens scope to make a total look better. Reads go through
 *    createServerAnonClient(), which carries the session cookie, so RLS
 *    decides what this planner may see. A planner scoped to one region can
 *    legitimately see far fewer than the portfolio's exceptions, and an
 *    empty list is a real answer that the screen states in a sentence rather
 *    than hiding behind a spinner.
 *
 * 3. It renders no accuracy headline on its own. Part H: the manual baseline
 *    was authored and calibrated to a target, so the margin over it flatters;
 *    the margin over seasonal naive is small and is what actually proves the
 *    model. AccuracyStatement is the only way accuracy reaches this page, and
 *    it always carries both.
 */

export const metadata: Metadata = {
  title: "Exceptions",
};

// ------------------------------------------------------------------ helpers

type LabelMap = Readonly<Record<string, string>>;

type Labels = {
  brand: LabelMap;
  category: LabelMap;
  channel: LabelMap;
  region: LabelMap;
};

const EMPTY_LABELS: Labels = {
  brand: {},
  category: {},
  channel: {},
  region: {},
};

/**
 * Display names for the dimension codes.
 *
 * Cosmetic only: a series is identified by its ids, and if a dim table is
 * unreadable the row shows the id rather than disappearing. Nothing here
 * feeds a calculation.
 */
async function readLabels(sb: StyleverseClient): Promise<Labels> {
  const [brand, category, channel, region] = await Promise.all([
    sb.from("dim_brand").select("brand_id, brand_name"),
    sb.from("dim_category").select("category_id, category_name"),
    sb.from("dim_channel").select("channel_id, channel_name"),
    sb.from("dim_region").select("region_id, region_name"),
  ]);

  const brands: Record<string, string> = {};
  for (const row of brand.data ?? []) brands[row.brand_id] = row.brand_name;

  const categories: Record<string, string> = {};
  for (const row of category.data ?? []) {
    if (row.category_name) categories[row.category_id] = row.category_name;
  }

  const channels: Record<string, string> = {};
  for (const row of channel.data ?? []) {
    if (row.channel_name) channels[row.channel_id] = row.channel_name;
  }

  const regions: Record<string, string> = {};
  for (const row of region.data ?? []) {
    if (row.region_name) regions[row.region_id] = row.region_name;
  }

  return {
    brand: brands,
    category: categories,
    channel: channels,
    region: regions,
  };
}

/** payload values are jsonb; take a number or take nothing. */
function payloadNumber(
  payload: RecommendationPayload,
  key: string,
): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function severityOf(raw: string | null): SeverityLevel | null {
  return raw === "HIGH" || raw === "MEDIUM" || raw === "LOW" ? raw : null;
}

const CONFIDENCE_RANK: Record<ModelConfidence, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

/**
 * The weakest confidence among the rows on screen. Averaging confidence
 * would flatter the list; the reader needs to know the softest thing they
 * are looking at.
 */
function weakestConfidence(
  values: ReadonlyArray<string | null>,
): ModelConfidence | undefined {
  let weakest: ModelConfidence | undefined;
  for (const value of values) {
    if (value !== "High" && value !== "Medium" && value !== "Low") continue;
    if (
      weakest === undefined ||
      CONFIDENCE_RANK[value] < CONFIDENCE_RANK[weakest]
    ) {
      weakest = value;
    }
  }
  return weakest;
}

/** The most recent generated_at across the rows actually displayed. */
function latestTimestamp(values: ReadonlyArray<string | null>): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
      latest = value;
    }
  }
  return latest;
}

const CEILING_PREFIX = "cover_ceiling_";
const FLOOR_PREFIX = "stockout_floor_";

type ResolvedPolicy = {
  /** Ascending by ceiling, so the banner reads off the ends of the list. */
  ceilings: CeilingView[];
  floorWeeks: Map<string, number | null>;
  /** Keyed "CAT" for a ceiling and "floor:CAT" for a stockout floor. */
  basisFor: Map<string, string>;
};

/**
 * Cover ceilings and stockout floors, each with the derivation stored beside
 * it in policy_parameter and, for a ceiling, the holding-cost route that was
 * costed and discarded.
 */
function resolvePolicies(
  policies: readonly PolicyParameter[],
  categoryLabels: LabelMap,
): ResolvedPolicy {
  const floorWeeks = new Map<string, number | null>();
  const basisFor = new Map<string, string>();

  for (const policy of policies) {
    if (!policy.param_name.startsWith(FLOOR_PREFIX)) continue;
    const categoryId = policy.param_name.slice(FLOOR_PREFIX.length);
    floorWeeks.set(categoryId, policy.applied_value);
    basisFor.set(`floor:${categoryId}`, policy.basis);
  }

  const ceilings: CeilingView[] = [];
  for (const policy of policies) {
    if (!policy.param_name.startsWith(CEILING_PREFIX)) continue;
    const categoryId = policy.param_name.slice(CEILING_PREFIX.length);
    basisFor.set(categoryId, policy.basis);
    ceilings.push({
      categoryId,
      categoryName: categoryLabels[categoryId] ?? categoryId,
      ceilingWeeks: policy.applied_value,
      floorWeeks: floorWeeks.get(categoryId) ?? null,
      basis: policy.basis,
      discardedAlternative: policy.override_reason,
    });
  }

  ceilings.sort(
    (a, b) =>
      (a.ceilingWeeks ?? Number.POSITIVE_INFINITY) -
      (b.ceilingWeeks ?? Number.POSITIVE_INFINITY),
  );

  return { ceilings, floorWeeks, basisFor };
}

function toExceptionView(
  row: RecommendationState,
  labels: Labels,
  policy: ResolvedPolicy,
): ExceptionView {
  const payload: RecommendationPayload = row.payload;
  const isStockout = row.action === "STOCKOUT_RISK";
  const categoryId = row.category_id ?? "";
  const ceiling =
    policy.ceilings.find((c) => c.categoryId === categoryId) ?? null;

  // A stockout was raised against the floor, not the ceiling. Showing the
  // ceiling on a stockout row would put a threshold on screen that the row
  // never touched.
  const threshold = isStockout
    ? {
        label: "STOCKOUT FLOOR",
        weeks: policy.floorWeeks.get(categoryId) ?? null,
        basis: policy.basisFor.get(`floor:${categoryId}`) ?? null,
      }
    : {
        label: "CATEGORY CEILING",
        weeks: ceiling?.ceilingWeeks ?? null,
        basis: ceiling?.basis ?? null,
      };

  return {
    id: row.id,
    action: row.action ?? "STOCKOUT_RISK",
    actionLabel: isStockout ? "Stockout risk" : "Overstock risk",
    isStockout,
    severity: severityOf(row.severity),
    category: labels.category[categoryId] ?? categoryId,
    channel: labels.channel[row.channel_id ?? ""] ?? row.channel_id ?? "",
    region: labels.region[row.region_id ?? ""] ?? row.region_id ?? "",
    valueAtStakeInr: row.value_at_stake_inr,
    projectedWos: payloadNumber(payload, "projected_wos"),
    unitsAtRisk: payloadNumber(payload, "units_at_risk"),
    threshold:
      threshold.weeks === null && threshold.basis === null ? null : threshold,
    rationale: row.rationale,
    modelVersion: row.model_version,
    generatedAt: row.generated_at,
    confidence: row.confidence,
    status: committedStatus(row.status),
    decidedAt: row.decided_at,
    accountablePlanner: row.accountable_planner,
    acceptedValue: row.accepted_value,
    overrideReason: row.override_reason,
  };
}

// --------------------------------------------------------------------- page

export default async function ExceptionsPage() {
  const planner = await getSessionPlanner();
  const brandId = planner?.brandId ?? null;
  const brand: BrandId | undefined =
    brandId === "SPD" || brandId === "ECO" ? brandId : undefined;

  const sb = await createServerAnonClient();

  const [rows, policies, touchless, accuracies, labels] = await Promise.all([
    brandId
      ? getExceptions(sb, brandId)
      : Promise.resolve<RecommendationState[]>([]),
    brandId
      ? getPolicyParameters(sb, brandId)
      : Promise.resolve<PolicyParameter[]>([]),
    getTouchlessRate(sb),
    getAccuracyHeadline(sb, brand),
    readLabels(sb).catch(() => EMPTY_LABELS),
  ]);

  const headline: AccuracyHeadline | null =
    accuracies.find((a) => a.brandId === brandId) ?? accuracies[0] ?? null;

  const policy = resolvePolicies(policies, labels.category);
  const views: ExceptionView[] = rows.map((row) =>
    toExceptionView(row, labels, policy),
  );

  // Counted from the rows this planner can actually see. A number here that
  // did not come from `views` would be a portfolio figure wearing a personal
  // label.
  const stockout = views.filter((v) => v.isStockout);
  const overstock = views.filter((v) => !v.isStockout);
  const undecided = views.filter((v) => v.status === null).length;
  const sumValue = (list: readonly ExceptionView[]): number =>
    list.reduce((total, view) => total + (view.valueAtStakeInr ?? 0), 0);

  const kpis: KpiItem[] = [
    {
      label: "Stockout risk",
      value: formatCount(stockout.length),
      pill: formatInr(sumValue(stockout)),
      tone: "down",
    },
    {
      label: "Overstock risk",
      value: formatCount(overstock.length),
      pill: formatInr(sumValue(overstock)),
      tone: "amber",
    },
    {
      label: "Awaiting your decision",
      value: formatCount(undecided),
      pill: `of ${formatCount(views.length)}`,
      tone: "grey",
    },
  ];

  const versions = Array.from(
    new Set(
      views
        .map((view) => view.modelVersion)
        .filter((version): version is string => Boolean(version)),
    ),
  );

  const stripVersion =
    versions.length > 0 ? versions.join(" + ") : (headline?.modelVersion ?? null);

  const stripGeneratedAt =
    latestTimestamp(views.map((view) => view.generatedAt)) ??
    headline?.generatedAt ??
    null;

  const scopeLabel = brandId ? (labels.brand[brandId] ?? brandId) : "your brand";

  return (
    <>
      <PageHeader
        eyebrow="Exception-based planning"
        title="Exceptions"
        kpis={kpis}
      />

      <TouchlessBanner touchless={touchless} />
      <ThresholdBanner ceilings={policy.ceilings} />

      {brandId === null ? (
        <p className="mb-[16px] text-[12.5px] text-body leading-[1.6]">
          Your account has no planner record, so it carries no brand scope and
          no exceptions can be listed against it. Reading is all that is
          possible until a workspace administrator links the account; every
          write policy keys off the session&apos;s own planner id.
        </p>
      ) : null}

      <ExceptionQueue rows={views} scopeLabel={scopeLabel} />

      {stripVersion === null || stripGeneratedAt === null ? null : (
        <ModelStrip
          className="mt-[16px]"
          modelVersion={stripVersion}
          generatedAt={new Date(stripGeneratedAt)}
          confidence={weakestConfidence(views.map((view) => view.confidence))}
          why={
            <div className="flex flex-col gap-[10px]">
              <p>
                Each row is raised off the forward forecast, not off a report
                of a week that has already happened: eight-week demand against
                latest closing inventory gives projected weeks of cover, and
                the row fires when that crosses the category&apos;s floor or
                ceiling, or when recent availability was low enough that the
                series sold short of demand while demand was still rising. The
                rationale on each row is the pipeline&apos;s own sentence,
                printed unchanged.
              </p>
              <p>
                {views.length === 0
                  ? "No exception rows are in your scope, so this strip names the planning-grain model registered for your brand rather than a row on screen."
                  : `Ranked by value at stake, descending, across the ${formatCount(
                      views.length,
                    )} rows your session may read.`}
              </p>
              {headline === null ? null : (
                <AccuracyStatement accuracy={headline} variant="inline" />
              )}
            </div>
          }
        />
      )}
    </>
  );
}
