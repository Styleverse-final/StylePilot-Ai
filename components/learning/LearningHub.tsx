import { existsSync } from "node:fs";
import { join } from "node:path";

import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components";
import { iconFor } from "@/components/navIcons";

import type { Journey, JourneyStep, StepState, UsageEvidence } from "./data";
import { DASH, formatDate, formatHoursBare, formatScore } from "./format";
import { WRITTEN_MODULES } from "./hubContent";
import { ProveIt } from "./ProveIt";

/**
 * The learning hub, laid out to the reference design: hero banner with the
 * progress card beside it, the module cards, the demo ground that checks
 * real usage, then activities, the certificate and the recommended row.
 *
 * WHAT THE REFERENCE ASKED FOR THAT IS DELIBERATELY NOT HERE. Watched-video
 * counts, quiz-minute estimates, scheduled activities dated "Today" and
 * "Tomorrow", a live session with a named consultant, a template library.
 * None of that exists in learning_module or learning_completion, and a tile
 * with a typed-in number is a lie on the one screen whose subject is whether
 * people actually did the work. Where the reference had an invented figure,
 * this renders the real equivalent or nothing.
 *
 * THE PHOTOGRAPH IS A SLOT, NOT AN ASSET. The hero looks for
 * public/learning-hero.jpg at render time; when a licensed photograph is
 * dropped there it appears with the gradient sweep and pull-quote over it,
 * and until then the panel renders the sweep and quote alone. No stock image
 * was bundled: licensing a photograph is a decision, not a default. This is
 * the only place in the app a photograph may appear.
 */

const ORANGE = "#D04A02";

function progressLabel(state: StepState): string {
  if (state === "completed") return "100%";
  // The row stores a status, not a fraction. "In progress" is what is known.
  if (state === "in_progress") return "In progress";
  return "0%";
}

const BAR: Record<StepState, { width: string; fill: string }> = {
  completed: { width: "100%", fill: "bg-green" },
  in_progress: { width: "33%", fill: "bg-orange" },
  next: { width: "0%", fill: "bg-rule2" },
  later: { width: "0%", fill: "bg-rule2" },
};

// ---------------------------------------------------------------- hero

function Hero({ next }: { next: JourneyStep | null }) {
  const hasPhoto = existsSync(join(process.cwd(), "public", "learning-hero.jpg"));

  return (
    <div className="relative overflow-hidden rounded-card bg-white shadow-card">
      <div className="relative z-10 max-w-[58%] px-[24px] py-[22px] max-[860px]:max-w-full">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-orangeD">
          Merchandising &amp; planning learning hub
        </div>
        <h2 className="mt-[6px] text-[34px] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink">
          Learn. Plan. Grow.
        </h2>
        <p className="mt-[8px] max-w-[46ch] text-[12.5px] font-semibold leading-[1.55] text-body">
          Build the skills to make better assortment, allocation and inventory
          decisions -- on the same screens you decide on.
        </p>
        {next ? (
          <Link
            href="#prove-it"
            className="mt-[14px] inline-flex items-center gap-[9px] rounded-pill bg-orange px-[18px] py-[9px] text-[12.5px] font-extrabold text-white transition-colors duration-[120ms] hover:bg-orangeD"
          >
            Show you can drive it
            <span aria-hidden="true">&rarr;</span>
          </Link>
        ) : (
          <span className="mt-[14px] inline-flex rounded-pill bg-greenW px-[14px] py-[7px] text-[12px] font-extrabold text-green">
            Every module on your path is finished
          </span>
        )}
        <div className="mt-[16px] flex items-center gap-[10px]">
          <span aria-hidden="true" className="h-[3px] w-[46px] rounded-pill bg-orange" />
          <span className="text-[11px] font-bold text-mute">
            Knowledge today. A better tomorrow.
          </span>
        </div>
      </div>

      {/* The right panel: gradient sweep, the photograph when one exists,
          and the pull-quote. aria-hidden throughout -- it is atmosphere. */}
      <div aria-hidden="true" className="absolute inset-y-0 right-0 w-[46%] max-[860px]:hidden">
        {hasPhoto ? (
          /* eslint-disable-next-line @next/next/no-img-element -- decorative
             slot filled by a locally provided file; next/image needs static
             dimensions this optional asset cannot promise. */
          <img
            src="/learning-hero.jpg"
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(105deg, #FFFFFF 0%, ${ORANGE}22 30%, ${ORANGE}66 58%, ${ORANGE}E6 100%)`,
          }}
        />
        <div className="absolute inset-y-0 right-[20px] flex items-center">
          <div className="max-w-[150px] text-right text-[15px] font-extrabold leading-[1.35] text-white">
            Retail moves people.
            <br />
            So do you.
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- progress

function Ring({ fraction }: { fraction: number }) {
  const R = 32;
  const C = 2 * Math.PI * R;
  const safe = Math.max(0, Math.min(1, fraction));
  const pct = Math.round(safe * 100);

  return (
    <div className="relative h-[92px] w-[92px] flex-none">
      <svg viewBox="0 0 84 84" className="h-full w-full" aria-hidden="true">
        <circle cx="42" cy="42" r={R} fill="none" stroke="#F0EBE5" strokeWidth="9" />
        <circle
          cx="42"
          cy="42"
          r={R}
          fill="none"
          stroke={ORANGE}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - safe)}
          transform="rotate(-90 42 42)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[17px] font-extrabold leading-none tabular-nums text-ink">
          {pct}%
        </span>
        <span className="mt-[2px] text-[8.5px] font-bold uppercase tracking-[0.05em] text-mute">
          Completed
        </span>
      </div>
    </div>
  );
}

function ProgressCard({ journey }: { journey: Journey }) {
  const { steps, completedCount, totalCount, completedHours } = journey;
  const fraction = totalCount === 0 ? 0 : completedCount / totalCount;

  const started = steps.filter((s) => s.startedAt !== null).length;
  const recorded = steps.filter((s) => s.score !== null);
  const passed = recorded.filter((s) => (s.score ?? 0) >= 70).length;

  // 1E: progress against HER segment's own hours target, not the function's.
  // 12 hours against a 20-hour segment target is a path in progress; the same
  // 12 against a flat function-wide bar would read as being behind.
  const target = journey.recommendedHours;
  const hoursFraction =
    target !== null && target > 0 ? Math.min(1, completedHours / target) : null;

  return (
    <Card>
      <CardHeader title="Your progress" subtitle="Your path, not the catalogue" />
      <CardBody>
        <div className="flex items-center gap-[14px]">
          <Ring fraction={fraction} />
          <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
            <div>
              <div className="text-[15px] font-extrabold leading-[1.2] tabular-nums text-ink">
                {completedCount} / {totalCount}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-mute">
                Modules completed
              </div>
            </div>
            <div>
              <div className="text-[15px] font-extrabold leading-[1.2] tabular-nums text-ink">
                {started}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-mute">
                Modules started
              </div>
            </div>
            <div>
              <div className="text-[15px] font-extrabold leading-[1.2] tabular-nums text-ink">
                {recorded.length === 0 ? DASH : `${passed} / ${recorded.length}`}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-mute">
                {recorded.length === 0
                  ? "No assessments recorded"
                  : "Assessments at 70 or above"}
              </div>
            </div>
          </div>
        </div>

        {hoursFraction === null ? null : (
          <div className="mt-[13px] border-t border-rule pt-[11px]">
            <div className="flex items-baseline justify-between text-[10.5px] font-bold text-mute">
              <span>Against your segment&apos;s target</span>
              <span className="tabular-nums text-ink">
                {formatHoursBare(completedHours)} of {formatHoursBare(target ?? 0)}h
              </span>
            </div>
            <div className="mt-[5px] h-[5px] w-full overflow-hidden rounded-pill bg-cream">
              <div
                className="h-full rounded-pill bg-orange"
                style={{ width: `${Math.round(hoursFraction * 100)}%` }}
              />
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function QuoteCard() {
  return (
    <div className="rounded-card bg-peach px-[18px] py-[15px]">
      <div aria-hidden="true" className="text-[30px] font-extrabold leading-none text-orange">
        &ldquo;
      </div>
      <p className="mt-[2px] text-[14px] font-extrabold italic leading-[1.4] text-ink">
        Skills today.
        <br />
        Stronger decisions tomorrow.
      </p>
      <p className="mt-[6px] text-[11px] font-bold text-orangeD">&mdash; PwC</p>
    </div>
  );
}

// ------------------------------------------------------------ modules

/** The screen a module is practised on, where one is mapped. */
const PRACTICE_ROUTE = new Map(
  WRITTEN_MODULES.map((w) => [w.moduleId, w.route] as const),
);

function ModuleCard({ step, index }: { step: JourneyStep; index: number }) {
  const m = step.module;
  const bar = BAR[step.state];
  // The arrow goes to the live screen this module is practised on, because
  // the proof of the module is a row made there -- not more reading.
  const practiceRoute = PRACTICE_ROUTE.get(m.moduleId) ?? null;

  return (
    <div className="flex min-w-0 flex-col rounded-card border border-rule bg-white p-[14px]">
      <div className="flex items-start justify-between gap-[8px]">
        <span
          aria-hidden="true"
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[12px] bg-peach text-[15px] font-extrabold text-orangeD"
        >
          {index + 1}
        </span>
        <span className="text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-mute">
          {formatHoursBare(m.durationHours)}h · {m.format}
        </span>
      </div>

      <h3 className="mt-[9px] text-[13px] font-extrabold leading-[1.35] tracking-[-0.01em] text-ink">
        {index + 1}. {m.title}
      </h3>
      {/* unlocks_capability, not description: what the person can DO after,
          which is the only line that answers "why bother". */}
      <p className="mt-[4px] text-[11px] font-semibold leading-[1.5] text-mute">
        {m.unlocksCapability}
      </p>

      <div className="mt-auto flex items-center gap-[9px] pt-[10px]">
        <div className="h-[4px] flex-1 overflow-hidden rounded-pill bg-cream">
          <div className={`h-full rounded-pill ${bar.fill}`} style={{ width: bar.width }} />
        </div>
        <span className="text-[10px] font-extrabold tabular-nums text-mute">
          {step.state === "completed" && step.score !== null
            ? formatScore(step.score)
            : progressLabel(step.state)}
        </span>
        {practiceRoute ? (
          <Link
            href={practiceRoute}
            aria-label={`Practice ${m.title} on ${practiceRoute}`}
            className="flex h-[24px] w-[24px] flex-none items-center justify-center rounded-full border border-orange text-[12px] font-extrabold text-orangeD transition-colors duration-[120ms] hover:bg-peach"
          >
            <span aria-hidden="true">&rarr;</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------- activities

type Activity = {
  key: string;
  title: string;
  sub: string;
  right: string;
};

function ActivitiesCard({
  journey,
  coachingBacklog,
  checksRemaining,
}: {
  journey: Journey;
  coachingBacklog: number | null;
  /** Demo checks not yet evidenced; null hides the row. */
  checksRemaining: number | null;
}) {
  const rows: Activity[] = [];

  // Real next-actions only. Nothing here is scheduled, so nothing carries a
  // date -- inventing "Tomorrow" is the same defect as a fake progress bar.
  const next = journey.next;
  if (next) {
    rows.push({
      key: "module",
      title: next.module.title,
      sub: `${formatHoursBare(next.module.durationHours)}h · ${next.module.format}${
        next.startedAt ? ` · started ${formatDate(next.startedAt)}` : ""
      }`,
      right: next.status === "in_progress" ? "Resume" : "Up next",
    });
  }
  if (checksRemaining !== null && checksRemaining > 0) {
    rows.push({
      key: "prove",
      title: "Demonstrate it on the live screens",
      sub: `${checksRemaining} of the demo checks still to show`,
      right: "Prove it",
    });
  }
  if (coachingBacklog !== null && coachingBacklog > 0) {
    rows.push({
      key: "coaching",
      title: "Coaching backlog",
      sub: `${coachingBacklog} people below their segment median`,
      right: "Assign",
    });
  }

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Up next"
        subtitle="From your own path -- nothing here is scheduled"
      />
      <CardBody>
        <div className="flex flex-col">
          {rows.map((row, i) => (
            <div
              key={row.key}
              className={`flex items-center gap-[10px] py-[9px] ${
                i > 0 ? "border-t border-rule" : ""
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-[32px] w-[32px] flex-none items-center justify-center rounded-[10px] bg-peach text-[13px] font-extrabold text-orangeD"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-extrabold text-ink">
                  {row.title}
                </div>
                <div className="truncate text-[10.5px] font-semibold text-mute">
                  {row.sub}
                </div>
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-[0.04em] text-orangeD">
                {row.right}
              </span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

// --------------------------------------------------------- certificate

function CertificateCard({ journey }: { journey: Journey }) {
  const { steps, completedCount, totalCount } = journey;
  const remaining = totalCount - completedCount;
  const recorded = steps.filter((s) => s.score !== null);
  const failing = recorded.filter((s) => (s.score ?? 0) < 70).length;
  const earned =
    totalCount > 0 && remaining === 0 && recorded.length > 0 && failing === 0;

  const hours = journey.recommendedHours ?? journey.pathHours;

  return (
    <div className="rounded-card bg-ink px-[18px] py-[16px] text-white">
      <div className="flex items-center gap-[10px]">
        <span
          aria-hidden="true"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-orange text-[15px] font-extrabold"
        >
          &#10003;
        </span>
        <h3 className="text-[14.5px] font-extrabold tracking-[-0.01em]">
          {earned ? "Certified" : "Get certified"}
        </h3>
      </div>
      <p className="mt-[8px] text-[11.5px] font-semibold leading-[1.55] text-white/80">
        {earned ? (
          <>
            Every module on your {formatHoursBare(hours)}-hour path is
            finished and every recorded assessment cleared 70. That standing
            is readable straight off your completion rows.
          </>
        ) : (
          <>
            Finish every module on your {formatHoursBare(hours)}-hour path
            with every assessment at 70 or above.{" "}
            <b className="text-white">
              {remaining > 0
                ? `${remaining} module${remaining === 1 ? "" : "s"}`
                : ""}
              {remaining > 0 && failing > 0 ? " and " : ""}
              {failing > 0
                ? `${failing} assessment${failing === 1 ? "" : "s"} below 70`
                : ""}
              {remaining === 0 && failing === 0
                ? "One recorded assessment"
                : ""}
            </b>{" "}
            still stand between you and it.
          </>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------- recommended

const PLANNER_LINKS = [
  { href: "/workbench", label: "Practice on the workbench", sub: "Real series, your scope" },
  { href: "/scenarios", label: "Run a scenario", sub: "Levers over a stored forecast" },
  { href: "/exceptions", label: "Work the exception queue", sub: "Ranked by rupees" },
  { href: "/buy", label: "Read a buy recommendation", sub: "Demand plus safety stock" },
] as const;

const PORTFOLIO_LINKS = [
  { href: "/portfolio", label: "Portfolio position", sub: "Both brands, one screen" },
  { href: "/governance", label: "The decision ledger", sub: "Append-only, named" },
  { href: "/model-ops", label: "The model card", sub: "Folds and baselines" },
  { href: "/signals", label: "Signal intelligence", sub: "Measured leads only" },
] as const;

function Recommended({ appRole }: { appRole: string | null }) {
  const links =
    appRole === "cmpo" || appRole === "group_cmpo"
      ? PORTFOLIO_LINKS
      : PLANNER_LINKS;

  return (
    <div className="grid grid-cols-4 gap-[12px] max-[1140px]:grid-cols-2 max-[720px]:grid-cols-1">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="flex items-center gap-[10px] rounded-card border border-rule bg-white px-[13px] py-[11px] transition-colors duration-[120ms] hover:border-rule2 hover:bg-shell"
        >
          <span
            aria-hidden="true"
            className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[11px] bg-peach text-orangeD"
          >
            {iconFor(link.href) ?? <span className="text-[13px] font-extrabold">&rarr;</span>}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-extrabold text-ink">
              {link.label}
            </span>
            <span className="block truncate text-[10.5px] font-semibold text-mute">
              {link.sub}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------- hub

export function LearningHub({
  journey,
  appRole,
  coachingBacklog,
  evidence,
  canDecide,
}: {
  journey: Journey;
  appRole: string | null;
  /** Support-list size, passed only for the roles that assign coaches. */
  coachingBacklog: number | null;
  /** The reader's own ledger and copilot rows -- the demo ground's input. */
  evidence: UsageEvidence;
  /** False for portfolio roles, whose commits the database refuses. */
  canDecide: boolean;
}) {
  const { steps } = journey;

  return (
    <div className="grid grid-cols-[1fr_330px] items-start gap-[16px] max-[1140px]:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-[16px]">
        <Hero next={journey.next} />

        <Card>
          <CardHeader
            title="Your modules"
            subtitle="In sequence, with what each one leaves you able to do"
          />
          <CardBody>
            {steps.length === 0 ? (
              <p className="text-[12.5px] font-semibold leading-[1.6] text-mute">
                No modules are on your path. The catalogue is assigned by
                adoption segment and role, and yours has not resolved any.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-[12px] max-[860px]:grid-cols-2 max-[600px]:grid-cols-1">
                {steps.map((step, i) => (
                  <ModuleCard key={step.module.moduleId} step={step} index={i} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* The written-module library stood here and was removed on review:
            reading about the workbench proved you could read. The demo ground
            answers the question the library could not -- whether this person
            can USE the system -- from their own ledger rows. */}
        <ProveIt evidence={evidence} canDecide={canDecide} />
      </div>

      <div className="flex min-w-0 flex-col gap-[16px]">
        <ProgressCard journey={journey} />
        <QuoteCard />
        <ActivitiesCard
          journey={journey}
          coachingBacklog={coachingBacklog}
          checksRemaining={
            canDecide
              ? [
                  evidence.committed > 0,
                  evidence.disagreedWithReason > 0,
                  evidence.scenariosSaved > 0,
                  evidence.copilotAsked > 0,
                ].filter((done) => !done).length
              : null
          }
        />
        <CertificateCard journey={journey} />
      </div>

      <div className="col-span-2 max-[1140px]:col-span-1">
        <Recommended appRole={appRole} />
      </div>
    </div>
  );
}

export default LearningHub;
