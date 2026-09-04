import type { ReactNode } from "react";

/**
 * RoleGate -- D6.
 *
 * WHY DISABLE RATHER THAN HIDE
 * ----------------------------
 * A planner who cannot flip the kill switch should still SEE it, disabled,
 * with a line naming who can. Hiding the control would misrepresent the
 * product: it would suggest the system has no kill switch, when what it
 * actually has is a kill switch someone else owns. Showing it disabled
 * teaches the governance model in the place where the model matters, and it
 * is the same argument as `accountable_planner` staying NOT NULL on an
 * agent row -- authority is always visible and always attributed.
 *
 * This is the mechanism only. The kill switch itself lives on the
 * Governance screen, which Phase 5 builds; this component is what that
 * screen will wrap it in.
 *
 * SECURITY NOTE: this is presentation, not enforcement. Row level security
 * is the enforcement -- `agent_kill_switch` accepts an UPDATE only from
 * planning_manager or coe_admin, verified in the Phase 4 policy tests. A
 * planner who defeats this component still cannot write. Never rely on a
 * disabled attribute for authority.
 */

export type AppRole =
  | "planner"
  | "category_manager"
  | "planning_manager"
  | "coe_admin"
  | "anonymous";

const ROLE_LABEL: Record<AppRole, string> = {
  planner: "a planner",
  category_manager: "a category manager",
  planning_manager: "a planning manager",
  coe_admin: "a CoE administrator",
  anonymous: "a signed-out visitor",
};

export type RoleGateProps = {
  /** The signed-in user's app_role, from the session. */
  role: AppRole | string | null | undefined;
  /** Roles permitted to act. Anyone else sees the control disabled. */
  allow: readonly AppRole[];
  /** What is being gated, for the explanatory line: "flip the kill switch". */
  action: string;
  children: ReactNode;
};

export function roleAllows(
  role: AppRole | string | null | undefined,
  allow: readonly AppRole[],
): boolean {
  return typeof role === "string" && (allow as readonly string[]).includes(role);
}

/** Human list: "a planning manager or a CoE administrator". */
function describe(allow: readonly AppRole[]): string {
  const names = allow.map((r) => ROLE_LABEL[r] ?? r);
  if (names.length <= 1) return names[0] ?? "nobody";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

export function RoleGate({ role, allow, action, children }: RoleGateProps) {
  const permitted = roleAllows(role, allow);
  if (permitted) return <>{children}</>;

  const reason = `Only ${describe(allow)} can ${action}. You are signed in as ${
    ROLE_LABEL[(role as AppRole) ?? "anonymous"] ?? role
  }.`;

  return (
    <span
      className="inline-flex cursor-not-allowed opacity-55"
      title={reason}
      aria-disabled="true"
    >
      <span className="pointer-events-none contents" aria-hidden="true">
        {children}
      </span>
      <span className="sr-only">{reason}</span>
    </span>
  );
}

export default RoleGate;
