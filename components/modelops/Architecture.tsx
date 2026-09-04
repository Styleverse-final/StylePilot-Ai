import { Card, CardBody, CardHeader, Why } from "@/components";
// From navItems, NOT from TopNav: TopNav is a client module, and a server
// component importing a constant from one gets undefined at runtime.
import { PRIMARY_NAV, SECONDARY_NAV } from "@/components/navItems";

import { integer, plural } from "./format";
import type { Registry } from "./data";
import type { AutonomyBand, PolicyParameter } from "./data";

/**
 * ARCHITECTURE -- the panel that answers "is this AI, or a planning system?"
 *
 * The honest answer is "both, in a stack", and a stack is only a claim
 * unless each layer names something you can go and look at. So every layer
 * below names artefacts that exist in THIS repository: tables you can select
 * from, model ids in model_registry, param_names in policy_parameter, agent
 * names in autonomy_band, and routes in this application's own nav array.
 * The counts are read from those same rows at request time -- if a model is
 * registered or an agent is added, the sentence changes with it.
 *
 * The layer text itself is written prose rather than a query result, because
 * "what this layer is for" is a design statement and there is no table of
 * design statements. Nothing in it is a measurement.
 *
 * Ports `.layer` from the visual specification: a 14px-radius tinted block
 * with a bold name over a body line, stacked five deep.
 */

const LAYER_TINT = {
  interface: "bg-peach",
  agents: "bg-violetW",
  policy: "bg-greenW",
  models: "bg-amberW",
  data: "bg-rule",
} as const;

type LayerKey = keyof typeof LAYER_TINT;

function Layer({
  index,
  name,
  tint,
  children,
  names,
}: {
  index: number;
  name: string;
  tint: LayerKey;
  children: React.ReactNode;
  /** The artefacts this layer is made of, listed rather than summarised. */
  names?: readonly string[];
}) {
  return (
    <div className={`rounded-quote px-[15px] py-[13px] ${LAYER_TINT[tint]}`}>
      <b className="mb-[3px] block text-copy font-extrabold text-ink">
        {index} &middot; {name}
      </b>
      <span className="block max-w-[92ch] text-copy leading-[1.6] text-body">
        {children}
      </span>
      {names && names.length > 0 ? (
        <div className="mt-[7px] flex flex-wrap gap-[5px]">
          {names.map((entry) => (
            <span
              key={entry}
              className="rounded-pill bg-white/70 px-[8px] py-[2px] font-mono text-[10px] font-bold text-ink2"
            >
              {entry}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Feature families, derived from the feature list the registry actually
 * stores rather than from a description of it. Each test is a pattern over
 * the stored names; a feature matching none of them lands in "other", which
 * is why "other" is shown rather than hidden.
 */
export function featureFamilies(features: readonly string[]): {
  label: string;
  count: number;
}[] {
  const families: { label: string; test: (name: string) => boolean }[] = [
    { label: "own-history lags", test: (n) => /^lag_/.test(n) || n === "lag52_mean4" || n === "yoy_ratio" },
    { label: "rolling mean and spread", test: (n) => /^rmean_|^rstd_/.test(n) },
    { label: "external signals", test: (n) => /^(search_interest|social_trend|competitor_)/.test(n) },
    { label: "trading state", test: (n) => /^(avg_selling_price|markdown_depth|availability_ratio)/.test(n) },
    { label: "calendar and seasonality", test: (n) => /^(woy|sin52|cos52|month|holiday_flag|weeks_to_next_event)$/.test(n) },
    { label: "promotion", test: (n) => /^promo_/.test(n) },
    { label: "weather", test: (n) => /^weather_/.test(n) },
    { label: "hierarchy identifiers", test: (n) => /_id$/.test(n) },
  ];

  const counted = families.map((family) => ({
    label: family.label,
    count: features.filter((name) => family.test(name)).length,
  }));
  const claimed = counted.reduce((total, family) => total + family.count, 0);
  const other = features.length - claimed;
  return other > 0
    ? [...counted.filter((f) => f.count > 0), { label: "other", count: other }]
    : counted.filter((f) => f.count > 0);
}

export type ArchitectureProps = {
  registry: Registry;
  parameters: readonly PolicyParameter[];
  bands: readonly AutonomyBand[];
};

export function Architecture({ registry, parameters, bands }: ArchitectureProps) {
  const planning = registry.planning[0] ?? null;
  const coldStart = registry.coldStart[0] ?? null;

  const families = planning ? featureFamilies(planning.features) : [];
  const trainRows = registry.planning
    .map((row) => row.entry.n_train_rows)
    .filter((value): value is number => typeof value === "number");

  const paramNames = [...new Set(parameters.map((p) => p.param_name))];
  // The per-category thresholds are one rule instantiated six times; count
  // the distinct RULES so the number describes the policy layer rather than
  // the category list.
  const paramRules = [...new Set(paramNames.map((name) => name.replace(/_[A-Z]{4}$/, "")))];

  const agentNames = [...new Set(bands.map((band) => band.agent_name))].sort();
  const enabledAgents = [
    ...new Set(bands.filter((band) => band.enabled).map((band) => band.agent_name)),
  ];

  const routes = [...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => item.label);

  return (
    <Card className="mb-[16px]">
      <CardHeader
        title="Architecture"
        subtitle="Five layers. Models produce, policy decides, agents act, language explains."
      />
      <CardBody>
        {/* The answer goes first. The question that motivated it, and the
            standard of evidence behind it, are worth having and are not
            worth three lines above the diagram they describe. */}
        <Why
          lead="Four of these five layers would still be doing work if the forecast were replaced tomorrow"
          label="what that claims"
          className="mb-[13px] block max-w-[92ch]"
        >
          The question this screen exists to answer is whether StyleVerse is a
          model with a dashboard bolted on, or a planning system that happens
          to contain models. It is the second. Every layer below names things
          you can go and look at in this repository, and the counts beside them
          are read from those rows at request time.
        </Why>

        <div className="flex flex-col gap-[8px]">
          <Layer index={5} name="Interface" tint="interface" names={routes}>
            The {routes.length} routes this build ships, read from the
            application&rsquo;s own navigation. Language explains and
            classifies here &mdash; the copilot drawer reads your rows before
            it answers &mdash; and it never produces a number. Every screen
            carries a model strip naming the version, the moment and the
            confidence behind what it shows.
          </Layer>

          <Layer index={4} name="Agents" tint="agents" names={agentNames}>
            {agentNames.length > 0 ? (
              <>
                {agentNames.length} {plural(agentNames.length, "agent")} in{" "}
                <span className="font-mono text-[11px] font-bold">autonomy_band</span>,
                {" "}
                {enabledAgents.length} of them enabled, each with a written
                band, an accountable human named on the row, and a kill switch.
                An agent acts inside its band and escalates outside it; every
                run it makes is a row in{" "}
                <span className="font-mono text-[11px] font-bold">agent_run</span>{" "}
                and every decision it takes lands in the same append-only
                ledger as a human&rsquo;s.
              </>
            ) : (
              <>
                No autonomy bands are readable in your scope, so this layer
                names none. When bands exist, each agent appears here with the
                clause that governs it and the human accountable for it.
              </>
            )}
          </Layer>

          <Layer index={3} name="Decision policy" tint="policy" names={paramRules}>
            {paramRules.length} threshold {plural(paramRules.length, "rule")} in{" "}
            <span className="font-mono text-[11px] font-bold">policy_parameter</span>
            {paramNames.length !== paramRules.length ? (
              <> ({paramNames.length} rows once the per-category ones are counted separately)</>
            ) : null}
            . Newsvendor buy sizing, category cover ceilings, the conformal
            widening offset, the allocation band. Deterministic and
            re-derivable: each row carries the derivation that produced it and
            the value actually in force, and the audit table at the foot of
            this screen shows every place those two differ.
          </Layer>

          <Layer
            index={2}
            name="Models"
            tint="models"
            names={[...registry.planning, ...registry.coldStart].map((row) => row.entry.model_id)}
          >
            {planning ? (
              <>
                {registry.planning.length + registry.coldStart.length} registered
                models. Planning grain is a {planning.entry.engine} ensemble at a{" "}
                {planning.entry.horizon_weeks}-week horizon over{" "}
                {planning.featureCount} features, fitted on{" "}
                {trainRows.length > 0 ? integer(Math.max(...trainRows)) : "the pilot"}{" "}
                rows per brand, with p10 / p50 / p90 quantiles fitted
                independently and repaired to be monotone.
                {coldStart ? (
                  <>
                    {" "}
                    Cold start is a separate {coldStart.entry.horizon_weeks}-week
                    attribute model over {coldStart.featureCount} features for
                    styles with no history at all, and its accuracy is reported
                    on its own because the two grains are not comparable.
                  </>
                ) : null}
              </>
            ) : (
              <>
                No planning-grain model is readable in your scope. When one is
                registered, its engine, horizon, target and feature count are
                read from the registry row and stated here.
              </>
            )}
          </Layer>

          <Layer index={1} name="Data and features" tint="data">
            {families.length > 0 ? (
              <>
                The feature store behind the planning model, grouped from the
                names the registry stores:{" "}
                {families.map((family, index) => (
                  <span key={family.label}>
                    {index > 0 ? ", " : ""}
                    <b className="font-bold text-ink2">{family.count}</b>{" "}
                    {family.label}
                  </span>
                ))}
                .{" "}
                {planning?.entry.horizon_weeks ? (
                  <>
                    Every history feature is lagged at least{" "}
                    {planning.entry.horizon_weeks} weeks, which is the horizon
                    on the registry row: a forecast made{" "}
                    {planning.entry.horizon_weeks} weeks out cannot see week{" "}
                    {planning.entry.horizon_weeks - 1}, and building the matrix
                    that way is what stops the backtest scoring a model that
                    had the answer.
                  </>
                ) : (
                  <>
                    Every history feature is lagged by at least the forecast
                    horizon, which is what stops the backtest scoring a model
                    that had the answer.
                  </>
                )}{" "}
                Demand is
                recovered from censored sales before any of it is computed, so
                the target is what customers wanted rather than what the shelf
                allowed them to buy.
              </>
            ) : (
              <>
                No feature list is readable in your scope. When a registry row
                carries one, the families in it are grouped and counted here
                from the stored names.
              </>
            )}
          </Layer>
        </div>
      </CardBody>
    </Card>
  );
}

export default Architecture;
