import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Route protection and session refresh.
 *
 * The matcher below runs this on every request except Next internals and
 * static assets, so the default for a new route is "protected". Only the
 * prefixes in PUBLIC_PREFIXES are reachable signed out.
 *
 * This file cannot import from lib/session.ts: that module pulls in
 * next/headers, which does not belong in the middleware bundle. The two small
 * helpers below are therefore deliberate copies of the ones in
 * app/login/page.tsx -- keep them in step.
 */

const PUBLIC_PREFIXES = ['/login', '/auth'] as const

const FALLBACK_PATH = '/'

/** Control characters (CR and LF included), DEL, and backslash. */
const UNSAFE_PATH_CHARS = /[\u0000-\u001F\u007F\\]/

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isPublic = isPublicPath(pathname)

  const env = getSupabaseEnv()
  if (!env) {
    // Unconfigured deployment: fail closed. Everything protected bounces to
    // /login, which explains what is missing rather than rendering a broken
    // application shell.
    return isPublic ? NextResponse.next() : redirectToLogin(request, pathname)
  }

  // The response is rebuilt whenever Supabase rotates a token, so the refreshed
  // cookies travel on the response the browser actually receives.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
        // Cache-Control: private, no-store and friends. A CDN caching a
        // response that sets auth cookies would serve one planner's session
        // to another.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value)
        }
      },
    },
  })

  // getUser() revalidates the token against the auth server. Do it before any
  // response is committed so a refresh can still be written back.
  const { data } = await supabase.auth.getUser()
  const user = data.user

  if (!user && !isPublic) {
    return redirectToLogin(request, pathname + request.nextUrl.search)
  }

  if (user && pathname === '/login') {
    // Already signed in. Honour the pending destination if there is a safe one.
    const target = safeNextPath(request.nextUrl.searchParams.get('next'))
    return NextResponse.redirect(new URL(target, request.nextUrl.origin))
  }

  return response
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

function redirectToLogin(request: NextRequest, attempted: string): NextResponse {
  const url = new URL('/login', request.nextUrl.origin)
  const target = safeNextPath(attempted)
  if (target !== FALLBACK_PATH) {
    url.searchParams.set('next', target)
  }
  return NextResponse.redirect(url)
}

function getSupabaseEnv(): { url: string; key: string } | null {
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
 * Open-redirect guard for the `next` parameter.
 *
 * A value is accepted only if it is a path on this origin. Anything else --
 * an absolute URL, a scheme, a protocol-relative "//host", a backslash that a
 * browser folds into a slash, a percent-encoded version of any of those, or a
 * control character that could split a response header -- is discarded and
 * replaced with "/". Nothing is repaired; suspicious input is dropped.
 *
 * NOTE: kept identical to the copy in app/login/page.tsx.
 */
function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) {
    return FALLBACK_PATH
  }

  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return FALLBACK_PATH
  }

  for (const candidate of [raw, decoded]) {
    if (UNSAFE_PATH_CHARS.test(candidate)) {
      return FALLBACK_PATH
    }
    // A local path is exactly one leading slash.
    if (candidate.charAt(0) !== '/' || candidate.charAt(1) === '/') {
      return FALLBACK_PATH
    }
  }

  // Final proof: resolve against a throwaway origin and require that the
  // result did not leave it.
  const base = 'http://styleverse.invalid'
  let resolved: URL
  try {
    resolved = new URL(raw, base)
  } catch {
    return FALLBACK_PATH
  }
  if (resolved.origin !== base || resolved.pathname.charAt(1) === '/') {
    return FALLBACK_PATH
  }

  // Never bounce back into the auth surface itself; that is a redirect loop,
  // not a destination.
  if (isPublicPath(resolved.pathname)) {
    return FALLBACK_PATH
  }

  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   _next/static, _next/image, _next/data  Next internals
     *   favicon.ico, robots.txt, sitemap.xml   root-level static files
     *   any path ending in a static asset extension
     * /login and /auth/* are matched on purpose -- the session still needs
     * refreshing there, and a signed-in visitor on /login is bounced onward.
     */
    '/((?!_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|xml|json|webmanifest|woff|woff2|ttf|otf)$).*)',
  ],
}
