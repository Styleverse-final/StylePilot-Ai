import Link from "next/link";

import { Card, CardBody, CardHeader, Pill } from "@/components";

/**
 * The planning cycle, stage by stage.
 *
 * Case deliverable 1a asks which steps of the current cycle this system
 * removes, shortens or replaces, and 1b asks which tasks end up automated,
 * which augmented, and which stay human. Nothing else in the build answers
 * either question, because every other screen looks at the work rather than
 * at the process around it.
 *
 * TWO RULES GOVERN THIS PANEL, AND THEY PULL IN OPPOSITE DIRECTIONS.
 *
 * 1. NO "AFTER" DURATION. Not one. The obvious thing to put in the last
 *    column is "11 weeks becomes 4", and it would be the only number in this
 *    application with nothing behind it. The pilot has not run a full cycle,
 *    so cycle-time reduction has not been observed, and a projection rendered
 *    beside four measured columns reads as measured. Each row says what
 *    changed at that stage. None says how many weeks it saved.
 *
 * 2. THE CLASSIFICATION IS DERIVED, NOT ASSERTED. AUTOMATED / AUGMENTED /
 *    HUMAN-LED comes from what the agents actually have scope over, read from
 *    autonomy_band at request time:
 *
 *      an enabled agent with a numeric band over the stage's decisions  -> AUTOMATED
 *      model output that a human commits                                -> AUGMENTED
 *      no model output at all                                           -> HUMAN-LED
 *
 *    Buy quantity comes out AUGMENTED because NO agent holds a band over
 *    BUY_QUANTITY -- not because that reads better. That exclusion is a
 *    governance decision leadership asked for, and it is the most important
 *    thing this panel says.
 *
 * The baseline durations and manual-work shares are the case's own Exhibit 1.
 * They are authored, they are labelled as authored beneath the table, and they
 * are the only figures here that do not come from a query.
 */

/**
 * Exhibit 1 of the Round 2 case. AUTHORED, not measured, not in any table.
 *
 * These are the current-state durations the case supplies. Nothing in this
 * schema records how long a planning stage takes -- there is no cycle table,
 * no stage dimension and no timing column anywhere -- so these could not be
 * derived even in principle from the pilot data.
 */
export const EXHIBIT_1 = [
  {
    id: "demand-review",
    stage: "Demand Review",
    weeks: 2,
    manualPct: 70,
    /** rec_types whose agent scope decides this stage's classification. */
    decides: [] as string[],
    /** True when the system publishes model output into this stage. */
    hasModelOutput: true,
    change:
      "Signal intelligence with a measured lead and a correlation per category, plus the driver panel on the workbench. The manual consolidation that takes 70% of this stage is replaced by a query; what remains is deciding whether a signal that cleared the r=0.30 bar should move the plan.",
    links: [
      { href: "/signals", label: "Signals" },
      { href: "/workbench", label: "Workbench" },
    ],
  },
  {
    id: "demand-forecasting",
    stage: "Demand Forecasting",
    weeks: 3,
    manualPct: 60,
    decides: [],
    hasModelOutput: true,
    change:
      "The ensemble forecast with its P10-P90 band, scored offline in batch. The three-week spreadsheet cycle becomes a scheduled job, and planner time moves from building the number to interrogating it -- which is what the drivers, the censored weeks and the benchmark line on the workbench are for.",
    links: [{ href: "/workbench", label: "Workbench" }],
  },
  {
    id: "assortment-planning",
    stage: "Assortment Planning",
    weeks: 2,
    manualPct: 45,
    decides: ["BUY_QUANTITY"],
    hasModelOutput: true,
    change:
      "Cold-start analogues for styles with no history, and the scenario engine for testing a mix before committing to it. Augmented rather than replaced: the assortment call stays human, and the buy quantity underneath it is the one recommendation type no agent may touch.",
    links: [{ href: "/scenarios", label: "Scenarios" }],
  },
  {
    id: "inventory-allocation",
    stage: "Inventory Allocation",
    weeks: 2,
    manualPct: 55,
    decides: ["ALLOCATION"],
    hasModelOutput: true,
    change:
      "The optimiser runs against the incumbent proportional rule, and shifts below the derived band execute without a person. Everything above it routes to a planner, which at the pilot's 25th-percentile setting is three quarters of proposed shifts.",
    links: [{ href: "/allocation", label: "Allocation" }],
  },
  {
    id: "commercial-review",
    stage: "Commercial Review",
    weeks: 2,
    manualPct: 30,
    decides: ["EXCEPTION"],
    hasModelOutput: true,
    change:
      "Exception detection against derived thresholds, and an append-only decision trail underneath it. The review itself is not shortened -- it is the part worth keeping. What goes is the reconciliation beforehand: the meeting no longer opens by agreeing whose spreadsheet is right.",
    links: [
      { href: "/exceptions", label: "Exceptions" },
      { href: "/governance", label: "Governance" },
    ],
  },
] as const;

export type StageBand = {
  /** rec_type this agent holds a numeric band over, if any. */
  recType: string;
  agentName: string;
  enabled: boolean;
  /** The band as written, for the tooltip. */
  actsWithin: string;
};

export type CycleStagesProps = {
  /** Agent bands, read from autonomy_band under the caller's session. */
  bands: readonly StageBand[];
  /** Recommendation counts by rec_type, for the buy-exclusion sentence. */
  countsByType: Readonly<Record<string, number>>;
  className?: string;
};

type Classification = "AUTOMATED" | "AUGMENTED" | "HUMAN-LED";

const TONE: Record<Classification, "orange" | "violet" | "grey"> = {
  AUTOMATED: "orange",
  AUGMENTED: "violet",
  "HUMAN-LED": "grey",
};

/**
 * The derivation. Read it before trusting the pills.
 *
 * A stage is AUTOMATED only if an ENABLED agent holds a band over one of the
 * decision types that stage produces. markdown_agent is enabled but its band
 * is 0.0 / 0.0 -- recommend-only -- so it never makes a stage automated, which
 * is the correct reading of a band that permits nothing.
 */
function classify(
  decides: readonly string[],
  hasModelOutput: boolean,
  bands: readonly StageBand[],
): { verdict: Classification; because: string } {
  const acting = bands.filter(
    (band) => band.enabled && decides.includes(band.recType),
  );

  if (acting.length > 0) {
    return {
      verdict: "AUTOMATED",
      because: `${acting.map((b) => b.agentName).join(" and ")} holds a band over ${decides.join(", ")} and acts inside it without a person.`,
    };
  }
  if (decides.length > 0) {
    return {
      verdict: "AUGMENTED",
      because: `No enabled agent holds a band over ${decides.join(", ")}, so every one is committed by a planner.`,
    };
  }
  if (hasModelOutput) {
    return {
      verdict: "AUGMENTED",
      because:
        "The system publishes model output into this stage but commits no decision in it.",
    };
  }
  return {
    verdict: "HUMAN-LED",
    because: "No model output reaches this stage.",
  };
}

export function CycleStages({ bands, countsByType, className }: CycleStagesProps) {
  const rows = EXHIBIT_1.map((stage) => ({
    ...stage,
    ...classify(stage.decides, stage.hasModelOutput, bands),
  }));

  const totalWeeks = EXHIBIT_1.reduce((sum, stage) => sum + stage.weeks, 0);
  const buyCount = countsByType.BUY_QUANTITY ?? 0;

  return (
    <Card className={className}>
      <CardHeader
        title="The planning cycle, stage by stage"
        subtitle={`What this system removes, shortens or replaces across the ${totalWeeks}-week cycle, and which stages end up automated`}
      />
      <CardBody>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-copy">
            <thead>
              <tr className="border-b border-rule text-label font-extrabold text-mute">
                <th className="py-[8px] pr-[12px] text-left">Stage</th>
                <th className="py-[8px] pr-[12px] text-right whitespace-nowrap">
                  Baseline
                </th>
                <th className="py-[8px] pr-[12px] text-right whitespace-nowrap">
                  Manual work
                </th>
                <th className="py-[8px] pr-[12px] text-left">What changes</th>
                <th className="py-[8px] text-left whitespace-nowrap">
                  1b classification
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-rule align-top last:border-b-0"
                >
                  <td className="py-[13px] pr-[12px] font-extrabold text-ink whitespace-nowrap">
                    {row.stage}
                  </td>
                  <td className="py-[13px] pr-[12px] text-right tabular whitespace-nowrap">
                    {row.weeks} wks
                  </td>
                  <td className="py-[13px] pr-[12px] text-right tabular whitespace-nowrap">
                    {row.manualPct}%
                  </td>
                  <td className="py-[13px] pr-[12px] leading-[1.6] text-body">
                    {row.change}
                    <div className="mt-[6px] flex flex-wrap gap-[6px]">
                      {row.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="rounded-pill bg-cream px-[9px] py-[3px] text-label font-bold text-ink transition-colors duration-[120ms] hover:bg-peach"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </td>
                  <td className="py-[13px] whitespace-nowrap">
                    <Pill variant={TONE[row.verdict]}>{row.verdict}</Pill>
                    <div className="mt-[5px] max-w-[34ch] text-small font-semibold leading-[1.5] text-mute whitespace-normal">
                      {row.because}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/*
          The instruction this panel exists to obey. Rendered, not just
          commented, because the reader is the one who needs it.
        */}
        <p className="mt-[14px] max-w-[100ch] text-copy leading-[1.6] text-body">
          <b className="text-ink">
            Baseline durations are the case&apos;s own Exhibit 1.
          </b>{" "}
          Cycle-time reduction is a projected pilot outcome, not a measurement
          {" — "}the pilot has not run long enough to observe it.
        </p>
        <p className="mt-[8px] max-w-[100ch] text-copy leading-[1.6] text-mute">
          So there is no &quot;after&quot; column here, and its absence is the
          point. Every other figure in this application carries a derivation,
          and an eleven-weeks-becomes-four printed beside four measured columns
          would be read as measured. What each row states is what changed at
          that stage; how much time that saves is a question the pilot has not
          answered yet. The same rule governs the trust curve on Adoption,
          where waves one and two are measured and wave three is drawn as a
          projection.
        </p>
        <p className="mt-[8px] max-w-[100ch] text-copy leading-[1.6] text-mute">
          The classification is read from autonomy_band at request time rather
          than written here: a stage counts as automated only where an enabled
          agent holds a band over the decisions that stage produces.{" "}
          {buyCount > 0 ? (
            <>
              That is why Assortment Planning reads AUGMENTED. All {buyCount}{" "}
              buy recommendations in your scope sit outside every agent band,
              because leadership requires a planner to own each committed buy.
              The exclusion is deliberate and it is the reason the touchless
              rate is quoted against agent-scoped work rather than against
              everything.
            </>
          ) : (
            <>
              No buy recommendations are readable in your scope, so the
              buy-exclusion figure is not shown here.
            </>
          )}
        </p>
      </CardBody>
    </Card>
  );
}

export default CycleStages;
