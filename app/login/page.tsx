import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { redirect } from 'next/navigation'
import type { AuthError } from '@supabase/supabase-js'

import { createServerSupabaseClient, getSupabaseEnv } from '@/lib/session'
import LoginForm, { type LoginState } from './LoginForm'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Sign in - StyleVerse AI',
  description: 'Sign in to the StyleVerse AI planning workspace.',
}

const FALLBACK_PATH = '/'

/**
 * Login is an EMPLOYEE ID, never an email.
 *
 * Supabase Auth requires an email, so the employee id is lowercased onto a
 * domain that exists only to satisfy that requirement. Nobody types it and
 * no mail is ever sent there; every account is created pre-confirmed. The
 * domain is appended HERE, server-side, so the browser never has to know
 * the mapping and a planner never has to remember it.
 */
const LOGIN_DOMAIN = 'styleverse.ai'

/** EMP-SPD-0001 (any case, stray spaces tolerated) -> emp-spd-0001@styleverse.ai */
function emailForEmployeeId(raw: string): string | null {
  const id = raw.trim().toLowerCase()
  if (!/^emp-[a-z]{3}-\d{4}$/.test(id)) {
    return null
  }
  return `${id}@${LOGIN_DOMAIN}`
}

const PUBLIC_PREFIXES = ['/login', '/auth'] as const

/** Control characters (CR and LF included), DEL, and backslash. */
const UNSAFE_PATH_CHARS = /[\u0000-\u001F\u007F\\]/

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const nextParam = params.next
  const nextPath = safeNextPath(Array.isArray(nextParam) ? nextParam[0] : nextParam)

  // A signed-in visitor never gets here: middleware.ts bounces them onward
  // before this page renders.

  return (
    <main className={`${jakarta.className} lv-page`}>
      <style dangerouslySetInnerHTML={{ __html: LOGIN_CSS }} />
      <div className="lv-card">
        <div className="lv-mark">
          StyleVerse<span>AI</span>
        </div>
        <p className="lv-context">
          Decisions you commit are recorded against this account.
        </p>
        <LoginForm action={signIn} nextPath={nextPath} />
        <p className="lv-foot">Accounts are issued by your workspace administrator.</p>
      </div>
    </main>
  )
}

/**
 * Email and password only. No magic link and no OAuth: a judge on a conference
 * network must not have to reach an inbox or a third-party consent screen
 * halfway through a demo.
 *
 * Runs on the server, so @supabase/ssr writes the session into HttpOnly
 * cookies. Nothing is stored in localStorage and no token is handed to the
 * browser bundle.
 */
/**
 * THE SIX ACCOUNTS THIS DEPLOYMENT ADMITS.
 *
 * All 450 planner accounts exist in the database and every one of them has a
 * real, RLS-scoped view of the data. This deployment is a demonstration, and
 * a demonstration wants a known set of doors: these six span all six roles and
 * both brands, so anything worth showing can be shown through one of them.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. It gates the APPLICATION. It does not
 * disable the other 444 accounts in Supabase, so their credentials would still
 * work against the Supabase API directly. That is the honest description of a
 * front-door lock, and it is the right level for a demo: reversible by editing
 * one array, and it takes nothing away from the accounts themselves. If the
 * database itself needs locking down, the accounts have to be banned in
 * Supabase auth, which is a different and heavier operation.
 *
 * Row level security is unaffected either way -- it is what decides what each
 * of these six can SEE once they are in, and it would still scope any of the
 * other 444 correctly if they were let back in.
 */
const ADMITTED_EMPLOYEE_IDS: readonly string[] = [
  'EMP-SPD-0001', // Ava Menon         planner           SpeedStyle
  'EMP-SPD-0019', // Shreya Bose       category manager  SpeedStyle
  'EMP-SPD-0060', // Shreya Reddy      planning manager  SpeedStyle
  'EMP-SPD-0067', // Marco Patel       CMPO              SpeedStyle
  'EMP-ECO-0103', // Manav Bose        CMPO              EcoWeave
  'EMP-SPD-0295', // Aarav Chatterjee  group CMPO        both brands
]

async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  'use server'

  const employeeId = readField(formData, 'employee_id').trim()
  const password = readField(formData, 'password')

  // Re-validated here, not trusted from the hidden field. Anyone can post any
  // value; only a local path is ever followed.
  const target = safeNextPath(readField(formData, 'next'))

  if (!employeeId || !password) {
    return { error: 'Enter your employee ID and your password, then try again.' }
  }

  const email = emailForEmployeeId(employeeId)
  if (!email) {
    return {
      error:
        'That does not look like an employee ID. It reads like EMP-SPD-0001 -- three letters for the brand, then four digits.',
    }
  }

  // Checked BEFORE any credential reaches Supabase, so an id that is not
  // admitted cannot use this form to test passwords either. The message says
  // the account is not open on this deployment rather than that it does not
  // exist, because it does exist -- claiming otherwise would be a lie the
  // rest of this system does not tell.
  if (!ADMITTED_EMPLOYEE_IDS.includes(employeeId.toUpperCase())) {
    return {
      error:
        'That account is not open on this deployment. Six accounts are, one per role: EMP-SPD-0001 (planner), EMP-SPD-0019 (category manager), EMP-SPD-0060 (planning manager), EMP-SPD-0067 (CMPO, SpeedStyle), EMP-ECO-0103 (CMPO, EcoWeave), EMP-SPD-0295 (group CMPO).',
    }
  }

  if (!getSupabaseEnv()) {
    return {
      error:
        'This deployment has no Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart the server.',
    }
  }

  const supabase = await createServerSupabaseClient()
  if (!supabase) {
    return {
      error:
        'This deployment has no Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart the server.',
    }
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: describeAuthError(error) }
  }

  // redirect() throws, so it has to sit outside the try/catch-free path above.
  redirect(target)
}

function readField(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * Errors point at the next move rather than reporting a status. The
 * unconfirmed-address case gets its own sentence because the fix is different:
 * the password was right and nothing the planner types will help.
 */
function describeAuthError(error: AuthError): string {
  const code = error.code ?? ''

  if (code === 'email_not_confirmed' || /email not confirmed/i.test(error.message)) {
    return 'This account exists but its email address has never been confirmed, so it cannot sign in yet. Ask your workspace administrator to confirm it.'
  }

  if (code === 'invalid_credentials' || error.status === 400) {
    return 'That employee ID and password do not match an account. Check both, and check the ID reads like EMP-SPD-0001.'
  }

  if (code === 'user_banned') {
    return 'This account has been suspended. Your workspace administrator can restore it.'
  }

  if (code === 'over_request_rate_limit' || error.status === 429) {
    return 'Too many attempts from this network in the last minute. Wait a moment, then try once more.'
  }

  if (code === 'validation_failed' || code === 'email_address_invalid') {
    return 'That employee ID was not accepted. It reads like EMP-SPD-0001.'
  }

  return 'Sign-in could not be completed. Try once more; if it keeps failing, your workspace administrator can check the account.'
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
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
 * NOTE: kept identical to the copy in middleware.ts, which cannot import from
 * a module that pulls in next/headers.
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

/*
 * Scoped to .lv-* so it cannot reach the rest of the application. Values are
 * the literal design tokens from the production reference: cream #F4F1EE,
 * white card at 22px with the 0 6px 18px rgba(122,72,38,.10) shadow, 999px
 * pills, 14px notice, orange #D04A02 over #A33A00 on hover.
 */
const LOGIN_CSS = `
.lv-page,.lv-page *{box-sizing:border-box}
/* :where() keeps the reset at zero specificity so the rules below still win. */
.lv-page :where(p,form,div,label,input,button){margin:0}
.lv-page{
  flex:1;min-height:100dvh;display:flex;align-items:center;justify-content:center;
  padding:40px 20px;background:#F4F1EE;color:#231F1C;
  font-size:13px;line-height:1.45;-webkit-font-smoothing:antialiased;
}
.lv-page :focus-visible{outline:2px solid #D04A02;outline-offset:2px}
.lv-card{
  width:100%;max-width:380px;background:#FFF;border-radius:22px;
  padding:30px 28px 24px;box-shadow:0 6px 18px rgba(122,72,38,.10);
}
.lv-mark{font-size:20px;font-weight:800;letter-spacing:-.01em;line-height:1.2}
.lv-mark span{color:#D04A02}
.lv-context{margin-top:7px;font-size:12px;font-weight:600;color:#8D857D;line-height:1.5}
.lv-form{margin-top:24px;display:flex;flex-direction:column;gap:14px}
.lv-error{
  background:#F9DEDA;color:#C0392B;border-radius:14px;padding:11px 14px;
  font-size:12.5px;font-weight:600;line-height:1.55;
}
.lv-label{
  display:block;margin-bottom:6px;font-size:11px;font-weight:700;
  letter-spacing:.02em;color:#8D857D;
}
.lv-input{
  width:100%;height:42px;padding:0 16px;border:1px solid #E5DED7;border-radius:999px;
  background:#FBF7F3;color:#231F1C;font-family:inherit;font-size:13px;font-weight:500;
  outline:none;transition:border-color .12s,background .12s;
}
.lv-input:focus{border-color:#D04A02;background:#FFF}
.lv-submit{
  height:42px;margin-top:4px;border:none;border-radius:999px;
  background:#D04A02;color:#FFF;font-family:inherit;font-size:13px;font-weight:700;
  cursor:pointer;transition:background .12s,opacity .12s;
}
.lv-submit:hover{background:#A33A00}
.lv-submit:disabled{opacity:.55;cursor:default;background:#D04A02}
.lv-foot{
  margin-top:20px;padding-top:16px;border-top:1px solid #F0EBE5;
  font-size:11.5px;font-weight:600;color:#8D857D;line-height:1.6;
}
@media(prefers-reduced-motion:reduce){.lv-page *{transition:none!important}}
`
