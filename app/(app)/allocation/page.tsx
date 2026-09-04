import type { Metadata } from "next";

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
import { AgentBandCard } from "@/components/allocation/AgentBandCard";
import { IncumbentDriftCard } from "@/components/allocation/IncumbentDriftCard";
import {
  MIDDOT,
  allocationBand,
  bandCeilingPp,
  formatCeiling,
  groupBySeries,
  provenanceOf,
  resolveGroup,
  tally,
  toRegionShifts,
  widestMovement,
} from "@/components/allocation/model";
import { PortfolioMovement } from "@/components/allocation/PortfolioMovement";
import { SeriesPicker, type SeriesOption } from "@/components/allocation/SeriesPicker";
import { ShiftBoard } from "@/components/allocation/ShiftBoard";
import { getAccuracyHeadline, type BrandId } from "@/lib/accuracy";
import { getAutonomyBands, getRecommendations } from "@/lib/queries";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient, type StyleverseClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Allocation",
};

const ROUTE = "/allocation";
const EYEBROW = "35% of markdown loss";
const TITLE = "Allocation";

/**
 * Allocation.
 *
 * The screen answers one question per row: this region's split moves by this
 * many percentage points, so does the agent commit it or do you? Everything
 * else on the page exists to make that question answerable -- the band it is
 * measured against, the derivation of the band, and the rule the optimiser
 * is arguing with.
 *
 * Every figure is read through createServerAnonClient(), so row level
 * security scopes the board to the signed-in planner: their brand, their
 * region, the categories they own. A planner therefore sees fewer cells than
 * the optimiser produced, and the page says so rather than reaching for the
 * service role to make the counts look larger.
 */

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type Labels = {
  categories: Record<string, string>;
  channels: Record<string, string>;
  regions: Record<string, string>;
};

/**
 * Display names for the dimension keys on screen. These are labels, not
 * metrics, and they are still read from the database rather than written
 * into the component, so a renamed region renames everywhere at once.
 */
async function loadLabels(sb: StyleverseClient): Promise<Labels> {
  const [categories, channels, regions] = await Promise.all([
    sb.from("dim_category").select("category_id, category_name"),
    sb.from("dim_channel").select("channel_id, channel_name"),
    sb.from("dim_region").select("region_id, region_name"),
  ]);

  // A dimension row with no name falls through to its key, which is a real
  // identifier a planner can still act on -- never a placeholder.
  const labels: Labels = { categories: {}, channels: {}, regions: {} };
  for (const row of categories.data ?? []) {
    if (row.category_name) labels.categories[row.category_id] = row.category_name;
  }
  for (const row of channels.data ?? []) {
    if (row.channel_name) labels.channels[row.channel_id] = row.channel_name;
  }
  for (const row of regions.data ?? []) {
    if (row.region_name) labels.regions[row.region_id] = row.region_name;
  }
  return labels;
}

function isBrandId(value: string | null): value is BrandId {
  return value === "SPD" || value === "ECO";
}

export default async function AllocationPage({ searchParams }: PageProps) {
  const [planner, params] = await Promise.all([getSessionPlanner(), searchParams]);
  const brandId = planner?.brandId ?? null;

  if (!brandId) {
    return (
      <>
        <PageHeader eyebrow={EYEBROW} title={TITLE} />
        <Card>
          <CardHeader
            title="No brand resolved for your session"
            subtitle="Nothing was read, and nothing is being guessed at"
          />
          <CardBody>
            <p className="max-w-[88ch] text-[12.5px] leading-[1.6] text-body">
              An allocation board is scoped to one brand, and your session did
              not resolve one. Either your account has no planner record yet,
              in which case a workspace administrator has to link it, or the
              lookup did not answer on this request, in which case reloading
              will fix it. The screen stops here rather than reading past the
              scope to fill itself, because a board assembled without a scope
              would be showing you someone else&apos;s numbers.
            </p>
          </CardBody>
        </Card>
      </>
    );
  }

  const sb = await createServerAnonClient();
  const [recommendations, bands, accuracies, labels] = await Promise.all([
    getRecommendations(sb, brandId, "ALLOCATION"),
    getAutonomyBands(sb, brandId),
    getAccuracyHeadline(sb, isBrandId(brandId) ? brandId : undefined),
    loadLabels(sb),
  ]);

  const { shifts, unreadable } = toRegionShifts(recommendations);
  const band = allocationBand(bands);
  const ceilingPp = bandCeilingPp(band);
  const counts = tally(shifts, ceilingPp);
  const groups = groupBySeries(shifts, ceilingPp);
  const group = resolveGroup(groups, params.series);
  const provenance = provenanceOf(shifts);
  const accuracy = accuracies[0] ?? null;

  const kpis: KpiItem[] = [
    { label: "Cells in scope", value: String(shifts.length) },
    {
      label: "Shift in",
      value: String(counts.shiftIn),
      pill: counts.shiftIn > 0 ? "regions gaining" : undefined,
      tone: "up",
    },
    {
      label: "Shift out",
      value: String(counts.shiftOut),
      pill: counts.shiftOut > 0 ? "regions giving up" : undefined,
      tone: "down",
    },
    {
      label: "Inside the agent band",
      value: String(counts.within),
      pill: ceilingPp === null ? "no band" : `under ${formatCeiling(ceilingPp)}`,
      tone: ceilingPp === null ? "grey" : "violet",
    },
  ];

  const seriesOptions: SeriesOption[] = groups.map((candidate) => ({
    value: candidate.key,
    label: `${labels.categories[candidate.categoryId] ?? candidate.categoryId} ${MIDDOT} ${
      labels.channels[candidate.channelId] ?? candidate.channelId
    }`,
    regions: candidate.rows.length,
    escalating: candidate.escalating,
  }));

  return (
    <>
      <PageHeader eyebrow={EYEBROW} title={TITLE} kpis={kpis}>
        {accuracy ? (
          <AccuracyStatement accuracy={accuracy} variant="inline" />
        ) : null}
      </PageHeader>

      {band ? (
        <Banner
          variant="violet"
          icon="i"
          title="The band the agent acts inside was derived, not chosen."
          measureCh={100}
        >
          {band.acts_within}
        </Banner>
      ) : null}

      {shifts.length === 0 || group === null ? (
        <Card>
          <CardHeader
            title="Nothing to reallocate in your scope"
            subtitle={`Brand ${brandId}${
              planner?.regionId ? ` ${MIDDOT} region ${planner.regionId}` : ""
            }`}
          />
          <CardBody>
            <p className="max-w-[88ch] text-[12.5px] leading-[1.6] text-body">
              No allocation recommendation is visible to you this week. Row
              level security scopes this board to your brand, your region and
              the categories you own, so an empty board means the optimiser
              proposed nothing inside that scope -- not that it produced
              nothing. A category manager on the same brand may well have a
              full board open right now.
              {unreadable > 0
                ? ` ${unreadable} row${
                    unreadable === 1 ? "" : "s"
                  } reached this screen without a readable split and ${
                    unreadable === 1 ? "was" : "were"
                  } left off rather than drawn as zero.`
                : ""}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-[1.35fr_1fr] gap-[16px]">
          <Card>
            <CardHeader
              title={`${labels.categories[group.categoryId] ?? group.categoryId} ${MIDDOT} ${
                labels.channels[group.channelId] ?? group.channelId
              }`}
              subtitle="Regional units, optimiser against the incumbent rule"
              actions={
                <SeriesPicker
                  options={seriesOptions}
                  value={group.key}
                  path={ROUTE}
                />
              }
            />
            <CardBody>
              <ShiftBoard
                group={group}
                regionNames={labels.regions}
                ceilingPp={ceilingPp}
                role={planner?.appRole ?? null}
                revalidate={ROUTE}
              />
              <p className="mt-[14px] max-w-[88ch] text-[11.5px] font-semibold leading-[1.6] text-mute">
                Stone is the incumbent rule, orange the optimiser, both on one
                scale so the pair is comparable within a region and across
                them. The share movement is read from the recommendation rather
                than recomputed here, because your scope may hold only part of
                this cell and a share recomputed over part of a cell would be a
                different number.
              </p>
            </CardBody>
          </Card>

          <div className="flex flex-col gap-[16px]">
            <AgentBandCard
              band={band}
              ceilingPp={ceilingPp}
              counts={counts}
              brandId={brandId}
            />
            <PortfolioMovement
              counts={counts}
              total={shifts.length}
              ceilingPp={ceilingPp}
              unreadable={unreadable}
            />
            <IncumbentDriftCard
              widest={widestMovement(shifts)}
              regionNames={labels.regions}
              categoryNames={labels.categories}
              channelNames={labels.channels}
            />
          </div>
        </div>
      )}

      {provenance.modelVersions.length > 0 ? (
        <ModelStrip
          className="mt-[16px]"
          modelVersion={provenance.modelVersions.join(" / ")}
          generatedAt={
            provenance.generatedAt ? new Date(provenance.generatedAt) : "unknown"
          }
          confidence={provenance.confidence ?? undefined}
          why={
            <>
              Each row pairs the optimiser&apos;s split for a region with the
              incumbent rule&apos;s split for the same region, both taken from
              the recommendation payload that this model version wrote. The
              share movement in the right-hand column is the optimiser&apos;s
              own figure, computed over the whole cell before row level
              security narrowed it to your scope.
              {accuracy
                ? ` Backtested accuracy for ${accuracy.modelVersion} is ${accuracy.headlinePct.toFixed(
                    1,
                  )}% against seasonal naive at ${accuracy.seasonalNaivePct.toFixed(
                    1,
                  )}%, a margin of ${accuracy.vsSeasonalNaivePoints.toFixed(
                    1,
                  )} points; that margin, not the headline, is what supports moving units between regions on this model's say-so.`
                : ""}
            </>
          }
        />
      ) : null}
    </>
  );
}
