import { Card, CardBody, CardHeader, Pill, Stat, StatBlock } from "@/components";

import { isCoachingModule, type Journey } from "./data";
import {
  DASH,
  MIDDOT,
  formatDate,
  formatFractionPct,
  formatHours,
  formatSignedHours,
  plural,
} from "./format";

/**
 * The three panels that make up one person's view of their own capability
 * path: where they are and why, how far through the hours they are, and the
 * single next thing.
 *
 * THE TONE IS THE DELIVERABLE HERE
 * --------------------------------
 * The question this screen answers is whether a reskilling programme can be
 * read as genuine commitment rather than as a compliance exercise wearing a
 * friendly font. The same rows -- fifteen modules, 2,836 completion records,
 * an hours target per segment -- support either reading, and the difference
 * is entirely in what the screen chooses to say.
 *
 * So there are no due dates on this page, because the data has none and
 * inventing one would turn a curriculum into a deadline. There are no
 * overdue badges, because "behind" is a judgement the data does not carry.
 * Nothing is described as mandatory or required. Every module is introduced
 * by what it lets the person DO afterwards -- learning_module.unlocks_
 * capability is written that way and it is the field this screen leads with.
 *
 * "14 of 20 hours, and here is what is next" is the whole message. A red
 * badge saying "6 hours overdue" would be the identical arithmetic and the
 * opposite promise.
 */

// ------------------------------------------------------------ segment card

const READINESS_MAX = 5;

export function SegmentWhy({ journey }: { journey: Journey }) {
  const adoption = journey.adoption;

  if (!adoption || !adoption.segment) {
    return (
      <Card>
        <CardHeader
          title="Your starting point"
          subtitle="From the adoption survey"
        />
        <CardBody>
          <p className="max-w-[70ch] text-copy leading-[1.6] text-body">
            There is no adoption row against your employee record, so this
            screen cannot say which curriculum was written for you or why.
            That row is what carries your readiness and apprehension scores
            from the pilot survey and the recommended hours attached to them.
            Once it exists, this panel names your segment, shows both scores,
            and prints the exact arithmetic that placed you there.
          </p>
        </CardBody>
      </Card>
    );
  }

  const readiness = adoption.readiness;
  const apprehension = adoption.apprehension;
  const tier = journey.person.learningTier;

  return (
    <Card>
      <CardHeader
        title="Where your path came from"
        subtitle="Adoption survey, scored once at the start of the pilot"
        actions={<Pill variant="violet">{adoption.segment}</Pill>}
      />
      <CardBody>
        <p className="max-w-[70ch] text-copy leading-[1.6] text-body">
          Your path was chosen from two answers you gave, not from anything
          you have done in the tool since. Readiness is how prepared you said
          you felt; apprehension is how much you said the change worried you.
          Both are on a {READINESS_MAX}-point scale, and a high apprehension
          score is not a mark against anyone -- it routes you to sessions
          about accountability and the audit trail instead of sessions about
          keyboard mechanics.
        </p>

        <StatBlock>
          <Stat
            label="Readiness"
            value={
              readiness === null ? DASH : `${readiness.toFixed(1)} / ${READINESS_MAX}`
            }
          />
          <Stat
            label="Apprehension"
            value={
              apprehension === null
                ? DASH
                : `${apprehension.toFixed(1)} / ${READINESS_MAX}`
            }
          />
          <Stat
            label="Recommended for this segment"
            value={formatHours(adoption.recommendedHours)}
          />
          <Stat label="Tier" value={tier} tone="mute" />
        </StatBlock>

        {tier === "C3" ? (
          <p className="mt-[14px] max-w-[70ch] text-copy leading-[1.6] text-body">
            You are on the {tier} path, which is the segment curriculum plus
            the two governance modules. Those exist because someone has to be
            named as the owner of an autonomy band, and owning one means
            answering for what an agent decided while nobody was watching.
            That is a different skill from reading a forecast, so it is taught
            separately rather than assumed.
          </p>
        ) : null}

        {adoption.rationale ? (
          <>
            <div className="mt-[16px] text-micro font-extrabold uppercase text-mute">
              The exact derivation, as stored
            </div>
            <p className="mt-[8px] max-w-[64ch] rounded-quote bg-shell px-[14px] py-[11px] text-copy leading-[1.55] text-body">
              {adoption.rationale}
            </p>
            <p className="mt-[10px] max-w-[70ch] text-small font-semibold leading-[1.6] text-mute">
              That paragraph is stored on your adoption row, not written for
              this screen. It names every weight and both segment thresholds,
              so you can re-derive your own placement by hand and argue with
              it if it is wrong.
            </p>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

// -------------------------------------------------------------- hours card

function HoursBar({
  completed,
  inProgress,
  total,
  recommended,
}: {
  completed: number;
  inProgress: number;
  total: number;
  recommended: number | null;
}) {
  const scale = Math.max(total, recommended ?? 0, 1);
  const completedPct = Math.min(100, (completed / scale) * 100);
  const inProgressPct = Math.min(100 - completedPct, (inProgress / scale) * 100);
  const markerPct =
    recommended !== null && recommended > 0
      ? Math.min(100, (recommended / scale) * 100)
      : null;

  return (
    <div className="relative mt-[6px] h-[18px] overflow-hidden rounded-pill bg-cream">
      <div className="flex h-full">
        <div
          className="h-full bg-orange"
          style={{ width: `${completedPct}%` }}
          aria-hidden="true"
        />
        <div
          className="h-full bg-peach"
          style={{ width: `${inProgressPct}%` }}
          aria-hidden="true"
        />
      </div>
      {markerPct === null ? null : (
        <span
          aria-hidden="true"
          className="absolute top-0 h-full w-[2px] bg-ink2"
          style={{ left: `calc(${markerPct}% - 1px)` }}
        />
      )}
    </div>
  );
}

/**
 * Hours completed against THE PATH, with the segment recommendation shown
 * beside it as a property of the curriculum rather than as the bar to clear.
 *
 * WHY PROGRESS IS MEASURED AGAINST THE PATH AND NOT THE RECOMMENDATION.
 * The two are not always the same number. "Capable but apprehensive" is
 * recommended 14 hours and its C2 curriculum totals 13: three three-hour
 * sessions plus the four-hour foundation. The modules come in whole sessions
 * and they do not add to exactly fourteen. Scored against the recommendation,
 * somebody who has finished every module the programme gave them would read
 * as 93% and never reach the end -- the screen would be telling a person who
 * did everything asked of them that they are incomplete. So completion is
 * finished-hours over path-hours, which reaches 100% exactly when there is
 * nothing left to do, and the 13-against-14 difference is printed underneath
 * as arithmetic in the curriculum. Padding a module to tidy it would be
 * inventing training; hiding it would be inventing agreement.
 */
export function HoursProgress({ journey }: { journey: Journey }) {
  const {
    completedHours,
    inProgressHours,
    pathHours,
    recommendedHours,
    completedCount,
    totalCount,
  } = journey;

  const finished = totalCount > 0 && completedCount === totalCount;
  const remaining = Math.max(0, pathHours - completedHours);
  const gap = recommendedHours === null ? null : pathHours - recommendedHours;
  const prior = journey.person.priorHours;

  return (
    <Card>
      <CardHeader
        title="Hours so far"
        subtitle={`${plural(completedCount, "module", "modules")} finished of ${totalCount}`}
        actions={
          <Pill variant={finished ? "up" : "orange"} tabular>
            {formatFractionPct(pathHours > 0 ? completedHours / pathHours : null)}
          </Pill>
        }
      />
      <CardBody>
        <div className="flex items-baseline gap-[8px]">
          <b className="text-h1 font-extrabold tabular">
            {formatHours(completedHours)}
          </b>
          <span className="text-copy font-bold text-mute">
            of {formatHours(pathHours)} on your path
          </span>
        </div>

        <HoursBar
          completed={completedHours}
          inProgress={inProgressHours}
          total={pathHours}
          recommended={recommendedHours}
        />

        <div className="mt-[9px] flex flex-wrap gap-x-[16px] gap-y-[4px] text-small font-semibold text-mute">
          <span>
            <i
              aria-hidden="true"
              className="mr-[6px] inline-block h-[8px] w-[8px] rounded-[2px] bg-orange align-[0px]"
            />
            Finished {formatHours(completedHours)}
          </span>
          {inProgressHours > 0 ? (
            <span>
              <i
                aria-hidden="true"
                className="mr-[6px] inline-block h-[8px] w-[8px] rounded-[2px] bg-peach align-[0px]"
              />
              Open now {formatHours(inProgressHours)}
            </span>
          ) : null}
          <span>
            <i
              aria-hidden="true"
              className="mr-[6px] inline-block h-[8px] w-[8px] rounded-[2px] bg-cream align-[0px]"
            />
            Ahead of you {formatHours(remaining)}
          </span>
          {recommendedHours === null ? null : (
            <span>
              <i
                aria-hidden="true"
                className="mr-[6px] inline-block h-[8px] w-[2px] bg-ink2 align-[-1px]"
              />
              Segment recommendation {formatHours(recommendedHours)}
            </span>
          )}
        </div>

        <StatBlock>
          <Stat label="On your path" value={formatHours(pathHours)} />
          <Stat label="Modules" value={`${completedCount} / ${totalCount}`} />
          <Stat
            label="Structured learning last year"
            value={formatHours(prior)}
            tone="mute"
          />
          {journey.lastCompletedAt ? (
            <Stat
              label="Last finished"
              value={formatDate(journey.lastCompletedAt)}
              tabular={false}
              tone="mute"
            />
          ) : null}
        </StatBlock>

        {gap !== null && Math.abs(gap) > 0.001 ? (
          <p className="mt-[14px] max-w-[70ch] text-copy leading-[1.6] text-body">
            Your path totals {formatHours(pathHours)} against a{" "}
            {formatHours(recommendedHours)} recommendation for{" "}
            {journey.adoption?.segment ?? "your segment"} --{" "}
            {formatSignedHours(gap)}.{" "}
            {gap < 0
              ? `That is arithmetic in the curriculum rather than a missing module: the sessions come in whole blocks and they do not add up to exactly ${formatHours(recommendedHours)}. It is shown rather than padded away, because a module invented to round the number up would be an hour of your time spent on tidiness. The percentage above is scored against your path, not against the recommendation, so finishing every module reads as finished and this difference stays where it belongs -- with the curriculum.`
              : `The extra sits above the segment recommendation because a ${journey.person.learningTier} path adds the governance modules on top of the curriculum for ${journey.adoption?.segment ?? "your segment"}.`}
          </p>
        ) : null}

        {prior !== null ? (
          <p className="mt-[10px] max-w-[70ch] text-small font-semibold leading-[1.6] text-mute">
            The {formatHours(prior)} figure is what your record shows for
            structured learning across the whole of last year. This path is
            the comparison worth making, and it is deliberately not a target
            you are measured against.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

// --------------------------------------------------------- the next thing

/**
 * One module, presented as the only thing worth deciding about today.
 *
 * A list of ten open items reads as a backlog. One reads as a next step, and
 * the difference matters more here than anywhere else on the screen.
 */
export function NextModule({ journey }: { journey: Journey }) {
  const step = journey.next;

  if (!step) {
    // The coaching module is Champions-only. Most people who finish a path
    // never had it, so it is named only for the people whose own curriculum
    // actually contained it, and everyone else gets a sentence that is true
    // of them. Advice addressed to a module the reader never sat is worse
    // than no advice: it reads as a screen talking past them.
    const coaching = journey.steps.find((entry) => isCoachingModule(entry.module));

    return (
      <div className="rounded-card bg-gradient-to-br from-[#FCE4D2] via-[#F8D9CB] to-[#F6D3D9] px-[20px] py-[22px]">
        <div className="text-small font-bold text-orangeD">
          Your path is complete
        </div>
        <h2 className="mt-[4px] text-hero font-extrabold text-ink">
          All {journey.totalCount} modules finished
          {journey.lastCompletedAt
            ? `, the last on ${formatDate(journey.lastCompletedAt)}`
            : ""}
        </h2>
        <p className="mt-[10px] max-w-[64ch] text-copy leading-[1.6] text-ink2">
          {formatHours(journey.completedHours)} across{" "}
          {plural(journey.totalCount, "module", "modules")}. Nothing else is
          waiting for you. The capabilities you picked up are listed below;
          the most useful thing to do with them now is sit with someone
          earlier in their path
          {coaching
            ? `, which is what ${coaching.module.title} was for.`
            : ". Coaching was not one of the modules on your own curriculum, so that is an offer to make out of what you now know rather than a technique this path taught you -- and it is worth making anyway."}
        </p>
      </div>
    );
  }

  const opened = step.state === "in_progress";

  return (
    <div className="rounded-card bg-gradient-to-br from-[#FCE4D2] via-[#F8D9CB] to-[#F6D3D9] px-[20px] py-[22px]">
      <div className="flex items-center gap-[10px]">
        <span className="text-small font-bold text-orangeD">
          {opened ? "Open now" : "Next on your path"}
        </span>
        <span className="rounded-pill bg-white/70 px-[9px] py-[3px] text-th font-extrabold text-ink">
          {step.module.moduleId}
        </span>
      </div>

      <h2 className="mt-[5px] text-hero font-extrabold text-ink">
        {step.module.title}
      </h2>

      <div className="mt-[8px] flex flex-wrap items-center gap-[7px]">
        <span className="rounded-pill bg-white/70 px-[11px] py-[5px] text-small font-bold text-ink2">
          {formatHours(step.module.durationHours)}
        </span>
        <span className="rounded-pill bg-white/70 px-[11px] py-[5px] text-small font-bold text-ink2">
          {step.module.format}
        </span>
        {opened && step.startedAt ? (
          <span className="rounded-pill bg-white/70 px-[11px] py-[5px] text-small font-bold text-ink2">
            Started {formatDate(step.startedAt)}
          </span>
        ) : null}
      </div>

      <p className="mt-[12px] max-w-[64ch] text-copy leading-[1.6] text-ink2">
        {step.module.description}
      </p>

      <div className="mt-[14px] rounded-inner bg-white/70 px-[14px] py-[12px]">
        <div className="text-micro font-extrabold uppercase text-orangeD">
          What you can do afterwards
        </div>
        <div className="mt-[4px] max-w-[60ch] text-base font-bold leading-[1.5] text-ink">
          {step.module.unlocksCapability}
        </div>
      </div>

      <p className="mt-[12px] max-w-[64ch] text-small font-semibold leading-[1.6] text-ink2">
        StyleVerse records where you are on the path {MIDDOT} the session
        itself is run by the capability team, in the format above. There is no
        date attached to this and there is not going to be one.
      </p>
    </div>
  );
}
