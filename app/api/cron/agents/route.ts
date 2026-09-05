import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@/lib/supabase-server";

/**
 * THE NIGHTLY AGENT PASS.
 *
 * Runs at 00:00 IST. No interface anywhere in the app mentions it, by design:
 * it is infrastructure, and a planner arriving in the morning should find the
 * queue already worked rather than a banner telling them a job ran.
 *
 * WHAT IT ACTUALLY DOES, AND WHAT IT DOES NOT.
 *
 * It does NOT re-read a spreadsheet. The workbooks were loaded once and no
 * spreadsheet is watched; nothing here invents new demand, refits a model or
 * moves a timestamp to make the data look fresher than it is. Manufacturing
 * freshness would be the easy version of this and it would be a lie told to
 * every screen at once.
 *
 * What it does is the thing a real overnight run does: THE AGENTS WORK THE
 * OPEN QUEUE. For each enabled autonomy band, every undecided recommendation
 * in that band's brand is measured against the band's own threshold --
 *
 *   exception_agent    value_at_stake_inr <= max_value_inr
 *   allocation_agent   |payload.share_shift_pp| <= max_shift_pp
 *
 * -- and the ones inside are decided by the agent, in the open, as ledger
 * rows. The ones outside are escalated, which in this system means left for a
 * human and counted. Both counts are written to agent_run, which is what the
 * dashboard's touchless rate and the governance activity lines already read.
 *
 * forecast_agent and learning_agent record a run and write no decision. That
 * is not a stub: their own bands say so. The learning agent "reads the
 * ledger; never writes a recommendation decision", and the forecast agent
 * scores series rather than deciding recommendations.
 *
 * FIVE THINGS THAT KEEP THIS SAFE TO LEAVE ARMED.
 *
 *   1. AUTHORISED. Vercel sends Authorization: Bearer $CRON_SECRET. Without a
 *      matching secret the route answers 401 and does nothing. An unprotected
 *      endpoint that writes to the decision ledger would be an open door.
 *   2. KILL SWITCH RESPECTED. If agent_kill_switch is engaged the pass stops
 *      before writing anything and says so in the response. A kill switch
 *      that the overnight job ignores is not a kill switch.
 *   3. IDEMPOTENT. A recommendation that already carries any decision is
 *      skipped, so a retry, a double-fire, or a manual run cannot produce a
 *      second decision on the same row. The ledger is append-only and cannot
 *      be tidied afterwards, which makes not writing twice the only defence.
 *   4. HUMAN DECISIONS ARE NEVER OVERRIDDEN. The skip above does not
 *      distinguish actor type on purpose: if a planner decided it, the agent
 *      does not get a later word.
 *   5. ACCOUNTABLE TO A PERSON. Every agent row names the band owner as
 *      accountable_planner, because check_agent_accountability() rejects any
 *      agent decision that does not. Accountability does not transfer to
 *      software, and the database enforces that rather than trusting this
 *      file to remember it.
 *
 * ?dry=1 reports exactly what it would do and writes nothing.
 */

/** Node, not Edge: this uses the service-role client. */
export const runtime = "nodejs";
/** Never cached. A cron that returns a cached answer has not run. */
export const dynamic = "force-dynamic";

type BandRow = {
  agent_name: string;
  brand_id: string | null;
  enabled: boolean | null;
  max_value_inr: number | null;
  max_shift_pp: number | null;
  owner_employee_id: string | null;
};

type AgentSummary = {
  agent: string;
  brand: string;
  examined: number;
  acted: number;
  escalated: number;
  skipped_already_decided: number;
};

/** Which recommendation type each agent is responsible for examining. */
const REC_TYPE_FOR: Readonly<Record<string, string>> = {
  exception_agent: "EXCEPTION",
  allocation_agent: "ALLOCATION",
};

/**
 * Agents permitted to WRITE a decision in this pass.
 *
 * allocation_agent examines and escalates but does not write, and that is a
 * deliberate refusal rather than an oversight.
 *
 * Its band says it executes regional share shifts under 1.25pp (SPD). Applied
 * to recommendation.payload.share_shift_pp that rule matches 89 of the 108
 * SPD allocation rows, and would put 174 agent decisions across both brands
 * into the ledger on the first night. But the seeded allocation run examined
 * SIXTEEN shifts and acted on four -- so "a shift this brand proposes" is a
 * coarser grain than one allocation recommendation, and the two cannot both
 * be right. The offline pipeline knows which; this file does not.
 *
 * Writing 174 decisions on a guess would be irreversible: planner_decision is
 * append-only and a trigger blocks DELETE, so a wrong rule cannot be tidied
 * away afterwards. The counts are still recorded, so the run is honest about
 * what it saw; it simply does not act on a rule it cannot justify.
 */
const MAY_WRITE: readonly string[] = ["exception_agent"];

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured is a misconfiguration, not an invitation. Refuse.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry") === "1";
  const sb = await createServerClient();

  // The kill switch is checked FIRST and before any read that could be
  // mistaken for work. Engaged means the pass does not happen at all.
  const { data: killRows } = await sb
    .from("agent_kill_switch")
    .select("engaged, reason")
    .limit(1);
  const kill = killRows?.[0];
  if (kill?.engaged) {
    return NextResponse.json({
      ran: false,
      reason: "kill switch engaged",
      detail: kill.reason ?? null,
    });
  }

  const [{ data: bands }, { data: decided }] = await Promise.all([
    sb
      .from("autonomy_band")
      .select("agent_name, brand_id, enabled, max_value_inr, max_shift_pp, owner_employee_id"),
    sb.from("planner_decision").select("recommendation_id"),
  ]);

  // Every recommendation that already carries a decision, of any actor type.
  const alreadyDecided = new Set((decided ?? []).map((row) => row.recommendation_id));

  const summaries: AgentSummary[] = [];
  const runRows: Record<string, unknown>[] = [];
  const decisionRows: Record<string, unknown>[] = [];

  for (const band of (bands ?? []) as BandRow[]) {
    if (band.enabled === false || !band.brand_id) continue;

    const recType = REC_TYPE_FOR[band.agent_name];
    const summary: AgentSummary = {
      agent: band.agent_name,
      brand: band.brand_id,
      examined: 0,
      acted: 0,
      escalated: 0,
      skipped_already_decided: 0,
    };

    if (recType) {
      // The band owner is who the agent's actions are accountable TO. Without
      // a name the trigger will refuse every insert, so the band is skipped
      // rather than allowed to fail row by row.
      const { data: owner } = await sb
        .from("dim_planner")
        .select("full_name")
        .eq("employee_id", band.owner_employee_id ?? "")
        .limit(1);
      const ownerName = owner?.[0]?.full_name ?? null;

      const { data: open } = await sb
        .from("recommendation")
        .select("id, value_at_stake_inr, payload, model_version")
        .eq("brand_id", band.brand_id)
        .eq("rec_type", recType as never);

      for (const rec of open ?? []) {
        summary.examined += 1;
        if (alreadyDecided.has(rec.id)) {
          summary.skipped_already_decided += 1;
          continue;
        }

        const insideBand =
          band.agent_name === "exception_agent"
            ? band.max_value_inr !== null &&
              Number(rec.value_at_stake_inr ?? 0) <= Number(band.max_value_inr)
            : band.max_shift_pp !== null &&
              Math.abs(
                Number(
                  (rec.payload as { share_shift_pp?: number } | null)
                    ?.share_shift_pp ?? Number.POSITIVE_INFINITY,
                ),
              ) <= Number(band.max_shift_pp);

        if (!insideBand) {
          // Escalated means left for a human. No row is written: an
          // escalation is the ABSENCE of an agent decision, and inventing a
          // row for it would put a decision in the ledger nobody made.
          summary.escalated += 1;
          continue;
        }

        if (!ownerName || !MAY_WRITE.includes(band.agent_name)) {
          // Inside the band, but this agent does not write in this pass. It
          // counts as escalated because that is what it becomes: work left
          // for a human.
          summary.escalated += 1;
          continue;
        }

        summary.acted += 1;
        decisionRows.push({
          recommendation_id: rec.id,
          planner_id: band.owner_employee_id,
          status: "APPROVED",
          recommended_value: rec.value_at_stake_inr,
          accepted_value: null,
          override_reason: null,
          accountable_planner: ownerName,
          actor_type: "agent",
          actor_id: band.agent_name,
          model_version: rec.model_version,
        });
      }
    }

    summaries.push(summary);
    runRows.push({
      agent_name: band.agent_name,
      brand_id: band.brand_id,
      items_examined: summary.examined,
      items_acted: summary.acted,
      items_escalated: summary.escalated,
    });
  }

  if (dryRun) {
    return NextResponse.json({ ran: false, dryRun: true, summaries });
  }

  // Decisions first, runs second. If the insert fails the run row is not
  // written either, so agent_run never claims work that did not land.
  let written = 0;
  if (decisionRows.length > 0) {
    const { error } = await sb.from("planner_decision").insert(decisionRows as never);
    if (error) {
      return NextResponse.json(
        { ran: false, error: error.message, attempted: decisionRows.length },
        { status: 500 },
      );
    }
    written = decisionRows.length;
  }

  const { error: runError } = await sb.from("agent_run").insert(runRows as never);

  return NextResponse.json({
    ran: true,
    decisionsWritten: written,
    runRowsWritten: runError ? 0 : runRows.length,
    runError: runError?.message ?? null,
    summaries,
  });
}
