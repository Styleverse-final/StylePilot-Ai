#!/usr/bin/env bash
#
# StyleVerse -- Phase 7 Part B. Run from the web/ directory:
#
#     bash deploy.sh
#
# It does three things, in the order they have to happen:
#
#   1. pushes web/ to Styleverse-final/StylePilot-Ai (the repo is empty, so
#      this is the first commit and it becomes main)
#   2. sets the six environment variables on Vercel, for BOTH production and
#      preview, reading the values out of your local .env.local
#   3. triggers a production deploy
#
# It never echoes a secret. Values are piped straight from .env.local into
# `vercel env add`, so nothing lands in your shell history or scrollback.
#
# THE REPO ROOT IS web/, NOT THE PROJECT FOLDER. That is deliberate: it makes
# the Next app the root of the repository, so Vercel needs no Root Directory
# setting. The styleverse/ pipeline stays local, which is correct -- it is a
# batch job, it is not deployed, and it holds the service-role key.

set -euo pipefail

REPO="https://github.com/Styleverse-final/StylePilot-Ai.git"
ENV_FILE=".env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: run this from the web/ directory (no .env.local here)." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Push
# ---------------------------------------------------------------------------
echo "==> git"

if [ ! -d .git ]; then
  git init -b main
  git remote add origin "$REPO"
else
  git remote set-url origin "$REPO" 2>/dev/null || git remote add origin "$REPO"
fi

# .gitignore already excludes node_modules, .next and .env* -- verified before
# writing this script. Assert it rather than trusting it, because the cost of
# being wrong is a service-role key in a public repo, permanently.
if ! grep -qE '^\.env' .gitignore; then
  echo "ERROR: .gitignore does not exclude .env -- refusing to push." >&2
  exit 1
fi
if git status --porcelain --ignored=no | grep -q '\.env'; then
  echo "ERROR: a .env file is staged. Refusing to push." >&2
  exit 1
fi

git add -A
git commit -m "StyleVerse: 14 screens, 6 roles, RLS-scoped copilot" || echo "  (nothing new to commit)"
git push -u origin main

# ---------------------------------------------------------------------------
# 2. Environment variables, production AND preview
# ---------------------------------------------------------------------------
echo
echo "==> vercel env"
echo "    If this is your first run, 'vercel login' opens a browser."

npx vercel link --yes --project style-pilot-ai >/dev/null 2>&1 || true

VARS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  GEMINI_API_KEY
  GEMINI_MODEL
  OPENROUTER_API_KEY
)

for name in "${VARS[@]}"; do
  # Read the value without printing it. Everything after the first '=' is the
  # value, so a key containing '=' (base64 JWTs often do) survives intact.
  value="$(grep -m1 "^${name}=" "$ENV_FILE" | cut -d= -f2-)"
  if [ -z "$value" ]; then
    echo "  !! $name is not in $ENV_FILE -- skipped"
    continue
  fi
  for target in production preview; do
    # Remove first so a re-run updates rather than erroring on a duplicate.
    npx vercel env rm "$name" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | npx vercel env add "$name" "$target" >/dev/null 2>&1 \
      && echo "  set $name ($target)" \
      || echo "  !! failed to set $name ($target)"
  done
done

# ---------------------------------------------------------------------------
# 3. Deploy
# ---------------------------------------------------------------------------
echo
echo "==> deploying to production"
npx vercel deploy --prod --yes

cat <<'NOTE'

==> ONE MANUAL STEP REMAINS, and it is the one that usually breaks.

Supabase dashboard -> Authentication -> URL Configuration:

    Site URL       https://<your-vercel-domain>
    Redirect URLs  https://<your-vercel-domain>/**

Sign-in works perfectly on localhost and silently loops back to /login in
production when this is missing. If you sign in with correct credentials and
land back on the login page, this is why -- do not look anywhere else first.

Then paste me the deployment URL and I will run the full smoke suite against
it: all 14 routes over 6 roles, session persistence across a hard refresh, the
signed-out redirect, a Modify write reaching planner_decision, the copilot
answering and refusing, and a secret scan of the deployed client bundle.
NOTE
