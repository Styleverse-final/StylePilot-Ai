import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { CopilotProvider } from "@/components/CopilotDrawer";
import { WelcomeOverlay } from "@/components/WelcomeOverlay";
import { TopNav } from "@/components/TopNav";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

/**
 * The application shell from production.html, applied to authenticated
 * routes only.
 *
 * The `.page` container is a 1140px floor and a 1400px ceiling, centred,
 * with 16px/20px/44px padding; it holds the sticky pill nav and the routed
 * screen. CopilotProvider wraps both so the nav icon, every PageHeader Ask
 * button and Cmd/Ctrl-K drive one drawer.
 *
 * D4: the identity in the nav is the SESSION's. There is no hardcoded
 * "Ananya Rao" anywhere. A signed-in user with no dim_planner row is a real
 * state -- they can read, but every write policy keys off current_planner()
 * and will refuse them -- so the chip shows their email rather than
 * inventing a planner.
 *
 * The exception pip is counted here rather than hardcoded to 66; the count
 * is read under RLS with the caller's own session.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // BOTH AT ONCE. These used to run in sequence, and the pip count -- a badge
  // number that does not depend on the planner at all -- sat behind the whole
  // identity resolution. That put TWO sequential round trips in front of the
  // first byte of EVERY route in the app, including the loading skeleton.
  //
  // Nothing here needs the other's result, so nothing waits. If the session
  // turns out to be missing we redirect and the count is wasted, which costs
  // one query on a request that was going to be thrown away anyway.
  const countExceptions = async (): Promise<number | undefined> => {
    try {
      const sb = await createServerAnonClient();
      const { count } = await sb
        .from("recommendation")
        .select("id", { count: "exact", head: true })
        .eq("rec_type", "EXCEPTION");
      return count ?? undefined;
    } catch {
      // A nav that cannot count is still a usable nav; drop the pip rather
      // than fail the whole shell.
      return undefined;
    }
  };

  // The two facts the sign-in intro needs beside the name: the reader's job
  // title and their company. Both are one small row, both join the wave that
  // was already running, and both fail soft -- an unreadable row drops that
  // half of the subtitle rather than failing the shell for a decoration.
  // Returns the ROWS, not a pick. The pick needs the planner's own id and
  // brand, which resolve in the same wave as this read, so choosing here
  // would mean taking data[0] -- and data[0] of dim_brand is whichever brand
  // sorts first, not the reader's. An EcoWeave CMPO would have been welcomed
  // to SpeedStyle. The match happens below, once identity is known.
  const readIdentityRows = async (): Promise<{
    roles: { employee_id: string; role: string | null }[];
    brands: { brand_id: string; brand_name: string | null }[];
  }> => {
    try {
      const sb = await createServerAnonClient();
      const [adoption, brands] = await Promise.all([
        sb.from("planner_adoption").select("employee_id, role"),
        sb.from("dim_brand").select("brand_id, brand_name"),
      ]);
      return { roles: adoption.data ?? [], brands: brands.data ?? [] };
    } catch {
      return { roles: [], brands: [] };
    }
  };

  const [planner, exceptionCount, identity] = await Promise.all([
    getSessionPlanner(),
    countExceptions(),
    readIdentityRows(),
  ]);
  if (!planner) redirect("/login");

  // Matched on the reader's own employee id and brand. A miss leaves the
  // field null and the intro drops that half of the line rather than
  // asserting somebody else's job title or another brand's name.
  const welcomeRole =
    identity.roles.find((row) => row.employee_id === planner.employeeId)?.role ??
    null;
  const welcomeCompany =
    identity.brands.find((row) => row.brand_id === planner.brandId)?.brand_name ??
    null;

  // NO SIGN-OUT SERVER ACTION HERE, DELIBERATELY.
  //
  // There used to be one, and all it did was redirect("/auth/signout"). A
  // redirect is followed by the browser with GET, and that route is POST only,
  // so every sign-out in production answered 405. UserChip already posts a
  // real form to the route; that is the only path now, so there is no second
  // one to go stale.
  return (
    <CopilotProvider>
      {planner.fullName ? (
        <WelcomeOverlay
          name={planner.fullName}
          role={welcomeRole}
          company={welcomeCompany}
        />
      ) : null}
      <div className="mx-auto min-w-[1140px] max-w-[1400px] px-[20px] pb-[44px] pt-[16px] max-[1140px]:min-w-0">
        <TopNav
          exceptionCount={exceptionCount}
          user={{
            name: planner.fullName ?? planner.email ?? undefined,
            role: planner.appRole ?? undefined,
          }}
        />
        {children}
      </div>
    </CopilotProvider>
  );
}
