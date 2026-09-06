import type { Metadata } from "next";

import {
  AccuracyStatement,
  Banner,
  Card,
  CardBody,
  CardHeader,
  KpiCard,
  ModelStrip,
  PageFooter,
  PageHeader,
  Pill,
} from "@/components";
import { AgentBandCard } from "@/components/allocation/AgentBandCard";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BulbIcon,
  GarmentIcon,
  GridIcon,
  SettlingCurve,
  TargetIcon,
  UsersIcon,
} from "@/components/allocation/icons";
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
import { redirectCmpoToPortfolio } from "@/lib/guards";

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
  await redirectCmpoToPortfolio();
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

  const seriesOptions: SeriesOption[] = groups.map((candidate) => ({
    value: candidate.key,
    label: `${labels.categories[candidate.categoryId] ?? candidate.categoryId} ${MIDDOT} ${
      labels.channels[candidate.channelId] ?? candidate.channelId
    }`,
    regions: candidate.rows.length,
    escalating: candidate.escalating,
  }));

  /*
    FIVE CARDS RATHER THAN THE FLAT KPI ROW.

    The flat row was right while these were four reference figures a planner
    glanced past on the way to the board. They are not that: the first three
    are the shape of the week's movement, the fourth is the governance line
    drawn through it, and the fifth is the evidence that the model proposing
    all of it is worth following. Each one needed a caveat that the flat row
    had nowhere to put -- what the denominator is, what "inside the band"
    counts, how many folds the accuracy is a mean of -- and each now carries
    it behind its own disclosure rather than dropping it.

    The tone on each tile is the app's own palette rather than decoration:
    green for units arriving, red for units leaving, violet for the agent,
    green again for the model against its benchmarks. A reader who has seen
    the exception queue or the buy plan already knows what those mean.

    THE FIVE STAY ON ONE LINE, WHICH IS WHY THEY SIT IN THE BAND. Squeezed
    between the title and the Ask button these five get about a thousand
    pixels, and the last two drop to a second row -- which reads as two groups
    of measures when it is one. The band is the full-width row under the title
    and it is exactly what PageHeader documents it for; the buy plan puts its
    own five there for the same reason.

    THE FIVE TRACKS ARE NOT EQUAL. Each is minmax(max-content, <share>): the
    FLOOR is whatever that card actually contains, and the share only decides
    how the slack above the floors is divided. Fixed fr weights cannot do this
    -- a track narrower than its own label does not wrap the card, it overflows
    it, and the label of an inline KpiCard is deliberately unwrappable so that
    five cards in a row stand the same height. Sizing from content is also
    what keeps each pill on the value line instead of dropping under it, and
    it means no weight here has to be re-guessed when a count goes from two
    digits to three.

    The shares are near-even because the first four cards are near-even; the
    accuracy card takes about a third more because it carries a percentage, a
    pill AND the line naming the folds and benchmarks behind it. Below 1180px
    there is no width at which five fit, and it falls to three, then two.

    Part H is why the accuracy card is rendered by AccuracyStatement and not
    by a KpiCard here: that component cannot draw the headline without the
    seasonal-naive margin beside it, and no accuracy percentage is written as
    a literal anywhere in this file.
  */
  const headerCards = (
    <div className="grid flex-1 grid-cols-[minmax(max-content,0.88fr)_minmax(max-content,0.94fr)_minmax(max-content,0.96fr)_minmax(max-content,0.92fr)_minmax(max-content,1.3fr)] gap-[10px] max-[1180px]:grid-cols-3 max-[860px]:grid-cols-2">
      <KpiCard
        variant="inline"
        surface="plain"
        tone="violet"
        icon={<GridIcon />}
        label="Cells in scope"
        value={String(shifts.length)}
        detail={
          <>
            Category {String.fromCharCode(0xd7)} channel{" "}
            {String.fromCharCode(0xd7)} region cells row level security
            returned to you. A colleague on the same brand with a different
            region sees a different number, and neither of them is the
            portfolio&apos;s.
            {unreadable > 0
              ? ` ${unreadable} further row${
                  unreadable === 1 ? "" : "s"
                } reached this screen without a readable split and ${
                  unreadable === 1 ? "is" : "are"
                } left out rather than counted as zero.`
              : ""}
          </>
        }
      />

      <KpiCard
        variant="inline"
        surface="plain"
        tone="green"
        icon={<ArrowUpIcon />}
        label="Shift in"
        value={String(counts.shiftIn)}
        pill={
          counts.shiftIn > 0 ? (
            <Pill variant="up">regions gaining</Pill>
          ) : undefined
        }
        detail={
          <>
            Cells where the optimiser puts more of the category total into
            this region than last year&apos;s mix would. The count is of
            cells, not units: one large cell can outweigh several small ones,
            which is what the shift pp column on the board is for.
          </>
        }
      />

      <KpiCard
        variant="inline"
        surface="plain"
        tone="red"
        icon={<ArrowDownIcon />}
        label="Shift out"
        value={String(counts.shiftOut)}
        pill={
          counts.shiftOut > 0 ? (
            <Pill variant="down">regions giving up</Pill>
          ) : undefined
        }
        detail={
          <>
            Cells the optimiser takes share away from. Shifts in and shifts
            out need not sum to the cells in scope: a region the model holds
            at its current share is neither, and those are counted as holds.
          </>
        }
      />

      <KpiCard
        variant="inline"
        surface="plain"
        tone="violet"
        icon={<UsersIcon />}
        /* "Inside the band", not "Inside the agent band": an inline card's
           label cannot wrap, so a five-word label sets a floor under the
           card's width and pushes the strip onto a second line. This is the
           wording the band card's own stat rail already uses, the tile says
           whose band it is, and the pill beside the value names the ceiling. */
        label="Inside the band"
        value={String(counts.within)}
        pill={
          <Pill variant={ceilingPp === null ? "grey" : "violet"} tabular>
            {ceilingPp === null ? "no band" : `under ${formatCeiling(ceilingPp)}`}
          </Pill>
        }
        detail={
          ceilingPp === null ? (
            <>
              No enabled allocation band is published for this brand, so
              nothing here executes on its own and every movement on the board
              is a decision waiting on a person.
            </>
          ) : (
            <>
              Movements the agent commits without asking, because the share
              they move is strictly below the published ceiling. The remaining{" "}
              {counts.escalates} escalate. This is not the threshold a
              row&apos;s rationale quotes: that one decides whether the
              optimiser calls a movement a shift at all, and this one decides
              who is allowed to commit it.
            </>
          )
        }
        href="#agent-band"
        hrefLabel="See how the band was derived"
      />

      {accuracy === null ? (
        <KpiCard
          variant="inline"
          surface="plain"
          tone="green"
          icon={<TargetIcon />}
          label="Forecast accuracy"
          value="--"
          detail="No accuracy row is readable in your scope, so nothing is claimed for the model that proposed these movements."
        />
      ) : (
        <AccuracyStatement
          accuracy={accuracy}
          variant="card"
          cardVariant="inline"
          cardSurface="plain"
          cardBasis
          icon={<TargetIcon />}
        />
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow={EYEBROW}
        title={TITLE}
        tagline="Optimize today. Serve tomorrow."
        band={headerCards}
      />

      {band ? (
        <Banner
          variant="violet"
          icon={<BulbIcon />}
          eyebrow="Key insight"
          title="The band the agent acts inside was derived, not chosen."
          measureCh={100}
          /*
            Closed by default. The title is the whole claim, so a reader who
            never opens this has still read it; the sixty words under it are
            the evidence, and they were standing between the header figures
            and the board every single visit. They open on a press and are
            word for word what they were.
          */
          collapsible
          /*
            The aside states the CONSEQUENCE of the paragraph beside it, in
            the four words a planner would use. It carries no figure on
            purpose: every number that supports the claim is in the
            derivation to its left, and a number lifted out of its derivation
            and set in a decorative panel is exactly the pattern this app
            spends the rest of its surface area avoiding.
          */
          aside={
            <div className="w-[190px] text-right">
              <span className="block text-orange">
                <SettlingCurve />
              </span>
              <div className="mt-[2px] text-[12.5px] font-extrabold leading-[1.35] text-ink">
                Smaller shifts.
                <br />
                Smarter outcomes.
              </div>
              <span
                aria-hidden="true"
                className="mt-[7px] ml-auto block h-[2px] w-[46px] rounded-pill bg-orange"
              />
            </div>
          }
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
        <div className="grid grid-cols-[1.35fr_1fr] gap-[16px] max-[1240px]:grid-cols-1">
          <Card>
            <CardHeader
              actions={
                <SeriesPicker
                  options={seriesOptions}
                  value={group.key}
                  path={ROUTE}
                />
              }
            >
              <div className="flex min-w-0 items-center gap-[11px]">
                <span
                  aria-hidden="true"
                  className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] bg-peach text-orange"
                >
                  <GarmentIcon />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-h3 font-extrabold text-ink">
                    {labels.categories[group.categoryId] ?? group.categoryId}{" "}
                    {MIDDOT}{" "}
                    {labels.channels[group.channelId] ?? group.channelId}
                  </h3>
                  <div className="mt-[2px] text-small font-semibold text-mute">
                    Regional units, optimiser against the incumbent rule
                  </div>
                </div>
              </div>
            </CardHeader>
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
                different number. Open a row for its reasoning, what the
                movement is worth in units, and the decision.
              </p>
            </CardBody>
          </Card>

          <div className="flex flex-col gap-[16px]">
            <div id="agent-band" className="scroll-mt-[90px]">
              <AgentBandCard
                band={band}
                ceilingPp={ceilingPp}
                counts={counts}
                brandId={brandId}
              />
            </div>
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

      <PageFooter
        statement="Where the units go, and who decided"
        words={["Insights", "Actions", "Impact"]}
      />
    </>
  );
}
