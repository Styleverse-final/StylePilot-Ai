"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * The sign-in intro: "Good morning, Ava", the reader's role and company, then
 * out of the way.
 *
 * WHY IT IS AN OVERLAY AND NOT A ROUTE.
 *
 * A welcome ROUTE would mean a real navigation, and a navigation to a screen
 * that shows nothing but a name is a blank wait with a greeting painted on
 * it -- the reader would pay a full server round trip before their data even
 * started loading. This renders on top of the screen they asked for, which is
 * fetching and rendering underneath the whole time. When the layer leaves,
 * the app is already there. That is the "no blank loading screen between the
 * greeting and prototype" requirement, and it is the reason for the shape.
 *
 * SHOWN ONCE PER LOAD, NOT ONCE PER SCREEN.
 *
 * This lives in the (app) layout, and a Next layout is not re-rendered on
 * client-side navigation -- it persists across tab switches. So the component
 * mounts once when the app is entered and never again while the reader moves
 * around. No sessionStorage flag is needed to prevent it replaying on every
 * tab, and none is used: a flag would have introduced either a hydration
 * mismatch or a frame of dashboard before the layer appeared.
 *
 * THE CLOCK IS THE READER'S.
 *
 * The hour comes from the browser, so the greeting is right wherever they
 * are. That is also why the greeting text is not rendered on the server: it
 * would be the Mumbai clock, correct for some readers and quietly wrong for
 * the rest. The layer paints with the name, which needs no clock, and the
 * word in front of it arrives on the first client frame.
 */

/** Total time on screen before the layer starts leaving. */
const HOLD_MS = 700;
/** Length of the fade-out, matched to the CSS below. */
const EXIT_MS = 320;

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Nothing to subscribe to: neither value changes during a 0.7s intro. */
const subscribeToNothing = () => () => {};

/**
 * The greeting word, from the READER'S clock.
 *
 * useSyncExternalStore rather than setState-in-an-effect, matching
 * useShortcutLabel in PageHeader. The server snapshot is null -- a server has
 * no business guessing a timezone -- so the layer paints with the name and
 * the word arrives on the first client frame. getSnapshot returns the same
 * string on every call within the hour, which is the stability the hook
 * requires.
 */
function useGreetingWord(): string | null {
  return useSyncExternalStore(
    subscribeToNothing,
    () => greetingFor(new Date().getHours()),
    () => null,
  );
}

/**
 * useSyncExternalStore rather than an effect, matching useShortcutLabel in
 * PageHeader: the server snapshot is what hydration matches against and React
 * swaps in the client value once hydrated.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

export type WelcomeOverlayProps = {
  /** Full name from the session. The greeting uses the first word of it. */
  name: string;
  /** Job title, e.g. "Merchandise Planner". Omitted when unreadable. */
  role: string | null;
  /** Company, e.g. "SpeedStyle". Omitted when unreadable. */
  company: string | null;
};

export function WelcomeOverlay({ name, role, company }: WelcomeOverlayProps) {
  const reducedMotion = usePrefersReducedMotion();
  const greeting = useGreetingWord();
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Nothing to stage when motion is switched off; the early return below
    // takes the layer out entirely rather than holding a static panel over
    // the app for a beat that buys the reader nothing.
    if (reducedMotion) return;
    const out = window.setTimeout(() => setLeaving(true), HOLD_MS);
    const end = window.setTimeout(() => setGone(true), HOLD_MS + EXIT_MS);
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(end);
    };
  }, [reducedMotion]);

  if (gone || reducedMotion) return null;

  const firstName = name.trim().split(/\s+/)[0] || name.trim();
  const line = [role, company].filter(Boolean).join(` ${String.fromCharCode(0x00b7)} `);

  return (
    <div
      // aria-hidden: the screen underneath is the real content and is already
      // announced. A screen reader should not be made to sit through a
      // decorative panel that removes itself in under a second.
      aria-hidden="true"
      className={`sv-welcome fixed inset-0 z-[100] flex flex-col items-center justify-center bg-cream ${
        leaving ? "sv-welcome-out" : ""
      }`}
    >
      <div className="sv-welcome-line px-[24px] text-center text-[clamp(28px,5vw,46px)] font-extrabold leading-[1.15] tracking-[-0.01em] text-ink">
        {greeting === null ? firstName : `${greeting}, ${firstName}`}
      </div>
      {line ? (
        <div className="sv-welcome-sub mt-[12px] px-[24px] text-center text-[clamp(12px,1.6vw,15px)] font-bold text-mute">
          {line}
        </div>
      ) : null}
    </div>
  );
}

export default WelcomeOverlay;
