import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components";

import type { Journey, JourneyStep, StepState } from "./data";
import {
  DASH,
  MIDDOT,
  formatDate,
  formatHours,
  formatHoursBare,
  formatScore,
} from "./format";

/**
 * The learning hub: a banner, a completion ring, and the path as cards.
 *
 * WHAT THIS REPLACED AND WHY IT IS NOT A DUPLICATE. Three panels used to
 * present this same journey object -- NextModule (the one thing to do next),
 * HoursProgress (hours done against hours on the path) and ModuleSequence (the
 * path as a vertical timeline). The banner's call to action IS NextModule, the
 * ring IS HoursProgress, and these cards ARE the sequence. Rendering both
 * shapes would have put every module on the screen twice, so the cards carry
 * everything the timeline carried -- state, score, dates, and above all
 * unlocks_capability -- rather than being an overview laid on top of it.
 *
 * EVERY FIGURE IS READ, NONE IS INVENTED. This screen was built against a
 * reference design that showed watched-video counts, quiz question counts,
 * scheduled live sessions with dates, a downloadable template library and a
 * certificate. learning_module and learning_completion carry none of those --
 * no video, no question bank, no schedule, no artefact, no certification -- so
 * none of them appear here. What the tables DO carry turned out to answer the
 * same questions better:
 *
 *   modules completed / total   from the person's own path, not the catalogue
 *   hours done / hours on path  duration_hours, summed by state
 *   mean assessment score       learning_completion.score, where one exists
 *   what each module unlocks    unlocks_capability, which no reference had
 *
 * NO DUE DATES, NO STREAKS, NO BADGES, and the banner does not congratulate
 * anyone. The existing screen states the reason in its own words: there are no
 * due dates in the data, and adding one turns a curriculum into something to
 * fail against. A progress ring is already the strongest nudge on this page.
 */

/** Fraction of the module a state implies. Two-state data, honestly rendered. */
function progressOf(state: StepState): number {
  if (state === "completed") return 1;
  // learning_completion has status and dates, not a percentage. A module that
  // is open has been started and is not finished, and the only honest bar for
  // that is a partial one that does not pretend to a number. It is drawn at a
  // third and labelled "In progress" rather than "33%", so nothing on screen
  // claims a precision the row does not carry.
  if (state === "in_progress") return 1 / 3;
  return 0;
}

const STATE_LABEL: Record<StepState, string> = {
  completed: "Finished",
  in_progress: "In progress",
  next: "Next up",
  later: "Later on your path",
};

const STATE_PILL: Record<StepState, string> = {
  completed: "bg-greenW text-green",
  in_progress: "bg-peach text-orangeD",
  next: "bg-peach text-orangeD",
  later: "bg-cream text-mute",
};

const BAR_FILL: Record<StepState, string> = {
  completed: "bg-green",
  in_progress: "bg-orange",
  next: "bg-rule2",
  later: "bg-rule2",
};

/**
 * The completion ring.
 *
 * Drawn as an SVG arc rather than a conic-gradient div so it renders in the
 * server component it lives in, keeps its stroke crisp at any zoom, and can be
 * given a real accessible name. The dash offset is the whole trick: a circle
 * whose dasharray is its own circumference shows exactly the fraction of it
 * that is not offset.
 */
function Ring({ fraction, label }: { fraction: number; label: string }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const safe = Math.max(0, Math.min(1, fraction));
  const pct = Math.round(safe * 100);

  return (
    <div className="flex items-center gap-[14px]">
      <svg
        viewBox="0 0 84 84"
        className="h-[84px] w-[84px] flex-none"
        role="img"
        aria-label={`${pct}% of your path complete: ${label}`}
      >
        <circle
          cx="42"
          cy="42"
          r={R}
          fill="none"
          stroke="#E5DED7"
          strokeWidth="8"
        />
        <circle
          cx="42"
          cy="42"
          r={R}
          fill="none"
          stroke="#D04A02"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - safe)}
          transform="rotate(-90 42 42)"
        />
      </svg>
      <div className="min-w-0">
        <div className="text-[24px] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums text-ink">
          {pct}%
        </div>
        <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-mute">
          of your path
        </div>
      </div>
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[17px] font-extrabold leading-[1.2] tabular-nums text-ink">
        {value}
      </div>
      <div className="mt-[1px] text-[10.5px] font-bold uppercase leading-[1.3] tracking-[0.04em] text-mute">
        {label}
      </div>
    </div>
  );
}

function ModuleCard({ step, index }: { step: JourneyStep; index: number }) {
  const fraction = progressOf(step.state);
  const m = step.module;

  return (
    <div className="flex min-w-0 flex-col rounded-card border border-rule bg-white p-[14px]">
      <div className="flex items-start justify-between gap-[8px]">
        <span
          className={`rounded-pill px-[8px] py-[2px] text-[10px] font-extrabold uppercase tracking-[0.04em] ${STATE_PILL[step.state]}`}
        >
          {STATE_LABEL[step.state]}
        </span>
        <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-cream text-[11px] font-extrabold tabular-nums text-mute">
          {index + 1}
        </span>
      </div>

      <h3 className="mt-[9px] text-[13.5px] font-extrabold leading-[1.35] tracking-[-0.01em] text-ink">
        {m.title}
      </h3>

      {/* unlocks_capability, not description: the description says what the
          module covers, this says what the person can do afterwards, and the
          second is the only one that answers "why bother". */}
      <p className="mt-[5px] text-[11.5px] font-semibold leading-[1.5] text-mute">
        {m.unlocksCapability}
      </p>

      <div className="mt-auto pt-[11px]">
        <div className="h-[5px] w-full overflow-hidden rounded-pill bg-cream">
          <div
            className={`h-full rounded-pill ${BAR_FILL[step.state]}`}
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </div>
        <div className="mt-[7px] flex items-center justify-between gap-[8px] text-[10.5px] font-bold text-mute">
          <span>
            {formatHours(m.durationHours)} {MIDDOT} {m.format}
          </span>
          <span className="tabular-nums">
            {step.state === "completed"
              ? step.score === null
                ? formatDate(step.completedAt)
                : formatScore(step.score)
              : step.state === "in_progress"
                ? `Started ${formatDate(step.startedAt)}`
                : DASH}
          </span>
        </div>
      </div>
    </div>
  );
}

export function LearningHub({ journey }: { journey: Journey }) {
  const { steps, completedCount, totalCount, completedHours, pathHours } =
    journey;

  const fraction = totalCount === 0 ? 0 : completedCount / totalCount;

  // Mean of the scores that exist. A module finished without an assessment row
  // is not a zero, so it is excluded from the mean rather than dragging it
  // down, and the count of what the mean covers is printed beside it.
  const scored = steps.filter((s) => s.score !== null);
  const meanScore =
    scored.length === 0
      ? null
      : scored.reduce((total, s) => total + (s.score ?? 0), 0) / scored.length;

  const next = journey.next;

  return (
    <>
      {/*
        The banner. Flat orange in the app's own palette -- no gradient, no
        stock photograph, no slogan about the future of retail. The line under
        the title is the person's own position on their own path, which is the
        only thing on a learning screen a planner opens it to find out.
      */}
      <div className="mb-[16px] grid grid-cols-[1.55fr_1fr] items-stretch gap-[16px] max-[1140px]:grid-cols-1">
        <div className="rounded-card bg-orange px-[22px] py-[20px] text-white">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.09em] text-white/75">
            Merchandising &amp; planning capability
          </div>
          <h2 className="mt-[7px] text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em]">
            {completedCount === totalCount && totalCount > 0
              ? "Your path is complete."
              : "Learn it once, then decide faster."}
          </h2>
          <p className="mt-[7px] max-w-[54ch] text-[12.5px] font-semibold leading-[1.55] text-white/85">
            {totalCount === 0
              ? "No modules are assigned to you yet."
              : `${completedCount} of ${totalCount} modules finished, ${formatHoursBare(
                  completedHours,
                )} of ${formatHours(pathHours)} on your path.`}
          </p>

          {next === null ? null : (
            <Link
              href="#your-path"
              className="mt-[15px] inline-flex items-center gap-[9px] rounded-pill bg-white px-[16px] py-[9px] text-[12.5px] font-extrabold text-orangeD transition-opacity duration-[120ms] hover:opacity-90"
            >
              Continue: {next.module.title}
              <span aria-hidden="true">&rarr;</span>
            </Link>
          )}
        </div>

        <Card>
          <CardHeader title="Your progress" subtitle="Your path, not the catalogue" />
          <CardBody>
            <Ring
              fraction={fraction}
              label={`${completedCount} of ${totalCount} modules`}
            />
            <div className="mt-[15px] grid grid-cols-3 gap-[10px] border-t border-rule pt-[13px]">
              <Figure
                value={`${completedCount} / ${totalCount}`}
                label="Modules done"
              />
              <Figure
                value={formatHoursBare(completedHours)}
                label={`of ${formatHoursBare(pathHours)} hours`}
              />
              <Figure
                value={meanScore === null ? DASH : formatScore(meanScore)}
                label={
                  meanScore === null
                    ? "No score yet"
                    : `Mean of ${scored.length}`
                }
              />
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-[16px]">
        <CardHeader
          title="Your modules"
          subtitle="In sequence, with what each one leaves you able to do"
        />
        <CardBody>
          {steps.length === 0 ? (
            <p className="text-[12.5px] font-semibold leading-[1.6] text-mute">
              No modules are on your path. The catalogue is assigned by adoption
              segment, and yours has not resolved one.
            </p>
          ) : (
            <div
              id="your-path"
              className="grid grid-cols-3 gap-[12px] max-[1140px]:grid-cols-2 max-[720px]:grid-cols-1"
            >
              {steps.map((step, i) => (
                <ModuleCard key={step.module.moduleId} step={step} index={i} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

export default LearningHub;
