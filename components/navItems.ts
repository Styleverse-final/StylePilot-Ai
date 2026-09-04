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
 * THE THREE TIERS
 * ---------------
 * Fourteen tabs in one row is a list, not a hierarchy: everything looks
 * equally important, so nothing is. The split is by HOW OFTEN A PLANNER
 * TOUCHES IT, not by subject:
 *
 *   PRIMARY    the decision loop, every day. If a planner opens the app to do
 *              their job, they are going to one of these five.
 *   SECONDARY  planning tools, most weeks. Real work, not daily work.
 *   MORE       evidence and governance, periodically or when challenged.
 *              Nothing here is less important -- the governance ledger is
 *              arguably the most important screen in the system -- but nobody
 *              opens it to get through Tuesday.
 *
 * /launch is GONE. It had been a 500-byte placeholder reading "not built yet"
 * since Phase 4, and a nav entry leading to that is worse than no entry: it
 * teaches the reader that tabs here may go nowhere.
 *
 * That leaves thirteen routes, not fourteen, so the tiers are 5 / 4 / 4.
 */

export type NavItem = {
  href: string;
  label: string;
};

/** The decision loop. Daily. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/workbench", label: "Workbench" },
  { href: "/exceptions", label: "Exceptions" },
  { href: "/buy", label: "Buy" },
  { href: "/allocation", label: "Allocation" },
];

/** Planning tools. Most weeks. */
export const SECONDARY_NAV: readonly NavItem[] = [
  { href: "/markdown", label: "Markdown" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/signals", label: "Signals" },
  { href: "/learning", label: "Learning" },
];

/**
 * Evidence and governance. Behind a More menu.
 *
 * Being in here is not a demotion. It is where you go to answer "why did the
 * system do that", which is a different question from "what should I do
 * today" and deserves its own door rather than a tab competing with Buy.
 */
export const MORE_NAV: readonly NavItem[] = [
  { href: "/governance", label: "Governance" },
  { href: "/model-ops", label: "Model ops" },
  { href: "/adoption", label: "Adoption" },
  { href: "/downstream", label: "Downstream" },
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
    ? { primary: PORTFOLIO_PRIMARY_NAV, secondary: SECONDARY_NAV, more: MORE_NAV }
    : { primary: PRIMARY_NAV, secondary: SECONDARY_NAV, more: MORE_NAV };
}

/** Every route the nav can reach, for anything that needs the full surface. */
export const ALL_NAV: readonly NavItem[] = [
  ...PRIMARY_NAV,
  ...SECONDARY_NAV,
  ...MORE_NAV,
];
