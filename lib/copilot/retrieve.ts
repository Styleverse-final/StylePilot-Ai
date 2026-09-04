import type { StyleverseClient } from "@/lib/supabase";

/**
 * Intent classification and retrieval.
 *
 * THE ORDER HERE IS THE WHOLE SECURITY MODEL. Retrieval runs BEFORE any model
 * call, through the CALLER'S OWN SESSION CLIENT -- the anon client carrying
 * their cookie, never the service role. Postgres RLS therefore scopes the
 * copilot exactly as it scopes the screens: a planner cannot ask their way into
 * another region's numbers, because the rows never reach the process that
 * builds the prompt.
 *
 * That is a much stronger guarantee than instructing a model to refuse. There
 * is nothing to jailbreak: the data is not in the context to be leaked.
 *
 * Classification is deterministic keyword matching rather than a model call.
 * Two reasons: an intent classifier that needs a network round trip doubles the
 * latency of every question, and using a model to decide what to retrieve would
 * put a model call BEFORE the retrieval step, which is the one ordering this
 * design does not allow.
 */

export type Intent =
  | "unknown"
  | "forecast"
  | "recommendation"
  | "exception"
  | "kpi"
  | "planner"
  | "model"
  | "navigation";

export type RetrievedContext = {
  intent: Intent;
  /** Tables and views actually read. Rendered in the sources panel. */
  sources: string[];
  /** The rows themselves, as handed to the model. */
  data: Record<string, unknown>;
  /** True when nothing came back -- no model call is made in that case. */
  empty: boolean;
  /** Screen that would answer this, named when we have nothing. */
  suggestedRoute: string | null;
};

const RULES: { intent: Intent; route: string; patterns: RegExp[] }[] = [
  {
    intent: "exception",
    route: "/exceptions",
    patterns: [/\bexception/i, /\bstockout/i, /\bovers?tock/i, /\bcover\b/i, /\brisk\b/i],
  },
  {
    intent: "recommendation",
    route: "/buy",
    patterns: [/\brecommend/i, /\bbuy\b/i, /\bquantit/i, /\border\b/i, /\ballocat/i, /\bmarkdown/i, /\bdepth\b/i],
  },
  {
    intent: "model",
    route: "/model-ops",
    patterns: [/\baccuracy\b/i, /\bmodel\b/i, /\bbenchmark/i, /\bnaive\b/i, /\bmase\b/i, /\bcalibrat/i, /\bdrift\b/i, /\binterval\b/i],
  },
  {
    intent: "planner",
    route: "/adoption",
    patterns: [/\bplanner/i, /\bteam\b/i, /\bwho\b/i, /\breadiness/i, /\bsegment/i, /\blearning\b/i, /\btraining\b/i, /\badoption/i],
  },
  {
    intent: "kpi",
    route: "/",
    patterns: [/\bkpi\b/i, /\bmargin\b/i, /\bvalue\b/i, /\btouchless/i, /\bapproval/i, /\bhow much\b/i, /\bhow many\b/i, /\bsaved\b/i],
  },
  {
    intent: "forecast",
    route: "/workbench",
    patterns: [/\bforecast/i, /\bdemand\b/i, /\bp10\b/i, /\bp90\b/i, /\bunits?\b/i, /\bweek/i, /\bhorizon/i],
  },
  {
    intent: "navigation",
    route: "/",
    patterns: [/\bwhere\b/i, /\bshow me\b/i, /\btake me\b/i, /\bopen\b/i, /\bnavigate/i, /\bscreen\b/i, /\bpage\b/i],
  },
];

/**
 * Classify, or admit we cannot.
 *
 * There is deliberately NO default intent. An earlier version fell back to
 * "kpi" when nothing matched, which meant a question about share prices or a
 * CEO's salary retrieved the value summary, found it non-empty, and called a
 * model -- so the "no data, no model call" path could never fire for exactly
 * the questions it exists for. An unrecognised question retrieves nothing and
 * is answered without a provider.
 */
export function classifyIntent(question: string): Intent {
  let best: { intent: Intent; hits: number } = { intent: "unknown", hits: 0 };
  for (const rule of RULES) {
    const hits = rule.patterns.reduce((n, re) => n + (re.test(question) ? 1 : 0), 0);
    if (hits > best.hits) best = { intent: rule.intent, hits };
  }
  return best.intent;
}

export function routeForIntent(intent: Intent): string {
  return RULES.find((r) => r.intent === intent)?.route ?? "/";
}

/** Small enough to fit a prompt, large enough to answer with. */
const ROW_LIMIT = 12;

function nonEmpty(data: Record<string, unknown>): boolean {
  return Object.values(data).some((v) => Array.isArray(v) && v.length > 0);
}

/**
 * Retrieve context for an intent, under the caller's session.
 *
 * `sb` MUST be the anon client bound to the request cookies. Passing a
 * service-role client here would silently defeat every scoping guarantee in
 * this file, which is why the copilot route builds it one way only.
 */
export async function retrieve(
  sb: StyleverseClient,
  intent: Intent,
  question: string,
): Promise<RetrievedContext> {
  const sources: string[] = [];
  const data: Record<string, unknown> = {};

  const record = async <T>(
    name: string,
    run: () => Promise<{ data: T | null; error: unknown }>,
  ): Promise<void> => {
    const { data: rows, error } = await run();
    if (error) return; // a blocked or failed read contributes nothing, silently
    sources.push(name);
    data[name] = rows ?? [];
  };

  switch (intent) {
    case "unknown":
      // Nothing is retrieved on purpose. See classifyIntent.
      break;

    case "forecast":
      await record("forecast", async () =>
        sb
          .from("forecast")
          .select("brand_id, category_id, channel_id, region_id, iso_week, horizon_week, forecast_units, p10, p90, model_version")
          .order("iso_week", { ascending: true })
          .limit(ROW_LIMIT),
      );
      break;

    case "recommendation":
      await record("recommendation", async () =>
        sb
          .from("v_recommendation_state")
          .select("id, brand_id, category_id, region_id, rec_type, action, severity, value_at_stake_inr, confidence, rationale, status, accountable_planner")
          .order("value_at_stake_inr", { ascending: false, nullsFirst: false })
          .limit(ROW_LIMIT),
      );
      await record("markdown_recommendation", async () =>
        sb
          .from("markdown_recommendation")
          .select("style_name, brand_id, category_id, recommended_depth, timing, margin_saved, remaining_life_weeks, current_cover_weeks")
          .order("margin_saved", { ascending: false })
          .limit(6),
      );
      break;

    case "exception":
      await record("v_recommendation_state", async () =>
        sb
          .from("v_recommendation_state")
          .select("id, brand_id, category_id, region_id, action, severity, value_at_stake_inr, rationale, status")
          .eq("rec_type", "EXCEPTION")
          .order("value_at_stake_inr", { ascending: false, nullsFirst: false })
          .limit(ROW_LIMIT),
      );
      await record("policy_parameter", async () =>
        sb
          .from("policy_parameter")
          .select("param_name, brand_id, computed_value, applied_value, basis")
          .like("param_name", "cover_ceiling%")
          .limit(6),
      );
      break;

    case "kpi":
      await record("value_summary", async () =>
        sb
          .from("value_summary")
          .select("brand_id, scope, markdown_avoided_margin_inr, lost_sales_recovered_margin_inr, total_margin_inr, unit_change_pct, holding_cost_change_inr, basis")
          .limit(6),
      );
      await record("v_adoption_kpi", async () =>
        sb.from("v_adoption_kpi").select("*").limit(ROW_LIMIT),
      );
      await record("v_touchless_rate", async () =>
        sb.from("v_touchless_rate").select("*").limit(2),
      );
      break;

    case "planner":
      await record("planner_adoption", async () =>
        sb
          .from("planner_adoption")
          .select("segment, readiness, apprehension, recommended_learning_hours, in_pilot_wave")
          .limit(ROW_LIMIT),
      );
      await record("dim_planner", async () =>
        sb
          .from("dim_planner")
          .select("employee_id, full_name, role, region_id, in_pilot_wave, learning_tier, structured_learning_hours_last_year")
          .limit(ROW_LIMIT),
      );
      break;

    case "model":
      await record("model_registry", async () =>
        sb
          .from("model_registry")
          .select("model_id, model_version, trained_at, metrics")
          .like("model_id", "%planning_grain%")
          .limit(2),
      );
      await record("policy_parameter", async () =>
        sb
          .from("policy_parameter")
          .select("param_name, brand_id, computed_value, applied_value, basis, override_reason")
          .in("param_name", ["interval_coverage_calibrated", "service_level", "allocation_band_pp"])
          .limit(8),
      );
      break;

    case "navigation":
      // Nothing to retrieve: the answer is a route, and the route whitelist is
      // not data. Deliberately empty so the caller takes the no-data path and
      // names a screen without spending a model call.
      break;
  }

  const empty = !nonEmpty(data);
  return {
    intent,
    sources,
    data,
    empty,
    suggestedRoute: routeForIntent(intent),
  };
}

/**
 * Stable hash of the retrieved context, for the cache tier.
 *
 * Keyed on the CONTENT, so a cache hit can only ever replay an answer built
 * from rows identical to the ones this caller just read. Two planners with
 * different scopes produce different hashes and therefore never share an
 * answer. FNV-1a: not cryptographic, and does not need to be -- this is a
 * cache key, not a security token, and the scoping is done by RLS upstream.
 */
export function contextHash(question: string, context: RetrievedContext): string {
  const payload = JSON.stringify({
    q: question.trim().toLowerCase(),
    i: context.intent,
    d: context.data,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0") + ":" + payload.length.toString(16);
}
