import { redirect } from "next/navigation";

import { PORTFOLIO_ROLES } from "@/components/navItems";
import { getSessionPlanner } from "@/lib/session";

/**
 * Route-level role guards.
 *
 * THE ONE RULE, AND WHY IT IS THE ONLY ONE.
 *
 * Absence from a role's nav and refusal of a route are different claims, and
 * conflating them would make the app lie in one direction or the other:
 *
 *   ABSENT FROM NAV means "not your daily job". The route still renders when
 *   reached directly, scoped by row level security to that account's own
 *   rows. A planner sent a link to /model-ops by their manager gets the
 *   screen. Redirecting them would break a shared link in order to enforce an
 *   access rule that does not exist -- RLS is the access rule, it is
 *   unchanged, and it already returns only what that account may read.
 *
 *   REDIRECTED means "not your job at all", and applies to exactly one case.
 *
 * A CMPO commits nothing. They approve no buy, decide no exception and shift
 * no allocation; the ledger has no row where a CMPO is the actor. So every
 * execution screen is not merely absent from their nav but unreachable, and
 * they are returned to /portfolio. A nav entry to a screen whose every
 * control would refuse them is an invitation to find that out the hard way.
 *
 * This extends the guard that already existed on "/" rather than inventing a
 * second mechanism.
 *
 * NOT A SECURITY BOUNDARY. This is a routing decision about whose job a
 * screen is. What any account can READ is decided by RLS in Postgres and is
 * untouched by this file. Deleting every line here would change what is
 * convenient, not what is permitted.
 */
export async function redirectCmpoToPortfolio(): Promise<void> {
  const planner = await getSessionPlanner();
  if (PORTFOLIO_ROLES.includes(planner?.appRole ?? "")) {
    redirect("/portfolio");
  }
}
