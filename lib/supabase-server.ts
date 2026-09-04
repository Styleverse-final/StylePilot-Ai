// StyleVerse -- SERVICE-ROLE Supabase client. Server-side only, always.
//
// The service-role key bypasses RLS entirely. Shipping it to a browser would
// hand every visitor the whole database, so this module is fenced twice and
// each fence catches a different failure:
//
//   1. `import "server-only"` -- a BUILD-TIME failure. If any client
//      component's module graph reaches this file, Turbopack refuses to
//      compile: "'server-only' cannot be imported from a Client Component
//      module." Verified on Next 16.3.4; a dynamic import() does not slip
//      past it either.
//
//   2. the module-scope `typeof window` throw -- a RUNTIME failure, for the
//      cases the bundler cannot see: a stray script tag, a test harness with
//      a jsdom global, a future bundler that stops honouring the marker.
//
// Two fences, not one, because either can be defeated on its own.
import "server-only";

import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import type { StyleverseClient } from "@/lib/supabase";

// Fence 2. Module scope: this runs on import, before any caller can guard it.
if (typeof window !== "undefined") {
  throw new Error(
    "lib/supabase-server.ts was loaded in a browser context. This module " +
      "holds the service-role key and must never reach the client bundle. " +
      "Use createBrowserClient() from @/lib/supabase instead.",
  );
}

function serviceUrl(): string {
  return (
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ""
  );
}

function serviceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

/**
 * Service-role client. Bypasses RLS. Use it only where a screen genuinely
 * must read across every planner's scope -- portfolio value roll-ups, the
 * model registry, agent-run telemetry, the touchless rate -- never to dodge
 * an RLS rule that is doing its job.
 *
 * `cookies()` is awaited because Next 16 made it async, and it is imported
 * dynamically for symmetry with @/lib/supabase. The store is passed through
 * so that Supabase's own cookie plumbing is satisfied; the service-role JWT,
 * not the session, is what authorises the read.
 *
 * Never call this from a route that a client component can reach through a
 * shared module. If you need per-user reads, you want createServerAnonClient.
 */
export async function createServerClient(): Promise<StyleverseClient> {
  const url = serviceUrl();
  const key = serviceKey();

  if (!url) {
    throw new Error(
      "StyleVerse: missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) in web/.env.local.",
    );
  }
  if (!key) {
    throw new Error(
      "StyleVerse: missing SUPABASE_SERVICE_ROLE_KEY in web/.env.local. " +
        "Supabase dashboard > Project Settings > API keys > service_role.",
    );
  }

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return createSsrServerClient<Database, "public">(url, key, {
    auth: {
      // A service-role client has no user session to persist or refresh.
      persistSession: false,
      autoRefreshToken: false,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
    },
  });
}

// Re-exported so a server component can take both clients from one import.
// Safe in this direction: @/lib/supabase has no server-only marker, so this
// edge adds nothing to the client graph.
export { createServerAnonClient } from "@/lib/supabase";
export type { StyleverseClient } from "@/lib/supabase";
