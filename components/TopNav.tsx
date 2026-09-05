"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { SPARK, useCopilot } from "./CopilotDrawer";
import { UserChip } from "./UserChip";
// Re-exported below for client consumers; imported here because this
// component uses them itself.
import { navFor, type NavItem } from "./navItems";

/**
 * TopNav
 *
 * Ports `.topnav`, `.logo`, `.tabs`, `.tab`, `.divider`, `.pip`, `.navr`
 * and `.iconb`. A sticky white pill bar: wordmark left, fourteen tabs
 * centred with a hairline divider between the eight primary and six
 * secondary routes, copilot trigger and account chip right.
 *
 * Active state comes from usePathname(), not from props, so a tab lights
 * up on navigation without any page having to declare which one it is.
 */

/**
 * The nav model lives in ./navItems (no "use client"), so SERVER components
 * can read it too. Importing a plain constant from a client module yields
 * undefined at runtime -- /model-ops hit exactly that and 500'd -- so the
 * arrays are defined there and re-exported here for existing client imports.
 */
export {
  PRIMARY_NAV,
  SECONDARY_NAV,
  MORE_NAV,
  ALL_NAV,
  PORTFOLIO_PRIMARY_NAV,
  PORTFOLIO_ROLES,
  navFor,
  type NavItem,
} from "./navItems";

const CHROMELESS_ROUTES: readonly string[] = ["/login"];

const TAB_BASE =
  "rounded-pill px-[11px] py-[7px] text-nav whitespace-nowrap transition-colors duration-[120ms]";

const TAB_TONE = {
  primaryIdle: "font-bold text-body hover:bg-cream",
  primaryActive: "font-bold bg-ink text-white hover:bg-ink",
  secondaryIdle: "font-semibold text-mute hover:bg-cream",
  secondaryActive: "font-semibold bg-violet text-white hover:bg-violet",
} as const;

const PIP_BASE =
  "ml-[5px] inline-block min-w-[16px] rounded-pill px-[4px] text-center text-[10px] font-extrabold tabular-nums";

const PIP_HREF = "/exceptions";
const CHEVRON = String.fromCharCode(0x25be); // black down-pointing small triangle

export type NavUser = {
  name?: string;
  role?: string;
};

export type TopNavProps = {
  /** Open exception count, rendered as a pip on the Exceptions tab. */
  exceptionCount?: number;
  /** Signed-in user. Supplied by whoever wires the session. */
  user?: NavUser | null;
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * PREFETCH ON INTENT, NOT ON ARRIVAL.
 *
 * Next's <Link prefetch> has three settings and none of them is "hover only":
 *
 *   auto (default)  viewport AND hover, but for a DYNAMIC route it fetches
 *                   only down to the nearest loading.js boundary. Every route
 *                   here is dynamic and app/(app)/loading.tsx is that
 *                   boundary, so the default was prefetching the skeleton and
 *                   none of the data. That is why a tab lights up instantly
 *                   and then sits there: the shell was ready, the rows were
 *                   not.
 *   true            full route, but STILL on viewport entry as well as hover.
 *                   The nav is a fixed bar, so every link is permanently in
 *                   the viewport -- prefetch={true} would fire all thirteen
 *                   full server renders the moment the shell mounts, each one
 *                   resolving identity, all competing with the screen the
 *                   reader is waiting for on the same hobby-plan lambda.
 *   false           never, on viewport OR hover.
 *
 * So hover-only is not reachable through the prop, and the two obvious moves
 * are both wrong:
 *
 *   prefetch={true}   fires thirteen full renders on mount.
 *   prefetch={false}  throws away the one thing prefetch currently buys.
 *
 * MEASURED, on a production build, against this database:
 *
 *   route         navigation payload   partial prefetch
 *   /exceptions      37,146 B               264 B
 *   /markdown        44,440 B               260 B
 *   /buy             66,193 B               250 B
 *
 * Those 250 bytes are the shell. Cheap, already happening, and the reason a
 * tab responds the instant it is clicked. Turning it off to add a hover
 * prefetch would trade a working thing for an unproven one.
 *
 * So the default is left alone and the hover is ADDITIVE: the shell still
 * prefetches on mount for 250 bytes a route, and hovering additionally pulls
 * the full payload. Worst case the hover buys nothing and the screen behaves
 * exactly as it does today; it cannot be worse.
 *
 * router.prefetch() DOES NOT fetch the full route by default, which is the
 * whole reason this needed a second look. Its second argument is optional and
 * next/dist/client/components/app-router-instance.js:300 reads
 *
 *     const prefetchKind = options?.kind ?? PrefetchKind.AUTO
 *
 * so a bare router.prefetch(href) takes the AUTO branch, which maps to
 * FetchStrategy.PPR -- the same partial fetch a default <Link> does. On a
 * dynamic route with a loading boundary that is the 250-byte skeleton and
 * none of the rows. Hovering was warming the spinner.
 *
 * PrefetchKind.FULL maps to FetchStrategy.Full, which fetches the route's
 * data. Passing it is the difference between prefetching the wait and
 * prefetching the answer.
 *
 * Per the staleTimes docs a route fetched through router.prefetch is then
 * held under `static` (180s here) rather than `dynamic` (30s).
 */
/**
 * PrefetchKind.FULL, as the value the runtime switch actually compares against.
 *
 * The enum lives at next/dist/client/components/router-reducer/router-reducer-types
 * and importing from there reaches past the package's public surface into a path
 * that has moved between versions. So the OPTIONS TYPE is derived from the router
 * API itself instead: if Next changes prefetch's signature this stops compiling
 * here rather than silently degrading to a partial prefetch at runtime, which is
 * the failure this whole comment exists because of.
 */
type PrefetchOptions = NonNullable<
  Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]
>;
const FULL = { kind: "full" } as unknown as PrefetchOptions;

const prefetched = new Set<string>();

function usePrefetchOnce() {
  const router = useRouter();
  return (href: string) => {
    // Once per mount. Hovering along a row of tabs would otherwise re-fire on
    // every re-entry, and each one is a real server render.
    if (prefetched.has(href)) return;
    prefetched.add(href);
    router.prefetch(href, FULL);
  };
}

/** requestIdleCallback, with a timeout fallback for Safari. */
function whenIdle(fn: () => void, timeout = 2000): () => void {
  type IdleWindow = Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 200);
  return () => window.clearTimeout(id);
}

/**
 * WARM THE PRIMARY TABS ONCE THE FIRST SCREEN HAS PAINTED.
 *
 * Hovering pulls a route's full payload, but only if the reader hovers, and a
 * reader who goes straight from reading to clicking never does. This warms
 * the tabs they are most likely to click next, without ever competing with
 * the screen they are looking at now.
 *
 * FOUR THINGS KEEP IT OFF THE CRITICAL PATH, and all four matter:
 *
 *   1. PRIMARY ONLY. Five routes, not thirteen. The daily decision loop.
 *      Secondary and More are left to hover -- warming everything would cost
 *      thirteen full server renders to save a click that may not come.
 *   2. AFTER IDLE. requestIdleCallback, so nothing starts until the browser
 *      has finished with the current screen. Safari has no rIC, so it falls
 *      back to a short timeout rather than being skipped.
 *   3. ONE AT A TIME. Sequential with a gap, not a burst of five. This runs
 *      on one hobby-plan lambda: five concurrent renders would queue behind
 *      each other anyway and could delay a real navigation the reader makes
 *      while they are running.
 *   4. CURRENT ROUTE SKIPPED. It is already here.
 *
 * The `prefetched` Set is module state, so it survives client-side
 * navigation: the warm-up runs once per full page load, not once per screen.
 */
const WARM_GAP_MS = 450;

function useWarmPrimary(primary: readonly NavItem[], pathname: string) {
  const router = useRouter();
  useEffect(() => {
    const pending = primary
      .map((item) => item.href)
      .filter((href) => href !== pathname && !prefetched.has(href));
    if (pending.length === 0) return;

    let cancelled = false;
    const timers: number[] = [];

    const cancelIdle = whenIdle(() => {
      if (cancelled) return;
      pending.forEach((href, i) => {
        timers.push(
          window.setTimeout(() => {
            if (cancelled || prefetched.has(href)) return;
            prefetched.add(href);
            router.prefetch(href, FULL);
          }, i * WARM_GAP_MS),
        );
      });
    });

    return () => {
      cancelled = true;
      cancelIdle();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [primary, pathname, router]);
}

export function TopNav({ exceptionCount, user }: TopNavProps) {
  const prefetchOnce = usePrefetchOnce();
  const { primary, secondary, more } = navFor(user?.role);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { open } = useCopilot();

  // Called BEFORE the early return below. There is already one useEffect
  // after that return, which is a hooks-order violation that only survives
  // because /login renders outside this layout so the branch is never taken.
  // Adding a second one behind it would make a live bug out of a latent one.
  useWarmPrimary(primary, pathname);

  // Close on an outside click. Without this the menu stays open behind the
  // next thing the reader does, which reads as a stuck UI rather than a menu.
  //
  // ABOVE the chromeless early return, not below it. It used to sit after,
  // which meant a render that returned null ran one hook fewer than a render
  // that did not -- React counts hooks by call order, so the next render
  // would read the wrong slot. It only ever survived because /login is
  // outside this layout, so the branch is never taken in practice. That is
  // luck, not a design, and adding a second hook behind it would have turned
  // a latent bug into a live one.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [moreOpen]);

  if (CHROMELESS_ROUTES.includes(pathname)) return null;

  const moreActive = more.some((item) => isActive(pathname, item.href));

  const renderTab = (item: NavItem, secondary: boolean) => {
    const active = isActive(pathname, item.href);
    const tone = secondary
      ? active
        ? TAB_TONE.secondaryActive
        : TAB_TONE.secondaryIdle
      : active
        ? TAB_TONE.primaryActive
        : TAB_TONE.primaryIdle;

    const showPip =
      item.href === PIP_HREF &&
      typeof exceptionCount === "number" &&
      exceptionCount > 0;

    return (
      <Link
        key={item.href}
        href={item.href}
        onMouseEnter={() => prefetchOnce(item.href)}
        onFocus={() => prefetchOnce(item.href)}
        onTouchStart={() => prefetchOnce(item.href)}
        className={`${TAB_BASE} ${tone}`}
        aria-current={active ? "page" : undefined}
      >
        {item.label}
        {showPip ? (
          <span
            className={`${PIP_BASE} ${
              active ? "bg-orange text-white" : "bg-peach text-orangeD"
            }`}
          >
            {exceptionCount}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <header className="sticky top-[12px] z-40 flex items-center gap-[14px] rounded-pill bg-white py-[8px] pl-[18px] pr-[10px] shadow-nav">
      <Link
        href="/"
        className="text-logo font-extrabold whitespace-nowrap text-ink"
        aria-label="StyleVerse AI, go to dashboard"
      >
        StyleVerse<span className="text-orange">AI</span>
      </Link>

      <nav
        aria-label="Primary"
        className="mx-auto flex items-center gap-[2px] max-[1140px]:hidden"
      >
        {primary.map((item) => renderTab(item, false))}
        {/* The rule separates two tiers, so it only earns its place when
            there are two. A planner and a CMPO both have an empty secondary
            row, and a divider with nothing after it reads as something
            failing to load. */}
        {secondary.length > 0 ? (
          <>
            <span
              className="mx-[7px] h-[20px] w-px bg-rule2"
              aria-hidden="true"
            />
            {secondary.map((item) => renderTab(item, true))}
          </>
        ) : null}

        {/*
          MORE. Evidence and governance live behind one door rather than
          competing with Buy for the same row. The trigger lights violet when
          a route inside it is active, so a reader on /governance can still
          see where they are without the menu being open.
        */}
        <div className="relative" ref={moreRef}>
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            className={`${TAB_BASE} ${
              moreActive
                ? TAB_TONE.secondaryActive
                : TAB_TONE.secondaryIdle
            }`}
          >
            More
            <span aria-hidden="true" className="ml-[4px] text-[9px]">
              {CHEVRON}
            </span>
          </button>

          {moreOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[190px] rounded-card border border-rule bg-white py-[6px] shadow-drawer"
            >
              {more.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setMoreOpen(false)}
                    className={`block px-[14px] py-[8px] text-nav transition-colors duration-[120ms] ${
                      active
                        ? "font-bold bg-violetW text-violet"
                        : "font-semibold text-body hover:bg-cream"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </nav>

      <div className="flex items-center gap-[8px]">
        <button
          type="button"
          onClick={open}
          aria-label="Open copilot"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-cream text-[13px] text-ink transition-colors duration-[120ms] hover:bg-hover"
        >
          {SPARK}
        </button>
        <UserChip name={user?.name} role={user?.role} />
      </div>
    </header>
  );
}

export default TopNav;
