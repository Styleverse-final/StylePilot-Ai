import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { getSupabaseEnv } from '@/lib/session'

/**
 * Sign out.
 *
 * POST only: a GET would let any page on the internet log a planner out with
 * an <img> tag, and browsers pre-fetch links.
 *
 * WHAT POST-ONLY COST US ONCE, SO IT IS NOT RE-LEARNED
 * ---------------------------------------------------
 * The app layout used to hand UserChip a server action whose whole body was
 * redirect('/auth/signout'). A redirect is followed by the browser with GET,
 * so every sign-out in production answered 405 -- while UserChip's own
 * correct form POST sat behind that prop, never used. The route was right the
 * entire time; the caller was not. The fix was to delete the action and let
 * the form post here directly, and to delete the prop so there is no longer a
 * second path that can quietly become the live one.
 *
 * The lesson is about coverage, not about POST: 78 passing renders and a
 * verified write did not catch it because nothing ever signed out. There is
 * now a sign-out case in the B4 smoke suite that asserts the 303 AND that the
 * cookie is gone afterwards.
 *
 * Cookies are written onto the response object directly rather than through
 * next/headers, so clearing them is deterministic even on a redirect. Every
 * sb-* cookie the request carried is deleted whether or not the auth server is
 * reachable, so a network failure cannot leave a live session behind.
 */
export async function POST(request: NextRequest) {
  // SAME-ORIGIN ONLY.
  //
  // The sign-out control is a plain <form method="post">, and a plain form
  // POST can be fired from any site. That is a forced logout rather than a
  // breach -- nothing is read and nothing is written but the end of a session
  // -- but it is free to close, and the server action this replaced got the
  // same check from Next for nothing.
  //
  // Only enforced when the browser actually sent Origin. Browsers always send
  // it on a cross-origin POST, so the attack is covered; its absence means a
  // non-browser caller, which is left to the auth check that follows.
  const origin = request.headers.get('origin')
  if (origin) {
    const host = request.headers.get('host')
    let sameOrigin = false
    try {
      sameOrigin = new URL(origin).host === host
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin) {
      return new NextResponse('Cross-origin sign-out refused.', { status: 403 })
    }
  }

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
