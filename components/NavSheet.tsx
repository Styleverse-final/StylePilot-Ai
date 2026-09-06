"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CloseIcon, MenuIcon, iconFor } from "./navIcons";
import { isActive, type NavItem } from "./navItems";

/**
 * NavSheet -- the navigation, for a viewport too narrow to hold the tab row.
 *
 * WHY THIS EXISTS
 * ---------------
 * The tab row carried `max-[1140px]:hidden` and nothing replaced it. Below
 * that width a reader got a wordmark, a copilot button and an account chip:
 * no tabs, no More menu, NO WAY TO REACH ANOTHER SCREEN AT ALL. Not a
 * degraded nav -- an absent one. The only exits left were the browser's back
 * button and typing a URL.
 *
 * That is a different failure from the one it looks like. The page content
 * below still has a 1140px floor, so a narrow window has always meant
 * sideways scrolling; the bar going missing was read as part of that and left
 * alone. But the bar is sticky and full-width, so it is the one element that
 * was genuinely usable at any width, and hiding it removed the only thing
 * that still worked.
 *
 * THE SAME NAV, NOT A SECOND ONE
 * ------------------------------
 * Every item here comes from the same navFor(role) call that feeds the tab
 * row -- passed in rather than re-derived, so a role whose nav changes cannot
 * end up with two different answers depending on window width. The tiers keep
 * their meaning and their order; they are stacked and labelled instead of
 * being expressed as a row, a hairline and a dropdown, because those three
 * devices all mean "further from your daily work" and a narrow column can say
 * that in words.
 *
 * An empty tier renders nothing at all. A planner's secondary row is empty,
 * and a heading with no items under it reads as something failing to load --
 * the same reason the tab row drops its divider when there is nothing on the
 * far side of it.
 */

export type NavSheetProps = {
  primary: readonly NavItem[];
  secondary: readonly NavItem[];
  more: readonly NavItem[];
  /** Open exception count, shown as a pip beside Exceptions. */
  exceptionCount?: number;
  /**
   * Called when the sheet opens, so the bar can close whatever else is open.
   * Two popovers open at once reads as a stuck UI rather than a menu.
   */
  onOpen?: () => void;
};

const PIP_HREF = "/exceptions";

/** Tier -> the heading that says what the tier means. */
const TIERS = [
  { key: "primary", heading: "Every day" },
  { key: "secondary", heading: "Most weeks" },
  { key: "more", heading: "Evidence and governance" },
] as const;

const HEADING =
  "px-[14px] pb-[6px] pt-[14px] text-micro font-extrabold uppercase tracking-[0.14em] text-mute";

const ROW_BASE =
  "flex items-center gap-[11px] rounded-inner px-[14px] py-[10px] text-base transition-colors duration-[120ms]";

export function NavSheet({
  primary,
  secondary,
  more,
  exceptionCount,
  onOpen,
}: NavSheetProps) {
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // CLOSE ON NAVIGATION, BY DERIVING RATHER THAN BY RESETTING.
  //
  // Next does a client-side transition, so nothing here unmounts when a link
  // is followed; left alone the panel stays open over the screen the reader
  // just asked for. It has to key off pathname rather than the link's own
  // onClick, because the back button and the skip link move the route too and
  // an onClick handler never sees either.
  //
  // The obvious shape is an effect that calls setOpen(false) when pathname
  // changes. react-hooks/set-state-in-effect rejects it, and is right to: that
  // renders the panel open on the new route, then immediately renders it
  // again closed. What the state actually means is "open, ON THIS ROUTE", so
  // storing the route WITH it makes the close fall out of a comparison
  // instead of out of a second render. Navigate away and openedAt stops
  // matching, so the panel is closed without anything having to close it.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt !== null && openedAt === pathname;
  // useCallback so the effect below can name it as a dependency honestly. A
  // fresh closure every render would re-run that effect every render, which
  // means tearing down and re-attaching the keydown listener -- and re-firing
  // the focus() call inside it -- on every keystroke the panel handles.
  const setOpen = useCallback(
    (next: boolean) => setOpenedAt(next ? pathname : null),
    [pathname],
  );

  // Escape, and focus that goes in and comes back out.
  //
  // A panel that traps nothing and returns nothing leaves a keyboard reader
  // stranded at the top of the document after every close. Focus moves to the
  // dismiss button on open -- not to the first link, which would make Escape
  // and Tab disagree about where the reader is -- and returns to the trigger
  // on close, which is where they were.
  useEffect(() => {
    if (!open) return;

    // Both nodes captured now, not read in the cleanup. A ref read at cleanup
    // time is whatever the ref points at THEN, which for the panel is null --
    // it has already been unmounted -- so the "is focus still inside?" test
    // below would answer no every time and focus would never come back.
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    closeRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      // A modal panel over the whole viewport must not let Tab walk into the
      // page behind it. The page is still there, still scrollable in
      // principle, and reachable by keyboard even though it is covered.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Only pull focus back if it is still inside the panel. If the reader
      // clicked a link, the route has changed and stealing focus back to a
      // button in the bar would undo that.
      if (panel?.contains(document.activeElement)) trigger?.focus();
    };
  }, [open, setOpen]);

  const renderRow = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    const showPip =
      item.href === PIP_HREF &&
      typeof exceptionCount === "number" &&
      exceptionCount > 0;

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`${ROW_BASE} ${
          active
            ? "bg-cream font-extrabold text-ink"
            : "font-semibold text-body hover:bg-cream"
        }`}
      >
        <span className={active ? "text-orange" : "text-mute"}>
          {iconFor(item.href)}
        </span>
        <span className="flex-1">{item.label}</span>
        {showPip ? (
          <span className="rounded-pill bg-peach px-[7px] py-[2px] text-[10px] font-extrabold tabular-nums text-orangeD">
            {exceptionCount}
            <span className="sr-only"> open exceptions</span>
          </span>
        ) : null}
        {/* The active marker, matching the tab row's rule: an orange bar,
            turned upright because this is a column. */}
        {active ? (
          <span aria-hidden="true" className="h-[16px] w-[2px] rounded-pill bg-orange" />
        ) : null}
      </Link>
    );
  };

  const groups = [
    { ...TIERS[0], items: primary },
    { ...TIERS[1], items: secondary },
    { ...TIERS[2], items: more },
  ].filter((group) => group.items.length > 0);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        aria-label="Open navigation"
        className="hidden h-[34px] w-[34px] items-center justify-center rounded-full bg-cream text-ink transition-colors duration-[120ms] hover:bg-hover max-[1140px]:flex"
      >
        <MenuIcon />
      </button>

      {open ? (
        <>
          {/* The scrim. Its own element rather than a click handler on the
              document, so a click that lands on it is unambiguous -- an
              outside-click listener on mousedown also fires for a text
              selection that happens to start inside the panel. */}
          <div
            className="fixed inset-0 z-40 bg-[rgba(35,31,28,0.28)]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            id={panelId}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            /*
              Anchored under the trigger and capped, not stretched edge to
              edge. Full-bleed is right on a phone and wrong at 900px, where it
              leaves each row with its label pinned to one side of an 880px
              gap and its pip to the other -- a nav that has to be read across
              rather than down. The cap keeps the rows scannable at every width
              the sheet is used at, and the viewport-width term keeps it inside
              the margins on a genuinely narrow screen.
            */
            className="fixed right-[12px] top-[12px] z-50 w-[calc(100vw-24px)] max-w-[340px] max-h-[calc(100vh-24px)] overflow-y-auto rounded-card bg-white p-[8px] shadow-card"
          >
            <div className="flex items-center justify-between px-[10px] py-[6px]">
              <span className="text-logo font-extrabold text-ink">
                StyleVerse<span className="text-orange">AI</span>
              </span>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-cream text-ink transition-colors duration-[120ms] hover:bg-hover"
              >
                <CloseIcon />
              </button>
            </div>

            {groups.map((group) => (
              <div key={group.key}>
                <div className={HEADING}>{group.heading}</div>
                <nav aria-label={group.heading} className="flex flex-col gap-[2px]">
                  {group.items.map(renderRow)}
                </nav>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

export default NavSheet;
