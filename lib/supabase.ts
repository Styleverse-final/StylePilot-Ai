// StyleVerse -- Supabase client factories (client-bundle safe).
//
// WHY THIS FILE HAS NO `import "server-only"` AND NO STATIC `next/headers`
// ----------------------------------------------------------------------
// This module is the one a "use client" component is allowed to import.
// Verified against Next 16.3.4 / Turbopack by building a probe app:
//
//   * a STATIC `import { cookies } from "next/headers"` anywhere in a
//     module reachable from a client component is a hard build error
//     ("You're importing a module that depends on next/headers");
//   * `import "server-only"` in such a module is a hard build error
//     ("'server-only' cannot be imported from a Client Component module"),
//     and a dynamic `await import()` does NOT escape that trace -- the
//     bundler still walks the edge and still reports it;
//   * a DYNAMIC `await import("next/headers")` on its own compiles clean
//     in every layer.
//
// Consequence, and it is not negotiable: the SERVICE-ROLE client cannot be
// re-exported from here. Re-exporting it would drag `import "server-only"`
// into the client layer and break every legitimate `createBrowserClient()`
// call site. It lives in `@/lib/supabase-server` instead, behind both
// guards. See the note on createServerClient at the bottom of this file.

import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * The only client type any StyleVerse query function accepts. Browser,
 * server-anon and service-role clients are all structurally this, which is
 * what lets every function in `@/lib/queries` take the client as an
 * argument and stay agnostic about who is calling it.
 */
export type StyleverseClient = SupabaseClient<Database, "public">;

// ---------------------------------------------------------------- env vars
//
// Next only inlines `process.env.NEXT_PUBLIC_*` into the browser bundle, and
// only for literal member access -- never `process.env[someVariable]`. So
// every public read below is written out longhand on purpose.
//
// On the server we also accept the unprefixed names, because the pipeline
// side of this repo (styleverse/.env.local) uses SUPABASE_URL /
// SUPABASE_PUBLISHABLE_KEY. That keeps one .env.local usable for both.

function publicUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

function publicKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  );
}

/** Server-side URL resolution: public name first, unprefixed as fallback. */
function serverUrl(): string {
  return publicUrl() || (process.env.SUPABASE_URL ?? "");
}

/** Server-side anon/publishable key: public name first, unprefixed fallback. */
function serverAnonKey(): string {
  return (
    publicKey() ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  );
}

function required(value: string, names: string): string {
  if (!value) {
    throw new Error(
      `StyleVerse: missing Supabase configuration. Set ${names} in web/.env.local.`,
    );
  }
  return value;
}

// ------------------------------------------------------------------ browser

/**
 * Anon / publishable key client, safe inside a "use client" component.
 *
 * RLS applies. It carries the signed-in user's session because
 * @supabase/ssr persists the session in cookies, so a read here sees exactly
 * what the same user's server components see. Treat it as read-only: nothing
 * in this app writes from the browser.
 */
export function createBrowserClient(): StyleverseClient {
  return createSsrBrowserClient<Database, "public">(
    required(publicUrl(), "NEXT_PUBLIC_SUPABASE_URL"),
    required(
      publicKey(),
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    ),
  );
}

// ------------------------------------------------------- server, RLS-abiding

/**
 * Anon-key client bound to the request's session cookie. RLS is enforced,
 * so this returns only what the signed-in planner is entitled to see.
 *
 * THIS IS THE ONE THE SCREENS USE. Every route under app/ is a server
 * component and RLS now requires an authenticated user, so a read that does
 * not carry the session cookie comes back empty rather than unauthorised.
 *
 * Async twice over: `cookies()` is async in Next 16, and `next/headers`
 * itself is imported dynamically so this module stays client-bundle safe.
 * `setAll` is intentionally omitted -- server components cannot write
 * cookies; token refresh is the middleware's job.
 */
export async function createServerAnonClient(): Promise<StyleverseClient> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return createSsrServerClient<Database, "public">(
    required(
      serverUrl(),
      "NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)",
    ),
    required(
      serverAnonKey(),
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or SUPABASE_PUBLISHABLE_KEY)",
    ),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // No setAll: a server component may not mutate the response cookie
        // jar. Refresh happens in middleware, which owns the response.
      },
    },
  );
}

// --------------------------------------------------------- service role note
//
// `createServerClient()` -- the SERVICE-ROLE, RLS-bypassing client -- is
// deliberately NOT exported from this module:
//
//     import { createServerClient } from "@/lib/supabase-server";
//
// Importing it from a client component is a build failure, by design, on two
// independent mechanisms (`import "server-only"` and a module-scope window
// check). Importing it from here would have made that failure fire for
// `createBrowserClient()` too, which is why the split exists. Asking this
// module for `createServerClient` is a compile error naming the missing
// export -- the loudest possible signal short of the build error itself.
