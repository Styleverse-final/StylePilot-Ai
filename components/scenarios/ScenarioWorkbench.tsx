"use client";

import { useMemo, useState, useTransition } from "react";

import { Button, ButtonRow } from "@/components/Button";
import { Card, CardBody, CardHeader } from "@/components/Card";
import { RoleGate } from "@/components/RoleGate";

import { CategoryBreakdown } from "./CategoryBreakdown";
import { ComparisonTable, type ComparisonRow } from "./ComparisonTable";
import { Levers } from "./Levers";
import { UnitConsequence } from "./UnitConsequence";
import { saveScenario } from "./actions";
import { formatFractionPct, formatSignedFractionPct } from "./format";
import {
  BASE_LEVERS,
  compare,
  isBaseLevers,
  runScenario,
  type CategoryBase,
  type LeverState,
  type PlanEconomics,
} from "./model";
import type { ScenarioScope } from "./note";

/**
 * The interactive half of the scenario screen.
 *
 * WHY THE ARITHMETIC RUNS HERE AND NOT ON THE SERVER
 * --------------------------------------------------
 * Because there is nothing to fetch. The server has already read the stored
 * forecast under the caller's RLS and summed it into a handful of category
 * rows; moving a slider does not need another row, only a multiplication.
 * Running it in the browser is what makes the levers feel like levers, and
 * it costs nothing in trust: the numbers being multiplied came from the
 * server, the function doing the multiplying is the same module the server
 * action uses when it writes the ledger entry, and no result computed here
 * is ever taken at face value by a write path. Saving re-derives every
 * figure server-side from the database.
 *
 * There is no model call on either side. The batch score is already in
 * `forecast`; this screen reads it.
 */

export type SavedScenarioView = {
  key: string;
  name: string;
  levers: LeverState;
  /** The selection it was filed against, in words. */
  scopeLabel: string;
  /** False when that selection is not the one currently on screen. */
  scopeMatchesSelection: boolean;
  accountablePlanner: string;
  decidedAtLabel: string;
  recommendationId: number;
  /**
   * The override_reason sentence exactly as it sits in the ledger.
   *
   * data.ts calls this "the whole sentence, so a reader can check the parsed
   * levers against it", and that check is only possible if the sentence is on
   * the screen. It is rendered below the comparison table.
   */
  note: string;
};

export type ScenarioWorkbenchProps = {
  bases: readonly CategoryBase[];
  economics: PlanEconomics;
  saved: readonly SavedScenarioView[];
  scope: ScenarioScope;
  scopeLabel: string;
  /** app_role from the session. Drives the RoleGate on Save. */
  role: string | null;
  /** Which recommendation a save would be filed against, in words. */
  anchorNote: string | null;
  /** Set when nothing can be saved, and says exactly why. */
  saveBlockedReason: string | null;
  clearanceSentence: string | null;
  coverageMeasured: number | null;
  /** Null when no registry row is readable; the count is then not stated. */
  coverageFolds: number | null;
  accuracyFolds: number | null;
  /** What the registry says about marketing features. Checked, not asserted. */
  marketing: {
    checked: boolean;
    featureCount: number;
    marketingFeatures: readonly string[];
    modelVersion: string | null;
  };
  /** Left column: the scope selectors, rendered by the page. */
  filters: React.ReactNode;
};

const WRITING_ROLES = [
  "planner",
  "category_manager",
  "planning_manager",
  "coe_admin",
] as const;

/** The levers in one line, for a table row and for the ledger preview. */
function summariseLevers(levers: LeverState): string {
  if (isBaseLevers(levers)) {
    return "Every lever at the plan's own setting -- this is the forecast as stored.";
  }
  const parts: string[] = [];
  if (levers.priceChange !== 0) {
    parts.push(`price ${formatSignedFractionPct(levers.priceChange)}`);
  }
  if (levers.promoDepth !== 0) {
    parts.push(`promotion depth ${formatFractionPct(levers.promoDepth)}`);
  }
  if (levers.marketingIndex !== 1) {
    parts.push(`marketing index ${levers.marketingIndex.toFixed(2)}`);
  }
  if (levers.capacityShare !== null) {
    parts.push(`capacity cap ${formatFractionPct(levers.capacityShare, 0)}`);
  }
  return parts.join(", ");
}

export function ScenarioWorkbench({
  bases,
  economics,
  saved,
  scope,
  scopeLabel,
  role,
  anchorNote,
  saveBlockedReason,
  clearanceSentence,
  coverageMeasured,
  coverageFolds,
  accuracyFolds,
  marketing,
  filters,
}: ScenarioWorkbenchProps) {
  const [levers, setLevers] = useState<LeverState>(BASE_LEVERS);
  const [name, setName] = useState<string>("");
  const [outcome, setOutcome] = useState<
    { ok: boolean; message: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const baseRun = useMemo(
    () => runScenario(bases, economics, BASE_LEVERS, 0),
    [bases, economics],
  );

  const liveRun = useMemo(
    () => runScenario(bases, economics, levers, baseRun.planUnits),
    [bases, economics, levers, baseRun.planUnits],
  );

  const liveComparison = useMemo(
    () => compare(baseRun, liveRun, economics),
    [baseRun, liveRun, economics],
  );

  const rows = useMemo<ComparisonRow[]>(() => {
    const atBase = isBaseLevers(levers);

    const out: ComparisonRow[] = [
      {
        key: "base",
        name: "Base plan",
        detail: summariseLevers(BASE_LEVERS),
        kind: "base",
        result: baseRun,
        comparison: null,
        scopeNote: null,
      },
      {
        key: "live",
        name: name.trim().length > 0 ? name.trim() : "Working scenario",
        detail: atBase
          ? "Unchanged from the base plan. Move a lever to make this row mean something."
          : summariseLevers(levers),
        kind: "live",
        result: liveRun,
        comparison: liveComparison,
        scopeNote: null,
      },
    ];

    for (const entry of saved) {
      const result = runScenario(bases, economics, entry.levers, baseRun.planUnits);
      out.push({
        key: entry.key,
        name: entry.name,
        detail: `${summariseLevers(entry.levers)} -- filed by ${entry.accountablePlanner} on ${entry.decidedAtLabel}, against recommendation #${entry.recommendationId}`,
        kind: "saved",
        result,
        comparison: compare(baseRun, result, economics),
        scopeNote: entry.scopeMatchesSelection
          ? null
          : `Saved against ${entry.scopeLabel}; re-run here on ${scopeLabel}, so these figures are not the ones that were on screen when it was filed.`,
      });
    }
    return out;
  }, [
    bases,
    economics,
    baseRun,
    liveRun,
    liveComparison,
    levers,
    name,
    saved,
    scopeLabel,
  ]);

  const atBase = isBaseLevers(levers);
  const canWrite = (WRITING_ROLES as readonly string[]).includes(role ?? "");

  const coefficients = useMemo(
    () =>
      new Map(bases.map((base) => [base.categoryId, base.fit?.coefficient ?? null])),
    [bases],
  );

  function onSave(): void {
    setOutcome(null);
    const payload = { name: name.trim(), levers, scope };
    startTransition(async () => {
      const result = await saveScenario(payload);
      setOutcome(
        result.ok
          ? { ok: true, message: result.message }
          : { ok: false, message: result.error },
      );
      if (result.ok) setName("");
    });
  }

  const saveDisabled =
    pending || atBase || name.trim().length === 0 || saveBlockedReason !== null;

  return (
    <div className="grid grid-cols-[300px_1fr] items-start gap-[16px] max-[1140px]:grid-cols-1">
      {/* ------------------------------------------------------- levers */}
      <div className="flex flex-col gap-[16px]">
        <Card>
          <CardHeader
            title="Selection"
            subtitle="Only combinations your session can read"
          />
          <CardBody>{filters}</CardBody>
        </Card>

        <Card>
          <CardHeader title="Levers" subtitle="Applied to the stored forecast" />
          <CardBody>
            <Levers
              levers={levers}
              onChange={setLevers}
              baseUnits={baseRun.planUnits}
              bases={bases}
              horizonWeeks={economics.horizonWeeks}
              marketing={marketing}
            />
            <ButtonRow className="mt-[14px]">
              <Button
                size="sm"
                disabled={atBase}
                onClick={() => setLevers(BASE_LEVERS)}
              >
                Reset to base plan
              </Button>
            </ButtonRow>
          </CardBody>
        </Card>
      </div>

      {/* --------------------------------------------------- comparison */}
      <div className="flex flex-col gap-[16px]">
        <Card>
          <CardHeader
            title="What this scenario costs in inventory"
            subtitle="The consequence the case actually constrains"
          />
          <CardBody>
            <UnitConsequence
              baseUnits={baseRun.planUnits}
              scenarioUnits={liveRun.planUnits}
              comparison={liveComparison}
              economics={economics}
              atBase={atBase}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Base against saved scenarios"
            subtitle={`${scopeLabel} -- saved scenarios enter the same ledger as committed decisions`}
            actions={
              <div className="flex items-center gap-[8px]">
                <input
                  type="text"
                  value={name}
                  maxLength={60}
                  placeholder="Name this scenario"
                  aria-label="Scenario name"
                  onChange={(event) => setName(event.target.value)}
                  className="h-[32px] w-[190px] rounded-full bg-cream px-[13px] text-[11.5px] font-semibold text-ink outline-none placeholder:text-mute"
                />
                <RoleGate
                  role={role}
                  allow={["planner", "category_manager", "planning_manager", "coe_admin"]}
                  action="file a scenario in the decision ledger"
                >
                  <Button
                    variant="orange"
                    size="sm"
                    disabled={saveDisabled}
                    onClick={onSave}
                  >
                    {pending ? "Saving" : "Save scenario"}
                  </Button>
                </RoleGate>
              </div>
            }
          />

          {outcome === null ? null : (
            <div
              role="status"
              className={`border-b border-rule px-[20px] py-[13px] ${
                outcome.ok ? "bg-greenW" : "bg-redW"
              }`}
            >
              <p
                className={`max-w-[96ch] text-copy font-semibold leading-[1.6] ${
                  outcome.ok ? "text-green" : "text-red"
                }`}
              >
                {outcome.message}
              </p>
            </div>
          )}

          <ComparisonTable
            rows={rows}
            economics={economics}
            clearanceSentence={clearanceSentence}
            coverageMeasured={coverageMeasured}
            coverageFolds={coverageFolds}
            accuracyFolds={accuracyFolds}
          />

          <div className="border-t border-rule px-[20px] py-[16px]">
            <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
              {saveBlockedReason !== null ? (
                <>
                  <b className="text-ink">Saving is unavailable here.</b>{" "}
                  {saveBlockedReason}
                </>
              ) : !canWrite ? (
                <>
                  <b className="text-ink">
                    You can run scenarios but not file them.
                  </b>{" "}
                  The ledger accepts entries from a planner, a category manager,
                  a planning manager or a CoE administrator, and the rule lives
                  in the database rather than in this button.
                </>
              ) : (
                <>
                  <b className="text-ink">Saving writes a real ledger row.</b>{" "}
                  It is a planner_decision with status SCENARIO, in your name,
                  append-only like every other decision.{" "}
                  {anchorNote ?? ""} The row stores the four lever values and the
                  unit consequence as a sentence, not the outcome: the outcome
                  depends on a forecast that will be re-scored, so it is
                  re-derived here every time rather than frozen into the audit
                  trail. Scenarios are excluded from the recommendation state
                  view and from the adoption figures, so exploring can never
                  inflate an approval rate.
                </>
              )}
            </p>
            {saved.length === 0 ? null : (
              <details className="mt-[11px]">
                <summary className="cursor-pointer text-[11.5px] font-bold text-mute">
                  The ledger sentence behind each saved scenario
                </summary>
                <div className="mt-[8px] flex flex-col gap-[8px]">
                  {saved.map((entry) => (
                    <div
                      key={`${entry.key}-note`}
                      className="rounded-quote bg-shell px-[12px] py-[9px]"
                    >
                      <div className="text-[10.5px] font-bold text-mute">
                        {entry.name} -- filed against recommendation #
                        {entry.recommendationId} by {entry.accountablePlanner} on{" "}
                        {entry.decidedAtLabel}
                      </div>
                      <p className="mt-[4px] max-w-[96ch] text-[11px] leading-[1.6] text-body">
                        {entry.note}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-[8px] max-w-[96ch] text-[11px] font-semibold leading-[1.6] text-mute">
                  The levers re-run in the table above were parsed out of the
                  bracket at the end of each sentence. The words before it
                  restate the same four values, so the two halves can be checked
                  against each other by eye -- which is the whole reason the
                  sentence is stored in words rather than as a blob.
                </p>
              </details>
            )}
            {atBase && saveBlockedReason === null && canWrite ? (
              <p className="mt-[7px] max-w-[96ch] text-[11.5px] font-semibold leading-[1.6] text-mute">
                Nothing to save yet -- the levers are all at the plan&apos;s own
                setting, and a scenario identical to the base plan would add a
                row to the ledger that says nothing.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Where the change comes from"
            subtitle="The working scenario, category by category"
          />
          <CategoryBreakdown
            base={baseRun}
            scenario={liveRun}
            economics={economics}
            coefficients={coefficients}
          />
          <div className="border-t border-rule px-[20px] py-[16px]">
            <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
              The demand response is the category&apos;s own coefficient applied
              to the realised price the levers set, so an elastic category moves
              further on the same slider. That is also where the units go: a
              plan that grows because one elastic category doubled is a
              different commercial argument from one that grew evenly, and the
              holding cost lands in a different warehouse.
              {/* Same rule as the comparison table's dagger: a pooled fit that
                  moved nothing is inert, and saying it carries a share of the
                  answer would claim an influence it did not have. */}
              {liveRun.pooledCoefficientApplied ? (
                <>
                  {" "}
                  <b className="text-amber">
                    The rows marked &ldquo;pooled coefficient&rdquo; borrow the
                    brand-wide curve rather than their own fit
                  </b>
                  , and they carry{" "}
                  {(liveRun.pooledUnitShare * 100).toFixed(1)}% of the plan
                  units in this selection -- so that share of the answer above
                  rests on a borrowed price response, said here rather than
                  applied quietly.
                </>
              ) : null}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default ScenarioWorkbench;
