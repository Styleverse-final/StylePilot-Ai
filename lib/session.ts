import { cache } from 'react'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Session handling for StyleVerse AI.
 *
 * The session lives entirely in server-side cookies written by @supabase/ssr.
 * Nothing is ever placed in localStorage or sessionStorage: no browser client
 * with `persistSession` exists anywhere in this app, and sign-in itself runs
 * as a server action (see app/login/page.tsx), so the access and refresh
 * tokens are never handed to client JavaScript at all.
 */

export type SupabaseEnv = {
  url: string
  key: string
}

/**
 * The publishable (anon) key only. The service-role key is never read here,
 * and must never be imported into anything that can reach a client component.
 */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    return null
  }

  return { url, key }
}

/**
 * A request-scoped Supabase client bound to the caller's cookies.
 *
 * Create a new one per request; never share one across requests. Returns null
 * when the deployment has no Supabase configuration, so callers can fail
 * closed instead of throwing on every route.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient | null> {
  const env = getSupabaseEnv()
  if (!env) {
    return null
  }

  const cookieStore = await cookies()

  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components cannot write cookies. That is expected and
          // harmless: middleware.ts refreshes the session on every request,
          // so a rotated token is always persisted there instead.
        }
      },
    },
  })
}

export type SessionPlanner = {
  userId: string
  email: string | null
  employeeId: string | null
  fullName: string | null
  appRole: string | null
  /** Brand the planner belongs to. Drives the portfolio scope and the
   *  group-CMPO brand switcher; null only if they have no planner row. */
  brandId: string | null
  regionId: string | null
}

/**
 * The signed-in planner, resolved from the session cookie.
 *
 * ACCOUNTABILITY (D5): this is the only trustworthy answer to "who is acting".
 * Every write path takes `accountable_planner` from the value returned here --
 * never from a request body, a form field, a header or a query parameter. A
 * caller can put any employee id in a payload; it cannot forge the session
 * cookie that current_planner() reads on the database side.
 *
 * Returns null when signed out, when the deployment is unconfigured, or when
 * the access token no longer validates against the auth server.
 */
export const getSessionPlanner = cache(async function getSessionPlanner(): Promise<SessionPlanner | null> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) {
    return null
  }

  // getUser() revalidates the JWT with the auth server. getSession() alone
  // trusts whatever is in the cookie, which is not good enough to hang an
  // audit trail on.
  const { data, error } = await supabase.auth.getUser()
  const user = data.user
  if (error || !user) {
    return null
  }

  // ONE RPC, NOT TWO.
  //
  // current_planner() returns an entire dim_planner row, and that row already
  // carries app_role. current_app_role() reads the SAME row under the SAME
  // predicate (auth_user_id = auth.uid() AND is_active), differing only in
  // substituting 'anonymous' when no row exists. The second call was asking
  // the database a question the first had already answered, at the cost of a
  // full network round trip on every render.
  //
  // A TRANSIENT failure here must not be mistaken for "this user has no
  // planner record". If the call fails and the error is ignored, every field
  // below resolves to null and this returns a SessionPlanner that is signed
  // in but anonymous -- which is what caused the intermittent 500s and the
  // half-rendered page in Phase 5. Accountability hangs off this value, so a
  // half-resolved identity is worse than no identity: retry once, then fail
  // closed. A planner who genuinely has no row still returns cleanly, because
  // that is a successful call with no data rather than a failed one.
  const resolve = () => supabase.rpc('current_planner')

  let plannerResult = await resolve()
  if (plannerResult.error) {
    plannerResult = await resolve()
  }
  if (plannerResult.error) {
    return null
  }

  const planner = firstRecord(plannerResult.data)

  // Exactly what current_app_role() would have returned: the row's app_role,
  // or 'anonymous' when the caller has no planner row at all.
  const roleRaw: unknown = planner
    ? readString(planner, 'app_role', 'appRole')
    : 'anonymous'

  return {
    userId: user.id,
    email: user.email ?? readString(planner, 'email'),
    employeeId: readString(planner, 'employee_id', 'employeeId'),
    fullName: readString(planner, 'full_name', 'fullName'),
    appRole: readAppRole(roleRaw),
    brandId: readString(planner, 'brand_id', 'brandId'),
    regionId: readString(planner, 'region_id', 'regionId'),
  }
})

/**
 * current_planner() may be declared to return a composite type (one object) or
 * a table (an array of one row). Accept either shape rather than guessing.
 */
function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? firstRecord(value[0]) : null
  }
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }
  return null
}

function readString(
  source: Record<string, unknown> | null,
  ...keys: readonly string[]
): string | null {
  if (!source) {
    return null
  }
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  }
  return null
}

/**
 * current_app_role() returns a scalar text value, which PostgREST delivers as a
 * bare string. Tolerate a single-column row as well.
 */
function readAppRole(value: unknown): string | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? readAppRole(value[0]) : null
  }
  if (typeof value === 'string') {
    return value.length > 0 ? value : null
  }
  return readString(firstRecord(value), 'current_app_role', 'app_role', 'role')
}
