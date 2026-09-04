"use client";

import { useEffect, useId, useRef, useState } from "react";

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
   * Sign-out handler. Rendered as a `<form action>`, so a Next server
   * action can be passed straight through from a server component.
   */
  onSignOut?: () => void | Promise<void>;
  /**
   * Endpoint used when no handler is supplied. POSTed, never linked: a GET
   * sign-out can be fired by any third-party page with an <img> tag, and
   * browsers pre-fetch links.
   */
  signOutEndpoint?: string;
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
  onSignOut,
  signOutEndpoint = "/auth/signout",
}: UserChipProps) {
  const displayName = name?.trim() ? name.trim() : FALLBACK_NAME;
  const initials = initialsFrom(displayName);

  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const signOutClass = buttonClasses("default", "sm", "w-full justify-center");

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={AVATAR_CLASS}
        aria-label={`Account menu for ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => setMenuOpen((value) => !value)}
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
          <form
            {...(onSignOut
              ? { action: onSignOut }
              : { action: signOutEndpoint, method: "post" })}
          >
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
