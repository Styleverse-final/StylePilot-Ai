import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { CopilotProvider } from "@/components/CopilotDrawer";
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

  const [planner, exceptionCount] = await Promise.all([
    getSessionPlanner(),
    countExceptions(),
  ]);
  if (!planner) redirect("/login");

  async function signOut() {
    "use server";
    redirect("/auth/signout");
  }

  return (
    <CopilotProvider>
      <div className="mx-auto min-w-[1140px] max-w-[1400px] px-[20px] pb-[44px] pt-[16px] max-[1140px]:min-w-0">
        <TopNav
          exceptionCount={exceptionCount}
          user={{
            name: planner.fullName ?? planner.email ?? undefined,
            role: planner.appRole ?? undefined,
          }}
          onSignOut={signOut}
        />
        {children}
      </div>
    </CopilotProvider>
  );
}
