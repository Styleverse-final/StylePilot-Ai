"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * The dashboard greeting: the reader's name, then the time-of-day greeting.
 *
 * WHY THIS IS A CLIENT COMPONENT WHEN EVERYTHING ELSE HERE IS NOT.
 *
 * The greeting depends on the reader's LOCAL time, and a server has no
 * reliable way to know it. Rendering "Good morning" from the server clock
 * would be right for a reader in the same timezone and wrong for everyone
 * else, silently. So the hour is read in the browser.
 *
 * That constraint and the requested animation happen to want the same shape,
 * which is why this is not a compromise:
 *
 *   the server renders the NAME, which needs no clock and is therefore
 *   identical on both sides of hydration -- no mismatch, no flash of wrong
 *   content, and the name is on screen in the first paint;
 *
 *   the browser then computes the hour and swaps in the greeting.
 *
 * Step one of the animation IS the hydration boundary, used honestly rather
 * than papered over with suppressHydrationWarning.
 *
 * The name comes from the session, resolved by current_planner() under row
 * level security. Nothing is hardcoded and nothing is passed in from the URL.
 */

/** How long the name holds before the greeting replaces it. */
const NAME_HOLD_MS = 1200;

/**
 * Morning before noon, afternoon to 17:00, evening after.
 *
 * Hour boundaries are taken from the boundaries as stated, not smoothed:
 * 12:00 is afternoon and 17:00 is evening.
 */
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

/**
 * useSyncExternalStore rather than an effect, matching useShortcutLabel in
 * PageHeader: the server snapshot is what hydration matches against, and
 * React swaps in the client value once hydrated. An effect would set state
 * during commit and cascade a second render.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

export type GreetingProps = {
  /** The reader's own name, from the session. Never a default. */
  name: string;
};

export function Greeting({ name }: GreetingProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    const reveal = () => setGreeting(greetingFor(new Date().getHours()));

    // With reduced motion there is no transition to stage, so holding the
    // name back for a beat would be a delay that buys the reader nothing.
    if (reducedMotion) {
      reveal();
      return;
    }

    const timer = window.setTimeout(reveal, NAME_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  // The key changes when the greeting arrives, so React replaces the node and
  // the entry animation plays a second time. Without it the text would swap
  // in place with no transition.
  return (
    <span key={greeting ?? "name"} className="sv-greet-in inline-block">
      {greeting === null ? name : `${greeting}, ${name}`}
    </span>
  );
}

export default Greeting;
