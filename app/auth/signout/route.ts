import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { getSupabaseEnv } from '@/lib/session'

/**
 * Sign out.
 *
 * POST only: a GET would let any page on the internet log a planner out with
 * an <img> tag, and browsers pre-fetch links.
 *
 * Cookies are written onto the response object directly rather than through
 * next/headers, so clearing them is deterministic even on a redirect. Every
 * sb-* cookie the request carried is deleted whether or not the auth server is
 * reachable, so a network failure cannot leave a live session behind.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.nextUrl.origin), {
    // 303 makes the browser follow with GET instead of re-POSTing.
    status: 303,
  })

  const env = getSupabaseEnv()

  if (env) {
    const supabase = createServerClient(env.url, env.key, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value)
          }
        },
      },
    })

    // Revokes the refresh token server-side. signOut() writes the expired
    // cookies through setAll above.
    await supabase.auth.signOut()
  }

  // Belt and braces: drop anything auth-shaped the request still carried,
  // including a half-written chunked cookie from an interrupted refresh.
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.delete(cookie.name)
    }
  }

  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0')

  return response
}
