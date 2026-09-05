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
 * NAV IS NOW PER ROLE
 * -------------------
 * Every role used to see the same thirteen tabs. That is a list, not a
 * hierarchy, and worse it is a claim: putting Model ops in a planner's nav
 * says the planner has business there, which they do not. A tab belonging to
 * someone else's job is not rendered for this role at all -- not hidden with
 * CSS, not greyed out, absent from the DOM. A greyed-out control is a lie
 * about the role that also invites the reader to go looking for permission.
 *
 * The tiers keep their meaning within each role:
 *
 *   PRIMARY    what this person opens the app to do, most days.
 *   SECONDARY  real work, most weeks.
 *   MORE       evidence and governance, periodically or when challenged.
 *              Nothing here is unimportant -- for a planning manager the
 *              governance ledger is PRIMARY, which is exactly the point of
 *              scoping the tiers per role rather than globally.
 *
 * NAV ABSENCE IS NOT ACCESS CONTROL, and must not be mistaken for it. Row
 * level security decides what any account can read, and it is unchanged by
 * anything in this file. A planner who types /model-ops still gets the
 * screen, scoped to their own rows -- see ROUTE GUARDS below for the one
 * place where a redirect is deliberate, and why.
 */

export type NavItem = {
  href: string;
  label: string;
};

// ------------------------------------------------------------ the routes

const DASHBOARD: NavItem = { href: "/", label: "Dashboard" };
const WORKBENCH: NavItem = { href: "/workbench", label: "Workbench" };
const EXCEPTIONS: NavItem = { href: "/exceptions", label: "Exceptions" };
const BUY: NavItem = { href: "/buy", label: "Buy" };
const ALLOCATION: NavItem = { href: "/allocation", label: "Allocation" };
const MARKDOWN: NavItem = { href: "/markdown", label: "Markdown" };
const SCENARIOS: NavItem = { href: "/scenarios", label: "Scenarios" };
const SIGNALS: NavItem = { href: "/signals", label: "Signals" };
const LEARNING: NavItem = { href: "/learning", label: "Learning" };
const GOVERNANCE: NavItem = { href: "/governance", label: "Governance" };
const MODEL_OPS: NavItem = { href: "/model-ops", label: "Model ops" };
const ADOPTION: NavItem = { href: "/adoption", label: "Adoption" };
const DOWNSTREAM: NavItem = { href: "/downstream", label: "Downstream" };
const PORTFOLIO: NavItem = { href: "/portfolio", label: "Portfolio" };

export type NavConfig = {
  primary: readonly NavItem[];
  secondary: readonly NavItem[];
  more: readonly NavItem[];
};

/**
 * Role -> nav. Read once per request in the app layout, from the session
 * getSessionPlanner() has already resolved. No screen re-derives it.
 *
 * A NOTE ON TWO ROLES YOU CANNOT SEE ON THIS DEPLOYMENT.
 *
 *   commercial_lead exists in dim_planner (4 accounts) and is configured
 *   below, but none of the six admitted demonstration logins carries it, so
 *   its nav cannot be exercised through the UI here.
 *
 *   coe_admin does NOT exist. dim_planner holds exactly six app_role values --
 *   planner, category_manager, planning_manager, commercial_lead, cmpo,
 *   group_cmpo -- and no row has coe_admin. The entry below is therefore
 *   configuration for a role nobody holds. It is kept rather than dropped
 *   because it costs nothing and the moment such an account is created the
 *   nav is already correct, but it should not be described as working: it
 *   has never rendered for anyone.
 */
const NAV_BY_ROLE: Readonly<Record<string, NavConfig>> = {
  /** Executes the plan. Five screens, every day. */
  planner: {
    primary: [DASHBOARD, EXCEPTIONS, BUY, ALLOCATION, WORKBENCH],
    secondary: [],
    more: [MARKDOWN, SCENARIOS, LEARNING],
  },

  /** As a planner, plus the ledger: they answer for their category. */
  category_manager: {
    primary: [DASHBOARD, EXCEPTIONS, BUY, ALLOCATION, WORKBENCH],
    secondary: [GOVERNANCE],
    more: [MARKDOWN, SCENARIOS, LEARNING],
  },

  /**
   * Sets the autonomy bands and answers for the team. Governance is PRIMARY
   * here -- second tab, beside the dashboard -- because for this role it is
   * daily work rather than evidence consulted when challenged.
   */
  planning_manager: {
    primary: [DASHBOARD, GOVERNANCE, EXCEPTIONS, BUY, ALLOCATION],
    secondary: [WORKBENCH, ADOPTION],
    more: [MARKDOWN, SCENARIOS, LEARNING],
  },

  /**
   * Same shape as a planning manager. The difference between them is not
   * navigational: a commercial lead reads the governance screen and cannot
   * touch the kill switch, which RoleGate already enforces on the control
   * itself rather than by hiding the screen.
   */
  commercial_lead: {
    primary: [DASHBOARD, GOVERNANCE, EXCEPTIONS, BUY, ALLOCATION],
    secondary: [WORKBENCH, ADOPTION],
    more: [MARKDOWN, SCENARIOS, LEARNING],
  },

  /**
   * Watches the business; commits nothing. Every execution screen is absent,
   * because a nav entry to a screen whose every control would be refused is
   * an invitation to discover that the hard way.
   */
  cmpo: {
    primary: [PORTFOLIO],
    secondary: [],
    more: [MODEL_OPS, GOVERNANCE, SIGNALS, DOWNSTREAM],
  },
  group_cmpo: {
    primary: [PORTFOLIO],
    secondary: [],
    more: [MODEL_OPS, GOVERNANCE, SIGNALS, DOWNSTREAM],
  },

  /** The one role that needs the whole surface. Nothing absent. */
  coe_admin: {
    primary: [MODEL_OPS, GOVERNANCE],
    secondary: [DASHBOARD, EXCEPTIONS, BUY, ALLOCATION],
    more: [WORKBENCH, MARKDOWN, SCENARIOS, SIGNALS, LEARNING, ADOPTION, DOWNSTREAM, PORTFOLIO],
  },
};

/**
 * The fallback for an unrecognised or missing role.
 *
 * Deliberately the PLANNER config, which is the narrowest of the working
 * roles, rather than the full thirteen. An unknown role is a state the app
 * does not understand, and the safe response to not understanding someone is
 * to show them less, not everything.
 */
const FALLBACK: NavConfig = NAV_BY_ROLE.planner;

export function navFor(role: string | null | undefined): NavConfig {
  return NAV_BY_ROLE[role ?? ""] ?? FALLBACK;
}

/**
 * ROUTE GUARDS -- where nav absence becomes a redirect, and where it does not.
 *
 * Two different things are being expressed and they should not be conflated:
 *
 *   ABSENT FROM NAV means "not your daily job". The route still renders if
 *   reached directly, scoped by RLS to that account's own rows. A planner
 *   sent a link to /model-ops by their manager gets the screen. Redirecting
 *   them would break a shared link to answer a question nobody asked, and it
 *   would imply an access rule that does not exist -- RLS is the access rule,
 *   and it already returns only what they may see.
 *
 *   REDIRECTED means "not your job at all". Exactly one rule, below.
 *
 * A CMPO commits nothing. Every execution screen is therefore not merely
 * absent from their nav but unreachable: they are returned to /portfolio.
 * This extends the guard that already existed on "/" rather than inventing a
 * new mechanism.
 */
export const PORTFOLIO_ROLES: readonly string[] = ["cmpo", "group_cmpo"];

/**
 * Roles that SET the autonomy bands, and therefore read their derivation as
 * working information rather than as background.
 *
 * For these two the basis text sits beside the number. For everyone else the
 * same text is one click away behind <Why>: a planner consults why the band
 * is 1.25pp when they are challenged on it, not while clearing a queue, and
 * /governance is the wordiest screen in the app precisely because it was
 * written for the person who owns it and shown to everyone.
 *
 * A commercial_lead is included: they answer for the bands even though
 * RoleGate refuses them the kill switch. Reading and pressing are different
 * permissions and this is the reading one.
 */
export const BAND_OWNER_ROLES: readonly string[] = [
  "planning_manager",
  "commercial_lead",
  "coe_admin",
];

/** Execution screens a CMPO is redirected away from, to /portfolio. */
export const CMPO_BLOCKED_ROUTES: readonly string[] = [
  "/",
  "/workbench",
  "/exceptions",
  "/buy",
  "/allocation",
  "/markdown",
  "/scenarios",
  "/learning",
  "/adoption",
];

/** Every route the nav can reach, for anything that needs the full surface. */
export const ALL_NAV: readonly NavItem[] = [
  DASHBOARD,
  WORKBENCH,
  EXCEPTIONS,
  BUY,
  ALLOCATION,
  MARKDOWN,
  SCENARIOS,
  SIGNALS,
  LEARNING,
  GOVERNANCE,
  MODEL_OPS,
  ADOPTION,
  DOWNSTREAM,
];

// Kept for existing importers. PRIMARY_NAV is the planner's primary row,
// which is what every current caller means by it.
export const PRIMARY_NAV: readonly NavItem[] = NAV_BY_ROLE.planner.primary;
export const SECONDARY_NAV: readonly NavItem[] = [
  MARKDOWN,
  SCENARIOS,
  SIGNALS,
  LEARNING,
];
export const MORE_NAV: readonly NavItem[] = [
  GOVERNANCE,
  MODEL_OPS,
  ADOPTION,
  DOWNSTREAM,
];
export const PORTFOLIO_PRIMARY_NAV: readonly NavItem[] =
  NAV_BY_ROLE.cmpo.primary;
