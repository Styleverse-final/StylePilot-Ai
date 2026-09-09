import type { Metadata } from "next";

import { Card, CardBody, CardHeader, Pill } from "@/components";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";

import { LaunchLabForm } from "./LaunchLabForm";

export const metadata: Metadata = {
  title: "Launch lab",
  description:
    "Trend-to-material: hypothetical attribute bundles priced for demand and fabric.",
};

/**
 * Launch Lab -- the Step 6 demo surface of the trend-to-material layer.
 *
 * A form and a results panel, per the build brief, and NOTHING here calls a
 * model: the offline pipeline walked a bounded design grid (category x
 * fabric x silhouette x colour, both brands) through trend scoring, the
 * frozen cold-start model plus its additive quantile trio, and the
 * deterministic material lookup -- and wrote rows. This screen reads the row
 * for the selected combination, RLS-scoped to the reader's brand like every
 * other read in the app.
 *
 * WHAT IS HELD, SAID OUT LOUD. The grid varies four design axes; fit,
 * sleeve, collar, price tier, newness and the numerics are held at the
 * category's modal/median historical values, stored per row and printed
 * under the results -- the screen never implies the planner chose them.
 *
 * THE HONESTY FURNITURE IS THE POINT OF THE DEMO. Confidence degrades to
 * "low -- no close historical precedent" with a visibly widened band when
 * the combination sits beyond the analogue-distance threshold; the fabric
 * numbers carry their placeholder consumption-norm label; the trend
 * adjustment prints its own calibration r. A tool for imagining products
 * that pretended certainty would be worse than no tool.
 */

const FABRICS = [
  "Cotton jersey", "Denim", "Hemp blend", "Linen blend", "Merino wool",
  "Nylon ripstop", "Organic cotton", "Recycled polyester", "Tencel lyocell",
  "Viscose",
] as const;
const SILHOUETTES = [
  "A-line", "Boxy", "Cropped", "Fitted", "Longline", "Straight", "Wide-leg",
] as const;
const COLOURS = [
  "Black", "Ecru", "Indigo", "Navy", "Off-white", "Olive", "Rust", "Sage",
  "Slate", "Terracotta",
] as const;
const CATEGORIES = ["ACCS", "ACTV", "BOTT", "DRES", "OUTW", "TOPS"] as const;

const DEFAULTS = {
  category: "DRES",
  fabric: "Tencel lyocell",
  silhouette: "A-line",
  colour: "Terracotta",
};

function one(v: string | string[] | undefined, fallback: string): string {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : fallback;
}

function fmtUnits(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

type EstimateRow = {
  held_values: Record<string, unknown>;
  week: string;
  demand_p10: number;
  demand_p50: number;
  demand_p90: number;
  confidence: string;
  nearest_analogue_distance: number | null;
  distance_threshold: number | null;
  trend_score: number | null;
  trend_adjustment: number | null;
  adjustment_calibration_r: number | null;
  frozen_point_estimate: number | null;
  trend_drivers: string[];
  nearest_analogues: {
    style_name: string;
    descriptor: string;
    similarity: number;
    actual_first_8wk: number;
  }[];
  fabric_p10: number;
  fabric_p50: number;
  fabric_p90: number;
  metres_per_garment: number | null;
  consumption_norm_source: string;
  recommended_action: string;
};

type ScoreRow = {
  attribute: string;
  value: string;
  trend_score: number;
  direction: string;
  lead_weeks: number | null;
  confidence: string;
  source: string;
};

function Band({ p10, p50, p90, unit }: { p10: number; p50: number; p90: number; unit: string }) {
  const span = Math.max(p90 - p10, 1);
  const mid = ((p50 - p10) / span) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold tabular-nums text-mute">
          P10 {fmtUnits(p10)}
        </span>
        <span className="text-[22px] font-extrabold tabular-nums text-ink">
          {fmtUnits(p50)}
          <span className="ml-[5px] text-[11px] font-bold text-mute">{unit} P50</span>
        </span>
        <span className="text-[11px] font-bold tabular-nums text-mute">
          P90 {fmtUnits(p90)}
        </span>
      </div>
      <div className="relative mt-[7px] h-[8px] overflow-hidden rounded-pill bg-peach">
        <div
          className="absolute top-0 h-full w-[3px] rounded-pill bg-orange"
          style={{ left: `calc(${Math.max(2, Math.min(97, mid))}% - 1px)` }}
        />
      </div>
    </div>
  );
}

export default async function LaunchLabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [planner, params] = await Promise.all([getSessionPlanner(), searchParams]);
  const brandId = planner?.brandId === "ECO" ? "ECO" : "SPD";

  const category = one(params.category, DEFAULTS.category);
  const fabric = one(params.fabric, DEFAULTS.fabric);
  const silhouette = one(params.silhouette, DEFAULTS.silhouette);
  const colour = one(params.colour, DEFAULTS.colour);

  const sb = await createServerAnonClient();
  const [{ data: estRows }, { data: scoreRows }] = await Promise.all([
    sb
      .from("trend_material_estimate")
      .select("*")
      .eq("brand_id", brandId)
      .eq("category_id", category)
      .eq("fabric", fabric)
      .eq("silhouette", silhouette)
      .eq("colour_family", colour)
      .limit(1),
    sb
      .from("trend_attr_score")
      .select("attribute, value, trend_score, direction, lead_weeks, confidence, source")
      .eq("brand_id", brandId)
      .eq("category_id", category)
      .in("value", [fabric, silhouette, colour]),
  ]);

  const est = (estRows?.[0] ?? null) as EstimateRow | null;
  const scores = (scoreRows ?? []) as ScoreRow[];
  const isLow = est ? est.confidence.startsWith("low") : false;

  return (
    <>
      <PageHeader
        eyebrow="Trend to material"
        title={
          <>
            Launch <span className="text-orange">lab</span>
          </>
        }
        strapline="A hypothetical design, priced for demand and fabric before it exists"
      />

      <Card className="mb-[16px]">
        <CardHeader
          title="Compose a hypothetical"
          subtitle={`${brandId === "SPD" ? "SpeedStyle" : "EcoWeave"} · four design axes vary; everything else is held at the category's historical norm and listed below the result`}
        />
        <CardBody>
          <LaunchLabForm
            /* Keyed on the params so a completed navigation remounts the
               form with fresh state -- which is also what clears the
               pending flag on the Estimate button. */
            key={`${category}|${fabric}|${silhouette}|${colour}`}
            categories={CATEGORIES}
            fabrics={FABRICS}
            silhouettes={SILHOUETTES}
            colours={COLOURS}
            category={category}
            fabric={fabric}
            silhouette={silhouette}
            colour={colour}
          />
        </CardBody>
      </Card>

      {est === null ? (
        <Card>
          <CardBody>
            <p className="text-[12.5px] font-semibold leading-[1.6] text-mute">
              No precomputed estimate exists for this combination in your
              brand&apos;s grid. The grid covers every category x fabric x
              silhouette x colour for the brand, so an empty read here means
              the batch has not been loaded {"—"} run
              trendmat.load_launch_lab.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-[1.4fr_1fr] items-start gap-[16px] max-[1140px]:grid-cols-1">
          <div className="flex flex-col gap-[16px]">
            <Card>
              <CardHeader
                title="Demand range, first 8 weeks"
                subtitle={`Frozen cold-start model + additive quantile band + trend adjustment · as of ${est.week}`}
                actions={
                  <Pill variant={isLow ? "amber" : "grey"}>
                    {isLow ? "No close precedent" : "Has historical analogues"}
                  </Pill>
                }
              />
              <CardBody>
                <Band p10={est.demand_p10} p50={est.demand_p50} p90={est.demand_p90} unit="units" />

                <div className="mt-[13px] grid grid-cols-3 gap-[10px] border-t border-rule pt-[12px]">
                  <div>
                    <div className="text-[14px] font-extrabold tabular-nums text-ink">
                      {est.nearest_analogue_distance ?? "--"}
                      <span className="text-[10.5px] font-bold text-mute"> vs {est.distance_threshold ?? "--"}</span>
                    </div>
                    <div className="text-[9.5px] font-bold uppercase tracking-[0.04em] text-mute">
                      Analogue distance / threshold
                    </div>
                  </div>
                  <div>
                    <div className="text-[14px] font-extrabold tabular-nums text-ink">
                      {est.trend_adjustment === null ? "--" : `×${est.trend_adjustment}`}
                      <span className="text-[10.5px] font-bold text-mute">
                        {" "}r={est.adjustment_calibration_r ?? "--"}
                      </span>
                    </div>
                    <div className="text-[9.5px] font-bold uppercase tracking-[0.04em] text-mute">
                      Trend adjustment / calibration
                    </div>
                  </div>
                  <div>
                    <div className="text-[14px] font-extrabold tabular-nums text-ink">
                      {est.frozen_point_estimate === null ? "--" : fmtUnits(est.frozen_point_estimate)}
                    </div>
                    <div className="text-[9.5px] font-bold uppercase tracking-[0.04em] text-mute">
                      Frozen model point estimate
                    </div>
                  </div>
                </div>

                {isLow ? (
                  <p className="mt-[11px] rounded-inner bg-amberW px-[12px] py-[9px] text-[11.5px] font-semibold leading-[1.55] text-amber">
                    {est.confidence}. The band above is widened 1.5x beyond the
                    calibrated quantiles because nothing in 20+ seasons of
                    history sits close to this combination. That is the tool
                    working, not failing.
                  </p>
                ) : null}

                {est.trend_drivers.length > 0 ? (
                  <div className="mt-[12px] border-t border-rule pt-[11px]">
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.05em] text-mute">
                      Trend drivers in this bundle
                    </div>
                    <ul className="mt-[6px] flex flex-col gap-[3px]">
                      {est.trend_drivers.map((d) => (
                        <li key={d} className="text-[11.5px] font-semibold leading-[1.5] text-body">
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Fabric requirement"
                subtitle="Deterministic: demand x metres per garment. Not a model."
              />
              <CardBody>
                <Band p10={est.fabric_p10} p50={est.fabric_p50} p90={est.fabric_p90} unit="m" />
                <p className="mt-[11px] text-[11.5px] font-semibold leading-[1.55] text-body">
                  {est.metres_per_garment ?? "--"} m per garment.{" "}
                  <b className="text-ink">{est.recommended_action}</b>
                </p>
                <p className="mt-[7px] rounded-inner bg-shell px-[11px] py-[7px] text-[11px] font-semibold leading-[1.5] text-mute">
                  Consumption norm: {est.consumption_norm_source}. The demand
                  range is real modelling; the metres conversion awaits
                  tech-pack data and says so rather than dressing up.
                </p>
              </CardBody>
            </Card>
          </div>

          <div className="flex flex-col gap-[16px]">
            <Card>
              <CardHeader
                title="What the signals say"
                subtitle="Derived: category signal x this value's demand share"
              />
              <CardBody>
                {scores.length === 0 ? (
                  <p className="text-[12px] font-semibold text-mute">
                    No scored history for these values in this category.
                  </p>
                ) : (
                  <div className="flex flex-col">
                    {scores.map((s, i) => (
                      <div
                        key={`${s.attribute}:${s.value}`}
                        className={`flex items-center gap-[10px] py-[8px] ${i > 0 ? "border-t border-rule" : ""}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-[13px] font-extrabold ${
                            s.direction === "rising"
                              ? "bg-greenW text-green"
                              : s.direction === "falling"
                                ? "bg-redW text-red"
                                : "bg-cream text-mute"
                          }`}
                        >
                          {s.direction === "rising" ? "↗" : s.direction === "falling" ? "↘" : "→"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-extrabold text-ink">{s.value}</div>
                          <div className="text-[10.5px] font-semibold text-mute">
                            {s.attribute} · {s.direction} {s.trend_score > 0 ? "+" : ""}
                            {s.trend_score}
                            {s.lead_weeks ? ` · ~${s.lead_weeks}wk lead` : ""} · {s.source}
                          </div>
                        </div>
                        <span className="text-[10px] font-extrabold uppercase tracking-[0.04em] text-mute">
                          {s.confidence}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Nearest real precedents" subtitle="Gower distance, the frozen module's own matcher" />
              <CardBody>
                <div className="flex flex-col">
                  {est.nearest_analogues.map((a, i) => (
                    <div
                      key={a.style_name}
                      className={`py-[8px] ${i > 0 ? "border-t border-rule" : ""}`}
                    >
                      <div className="flex items-baseline justify-between gap-[8px]">
                        <span className="truncate text-[12px] font-extrabold text-ink">{a.style_name}</span>
                        <span className="flex-none text-[11px] font-bold tabular-nums text-mute">
                          sim {a.similarity}
                        </span>
                      </div>
                      <div className="text-[10.5px] font-semibold text-mute">
                        {a.descriptor} · actual first 8wk {fmtUnits(a.actual_first_8wk)} units
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Held at the category norm" subtitle="Not chosen by you; stated, not implied" />
              <CardBody>
                <dl className="grid grid-cols-2 gap-x-[12px] gap-y-[6px]">
                  {Object.entries(est.held_values).map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="truncate text-[9.5px] font-bold uppercase tracking-[0.04em] text-mute">
                        {k.replace(/_/g, " ")}
                      </dt>
                      <dd className="truncate text-[11.5px] font-extrabold text-ink">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
