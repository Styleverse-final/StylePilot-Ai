'use client'

import { useActionState } from 'react'

export type LoginState = {
  error: string | null
}

export const LOGIN_INITIAL_STATE: LoginState = { error: null }

type LoginFormProps = {
  /**
   * A server action. Sign-in runs on the server so the access and refresh
   * tokens are written straight into HttpOnly cookies. No token ever reaches
   * client JavaScript, and nothing is written to localStorage.
   */
  action: (state: LoginState, formData: FormData) => Promise<LoginState>
  /** Already validated on the server; re-validated again when submitted. */
  nextPath: string
}

export default function LoginForm({ action, nextPath }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(action, LOGIN_INITIAL_STATE)

  return (
    <form action={formAction} className="lv-form">
      <input type="hidden" name="next" value={nextPath} />

      {state.error ? (
        <p className="lv-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div>
        <label className="lv-label" htmlFor="lv-employee-id">
          Employee ID
        </label>
        <input
          className="lv-input"
          id="lv-employee-id"
          name="employee_id"
          type="text"
          autoComplete="username"
          placeholder="EMP-SPD-0001"
          spellCheck={false}
          autoCapitalize="characters"
          required
          autoFocus
        />
      </div>

      <div>
        <label className="lv-label" htmlFor="lv-password">
          Password
        </label>
        <input
          className="lv-input"
          id="lv-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <button className="lv-submit" type="submit" disabled={pending}>
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}
