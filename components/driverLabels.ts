/**
 * Feature name to planner language.
 *
 * LIFTED, NOT REWRITTEN. This mapping and its fallbacks were written for
 * components/workbench/DriverPanel.tsx and have been correct there since; the
 * only change is where they live. /buy needs the same translation for the same
 * jsonb -- recommendation.drivers and forecast.drivers carry identical shapes
 * from the same scoring pass -- and the alternative was either a second
 * translator that could drift from this one, or /buy importing a workbench
 * component and pulling DriverBars and Why into its bundle to reach a pure
 * function.
 *
 * DriverPanel re-exports featureLabel, so every existing caller and import
 * path still resolves.
 *
 * The fallback is deliberate and unchanged: anything unmapped returns the raw
 * feature name. An unfamiliar label is a smaller problem than a label that
 * quietly describes the wrong feature.
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
