"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { buttonClasses } from "./Button";

/**
 * UserChip
 *
 * Ports `.avatar` and `.float`: a 34px peach-to-orange gradient disc that
 * opens an 18px-radius card carrying the account name, role and sign-out.
 *
 * The chip never names anyone. Initials are derived from whatever `name`
 * the session wiring passes in, and a missing name degrades to a neutral
 * placeholder rather than a hardcoded persona.
 */

export type UserChipProps = {
  /** Full name of the signed-in user. Supplied by the session wiring. */
  name?: string;
  /** Job title, shown under the name in the menu. */
  role?: string;
  /**
   * Where the sign-out form POSTs. POSTed, never linked: a GET sign-out can
   * be fired by any third-party page with an <img> tag, and browsers
   * pre-fetch links.
   *
   * There is deliberately no handler prop beside this. There was one, and
   * because the layout supplied it this endpoint was never exercised -- the
   * handler redirected here instead, the browser followed with GET, and the
   * POST-only route answered 405 for every sign-out in production. One path
   * cannot fall out of use behind another.
   */
  signOutEndpoint?: string;
  /**
   * Optional controlled open state. Omit both and the chip owns its own, which
   * is what it did before and what any future consumer gets for free.
   *
   * TopNav supplies them because it now has TWO popovers -- this menu and the
   * More dropdown -- and they were independent: opening one left the other
   * hanging over the bar. Coordinating them needs one owner of "which, if any,
   * is open", and the only component that can see both is their parent. The
   * alternative, having each close the other, means two components reaching
   * into each other to do what one already sitting above them can decide.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const FALLBACK_NAME = "Account";

/** "Ada Lovelace" -> "AL". Always derived, never hardcoded. */
export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "-";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

const AVATAR_CLASS =
  "flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[linear-gradient(140deg,#F7B787,#D04A02)] text-[12px] font-extrabold text-white";

export function UserChip({
  name,
  role,
  signOutEndpoint = "/auth/signout",
  open,
  onOpenChange,
}: UserChipProps) {
  const displayName = name?.trim() ? name.trim() : FALLBACK_NAME;
  const initials = initialsFrom(displayName);

  // Controlled when `open` is supplied, uncontrolled otherwise. The internal
  // state is declared either way -- hooks cannot be conditional -- and simply
  // goes unread in the controlled case.
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = open !== undefined;
  const menuOpen = controlled ? open : uncontrolledOpen;
  // useCallback so the effect below can depend on it honestly rather than
  // suppressing the warning: a fresh closure per render would re-attach both
  // document listeners on every render while the menu is open.
  const setMenuOpen = useCallback(
    (value: boolean) => {
      if (!controlled) setUncontrolledOpen(value);
      onOpenChange?.(value);
    },
    [controlled, onOpenChange],
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape closed the menu but left focus on whatever the reader had
      // tabbed to inside it, which is a node that is about to be removed --
      // focus then falls back to <body> and the next Tab restarts from the top
      // of the document. Put it back on the trigger, where they were.
      setMenuOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, setMenuOpen]);

  const signOutClass = buttonClasses("default", "sm", "w-full justify-center");

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className={AVATAR_CLASS}
        aria-label={`Account menu for ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        {initials}
      </button>

      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-[42px] z-50 min-w-[194px] rounded-inner bg-white p-[14px] shadow-card"
        >
          <div className="text-copy font-extrabold text-ink">{displayName}</div>
          <div className="mb-[10px] text-small font-semibold text-mute">
            {role ?? "Signed in"}
          </div>
          {/* A real form POST, not a link and not a redirect into the route.
              Sign-out ends a session, so it must not be reachable by GET: a
              prefetch, a link preview or a crawler would sign the planner
              out. The handler answers 303, which the browser follows with GET
              to /login. */}
          <form action={signOutEndpoint} method="post">
            <button type="submit" role="menuitem" className={signOutClass}>
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default UserChip;
