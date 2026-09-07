"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  // Aliased: the DOM's own KeyboardEvent is used by the document-level
  // listeners below, and React's synthetic one by the menu handler. Same
  // name, different types, and shadowing one with the other is how a handler
  // ends up compiling against the wrong shape.
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { SPARK, useCopilot } from "./CopilotDrawer";
import { LogoLockup } from "./Logo";
import { NavSheet } from "./NavSheet";
import { UserChip } from "./UserChip";
import { ChevronIcon, iconFor } from "./navIcons";
// Re-exported below for client consumers; imported here because this
// component uses them itself.
import { isActive, navFor, type NavItem } from "./navItems";

/**
 * TopNav
 *
 * A sticky white pill bar: the mark and wordmark left, the role's tabs
 * centred with a hairline divider between the tiers, then the copilot
 * trigger and account chip right.
 *
 * Active state comes from usePathname(), not from props, so a tab lights up
 * on navigation without any page having to declare which one it is.
 *
 * ONE ACTIVE LANGUAGE, NOT TWO
 * ----------------------------
 * A primary tab used to go solid ink and a secondary tab solid violet. Two
 * filled states in one 30px bar is two things to learn, and neither of them
 * says "you are here" better than the other -- the colour was carrying TIER,
 * which the reader can already see from the divider and the weight, while the
 * thing it looked like it was carrying was position. Worse, both fills are
 * heavy enough to become the loudest object in the bar, so the eye lands on
 * whichever tab is active before it lands on the wordmark or the queue pip.
 *
 * Now there is one: a cream ground, ink text, and a 2px orange bar under the
 * label. The bar is the same mark PageFooter uses to open and close a screen,
 * so "orange rule" already means "this is the edge of the thing you are
 * reading" everywhere else in the app. Tier survives in the type weight and
 * the divider, which is what those two were for.
 *
 * The icons are the second half of that trade. Losing the fills costs some
 * scannability, and a glyph beside each label buys it back in a way that
 * works for a reader coming back to a tab they use every day -- shape is
 * faster than reading, and unlike colour it is still there when the tab is
 * idle.
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
  "relative inline-flex items-center gap-[6px] rounded-pill px-[10px] py-[7px] text-nav whitespace-nowrap transition-colors duration-[120ms]";

const TAB_TONE = {
  primaryIdle: "font-bold text-body hover:bg-cream hover:text-ink",
  primaryActive: "font-bold bg-cream text-ink",
  secondaryIdle: "font-semibold text-mute hover:bg-cream hover:text-body",
  secondaryActive: "font-semibold bg-cream text-ink",
} as const;

/**
 * The active mark: the same 2px orange rule PageFooter opens and closes a
 * screen with. Sits inside the tab's bottom padding, so it never moves the
 * label or changes the bar's height between states -- a marker that reflows
 * its own tab makes the whole row shift by a pixel on every navigation.
 */
const TAB_MARK =
  "absolute bottom-[3px] left-1/2 h-[2px] w-[14px] -translate-x-1/2 rounded-pill bg-orange";

const PIP_BASE =
  "inline-block min-w-[16px] rounded-pill px-[4px] text-center text-[10px] font-extrabold tabular-nums";

const PIP_HREF = "/exceptions";

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

/**
 * Which popover is open, if any.
 *
 * ONE VALUE, NOT TWO BOOLEANS. The bar has two dropdowns -- More and the
 * account chip -- and they used to own their own open state independently.
 * Nothing stopped both being true, and clicking one while the other was open
 * did exactly that: two cards hanging off the same bar, overlapping, neither
 * of them stale enough to look deliberate. A union cannot represent that
 * state, so the bug is not fixed here so much as made unspeakable.
 */
type Popover = "more" | "account" | null;

export function TopNav({ exceptionCount, user }: TopNavProps) {
  const prefetchOnce = usePrefetchOnce();
  const { primary, secondary, more } = navFor(user?.role);
  // Stored WITH the route it was opened on, so closing on navigation is a
  // comparison rather than a second render -- see the same reasoning, at
  // length, in NavSheet. Following a link in the More menu changes pathname,
  // `at` stops matching, and the menu is shut without an effect resetting it.
  const [popoverState, setPopoverState] = useState<{
    which: Popover;
    at: string;
  } | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuId = useId();
  const pathname = usePathname();
  const { open: openCopilot } = useCopilot();

  const popover: Popover =
    popoverState && popoverState.at === pathname ? popoverState.which : null;
  // useCallback so the two effects below can name it as a dependency honestly
  // rather than lying about one. A fresh closure per render would re-run both
  // of them on every render, re-attaching their document listeners each time.
  const setPopover = useCallback(
    (which: Popover) =>
      setPopoverState(which ? { which, at: pathname } : null),
    [pathname],
  );

  const moreOpen = popover === "more";

  // Stable, because UserChip memoises its own setter against this and an
  // inline arrow here would change identity every render -- which would make
  // that setter change every render, and re-attach the chip's two document
  // listeners every render while its menu is open.
  const onAccountOpenChange = useCallback(
    (next: boolean) => setPopover(next ? "account" : null),
    [setPopover],
  );
  const closeAllPopovers = useCallback(() => setPopover(null), [setPopover]);

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
        setPopover(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [moreOpen, setPopover]);

  // ESCAPE, AND FOCUS THAT COMES BACK.
  //
  // The menu closed on an outside click and on nothing else. A keyboard
  // reader who opened it had two ways out -- Tab through every item to the
  // end, or click -- and neither is Escape, which is the one they will try.
  // UserChip has handled Escape since it was written; this had not, so the
  // two dropdowns on the same bar behaved differently.
  //
  // Focus returns to the trigger because the node holding it is the one about
  // to be unmounted. Left alone, focus falls to <body> and the next Tab
  // restarts at the skip link, which is a long way back from where they were.
  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPopover(null);
        moreTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [moreOpen, setPopover]);

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

    const glyph = iconFor(item.href);

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
        {glyph ? (
          <span className={active ? "text-orange" : "text-mute"}>{glyph}</span>
        ) : null}
        {item.label}
        {showPip ? (
          <span
            className={`${PIP_BASE} ${
              active ? "bg-orange text-white" : "bg-peach text-orangeD"
            }`}
          >
            {exceptionCount}
            {/*
              The count on its own was announced as part of the label -- the
              tab read "Exceptions 66", a number with no unit, which is either
              sixty-six exceptions or the sixty-sixth of something. The pip is
              visual shorthand that works because it sits on a tab already
              labelled Exceptions; a screen reader gets that context spelled
              out instead.
            */}
            <span className="sr-only"> open exceptions</span>
          </span>
        ) : null}
        {active ? <span aria-hidden="true" className={TAB_MARK} /> : null}
      </Link>
    );
  };

  /**
   * ARROW KEYS INSIDE THE MORE MENU.
   *
   * The menu carries role="menu" and its items role="menuitem", which is a
   * promise: a reader who meets that role expects arrows to move between
   * items and Home/End to reach the ends, because that is what the role
   * means. It was making the promise and only supporting Tab.
   *
   * Read off the DOM rather than tracked in state. The alternative is an
   * active-index state that has to be kept in step with a list that is
   * already derived from the role's nav -- two sources for one fact, and the
   * DOM is the one that is definitionally correct about what is rendered.
   */
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const items = Array.from(
      moreMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        [],
    );
    if (items.length === 0) return;
    event.preventDefault();

    const current = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? // -1 (focus is on none of them) + 1 lands on the first item,
              // which is what a reader arrowing in from the trigger wants.
              (current + 1) % items.length
            : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <header className="sticky top-[12px] z-40 flex items-center gap-[14px] rounded-pill bg-white py-[8px] pl-[18px] pr-[10px] shadow-nav">
      <Link
        href="/"
        className="flex items-center"
        aria-label="StylePilot Ai, go to dashboard"
      >
        <LogoLockup size={24} />
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
          competing with Buy for the same row. The trigger carries the active
          marker when a route inside it is active, so a reader on /governance
          can still see where they are without the menu being open -- the same
          orange rule a tab uses, because it means the same thing.
        */}
        <div className="relative" ref={moreRef}>
          <button
            ref={moreTriggerRef}
            type="button"
            onClick={() => setPopover(moreOpen ? null : "more")}
            onKeyDown={(event) => {
              // Arrow-down opens the menu and lands on its first item, which
              // is the gesture a reader who knows the pattern will reach for
              // before they try Enter.
              if (event.key === "ArrowDown" && !moreOpen) {
                event.preventDefault();
                setPopover("more");
              }
            }}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-controls={moreOpen ? moreMenuId : undefined}
            className={`${TAB_BASE} ${
              moreActive
                ? TAB_TONE.secondaryActive
                : TAB_TONE.secondaryIdle
            }`}
          >
            More
            <ChevronIcon
              className={`transition-transform duration-[120ms] ${
                moreOpen ? "rotate-180" : ""
              }`}
            />
            {moreActive ? (
              <span aria-hidden="true" className={TAB_MARK} />
            ) : null}
          </button>

          {moreOpen ? (
            <div
              id={moreMenuId}
              ref={moreMenuRef}
              role="menu"
              aria-label="More"
              onKeyDown={onMenuKeyDown}
              className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[200px] rounded-card border border-rule bg-white py-[6px] shadow-drawer"
            >
              {more.map((item) => {
                const active = isActive(pathname, item.href);
                const glyph = iconFor(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onMouseEnter={() => prefetchOnce(item.href)}
                    onFocus={() => prefetchOnce(item.href)}
                    onClick={() => setPopover(null)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-[10px] px-[14px] py-[8px] text-nav transition-colors duration-[120ms] ${
                      active
                        ? "font-extrabold bg-cream text-ink"
                        : "font-semibold text-body hover:bg-cream"
                    }`}
                  >
                    <span className={active ? "text-orange" : "text-mute"}>
                      {glyph}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {active ? (
                      <span
                        aria-hidden="true"
                        className="h-[14px] w-[2px] rounded-pill bg-orange"
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </nav>

      {/* Pushes the right-hand cluster over when the tab row is absent. The
          row itself carries mx-auto, which does that job at full width; below
          1140px there is no row to do it. */}
      <span className="ml-auto min-[1141px]:hidden" aria-hidden="true" />

      <div className="flex items-center gap-[8px]">
        <NavSheet
          primary={primary}
          secondary={secondary}
          more={more}
          exceptionCount={exceptionCount}
          onOpen={closeAllPopovers}
        />
        <button
          type="button"
          onClick={openCopilot}
          aria-label="Open copilot"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-cream text-[13px] text-ink transition-colors duration-[120ms] hover:bg-hover"
        >
          {SPARK}
        </button>
        <UserChip
          name={user?.name}
          role={user?.role}
          open={popover === "account"}
          onOpenChange={onAccountOpenChange}
        />
      </div>
    </header>
  );
}

export default TopNav;
