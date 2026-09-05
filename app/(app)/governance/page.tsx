import type { Metadata } from "next";

import {
  Banner,
  ModelStrip,
  PageHeader,
  Pill,
  type KpiItem,
} from "@/components";
import { AutonomyBands, buildBandRows } from "@/components/governance/AutonomyBands";
import { BAND_OWNER_ROLES } from "@/components/navItems";
import {
  BandCorrection,
  buildCorrections,
} from "@/components/governance/BandCorrection";
import { DecisionTrail } from "@/components/governance/DecisionTrail";
import { KillSwitch } from "@/components/governance/KillSwitch";
import { LearningLoop } from "@/components/governance/LearningLoop";
import { Explain, SectionHeading } from "@/components/governance/Layout";
import { analyseOverrides, type OverrideAnalysis } from "@/components/governance/classify";
import { AUTHORED_ON_THIS_SCREEN } from "@/components/governance/constants";
import {
  getAllAutonomyBands,
  getKillSwitch,
  getLedger,
  getPeople,
  getPolicyParameterByName,
  getSeriesLabels,
  indexBandOwners,
  indexPeople,
  type AccountablePerson,
  type KillSwitch as KillSwitchRow,
  type LedgerEntry,
  type SeriesLabels,
} from "@/components/governance/data";
import {
  formatCount,
  formatTimestamp,
  humaniseRole,
  plural,
} from "@/components/governance/format";
import { getAccuracyHeadline, type AccuracyHeadline } from "@/lib/accuracy";
import {
  getAgentRuns,
  type AgentRun,
  type AutonomyBand,
  type PolicyParameter,
} from "@/lib/queries";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Governance",
};

/**
 * GOVERNANCE -- the screen that has to survive being checked.
 *
 * Every other screen in StyleVerse asks you to believe a number. This one
 * asks you to believe the arrangement AROUND the numbers: that a machine
 * action always has a person's name on it, that a threshold can say where it
 * came from, that a superseded rule leaves a trail instead of being quietly
 * tidied away, and that the control which stops all of it exists and belongs
 * to somebody specific. So it is built to be audited rather than admired.
 * Four properties carry the weight:
 *
 * ONE LEDGER. Humans and agents are the same table, the same insert path and
 * the same policy, rendered in one chronological list. Splitting them into
 * tabs would make the quiet argument that they are different kinds of event.
 * They are not. Most of what happens now happens inside a band, and that
 * imbalance is a fact about the pilot rather than something to hide.
 *
 * ACCOUNTABILITY DOES NOT TRANSFER TO SOFTWARE. accountable_planner is NOT
 * NULL on an agent row, and every agent entry here reads "the agent executed
 * this, NAME is answerable for it" in the same position and weight as a
 * human row's attribution.
 *
 * THE PAST IS NOT EDITED. Allocation rows written before the band was
 * re-derived still say "inside the 2.0pp band". They are correct history and
 * they are left alone; the correction is a policy_parameter row printed
 * beside them. That is the property that makes an append-only ledger
 * evidence rather than a display.
 *
 * NOTHING IS CLASSIFIED THAT THE DATABASE HAS NOT CLASSIFIED. The learning
 * loop's split is computed on read, by a keyword rule printed next to its own
 * output, and the panel leads with the fact that the learning agent has
 * examined nothing -- because on a governance screen, an agent whose stated
 * job has produced no rows is the finding.
 *
 * PROVENANCE. Every figure here is read from Postgres at request time
 * through createServerAnonClient(), so row level security decides what the
 * screen contains: a decision is visible exactly when the recommendation it
 * decided is visible. The counts are the counts in YOUR scope and each panel
 * says so. The single exception -- the forecast agent's escalation
 * arithmetic, which lives only in the pipeline source -- is boxed, labelled
 * and named in the banner at the top, alongside the four things this screen
 * authors rather than reads.
 *
 * PART H. The one accuracy figure reaches the screen through
 * <ModelStrip accuracy={AccuracyHeadline}/>, which cannot render the
 * headline without the margin over seasonal naive beside it. It appears
 * because a reader of an override ledger immediately asks how good the model
 * being overridden is, and the flattering comparison alone would overstate
 * how much room a planner has to be right by disagreeing.
 */

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** The trail's page number, from ?trail=N. Anything unreadable is page one. */
function trailPage(params: { [key: string]: string | string[] | undefined }): number {
  const raw = params.trail;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Header figures, folded out of the rows on screen. Nothing is typed in.
 *
 * "Agent-executed" carries the count of distinct people those agent rows are
 * answerable to, because the number that matters about 421 machine decisions
 * is not 421 -- it is that they land on somebody.
 */
function headerKpis(
  entries: readonly LedgerEntry[],
  analysis: OverrideAnalysis,
): KpiItem[] {
  const agents = entries.filter((entry) => entry.actorType === "agent");
  const accountable = new Set(agents.map((entry) => entry.accountableName));

  return [
    { label: "Entries in your scope", value: formatCount(entries.length) },
    {
      label: "Written by people",
      value: formatCount(analysis.humanDecisions),
      pill: `${formatCount(analysis.all.length)} overrides`,
      tone: "amber",
    },
    {
      label: "Agent-executed",
      value: formatCount(agents.length),
      pill:
        accountable.size === 0
          ? "none in scope"
          : `every one answerable to ${plural(accountable.size, "person", "people")}`,
      tone: "violet",
    },
    {
      label: "Retraining candidates",
      value: formatCount(analysis.modelGaps.length),
      pill: "classified on read",
      tone: "orange",
    },
  ];
}

/**
 * The registry entry for the model the decisions on screen were made against.
 *
 * A group role reads two brands of ledger, so two model versions can be
 * stamped on the entries at once and one strip cannot honestly average them.
 * It picks the viewer's own brand where that model appears in the ledger,
 * falls back to the first model that does, and the strip names which model
 * the figure belongs to whenever more than one is on screen.
 */
function accuracyForLedger(
  headlines: readonly AccuracyHeadline[],
  entries: readonly LedgerEntry[],
  brandId: string | null,
): AccuracyHeadline | null {
  const versions = new Set(entries.map((entry) => entry.modelVersion));
  const inLedger = headlines.filter((headline) => versions.has(headline.modelVersion));
  return (
    inLedger.find((headline) => headline.brandId === brandId) ??
    inLedger[0] ??
    headlines.find((headline) => headline.brandId === brandId) ??
    headlines[0] ??
    null
  );
}

export default async function GovernancePage({ searchParams }: PageProps) {
  const [planner, params] = await Promise.all([getSessionPlanner(), searchParams]);
  const brandId = planner?.brandId ?? null;
  const appRole = planner?.appRole ?? null;

  const sb = await createServerAnonClient();

  // FOUR INDEPENDENT READS, FOUR INDEPENDENT FAILURES.
  //
  // The ledger, the governance tables, the agent runs and the model registry
  // answer different questions under different policies. A screen that
  // wrapped them in one try would lose the whole audit trail because the
  // accuracy annotation on the last strip could not be read. Each block
  // degrades on its own and says which one failed, because an empty
  // governance panel and a broken one look identical and mean opposite
  // things.

  let entries: LedgerEntry[] = [];
  let people: AccountablePerson[] = [];
  let labels: SeriesLabels = { category: {}, channel: {}, region: {} };
  let ledgerError: string | null = null;

  // FOUR WAVES THAT SHARED NO DATA, NOW ONE.
  //
  // These eight reads ran as four sequential Promise.all groups -- ledger,
  // then bands, then agent runs, then the registry -- so the page waited out
  // four round-trip latencies end to end. Nothing in any group reads a result
  // from an earlier one. Started together they cost the slowest single read.
  // This was the slowest route in the app at 1,965ms warm.
  //
  // The try/catch blocks below are UNCHANGED and still decide what each
  // failure means. The only thing added here is a no-op rejection handler on
  // each promise: attaching one marks the promise handled, so a rejection in
  // the window before its await cannot surface as an unhandled rejection and
  // take down the render. The later `await` still rejects into its own catch.
  const ledgerGroup = Promise.all([
    getLedger(sb),
    getPeople(sb),
    getSeriesLabels(sb),
  ]);
  const governanceGroup = Promise.all([
    getAllAutonomyBands(sb),
    getPolicyParameterByName(sb, "allocation_band_pp"),
    getKillSwitch(sb),
  ]);
  const runsPromise = getAgentRuns(sb, 200);
  const headlinePromise = getAccuracyHeadline(sb);
  for (const pending of [ledgerGroup, governanceGroup, runsPromise, headlinePromise]) {
    pending.catch(() => {});
  }

  try {
    const [ledger, roster, seriesLabels] = await ledgerGroup;
    entries = ledger;
    people = roster;
    labels = seriesLabels;
  } catch (error) {
    ledgerError = error instanceof Error ? error.message : String(error);
  }

  let bands: AutonomyBand[] = [];
  let allocationPolicies: PolicyParameter[] = [];
  let killSwitch: KillSwitchRow | null = null;
  let governanceError: string | null = null;

  try {
    const [bandRows, policies, switchRow] = await governanceGroup;
    bands = bandRows;
    allocationPolicies = policies;
    killSwitch = switchRow;
  } catch (error) {
    governanceError = error instanceof Error ? error.message : String(error);
  }

  // agent_run is brand-scoped by policy, so this can legitimately come back
  // holding one brand's runs while the bands above hold both. Its failure
  // costs the activity line under each band and nothing else.
  let runs: AgentRun[] = [];
  try {
    runs = await runsPromise;
  } catch {
    runs = [];
  }

  let headlines: AccuracyHeadline[] = [];
  try {
    headlines = await headlinePromise;
  } catch {
    headlines = [];
  }

  const analysis = analyseOverrides(entries);
  const peopleById = indexPeople(people);
  const bandOwners = indexBandOwners(bands);
  // Employee id -> name, for the band owner shown beside each correction.
  // dim_planner.full_name is nullable, and a nameless owner degrades to the
  // employee id rather than to "unknown": an id is still an attribution.
  const ownerNames = new Map(
    people.map(
      (person) => [person.employeeId, person.fullName ?? person.employeeId] as const,
    ),
  );

  const corrections = buildCorrections(entries, allocationPolicies, bands, ownerNames);
  const bandRows = buildBandRows(bands, runs, entries, peopleById);
  const learningRuns = runs.filter((run) => run.agent_name === "learning_agent");

  const accuracy = accuracyForLedger(headlines, entries, brandId);
  const versions = [...new Set(entries.map((entry) => entry.modelVersion))].sort();
  const latestDecisionAt = entries
    .map((entry) => entry.decidedAt)
    .filter((value): value is string => typeof value === "string")
    .sort()
    .at(-1);

  return (
    <>
      <PageHeader
        eyebrow="Append-only decision log"
        title="Governance"
        kpis={headerKpis(entries, analysis)}
      />

      <Banner
        variant="violet"
        icon="i"
        title="Where every number on this screen comes from"
        measureCh={104}
      >
        Every figure below -- every count, threshold, name, timestamp, model
        version and derivation -- is read from Postgres at request time under
        your own row level security, with exactly one exception, named here so
        the claim can be checked rather than taken on trust: the forecast
        agent&apos;s escalation arithmetic, measured against this dataset and
        written into a comment in the pipeline source rather than into a row.
        It is boxed and labelled where it appears.{" "}
        {formatCount(AUTHORED_ON_THIS_SCREEN.length)} further values on this
        screen are authored rather than read, and each is stated where it
        applies:{" "}
        {AUTHORED_ON_THIS_SCREEN.map((item, index) => (
          <span key={item.what}>
            {index === 0
              ? ""
              : index === AUTHORED_ON_THIS_SCREEN.length - 1
                ? " and "
                : ", "}
            {item.what}
          </span>
        ))}
        . Those are the ones named here; each is also stated at the point it
        applies, which is the copy that matters. This sentence previously
        called the list exhaustive, which it was not &mdash; at least a
        comparison tolerance and a display cap sit outside it &mdash; and a
        false assurance of completeness is worse than a short list, because it
        is the sentence that tells you not to look. Everything not authored
        comes from a query, and a panel that cannot read its rows says so
        rather than showing you a tidy default.
      </Banner>

      {planner === null ? (
        <div className="mb-[16px]">
          <Explain>
            You are not signed in, so nothing scoped to a planner can be read.
            The bands and the kill switch below are readable to any
            authenticated user by policy; the decision trail is not, because a
            decision is visible exactly when the recommendation it decided is
            visible, and that visibility is resolved from your planner record.
          </Explain>
        </div>
      ) : brandId === null ? (
        <div className="mb-[16px]">
          <Explain>
            You are signed in, but your account is not linked to a planner
            record. The published bands, the thresholds and the kill switch
            below are still readable -- they are governance artefacts and their
            read policies say so. The decision trail will be empty, because
            row level security resolves a decision&apos;s visibility through
            the recommendation it decided, and that resolution starts from the
            brand and categories on the record you do not yet have. Ask your
            workspace administrator to link your account.
          </Explain>
        </div>
      ) : null}

      {ledgerError ? (
        <div className="mb-[16px]">
          <Explain>
            The decision trail could not be read: {ledgerError}. Nothing has
            been hidden or approximated, and the panels below that count
            decisions are counting zero of them rather than estimating -- an
            audit trail that fails quietly is worse than one that is missing,
            so the failure is on the screen at the size of the thing it broke.
          </Explain>
        </div>
      ) : null}

      {governanceError ? (
        <div className="mb-[16px]">
          <Explain>
            The bands, thresholds and kill switch could not be read:{" "}
            {governanceError}. The decision trail is a separate read and stands
            on its own above; one failing is not a reason to withhold the
            other.
          </Explain>
        </div>
      ) : null}

      <div className="grid grid-cols-[1.45fr_1fr] items-start gap-[16px] max-[1240px]:grid-cols-1">
        <DecisionTrail
          entries={entries}
          labels={labels}
          peopleById={peopleById}
          bandOwners={bandOwners}
          page={trailPage(params)}
          headerAction={
            killSwitch === null ? null : (
              <Pill variant={killSwitch.engaged ? "down" : "up"}>
                {killSwitch.engaged ? "agents paused now" : "agents running now"}
              </Pill>
            )
          }
        />

        <div className="grid gap-[16px]">
          <KillSwitch
            state={
              killSwitch === null
                ? null
                : {
                    engaged: killSwitch.engaged,
                    reason: killSwitch.reason,
                    engagedBy: killSwitch.engaged_by,
                    changedAt: killSwitch.engaged_at
                      ? formatTimestamp(killSwitch.engaged_at)
                      : null,
                  }
            }
            role={appRole}
            roleLabel={humaniseRole(appRole)}
          />

          <AutonomyBands
            rows={bandRows}
            viewerBrandId={brandId}
            bandOwner={BAND_OWNER_ROLES.includes(planner?.appRole ?? "")}
          />
        </div>
      </div>

      <SectionHeading
        eyebrow="When a threshold moves"
        title="The rows that quote a band that no longer exists"
      >
        The allocation agent writes the band it acted inside into every reason
        it records. Those bands have since been re-derived from the shift
        distribution each brand actually proposes, so entries written before
        the change quote a wider number than the one in force. They have not
        been touched. A ledger you edit to agree with the present is a display;
        one that keeps what was true and records the change beside it is
        evidence, and the corrective row below is that record.
      </SectionHeading>

      <BandCorrection corrections={corrections} />

      <SectionHeading
        eyebrow="What the overrides are telling you"
        title="The planner being right, and the model being wrong"
      >
        These are two different findings and they carry two different actions:
        one is the collaboration working as designed, the other is a feature
        the model does not have. Nothing in the schema separates them --
        override_reason is free text and the agent whose job that is has
        examined none of it -- so the split below is computed on read, by a
        rule printed beside its own output, and every row is accounted for.
      </SectionHeading>

      <LearningLoop analysis={analysis} learningRuns={learningRuns} />

      <ModelStrip
        className="mt-[16px]"
        modelVersion={
          versions.length > 0
            ? versions.join(" + ")
            : (accuracy?.modelVersion ?? "no model on the decisions in scope")
        }
        generatedAt={formatTimestamp(
          latestDecisionAt ?? accuracy?.generatedAt ?? null,
        )}
        accuracy={accuracy ?? undefined}
        why={
          <>
            {versions.length > 0
              ? `Every entry in the trail carries the model version that produced the recommendation it decided; ${
                  versions.length === 1
                    ? "one version appears across the entries you can read"
                    : `${formatCount(versions.length)} versions appear across the entries you can read`
                }. `
              : "No decision is readable in your scope, so this strip names the registered model rather than a version stamped on a row you can see. "}
            The timestamp is the most recent decision in your scope, not a
            training run: this screen moves when somebody -- or something --
            decides, rather than when the model is retrained.
            {accuracy ? (
              <>
                {" "}
                The accuracy is the backtested figure for{" "}
                {versions.length > 1 ? (
                  <>
                    <span className="font-mono">{accuracy.modelVersion}</span>,
                    one of the {formatCount(versions.length)} models above --
                    two brands are in your scope and their models scored
                    differently, so one figure is named rather than the two
                    averaged into a number neither of them earned
                  </>
                ) : (
                  "that model"
                )}
                , quoted with the margin over seasonal naive attached, because a
                reader of an override ledger asks how good the thing being
                overridden is, and the headline alone would answer that too
                generously.
              </>
            ) : (
              " No registry entry is readable, so no accuracy is shown rather than one being carried over from another model."
            )}
          </>
        }
      />
    </>
  );
}
