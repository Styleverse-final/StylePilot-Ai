/**
 * The navigation model, in a module with NO "use client".
 *
 * WHY THIS FILE EXISTS AS A SEPARATE MODULE
 * -----------------------------------------
 * These constants used to live in TopNav.tsx, which is a client component.
 * That works for TopNav itself, but a SERVER component importing a plain value
 * from a client module does not get the value: Next replaces a client module
 * with a reference proxy, so component exports resolve and ordinary constants
 * come back undefined. /model-ops did exactly that -- it spread PRIMARY_NAV to
 * list the surface area of the app -- and returned a 500 reading
 * "PRIMARY_NAV is not iterable". TypeScript could not catch it, because the
 * export is real and correctly typed; only the runtime boundary makes it
 * undefined.
 *
 * Keeping the nav model here means both sides can read it. TopNav re-exports
 * the same symbols so existing client imports are unaffected.
 */

export type NavItem = {
  href: string;
  label: string;
};

/**
 * The decision loop, in the order a planner works through it.
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/workbench", label: "Workbench" },
  { href: "/exceptions", label: "Exceptions" },
  { href: "/buy", label: "Buy" },
  { href: "/allocation", label: "Allocation" },
  { href: "/markdown", label: "Markdown" },
  { href: "/launch", label: "Launch" },
  { href: "/scenarios", label: "Scenarios" },
];

/**
 * Evidence and governance. Lighter, behind the divider, violet when active.
 *
 * /learning is here for EVERY role, including the portfolio nav below, and
 * that is the point rather than an oversight: every employee has a capability
 * path, so every employee has something to see on that route. The cohort
 * roll-up on it is gated by row level security on the completion table, not by
 * the presence of the tab.
 */
export const SECONDARY_NAV: readonly NavItem[] = [
  { href: "/signals", label: "Signals" },
  { href: "/downstream", label: "Downstream" },
  { href: "/model-ops", label: "Model ops" },
  { href: "/governance", label: "Governance" },
  { href: "/adoption", label: "Adoption" },
  { href: "/learning", label: "Learning" },
];

/**
 * A CMPO watches the business; they do not commit buys. The decision loop is
 * therefore absent from their nav entirely -- not disabled, absent -- because
 * a greyed-out Approve is a lie about the role.
 */
export const PORTFOLIO_PRIMARY_NAV: readonly NavItem[] = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/workbench", label: "Workbench" },
];

export const PORTFOLIO_ROLES: readonly string[] = ["cmpo", "group_cmpo"];

export function navFor(role: string | null | undefined) {
  return PORTFOLIO_ROLES.includes(role ?? "")
    ? { primary: PORTFOLIO_PRIMARY_NAV, secondary: SECONDARY_NAV }
    : { primary: PRIMARY_NAV, secondary: SECONDARY_NAV };
}
