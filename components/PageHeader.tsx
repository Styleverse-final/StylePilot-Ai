"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { SPARK, useCopilot } from "./CopilotDrawer";
import { Kpi, KpiRow } from "./KpiRow";
import { Pill, type PillVariant } from "./Pill";

/**
 * PageHeader
 *
 * Ports `.phead`, `.eyebrow`, `.phead h1`, `.askbtn`, `.sp` and `.kbd`:
 * eyebrow over a 26px title, an inline KPI row, then the "Ask StyleVerse"
 * button pushed right by margin-left:auto.
 *
 * The Ask button is one of the three copilot triggers and shares its state
 * with the others through useCopilot(), so every screen's button opens the
 * same drawer instance.
 */

const COMMAND_GLYPH = String.fromCharCode(0x2318); // place of interest sign

/**
 * The KPI pill tones. An alias of the design system's PillVariant rather
 * than a parallel union, so the two can never drift apart.
 */
export type PillTone = PillVariant;

export type KpiItem = {
  /** Small muted label, e.g. "Forecast accuracy". */
  label: string;
  /** Pre-formatted display value, e.g. "82.3%". Rendered tabular. */
  value: string;
  /** Optional trailing pill, e.g. "+4.6 vs naive". */
  pill?: string;
  /** Pill tone. Defaults to grey. */
  tone?: PillTone;
};

export type PageHeaderProps = {
  /** 11.5px muted line above the title. */
  eyebrow: string;
  /**
   * 26px page title. A node rather than a string because the dashboard's
   * title is the animated greeting; every other screen still passes text.
   */
  title: ReactNode;
  /** Inline KPI row, between the title and the Ask button. */
  kpis?: readonly KpiItem[];
  /** Extra header controls, placed after the KPIs and before the Ask button. */
  children?: ReactNode;
};

const ASK_CLASS =
  "ml-auto flex h-[38px] items-center gap-[8px] rounded-pill bg-white px-[16px] text-copy font-bold text-ink shadow-raised transition-colors duration-[120ms] hover:bg-peach";

const MAC_SHORTCUT = `${COMMAND_GLYPH}K`;
const PC_SHORTCUT = "Ctrl K";

/** The platform is not a store, so there is nothing to subscribe to. */
const subscribeToNothing = () => () => {};

const readShortcut = (): string =>
  /mac|iphone|ipad|ipod/i.test(navigator.userAgent) ? MAC_SHORTCUT : PC_SHORTCUT;

/**
 * "Cmd K" on Apple platforms, "Ctrl K" everywhere else.
 *
 * useSyncExternalStore rather than an effect: the server snapshot is what
 * hydration matches against, and React swaps in the client snapshot once
 * hydrated. No mismatch, and no setState cascading out of an effect.
 */
export function useShortcutLabel(): string {
  return useSyncExternalStore(
    subscribeToNothing,
    readShortcut,
    () => MAC_SHORTCUT,
  );
}

export function PageHeader({ eyebrow, title, kpis, children }: PageHeaderProps) {
  const { open } = useCopilot();
  const shortcut = useShortcutLabel();

  return (
    <div className="flex flex-wrap items-center gap-[26px] px-[8px] pb-[18px] pt-[22px]">
      <div className="min-w-[240px]">
        <div className="text-small font-bold text-mute">{eyebrow}</div>
        <h1 className="mt-[2px] text-h1 font-extrabold text-ink">{title}</h1>
      </div>

      {kpis && kpis.length > 0 ? (
        <KpiRow>
          {kpis.map((kpi) => (
            <Kpi
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              pill={
                kpi.pill ? (
                  <Pill variant={kpi.tone ?? "grey"}>{kpi.pill}</Pill>
                ) : undefined
              }
            />
          ))}
        </KpiRow>
      ) : null}

      {children}

      <button type="button" onClick={open} className={ASK_CLASS}>
        <span
          className="inline-flex h-[20px] w-[20px] flex-none items-center justify-center rounded-full bg-orange text-[11px] text-white"
          aria-hidden="true"
        >
          {SPARK}
        </span>
        Ask StyleVerse
        <span className="rounded-[5px] bg-cream px-[5px] py-[2px] text-[10px] font-extrabold text-mute">
          {shortcut}
        </span>
      </button>
    </div>
  );
}

export default PageHeader;
