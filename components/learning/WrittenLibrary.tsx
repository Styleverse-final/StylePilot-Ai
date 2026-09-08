"use client";

import { useId, useState } from "react";

import {
  QUIZ,
  QUIZ_PASS_MARK,
  type WrittenModule,
  type WrittenSection,
} from "./hubContent";

/**
 * The written-module library -- the mockup's media row, without the lies.
 *
 * The reference design put video cards here: play button, runtime badge,
 * watch-progress bar. There are no videos, so this renders WRITTEN modules:
 * the thumbnail is a drawing of the screen the module walks, the meta line is
 * a read time computed from the words actually in the module, and the bar is
 * the module's real status from learning_completion. Clicking opens the text
 * right here. No play button, no "12:34", no watch percentage -- nothing on
 * these cards claims a medium that does not exist.
 *
 * THE FOURTH SLOT IS THE SELF-CHECK. Ten questions, graded locally, pass mark
 * 70% to match the assessment bar. It records nothing: there is no attempts
 * table, and writing browser clicks into learning_completion would overwrite
 * pilot assessment data. The card says "not recorded" so nobody mistakes a
 * green result here for a score in the system.
 */

export type LibraryItem = {
  moduleId: string;
  title: string;
  route: string;
  art: WrittenModule["art"];
  minutes: number;
  status: "completed" | "in_progress" | "not_started";
  sections: readonly WrittenSection[];
};

const STATUS_META: Record<
  LibraryItem["status"],
  { label: string; width: string; fill: string }
> = {
  completed: { label: "Read", width: "100%", fill: "bg-green" },
  // A third, not a percentage: the row stores a status, not a fraction, and
  // a bar reading "33%" would claim precision the data does not carry.
  in_progress: { label: "In progress", width: "33%", fill: "bg-orange" },
  not_started: { label: "Unread", width: "0%", fill: "bg-rule2" },
};

/**
 * Tile art: the screen the module walks, drawn in the app's own tokens.
 *
 * NOT a screenshot and NOT photography -- a screenshot would need an
 * authenticated session baked into the build, and a stock photo is banned on
 * this row for good reason. These are the app's shapes: the forecast band,
 * the driver bars, the buy table, the ranked exception queue.
 */
function TileArt({ art }: { art: LibraryItem["art"] }) {
  const common = {
    className: "h-full w-full",
    viewBox: "0 0 160 84",
    preserveAspectRatio: "none" as const,
    "aria-hidden": true as const,
  };
  if (art === "forecast") {
    return (
      <svg {...common}>
        <path d="M8 62 C40 58 60 40 90 38 C118 36 138 30 152 24 L152 10 C138 18 118 22 90 24 C60 26 40 44 8 50 Z" fill="#FBE3D4" />
        <path d="M8 56 C40 52 60 34 90 31 C118 29 138 23 152 17" fill="none" stroke="#D04A02" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M8 60 C40 57 62 46 92 44 C120 42 140 38 152 34" fill="none" stroke="#8D857D" strokeWidth="1.5" strokeDasharray="4 4" />
      </svg>
    );
  }
  if (art === "drivers") {
    return (
      <svg {...common}>
        {[
          { y: 12, w: 104, fill: "#D04A02" },
          { y: 28, w: 76, fill: "#D04A02" },
          { y: 44, w: 52, fill: "#E5DED7" },
          { y: 60, w: 30, fill: "#E5DED7" },
        ].map((bar) => (
          <rect key={bar.y} x="10" y={bar.y} width={bar.w} height="10" rx="3" fill={bar.fill} />
        ))}
      </svg>
    );
  }
  if (art === "buy") {
    return (
      <svg {...common}>
        {[10, 30, 50].map((y, i) => (
          <g key={y}>
            <rect x="10" y={y} width="66" height="12" rx="3" fill="#F0EBE5" />
            <rect x="84" y={y} width="28" height="12" rx="3" fill={i === 0 ? "#FBE3D4" : "#F0EBE5"} />
            <rect x="118" y={y} width="32" height="12" rx="3" fill={i === 0 ? "#D04A02" : "#E5DED7"} />
          </g>
        ))}
        <rect x="10" y="68" width="140" height="6" rx="3" fill="#F0EBE5" />
      </svg>
    );
  }
  if (art === "exceptions") {
    return (
      <svg {...common}>
        {[
          { y: 10, w: 132, fill: "#D04A02" },
          { y: 26, w: 100, fill: "#D04A02", opacity: 0.55 },
          { y: 42, w: 70, fill: "#FBE3D4" },
          { y: 58, w: 44, fill: "#F0EBE5" },
        ].map((bar) => (
          <rect key={bar.y} x="10" y={bar.y} width={bar.w} height="11" rx="3" fill={bar.fill} opacity={"opacity" in bar ? bar.opacity : 1} />
        ))}
      </svg>
    );
  }
  // escalation: a small decision moving up past a threshold line.
  return (
    <svg {...common}>
      <line x1="10" y1="42" x2="150" y2="42" stroke="#E5DED7" strokeWidth="2" strokeDasharray="5 4" />
      <rect x="18" y="54" width="34" height="18" rx="4" fill="#F0EBE5" />
      <rect x="63" y="50" width="34" height="22" rx="4" fill="#FBE3D4" />
      <rect x="108" y="14" width="34" height="22" rx="4" fill="#D04A02" />
      <path d="M97 50 C104 40 104 40 108 30" fill="none" stroke="#D04A02" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Reader({ item }: { item: LibraryItem }) {
  return (
    <div className="mt-[12px] rounded-card border border-rule bg-white p-[18px]">
      <div className="flex items-baseline justify-between gap-[10px]">
        <h4 className="text-[15px] font-extrabold tracking-[-0.01em] text-ink">
          {item.title}
        </h4>
        <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-mute">
          walks {item.route} · {item.minutes} min read
        </span>
      </div>
      {item.sections.map((section) => (
        <div key={section.heading} className="mt-[13px]">
          <h5 className="text-[12.5px] font-extrabold text-orangeD">
            {section.heading}
          </h5>
          <p className="mt-[4px] max-w-[88ch] text-[12.5px] leading-[1.65] text-body">
            {section.body}
          </p>
        </div>
      ))}
    </div>
  );
}

function Quiz() {
  const idBase = useId();
  const [picked, setPicked] = useState<(number | null)[]>(
    QUIZ.map(() => null),
  );
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correct = QUIZ.reduce(
    (total, q, i) => total + (picked[i] === q.answer ? 1 : 0),
    0,
  );
  const passed = correct / QUIZ.length >= QUIZ_PASS_MARK;

  const submit = () => {
    if (picked.some((p) => p === null)) {
      setError("Answer every question first -- unanswered ones would grade as wrong.");
      return;
    }
    setError(null);
    setSubmitted(true);
  };

  return (
    <div className="mt-[12px] rounded-card border border-rule bg-white p-[18px]">
      <div className="flex items-baseline justify-between gap-[10px]">
        <h4 className="text-[15px] font-extrabold tracking-[-0.01em] text-ink">
          Quick knowledge check
        </h4>
        <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-mute">
          {QUIZ.length} questions · self-check, not recorded
        </span>
      </div>

      {QUIZ.map((q, qi) => {
        const chosen = picked[qi];
        return (
          <fieldset key={q.question} className="mt-[13px] border-t border-rule pt-[11px]">
            <legend className="sr-only">Question {qi + 1}</legend>
            <p className="text-[12.5px] font-extrabold leading-[1.5] text-ink">
              {qi + 1}. {q.question}
            </p>
            <div className="mt-[6px] flex flex-col gap-[4px]">
              {q.options.map((option, oi) => {
                const state = !submitted
                  ? "idle"
                  : oi === q.answer
                    ? "right"
                    : chosen === oi
                      ? "wrong"
                      : "idle";
                return (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-center gap-[8px] rounded-inner px-[9px] py-[5px] text-[12px] font-semibold leading-[1.45] ${
                      state === "right"
                        ? "bg-greenW text-green"
                        : state === "wrong"
                          ? "bg-redW text-red"
                          : "text-body hover:bg-shell"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`${idBase}-${qi}`}
                      className="accent-orange"
                      disabled={submitted}
                      checked={chosen === oi}
                      onChange={() =>
                        setPicked((prev) =>
                          prev.map((p, i) => (i === qi ? oi : p)),
                        )
                      }
                    />
                    {option}
                  </label>
                );
              })}
            </div>
            {submitted ? (
              <p className="mt-[5px] text-[11px] font-semibold leading-[1.5] text-mute">
                {q.why}
              </p>
            ) : null}
          </fieldset>
        );
      })}

      <div className="mt-[14px] flex items-center gap-[12px] border-t border-rule pt-[12px]">
        {submitted ? (
          <>
            <span
              className={`rounded-pill px-[12px] py-[5px] text-[12.5px] font-extrabold ${
                passed ? "bg-greenW text-green" : "bg-peach text-orangeD"
              }`}
            >
              {correct} / {QUIZ.length} · {passed ? "pass" : "below the 70% bar"}
            </span>
            <button
              type="button"
              onClick={() => {
                setPicked(QUIZ.map(() => null));
                setSubmitted(false);
              }}
              className="text-[12px] font-extrabold text-mute underline-offset-2 hover:underline"
            >
              Try again
            </button>
            <span className="text-[11px] font-semibold text-mute">
              Not recorded anywhere -- this checks you, not the file on you.
            </span>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={submit}
              className="rounded-pill border border-orange px-[16px] py-[7px] text-[12.5px] font-extrabold text-orangeD transition-colors duration-[120ms] hover:bg-peach"
            >
              Grade my answers
            </button>
            {error ? (
              <span className="text-[11.5px] font-bold text-red">{error}</span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function WrittenLibrary({ items }: { items: readonly LibraryItem[] }) {
  const [open, setOpen] = useState<string | null>(null);

  const openItem = items.find((item) => item.moduleId === open) ?? null;

  return (
    <div>
      <div className="grid grid-cols-4 gap-[12px] max-[1140px]:grid-cols-2 max-[720px]:grid-cols-1">
        {items.map((item) => {
          const meta = STATUS_META[item.status];
          const active = open === item.moduleId;
          return (
            <button
              key={item.moduleId}
              type="button"
              onClick={() => setOpen(active ? null : item.moduleId)}
              aria-expanded={active}
              className={`flex flex-col overflow-hidden rounded-card border bg-white text-left transition-colors duration-[120ms] ${
                active ? "border-orange" : "border-rule hover:border-rule2"
              }`}
            >
              <div className="h-[84px] w-full bg-shell">
                <TileArt art={item.art} />
              </div>
              <div className="flex flex-1 flex-col p-[12px]">
                <h3 className="text-[12.5px] font-extrabold leading-[1.35] text-ink">
                  {item.title}
                </h3>
                <div className="mt-[3px] text-[10.5px] font-bold text-mute">
                  Written module · {item.minutes} min read · walks {item.route}
                </div>
                <div className="mt-auto pt-[9px]">
                  <div className="h-[4px] w-full overflow-hidden rounded-pill bg-cream">
                    <div
                      className={`h-full rounded-pill ${meta.fill}`}
                      style={{ width: meta.width }}
                    />
                  </div>
                  <div className="mt-[4px] flex items-center justify-between text-[10px] font-bold text-mute">
                    <span>{meta.label}</span>
                    <span className="text-orangeD">{active ? "Close" : "Read"}</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setOpen(open === "quiz" ? null : "quiz")}
          aria-expanded={open === "quiz"}
          className={`flex flex-col items-center justify-center gap-[8px] rounded-card border bg-white p-[16px] text-center transition-colors duration-[120ms] ${
            open === "quiz" ? "border-orange" : "border-rule hover:border-rule2"
          }`}
        >
          <span
            aria-hidden="true"
            className="flex h-[44px] w-[44px] items-center justify-center rounded-[14px] bg-peach text-[20px] font-extrabold text-orangeD"
          >
            ?
          </span>
          <span className="text-[13px] font-extrabold text-ink">
            Quick knowledge check
          </span>
          <span className="text-[10.5px] font-bold text-mute">
            {QUIZ.length} MCQs · self-check, not recorded
          </span>
          <span className="rounded-pill border border-orange px-[14px] py-[5px] text-[11.5px] font-extrabold text-orangeD">
            {open === "quiz" ? "Close quiz" : "Start quiz"}
          </span>
        </button>
      </div>

      {openItem ? <Reader item={openItem} /> : null}
      {open === "quiz" ? <Quiz /> : null}
    </div>
  );
}

export default WrittenLibrary;
