import { DriverBars, Why, type Driver } from "@/components";
import type { ShapDriver } from "@/lib/queries";

/**
 * DriverPanel -- attribution, in units, signed.
 *
 * A rules engine has no weights to attribute, which is why this panel is one
 * of the five properties that separate this from an ERP screen. Every row
 * here is read from forecast.drivers, the jsonb the scoring pipeline writes,
 * and every row in that jsonb carries method "tree_shap_exact" -- exact tree
 * SHAP, not a sampled approximation and not a permutation proxy. The method
 * string is rendered from the data rather than asserted in prose, so if the
 * pipeline ever writes something else the screen stops claiming exactness.
 *
 * Contributions are signed. Negative contributions run grey through
 * <DriverBars/>, because "search interest pulled 612 units OUT of this
 * forecast" is a different statement from "search interest contributed 612
 * units" and colour is the cheapest way to keep them apart.
 *
 * HONESTY NOTE, and it is why the footnote is worded the way it is: the
 * pipeline stores the largest contributions per row, not the full vector.
 * The full SHAP decomposition sums to the prediction; four of them do not,
 * and claiming otherwise on screen is arithmetic a reader can check in ten
 * seconds.
 */

const LAGGED_SIGNAL: Readonly<Record<string, string>> = {
  search_interest_index: "Search interest",
  social_trend_index: "Social trend",
  competitor_activity_index: "Competitor activity",
  competitor_price_index: "Competitor price",
  weather_anomaly_c: "Weather anomaly",
};

const EXACT: Readonly<Record<string, string>> = {
  lag_52: "Demand this week last year",
  lag52_mean4: "Last year, four-week mean",
  yoy_ratio: "Year-on-year ratio",
  promo_depth: "Planned promotion depth",
  promo_n: "Planned promotions this week",
  weeks_to_next_event: "Weeks to next calendar event",
  category_id: "Category effect",
  channel_id: "Channel effect",
  region_id: "Region effect",
};

/**
 * Feature name to planner language. Anything unmapped falls through to the
 * raw feature name: an unfamiliar label is a smaller problem than a label
 * that quietly describes the wrong feature.
 */
export function featureLabel(feature: string): string {
  const exact = EXACT[feature];
  if (exact !== undefined) return exact;

  const lag = /^lag_(\d+)$/.exec(feature);
  if (lag) return `Demand ${lag[1]} weeks ago`;

  const rmean = /^rmean_(\d+)$/.exec(feature);
  if (rmean) return `${rmean[1]}-week rolling mean`;

  const lagged = /^(.+)_lag(\d+)$/.exec(feature);
  if (lagged) {
    const base = LAGGED_SIGNAL[lagged[1] ?? ""];
    if (base) return `${base}, lagged ${lagged[2]}w`;
  }

  const trend = /^(.+)_trend$/.exec(feature);
  if (trend) {
    const base = LAGGED_SIGNAL[trend[1] ?? ""];
    if (base) return `${base}, trend`;
  }

  return feature;
}

export type DriverPanelProps = {
  drivers: readonly ShapDriver[];
  /** How many to show. The panel is a ranking, not the full vector. */
  limit?: number;
};

export function DriverPanel({ drivers, limit = 4 }: DriverPanelProps) {
  const ranked = [...drivers]
    .sort(
      (a, b) => Math.abs(b.contribution_units) - Math.abs(a.contribution_units),
    )
    .slice(0, limit);

  if (ranked.length === 0) {
    return (
      <div className="px-[20px] py-[16px] text-[11.5px] font-semibold leading-[1.6] text-mute">
        This forecast row carries no attribution. The panel stays empty rather
        than showing a ranking that was not computed.
      </div>
    );
  }

  const bars: Driver[] = ranked.map((d) => ({
    label: featureLabel(d.feature),
    value: d.contribution_units,
  }));

  const methods = Array.from(new Set(ranked.map((d) => d.method)));
  const exact = methods.length === 1 && methods[0] === "tree_shap_exact";

  return (
    <DriverBars
      drivers={bars}
      footnote={
        <Why
          lead={`${ranked.length} largest drivers, in units`}
          label="how they were attributed"
          className="block"
        >
          {exact ? (
            <>
              <b className="text-ink">Exact tree SHAP</b>, in units and signed
              {/* the method string, from the row, not from prose */}
              <span className="font-mono text-[11px]"> (method {methods[0]})</span>.
              Grey bars pulled units out of the forecast.
            </>
          ) : (
            <>
              Attribution method{methods.length > 1 ? "s" : ""}{" "}
              <span className="font-mono text-[11px]">{methods.join(", ")}</span>
              , in units and signed. Grey bars pulled units out of the forecast.
            </>
          )}{" "}
          These are the {ranked.length} largest contributions stored for this
          row, not the whole vector, so they rank the forecast rather than sum
          to it.
        </Why>
      }
    />
  );
}

export default DriverPanel;
