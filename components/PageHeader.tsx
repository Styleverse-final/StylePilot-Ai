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
  /** The 11.5px line under the value: what the number is measured over. */
  hint?: string;
  /** Where the number is explained -- "#panel-id", or a route. */
  href?: string;
  /** Accessible name for that link. Defaults to the label. */
  linkLabel?: string;
};

export type PageHeaderProps = {
  /**
   * 11.5px muted line above the title. Optional: the command centre moves
   * its generated-at stamp into `aside` as a dated card, and a screen that
   * does that has nothing left to put here.
   */
  eyebrow?: string;
  /**
   * 26px page title. A node rather than a string because the dashboard's
   * title is the animated greeting; every other screen still passes text.
   */
  title: ReactNode;
  /**
   * Small letterspaced line under the title. The command centre uses it for
   * the one-line statement of what the screen is for; nothing else does.
   */
  strapline?: ReactNode;
  /**
   * A sentence under the title, in sentence case rather than the strapline's
   * uppercase micro. The buy plan uses it to say what the screen is for in
   * words a planner would say out loud; `strapline` is the letterspaced
   * three-word form and the two are alternatives, not a pair.
   */
  tagline?: ReactNode;
  /**
   * A micro uppercase line UNDER the right-hand group, beneath the Ask
   * button. Three words naming what the screen moves, in the same register
   * as the footer rail at the other end of the page.
   */
  rail?: ReactNode;
  /** Inline KPI row, between the title and the Ask button. */
  kpis?: readonly KpiItem[];
  /** Right-hand slot, before the Ask button. A dated card, a switcher. */
  aside?: ReactNode;
  /**
   * A full-width row UNDER the title row, for content too tall to sit beside
   * a heading -- the command centre's four KPI cards. Passing `kpis` and
   * `band` together is legal but rarely what you want: the band is the
   * alternative to the inline row, not an addition to it.
   */
  band?: ReactNode;
  /** Extra header controls, placed after the KPIs and before the Ask button. */
  children?: ReactNode;
};

const ASK_CLASS =
  "flex h-[38px] items-center gap-[8px] rounded-pill bg-white px-[16px] text-copy font-bold text-ink shadow-raised transition-colors duration-[120ms] hover:bg-peach";

const MAC_SHORTCUT = `${COMMAND_GLYPH}K`;
const PC_SHORTCUT = "Ctrl K";

/** The platform is not a store, so there is nothing to subscribe to. */
const subscribeToNothing = () => () => {};

const readShortcut = (): string =>
  /mac|iphone|ipad|ipod/i.test(navigator.userAgent)
    ? MAC_SHORTCUT
    : PC_SHORTCUT;

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

export function PageHeader({
  eyebrow,
  title,
  strapline,
  tagline,
  rail,
  kpis,
  aside,
  band,
  children,
}: PageHeaderProps) {
  const { open } = useCopilot();
  const shortcut = useShortcutLabel();

  // The rule after the title separates who/where from how-much. It is drawn
  // whenever anything follows the title, because `children` is how the
  // dashboard passes its own KpiRow -- keying it off `kpis` alone would have
  // left the one screen with four header numbers without the divide.
  const hasMetrics =
    (kpis !== undefined && kpis.length > 0) || children !== undefined;

  return (
    <header className="px-[8px] pb-[18px] pt-[22px]">
      <div className="flex flex-wrap items-center gap-x-[22px] gap-y-[14px]">
        <div className="min-w-[240px]">
          {eyebrow === undefined ? null : (
            <div className="text-small font-bold text-mute">{eyebrow}</div>
          )}
          <h1 className="mt-[2px] text-h1 font-extrabold text-ink">{title}</h1>
          {strapline === undefined ? null : (
            <div className="mt-[5px] text-micro font-extrabold uppercase text-mute">
              {strapline}
            </div>
          )}
          {tagline === undefined ? null : (
            <div className="mt-[6px] text-copy font-semibold text-body">
              {tagline}
            </div>
          )}
        </div>

        {hasMetrics ? (
          <div
            aria-hidden="true"
            className="h-[36px] w-px shrink-0 bg-rule2 max-[1140px]:hidden"
          />
        ) : null}

        {kpis && kpis.length > 0 ? (
          <KpiRow>
            {kpis.map((kpi) => (
              <Kpi
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                hint={kpi.hint}
                href={kpi.href}
                linkLabel={kpi.linkLabel}
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

        {/* Right-hand group: the dated card, then Ask. One `ml-auto` between
            them, on the group, so the two travel together instead of being
            pushed apart by a second one. */}
        <div className="ml-auto flex flex-col items-end gap-[7px]">
          <div className="flex items-center gap-[10px]">
            {aside}

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

          {rail === undefined ? null : (
            <div className="text-micro font-extrabold uppercase text-mute">
              {rail}
            </div>
          )}
        </div>
      </div>

      {band === undefined ? null : <div className="mt-[16px]">{band}</div>}
    </header>
  );
}

export default PageHeader;
