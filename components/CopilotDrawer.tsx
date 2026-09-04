"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { buttonClasses } from "./Button";

/**
 * CopilotProvider / CopilotDrawer / useCopilot
 *
 * Ports `.scrim`, `.drawer`, `.dh`, `.spark`, `.db`, `.lbl`, `.prompts` and
 * `.df` from the production design system: a 400px right drawer with a
 * 22px left radius that slides in over a 25% ink scrim.
 *
 * The drawer has exactly three triggers -- the TopNav icon button, every
 * PageHeader "Ask StyleVerse" button, and Cmd/Ctrl-K -- and they all drive
 * one instance. That is what the context is for: CopilotProvider owns the
 * single open/closed boolean and mounts the drawer once, so no trigger
 * needs to know the others exist.
 *
 * It calls /api/copilot, which retrieves rows under the caller's OWN RLS
 * scope BEFORE any model call, and lists the tables it read beneath every
 * answer so the reply can be checked rather than trusted.
 */

/** Glyphs as char codes so the source stays plain ASCII. */
export const SPARK = String.fromCharCode(0x2726); // black four pointed star
const CLOSE_GLYPH = String.fromCharCode(0x2715); // multiplication x
const ELLIPSIS = String.fromCharCode(0x2026); // horizontal ellipsis

export type CopilotContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const CopilotContext = createContext<CopilotContextValue | null>(null);

/** Shared handle on the one drawer. Throws outside <CopilotProvider>. */
export function useCopilot(): CopilotContextValue {
  const value = useContext(CopilotContext);
  if (value === null) {
    throw new Error("useCopilot must be used inside <CopilotProvider>.");
  }
  return value;
}

export const SUGGESTED_PROMPTS: readonly string[] = [
  "Why is the model cutting the Tops marketplace buy?",
  "Which regions are at stockout risk this week?",
  "What did the agents do overnight?",
  "Is our accuracy real or just beating a weak baseline?",
];

const SCRIM_BASE =
  "fixed inset-0 z-[60] bg-[rgba(35,31,28,.25)] transition-opacity duration-[160ms]";

const DRAWER_BASE =
  "fixed inset-y-0 right-0 z-[70] flex w-[min(400px,94vw)] flex-col rounded-l-card bg-white shadow-drawer transition-transform duration-[220ms] ease-[cubic-bezier(.32,.72,0,1)]";

const PROMPT_CLASS =
  "rounded-quote bg-cream px-[14px] py-[10px] text-left text-copy font-semibold text-ink transition-colors duration-[120ms] hover:bg-peach";

/**
 * The scrim and drawer themselves. Mounted once by CopilotProvider --
 * do not render a second copy.
 */
type Attempt = {
  provider: string;
  model: string;
  ok: boolean;
  status?: number;
  reason?: string;
};

type Turn = {
  question: string;
  answer: string;
  sources: string[];
  provider: string | null;
  model: string | null;
  attempts: Attempt[];
  route: string | null;
  latencyMs: number | null;
  dropped: number;
  noData: boolean;
  streaming: boolean;
};

/**
 * The sources panel.
 *
 * VISIBLE RETRIEVAL IS THE CREDIBILITY OF THE FEATURE. An assistant that
 * states a number and shows nothing is asking to be trusted; one that names
 * the tables it read, under your own scope, can be checked instead. The
 * serving provider is shown for the same reason -- it demonstrates that the
 * failover happened rather than claiming a chain exists.
 */
function Sources({ turn }: { turn: Turn }) {
  if (turn.sources.length === 0 && turn.provider === null && turn.dropped === 0) {
    return null;
  }
  const fellThrough = turn.attempts.filter((a) => !a.ok);

  return (
    <div className="mt-[10px] rounded-quote bg-cream px-[12px] py-[10px]">
      <div className="text-micro font-extrabold text-mute">SOURCES</div>

      {turn.sources.length > 0 ? (
        <div className="mt-[5px] flex flex-wrap gap-[5px]">
          {turn.sources.map((table) => (
            <code
              key={table}
              className="rounded-pill bg-white px-[8px] py-[2px] text-[10.5px] font-bold text-ink"
            >
              {table}
            </code>
          ))}
        </div>
      ) : (
        <div className="mt-[5px] text-[10.5px] font-semibold text-mute">
          Nothing readable in your scope, so no model was called.
        </div>
      )}

      <div className="mt-[7px] text-[10.5px] font-semibold leading-[1.55] text-mute">
        {turn.provider !== null ? (
          <>
            Served by <b className="text-ink">{turn.provider}</b>
            {turn.model ? " (" + turn.model + ")" : null}
            {turn.latencyMs !== null ? " in " + turn.latencyMs + " ms" : null}.
          </>
        ) : (
          <>Answered without a model call.</>
        )}
        {fellThrough.length > 0 ? (
          <>
            {" "}
            Fell through {fellThrough.map((a) => a.provider).join(", ")}
            {fellThrough[0] && fellThrough[0].reason
              ? " (" + fellThrough[0].reason + ")"
              : null}
            .
          </>
        ) : null}
      </div>

      {turn.dropped > 0 ? (
        <div className="mt-[6px] text-[10.5px] font-semibold leading-[1.55] text-amber">
          {turn.dropped} {turn.dropped === 1 ? "sentence was" : "sentences were"}{" "}
          withheld for stating figures that are not in these rows.
        </div>
      ) : null}

      {turn.route !== null ? (
        <a
          href={turn.route}
          className="mt-[8px] inline-block rounded-pill bg-orange px-[11px] py-[4px] text-[11px] font-extrabold text-white"
        >
          Open {turn.route}
        </a>
      ) : null}
    </div>
  );
}

/**
 * The scrim and drawer themselves. Mounted once by CopilotProvider --
 * do not render a second copy.
 */
export function CopilotDrawer() {
  const { isOpen, close } = useCopilot();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  // Focus the input on open and hold the page still behind the scrim.
  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (trimmed === "" || busy) return;

      setDraft("");
      setBusy(true);
      setTurns((prev) => [
        ...prev,
        {
          question: trimmed,
          answer: "",
          sources: [],
          provider: null,
          model: null,
          attempts: [],
          route: null,
          latencyMs: null,
          dropped: 0,
          noData: false,
          streaming: true,
        },
      ]);

      const patch = (fn: (turn: Turn) => Turn) =>
        setTurns((prev) =>
          prev.map((turn, i) => (i === prev.length - 1 ? fn(turn) : turn)),
        );

      try {
        const res = await fetch("/api/copilot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });

        if (!res.ok || res.body === null) {
          patch((turn) => ({
            ...turn,
            answer:
              "The copilot is unavailable right now. Everything it would tell you is on the screens themselves, which are unaffected.",
            streaming: false,
          }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          for (;;) {
            const split = buffer.indexOf("\n\n");
            if (split === -1) break;
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);

            const lines = frame.split("\n");
            const eventLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (eventLine === undefined || dataLine === undefined) continue;

            const event = eventLine.slice(6).trim();
            let payload: Record<string, unknown>;
            try {
              payload = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
            } catch {
              continue;
            }

            if (event === "meta") {
              patch((turn) => ({
                ...turn,
                sources: (payload.sources as string[] | undefined) ?? [],
                provider: (payload.provider as string | null | undefined) ?? null,
                model: (payload.model as string | null | undefined) ?? null,
                attempts: (payload.attempts as Attempt[] | undefined) ?? [],
                noData: Boolean(payload.noData),
              }));
            } else if (event === "text") {
              const piece = String(payload.text ?? "");
              patch((turn) => ({ ...turn, answer: turn.answer + piece }));
            } else if (event === "done") {
              patch((turn) => ({
                ...turn,
                route: (payload.route as string | null | undefined) ?? null,
                latencyMs: (payload.latencyMs as number | null | undefined) ?? null,
                dropped: Number(payload.dropped ?? 0),
                streaming: false,
              }));
            }
          }
        }
      } catch {
        patch((turn) => ({
          ...turn,
          answer:
            turn.answer !== ""
              ? turn.answer
              : "The copilot could not be reached. The screens are unaffected.",
          streaming: false,
        }));
      } finally {
        patch((turn) => ({ ...turn, streaming: false }));
        setBusy(false);
      }
    },
    [busy],
  );

  return (
    <>
      <div
        className={`${SCRIM_BASE} ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={close}
        aria-hidden="true"
      />

      <aside
        className={`${DRAWER_BASE} ${isOpen ? "translate-x-0" : "translate-x-[105%]"}`}
        role="dialog"
        aria-modal="true"
        aria-label="StyleVerse Copilot"
        inert={!isOpen}
      >
        <header className="flex items-center justify-between border-b border-rule px-[18px] py-[16px]">
          <div className="flex items-center gap-[9px]">
            <span
              className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-orange text-[14px] text-white"
              aria-hidden="true"
            >
              {SPARK}
            </span>
            <div>
              <div className="text-[13.5px] font-extrabold text-ink">
                StyleVerse Copilot
              </div>
              <div className="text-[10.5px] font-semibold text-mute">
                Reads your data before it answers
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close copilot"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-cream text-[13px] text-ink transition-colors duration-[120ms] hover:bg-hover"
          >
            {CLOSE_GLYPH}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-[18px] py-[16px]">
          {turns.length === 0 ? (
            <>
              <div className="mb-[8px] text-micro font-extrabold text-mute">
                SUGGESTED PROMPTS
              </div>
              <div className="mb-[18px] flex flex-col gap-[8px]">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className={PROMPT_CLASS}
                    onClick={() => void ask(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <p className="text-small font-semibold leading-[1.6] text-mute">
                Every answer is built from rows your own account can read, retrieved
                before the model is called. The tables used are listed under each
                reply, so you can check it rather than take it on trust.
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-[16px]">
              {turns.map((turn, i) => (
                <div key={i}>
                  <div className="mb-[6px] text-copy font-extrabold text-ink">
                    {turn.question}
                  </div>
                  <div className="whitespace-pre-wrap text-copy leading-[1.6] text-body">
                    {turn.answer}
                    {turn.streaming && turn.answer === "" ? (
                      <span className="text-mute">Reading your data{ELLIPSIS}</span>
                    ) : null}
                  </div>
                  {turn.streaming ? null : <Sources turn={turn} />}
                </div>
              ))}
            </div>
          )}
        </div>

        <form
          className="flex gap-[8px] border-t border-rule px-[18px] py-[14px]"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(draft);
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Ask about demand, risk, agents, models${ELLIPSIS}`}
            aria-label="Ask StyleVerse"
            className="h-[38px] flex-1 rounded-pill border border-rule2 bg-shell px-[15px] text-copy text-ink outline-none placeholder:text-mute focus:border-orange focus:bg-white"
          />
          <button
            type="submit"
            disabled={draft.trim() === "" || busy}
            className={buttonClasses("orange", "md", "disabled:opacity-40")}
          >
            {busy ? ELLIPSIS : "Ask"}
          </button>
        </form>
      </aside>
    </>
  );
}

export type CopilotProviderProps = {
  children?: ReactNode;
};

/**
 * Owns the single open/closed state, binds Cmd/Ctrl-K and Escape globally,
 * and mounts the drawer once. Wrap the whole app in it.
 */
export function CopilotProvider({ children }: CopilotProviderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((value) => !value), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<CopilotContextValue>(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle],
  );

  return (
    <CopilotContext.Provider value={value}>
      {children}
      <CopilotDrawer />
    </CopilotContext.Provider>
  );
}

export default CopilotProvider;
