import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components";

import type { UsageEvidence } from "./data";
import { formatDate, plural } from "./format";

/**
 * The demo ground: whether this person can actually drive the system,
 * answered from evidence rather than from a quiz.
 *
 * THE TEST IS DOING IT, AND THE PROOF IS THE ROW. Each check names one thing
 * a working planner does -- commit a decision, disagree with a written
 * reason, save a scenario, ask the copilot -- links to the live screen where
 * it happens, and turns green only when the reader's OWN ledger or copilot
 * rows say it happened. Nothing here can be ticked by clicking; the tick IS
 * the row. That replaces the written-module library this card stands where:
 * reading about the workbench proved you could read, and the reviewer's
 * question was whether people can USE the thing.
 *
 * THESE ARE REAL ROWS, AND THE CARD SAYS SO. The ledger is append-only, so a
 * practice decision is a permanent decision -- which is not a defect of the
 * exercise but its point, and exactly what the curriculum's hands-on module
 * already instructs ("take a real buy recommendation, change it, write the
 * reason"). The copy tells the reader their practice lands in the same
 * ledger everyone else reads.
 *
 * ROLES THAT CANNOT COMMIT GET THE HONEST VARIANT. A CMPO's inserts are
 * refused by the database on purpose, so three of the four checks can never
 * pass for them and rendering them would be a permanent wall of failure for
 * behaving correctly. They see the one check their role can leave evidence
 * of, plus the reason the others are absent.
 */

type Check = {
  key: string;
  title: string;
  how: string;
  href: string | null;
  cta: string;
  passed: boolean;
  evidence: string | null;
};

function checksFor(evidence: UsageEvidence): Check[] {
  return [
    {
      key: "commit",
      title: "Commit a decision",
      how: "Approve, modify or reject any open recommendation.",
      href: "/exceptions",
      cta: "Open the queue",
      passed: evidence.committed > 0,
      evidence:
        evidence.committed > 0
          ? `${plural(evidence.committed, "decision", "decisions")} in the ledger${
              evidence.latestDecisionAt
                ? `, latest ${formatDate(evidence.latestDecisionAt)}`
                : ""
            }`
          : null,
    },
    {
      key: "disagree",
      title: "Disagree defensibly",
      how: "Modify or reject one, with a written reason that stands on its own.",
      href: "/buy",
      cta: "Open the buy plan",
      passed: evidence.disagreedWithReason > 0,
      evidence:
        evidence.disagreedWithReason > 0
          ? `${plural(evidence.disagreedWithReason, "reasoned override", "reasoned overrides")} recorded`
          : null,
    },
    {
      key: "scenario",
      title: "Save a scenario",
      how: "Move the levers, name the result, file it into the ledger.",
      href: "/scenarios",
      cta: "Open scenarios",
      passed: evidence.scenariosSaved > 0,
      evidence:
        evidence.scenariosSaved > 0
          ? `${plural(evidence.scenariosSaved, "scenario", "scenarios")} saved`
          : null,
    },
    {
      key: "copilot",
      title: "Ask the copilot",
      how: "Put a question to it from any screen.",
      href: null,
      cta: "Ctrl+K anywhere",
      passed: evidence.copilotAsked > 0,
      evidence:
        evidence.copilotAsked > 0
          ? `${plural(evidence.copilotAsked, "question", "questions")} asked`
          : null,
    },
  ];
}

function CheckRow({ check, index }: { check: Check; index: number }) {
  return (
    <div
      className={`flex items-center gap-[12px] py-[11px] ${index > 0 ? "border-t border-rule" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-[13px] font-extrabold ${
          check.passed ? "bg-green text-white" : "border border-rule2 bg-white text-mute"
        }`}
      >
        {check.passed ? "✓" : index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-extrabold text-ink">{check.title}</div>
        <div className="text-[11px] font-semibold leading-[1.45] text-mute">
          {check.passed && check.evidence ? check.evidence : check.how}
        </div>
      </div>
      {check.passed ? (
        <span className="rounded-pill bg-greenW px-[10px] py-[3px] text-[10px] font-extrabold uppercase tracking-[0.04em] text-green">
          Shown
        </span>
      ) : check.href ? (
        <Link
          href={check.href}
          className="rounded-pill border border-orange px-[12px] py-[5px] text-[11px] font-extrabold text-orangeD transition-colors duration-[120ms] hover:bg-peach"
        >
          {check.cta}
        </Link>
      ) : (
        <span className="rounded-pill bg-cream px-[12px] py-[5px] text-[11px] font-extrabold text-mute">
          {check.cta}
        </span>
      )}
    </div>
  );
}

export function ProveIt({
  evidence,
  canDecide,
}: {
  evidence: UsageEvidence;
  /** False for the portfolio roles, whose commits the database refuses. */
  canDecide: boolean;
}) {
  const checks = canDecide
    ? checksFor(evidence)
    : checksFor(evidence).filter((check) => check.key === "copilot");
  const done = checks.filter((check) => check.passed).length;

  return (
    <Card id="prove-it">
      <CardHeader
        title="Prove it on the live screens"
        subtitle={`${done} of ${checks.length} demonstrated -- each check turns green only when your own rows say it happened`}
      />
      <CardBody>
        <div className="flex flex-col">
          {checks.map((check, i) => (
            <CheckRow key={check.key} check={check} index={i} />
          ))}
        </div>
        <p className="mt-[10px] border-t border-rule pt-[10px] text-[11px] font-semibold leading-[1.55] text-mute">
          {canDecide ? (
            <>
              These are not practice sandboxes: a decision you commit here
              lands in the same append-only ledger everyone reads, with your
              name on it. That is deliberate -- the test of being able to use
              the system is using it, and the hands-on curriculum already asks
              for exactly this.
            </>
          ) : (
            <>
              Your role commits nothing by design -- the database refuses the
              insert -- so the decision checks would be a permanent wall of
              failure for behaving correctly. The one trace your usage leaves
              is the question log, and it is the one check shown.
            </>
          )}
        </p>
      </CardBody>
    </Card>
  );
}

export default ProveIt;
