import { Banner, Card, CardBody, CardHeader, DataTable, Pill, type Column } from "@/components";

import { DRIFT_RULE } from "./constants";
import type { AgentRun, DriftBrand } from "./data";
import { integer, plural, timestamp } from "./format";

/**
 * DRIFT MONITOR -- what the forecast agent actually did, and the rule it did
 * it under.
 *
 * The counts are rows: agent_run.items_examined and items_escalated for
 * agent_name = 'forecast_agent'. Nothing here is a simulation of an agent
 * run; each figure came out of a run that happened and is stamped with when.
 *
 * THE RULE IS RENDERED, NOT SUMMARISED
 * ------------------------------------
 * A drift alert is only worth reading if you know what fires it. The rule is
 * k consecutive weeks more than DRIFT_RULE.dropPoints accuracy points below
 * the series' OWN prior-window baseline -- not below a global target, because
 * accuracy is not comparable across series. The band row's own wording, with
 * the two-series illustration it uses, is rendered from autonomy_band rather
 * than paraphrased here.
 *
 * k WAS DERIVED, NOT CHOSEN, and that is the part usually missing. The
 * specification asked for fewer weeks; measured against this data a single
 * week's 1-WAPE has a standard deviation wide enough that a large minority of
 * individual weeks breach by chance alone. This panel multiplies that
 * per-week rate out at both values of k against the number of series the
 * agent actually examined, so the reader sees how many false alarms each k
 * would have produced in this run rather than a probability in the abstract.
 * Every number in that argument comes from DRIFT_RULE, which is declared once
 * and listed in the provenance panel as untabled.
 *
 * The threshold itself stayed where the specification set it. Only k moved,
 * and only because the noise was measured.
 */

const RUN_COLUMNS: readonly Column<AgentRun>[] = [
  {
    key: "started",
    header: "Run started",
    cell: (run) => <span className="tabular">{timestamp(run.started_at)}</span>,
  },
  {
    key: "brand",
    header: "Brand",
    cell: (run) => <span className="font-bold">{run.brand_id}</span>,
  },
  {
    key: "examined",
    header: "Series examined",
    numeric: true,
    cell: (run) => integer(run.items_examined),
  },
  {
    key: "acted",
    header: "Refreshed in band",
    numeric: true,
    cell: (run) => integer(run.items_acted),
  },
  {
    key: "escalated",
    header: "Escalated",
    numeric: true,
    cell: (run) =>
      typeof run.items_escalated === "number" && run.items_escalated > 0 ? (
        <Pill variant="amber" tabular>
          {integer(run.items_escalated)}
        </Pill>
      ) : (
        <span className="text-mute">{integer(run.items_escalated)}</span>
      ),
  },
  {
    key: "status",
    header: "Status",
    cell: (run) => (
      <Pill variant={run.status === "OK" ? "up" : "down"}>{run.status}</Pill>
    ),
  },
];

function BrandRun({ brand, brandName }: { brand: DriftBrand; brandName: string }) {
  const latest = brand.latest;
  const examined = latest?.items_examined ?? null;
  const escalated = latest?.items_escalated ?? null;
  const share =
    examined !== null && escalated !== null && examined > 0 ? escalated / examined : null;

  return (
    <div className="rounded-inner bg-shell px-[16px] py-[14px]">
      <div className="mb-[10px] flex flex-wrap items-baseline gap-[9px]">
        <span className="text-h3 font-extrabold text-ink">{brandName}</span>
        <span className="text-small font-semibold text-mute">
          {latest ? `last run ${timestamp(latest.started_at)}` : "no run recorded"}
        </span>
        {brand.band ? (
          <Pill variant={brand.band.enabled ? "up" : "grey"}>
            {brand.band.enabled ? "enabled" : "disabled"}
          </Pill>
        ) : null}
      </div>

      {latest === null ? (
        <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
          The forecast agent has no recorded run for this brand in your scope.
          When it runs, the series it examined and the number it referred to a
          human appear here with the timestamp of the run.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-[24px]">
            <div>
              <div className="text-label font-bold text-mute">Series examined</div>
              <div className="mt-[2px] text-kpi font-extrabold tabular text-ink">
                {integer(examined)}
              </div>
            </div>
            <div>
              <div className="text-label font-bold text-mute">Refreshed in band</div>
              <div className="mt-[2px] text-kpi font-extrabold tabular text-ink">
                {integer(latest.items_acted)}
              </div>
            </div>
            <div>
              <div className="text-label font-bold text-mute">
                Escalated to the accountable planner
              </div>
              <div className="mt-[2px] flex items-baseline gap-[7px]">
                <span className="text-kpi font-extrabold tabular text-ink">
                  {integer(escalated)}
                </span>
                {share === null ? null : (
                  <Pill variant={share > 0.1 ? "amber" : "up"} tabular>
                    {(share * 100).toFixed(1)}% of series
                  </Pill>
                )}
              </div>
            </div>
          </div>

          {share === null ? null : (
            <div className="mt-[12px]">
              <div
                className="h-[8px] w-full overflow-hidden rounded-pill bg-cream"
                role="img"
                aria-label={`${integer(escalated)} of ${integer(examined)} series escalated`}
              >
                <div
                  className="h-full rounded-pill bg-orange"
                  style={{ width: `${Math.max(1, Math.min(100, share * 100))}%` }}
                />
              </div>
              <div className="mt-[5px] text-small font-semibold text-mute">
                {integer(escalated)} of {integer(examined)} series crossed the
                rule; the remaining {integer((examined ?? 0) - (escalated ?? 0))}{" "}
                were refreshed inside the band without a human touching them.
              </div>
            </div>
          )}

          {latest.summary ? (
            <p className="mt-[11px] border-t border-rule pt-[10px] text-small font-semibold leading-[1.6] text-mute">
              {latest.summary}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export type DriftMonitorProps = {
  brands: readonly DriftBrand[];
  brandNames: Record<string, string>;
  /** Brands the registry names, used to say what row level security withheld. */
  registryBrandIds: readonly string[];
};

export function DriftMonitor({
  brands,
  brandNames,
  registryBrandIds,
}: DriftMonitorProps) {
  const visible = new Set(brands.map((brand) => brand.brandId));
  const withheld = registryBrandIds.filter((brandId) => !visible.has(brandId));

  // The false-alarm arithmetic, multiplied out against the series this run
  // actually examined rather than left as a probability.
  const examinedTotal = brands.reduce(
    (total, brand) => total + (brand.latest?.items_examined ?? 0),
    0,
  );
  const pAtTwo = Math.pow(DRIFT_RULE.perWeekBreachRate, DRIFT_RULE.specConsecutiveWeeks);
  const pAtThree = Math.pow(DRIFT_RULE.perWeekBreachRate, DRIFT_RULE.consecutiveWeeks);

  // The stored band text and the rule the runs actually applied disagree.
  // Say so; do not quietly render whichever one looks tidier.
  const storedBand = brands.find((brand) => brand.band?.escalates_when)?.band ?? null;
  const storedClause = storedBand?.escalates_when ?? null;
  const storedScope = storedBand?.acts_within ?? null;
  const storedDisagrees =
    storedClause !== null && /two consecutive/i.test(storedClause);

  const allRuns = brands
    .flatMap((brand) => brand.runs)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));

  // Runs that scored no series. Counted rather than assumed, so the sentence
  // explaining them appears only when there is something to explain.
  const emptyRuns = allRuns.filter((run) => run.items_examined === 0);

  return (
    <Card>
      <CardHeader
        title="Drift monitor"
        subtitle={`Rolling ${DRIFT_RULE.rollingWeeks}-week accuracy against each series' own prior window`}
        actions={
          <Pill variant="violet">
            {brands.length} {plural(brands.length, "brand")} in scope
          </Pill>
        }
      />

      <CardBody>
        <p className="mb-[14px] max-w-[92ch] text-copy leading-[1.6] text-body">
          The forecast agent refreshes every series on a pass and scores each
          one against its own recent history on the same pass. It scores
          against the series&rsquo; own baseline and not a global target
          because accuracy is not comparable across series: a thin accessories
          line and a high-volume tops line sit at quite different accuracies
          and both are normal, and what is abnormal is either of them falling
          below where it has been sitting. A refresh is routine and stays
          inside the band. Drift is not routine, and the agent never retrains
          itself out of it &mdash; it escalates to the named human who owns the
          band. The band&rsquo;s own wording, with the illustration it uses, is
          quoted from the row below.
        </p>

        <div className="flex flex-col gap-[14px]">
          {brands.length === 0 ? (
            <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
              No forecast agent runs are readable in your scope, so there is
              nothing to show. agent_run is scoped by row level security to
              your own brand unless you hold a group role; when the agent runs
              against your brand, the series it examined and the number it
              escalated appear here.
            </p>
          ) : (
            brands.map((brand) => (
              <BrandRun
                key={brand.brandId}
                brand={brand}
                brandName={brandNames[brand.brandId] ?? brand.brandId}
              />
            ))
          )}
        </div>

        {withheld.length > 0 ? (
          <p className="mt-[13px] max-w-[92ch] text-small font-semibold leading-[1.6] text-mute">
            The registry names {registryBrandIds.length} brands, and this panel
            shows {brands.length}. That is row level security working, not data
            missing: agent_run is readable only for your own brand unless you
            hold a group role, while model_registry and policy_parameter are
            readable to every authenticated planner. {withheld.join(", ")}{" "}
            {plural(withheld.length, "is", "are")} therefore absent here and
            present above.
          </p>
        ) : null}
      </CardBody>

      <CardBody className="border-t border-rule">
        <div className="mb-[9px] text-label font-bold text-mute">
          The escalation rule, in full
        </div>

        <div className="rounded-inner bg-violetW px-[16px] py-[14px]">
          <p className="max-w-[92ch] text-copy font-bold leading-[1.7] text-ink">
            A series is referred to the accountable planner when its weekly
            accuracy falls more than{" "}
            <b className="text-orangeD">{DRIFT_RULE.dropPoints} points</b> below
            its own prior-window baseline in each of{" "}
            <b className="text-orangeD">
              {DRIFT_RULE.consecutiveWeeks} consecutive weeks
            </b>
            .
          </p>
          <p className="mt-[8px] max-w-[92ch] text-copy leading-[1.6] text-body">
            The rolling window is {DRIFT_RULE.rollingWeeks} weeks &mdash; it
            fits inside the 12-week forecast horizon and still holds enough
            volume for 1&nbsp;&minus;&nbsp;WAPE to mean something. The baseline
            is every week before that window, and a series with fewer than{" "}
            {DRIFT_RULE.baselineMinWeeks} such weeks is escalated as
            unscoreable rather than given a flattering score.
          </p>
        </div>

        <div className="mt-[14px] rounded-inner bg-cream px-[16px] py-[14px]">
          <div className="mb-[5px] text-copy font-extrabold text-ink">
            k = {DRIFT_RULE.consecutiveWeeks} was measured, not picked.
          </div>
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            The specification asked for {DRIFT_RULE.specConsecutiveWeeks}{" "}
            weeks running. Against this data a single week&rsquo;s
            1&nbsp;&minus;&nbsp;WAPE has a standard deviation of{" "}
            {DRIFT_RULE.weeklySdPointsLow}&ndash;
            {DRIFT_RULE.weeklySdPointsHigh} accuracy points, so about{" "}
            {(DRIFT_RULE.perWeekBreachRate * 100).toFixed(0)}% of individual
            weeks fall more than {DRIFT_RULE.dropPoints} points below baseline
            by chance alone. At that rate a run of{" "}
            {DRIFT_RULE.specConsecutiveWeeks} consecutive breaches happens by
            variance alone in {(pAtTwo * 100).toFixed(1)}% of series and a run
            of {DRIFT_RULE.consecutiveWeeks} in {(pAtThree * 100).toFixed(1)}%.
            {examinedTotal > 0 ? (
              <>
                {" "}
                Across the {integer(examinedTotal)} series the last{" "}
                {plural(brands.length, "run", "runs")} examined, that is about{" "}
                <b className="text-ink">{Math.round(pAtTwo * examinedTotal)}</b>{" "}
                false alarms at k={DRIFT_RULE.specConsecutiveWeeks} against
                about{" "}
                <b className="text-ink">{Math.round(pAtThree * examinedTotal)}</b>{" "}
                at k={DRIFT_RULE.consecutiveWeeks}.
              </>
            ) : null}{" "}
            {DRIFT_RULE.consecutiveWeeks} is the smallest k at which an alert
            is more likely to be real degradation than noise, so k moved and
            the{" "}
            {DRIFT_RULE.dropPoints}-point threshold the specification set
            stayed exactly where it was.
          </p>
          <p className="mt-[8px] max-w-[92ch] text-small font-semibold leading-[1.6] text-mute">
            These rule numbers are code, not rows &mdash; they live in{" "}
            <span className="font-mono text-[10.5px]">{DRIFT_RULE.source}</span>{" "}
            and are listed in the provenance panel at the top of this screen.
            The counts above them came out of agent_run.
          </p>
        </div>

        {storedClause === null ? null : (
          <div className="mt-[14px]">
            <div className="mb-[5px] text-label font-bold text-mute">
              The clauses as stored on autonomy_band
            </div>
            {storedScope === null ? null : (
              <p className="mb-[8px] max-w-[92ch] rounded-quote bg-shell px-[14px] py-[11px] text-copy leading-[1.6] text-body">
                <b className="text-ink">Acts within.</b> {storedScope}
              </p>
            )}
            <p className="max-w-[92ch] rounded-quote bg-shell px-[14px] py-[11px] text-copy leading-[1.6] text-body">
              {storedScope === null ? null : (
                <b className="text-ink">Escalates when. </b>
              )}
              {storedClause}
            </p>
            {storedDisagrees ? (
              <Banner
                variant="amber"
                icon="!"
                className="mt-[12px]"
                title="The written band and the running code disagree, and the code is the one that acted."
              >
                The stored clause still says two consecutive weeks. The agent
                that produced the counts above required{" "}
                {DRIFT_RULE.consecutiveWeeks}, because k was re-derived from
                the noise measurement after the band text was written. The
                escalations you see are therefore FEWER than the stored clause
                would produce, not more. autonomy_band is data rather than
                code precisely so a clause like this can be corrected without a
                release, and it has not been corrected yet &mdash; so the
                screen shows both rather than quietly rendering whichever one
                reads better.
              </Banner>
            ) : null}
          </div>
        )}
      </CardBody>

      {allRuns.length === 0 ? null : (
        <div className="border-t border-rule">
          <div className="px-[20px] pb-[6px] pt-[14px]">
            <div className="text-label font-bold text-mute">
              Every recorded run of this agent in your scope
            </div>
            <p className="mt-[4px] max-w-[92ch] text-copy leading-[1.6] text-body">
              These are pipeline runs, not consecutive weeks, so the movement
              between them is a change in the agent or its inputs rather than a
              trend in the business.
              {/* Said only when the rows show it. A sentence explaining a
                  zero that is not on screen would be describing a different
                  dataset. */}
              {emptyRuns.length > 0 ? (
                <>
                  {" "}
                  {emptyRuns.length === 1 ? "One run" : `${emptyRuns.length} runs`}{" "}
                  examined nothing at all, and{" "}
                  {emptyRuns.length === 1 ? "it is" : "they are"} the earliest:
                  the embargo means no forward actual exists yet, so there was
                  nothing to score until the rolling-origin backtest was
                  supplied as the accuracy history.
                </>
              ) : null}
            </p>
          </div>
          <DataTable
            columns={RUN_COLUMNS}
            rows={allRuns}
            rowKey={(run) => run.run_id}
            rowClassName={(run) =>
              run.items_examined === 0 ? "text-mute" : undefined
            }
            caption="Forecast agent run history"
          />
        </div>
      )}
    </Card>
  );
}

export default DriftMonitor;
