import { Card, CardHeader } from "@/components";

import type { Journey, JourneyStep, StepState } from "./data";
import { MIDDOT, formatDate, formatHours, formatScore } from "./format";

/**
 * The whole path, in order, with what each module leaves you able to do.
 *
 * WHAT THE STATES MEAN, AND WHAT THEY DELIBERATELY DO NOT
 * ------------------------------------------------------
 * Four states: finished, open now, next, and later. "Later" is a position in
 * a sequence, not a lock and not a failure -- learning_module.sequence orders
 * the curriculum, and the pilot data confirms every person works it in that
 * order, so the modules after the current one are simply the ones that come
 * after it.
 *
 * There is no fifth state for "overdue", because the schema has no due date
 * and adding one on the screen would be inventing a threshold to fail people
 * against. Nothing here is red. The only colour that carries weight is the
 * green on a finished module and the orange on the one in hand.
 *
 * Every entry leads with unlocks_capability, phrased as something the person
 * can do. On a finished module it reads as an acquired capability; on one
 * ahead, as the reason to bother.
 */

const RING_CLASS: Record<StepState, string> = {
  completed: "border-green bg-green",
  in_progress: "border-orange bg-white",
  next: "border-orange bg-orange",
  later: "border-rule2 bg-white",
};

const LABEL: Record<StepState, string> = {
  completed: "Finished",
  in_progress: "Open now",
  next: "Next",
  later: "Later on your path",
};

const LABEL_CLASS: Record<StepState, string> = {
  completed: "text-green",
  in_progress: "text-orangeD",
  next: "text-orangeD",
  later: "text-mute",
};

function StepRow({ step, last }: { step: JourneyStep; last: boolean }) {
  const done = step.state === "completed";
  const ahead = step.state === "later";

  return (
    <li
      className={`relative ml-[5px] border-l-2 pl-[24px] ${
        last ? "border-l-transparent pb-0" : "border-rule pb-[22px]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute -left-[7px] top-[3px] h-[12px] w-[12px] rounded-full border-[2.5px] ${RING_CLASS[step.state]}`}
      />

      <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[3px]">
        <span
          className={`text-micro font-extrabold uppercase ${LABEL_CLASS[step.state]}`}
        >
          {LABEL[step.state]}
        </span>
        <span className="font-mono text-[10.5px] font-bold text-mute">
          {step.module.moduleId}
        </span>
        <span className="text-small font-semibold text-mute">
          {formatHours(step.module.durationHours)} {MIDDOT} {step.module.format}
        </span>
      </div>

      <div
        className={`mt-[3px] text-h3 font-extrabold ${ahead ? "text-ink2" : "text-ink"}`}
      >
        {step.module.title}
      </div>

      {done ? (
        <div className="mt-[4px] text-small font-semibold text-mute tabular">
          Finished {formatDate(step.completedAt)}
          {step.score === null ? null : (
            // learning_completion.score carries no bound: no check constraint,
            // no scale column, nothing that says what the top of it is. "of
            // 100" was an assumption dressed as a fact, so the number is
            // printed as the record stores it and the denominator is not
            // claimed.
            <> {MIDDOT} assessment {formatScore(step.score)}</>
          )}
        </div>
      ) : step.state === "in_progress" && step.startedAt ? (
        <div className="mt-[4px] text-small font-semibold text-mute tabular">
          Started {formatDate(step.startedAt)}
        </div>
      ) : null}

      <div
        className={`mt-[7px] max-w-[70ch] rounded-quote px-[13px] py-[10px] text-copy leading-[1.55] ${
          done ? "bg-greenW text-ink2" : "bg-shell text-body"
        }`}
      >
        <span className="font-extrabold">
          {done ? "You can now: " : "Leaves you able to: "}
        </span>
        {step.module.unlocksCapability}
      </div>

      {done ? null : (
        <p className="mt-[7px] max-w-[70ch] text-small font-semibold leading-[1.6] text-mute">
          {step.module.description}
        </p>
      )}
    </li>
  );
}

export function ModuleSequence({ journey }: { journey: Journey }) {
  const { steps, completedCount, totalCount } = journey;

  if (steps.length === 0) {
    return (
      <Card>
        <CardHeader title="Your path" subtitle="Modules in sequence" />
        <div className="px-[20px] py-[18px]">
          <p className="max-w-[70ch] text-copy leading-[1.6] text-body">
            No modules resolve for your segment and tier, so there is nothing
            to sequence yet. When they do, this panel lists them in order with
            the capability each one leaves you holding, the hours it takes and
            the format it runs in. It stays empty rather than showing the full
            catalogue, because the catalogue is not your path.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Your path, in order"
        subtitle={`${completedCount} of ${totalCount} finished ${MIDDOT} sequenced by the curriculum, not by a calendar`}
      />
      <div className="px-[20px] py-[18px]">
        <ol className="list-none">
          {steps.map((step, index) => (
            <StepRow
              key={step.module.moduleId}
              step={step}
              last={index === steps.length - 1}
            />
          ))}
        </ol>
      </div>
    </Card>
  );
}
