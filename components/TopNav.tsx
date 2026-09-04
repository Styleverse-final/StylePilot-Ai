"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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


export type NavUser = {
  name?: string;
  role?: string;
};

export type TopNavProps = {
  /** Open exception count, rendered as a pip on the Exceptions tab. */
  exceptionCount?: number;
  /** Signed-in user. Supplied by whoever wires the session. */
  user?: NavUser | null;
  /** Server action or client handler behind the UserChip sign-out control. */
  onSignOut?: () => void | Promise<void>;
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav({ exceptionCount, user, onSignOut }: TopNavProps) {
  const { primary, secondary } = navFor(user?.role);
  const pathname = usePathname();
  const { open } = useCopilot();

  if (CHROMELESS_ROUTES.includes(pathname)) return null;

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
        <span className="mx-[7px] h-[20px] w-px bg-rule2" aria-hidden="true" />
        {secondary.map((item) => renderTab(item, true))}
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
        <UserChip name={user?.name} role={user?.role} onSignOut={onSignOut} />
      </div>
    </header>
  );
}

export default TopNav;
