/**
 * The copilot's provider chain.
 *
 * THREE TIERS, tried in order, and the caller is never told which one failed:
 *
 *   1. Gemini            GEMINI_API_KEY, model from GEMINI_MODEL
 *   2. OpenRouter        OPENROUTER_API_KEY, :free variants ONLY
 *   3. Cache             a previous answer built from the SAME retrieved context
 *
 * WHY OPENROUTER IS PINNED TO :free
 * ---------------------------------
 * The account has never purchased credits, so any paid model id returns 402
 * Payment Required -- which is not a transient error and would burn the tier
 * on every request. Only :free ids are permitted here, and a caller that
 * somehow supplies a paid id is rejected before the request leaves the process
 * rather than after the provider charges for the round trip.
 *
 * WHAT COUNTS AS "FALL THROUGH"
 * -----------------------------
 * 429 (rate limited) and 5xx (provider fault) fall through to the next tier,
 * because a different provider plausibly succeeds. A 400 or 401 does NOT: that
 * is a bug in our request or a bad key, and quietly trying the next provider
 * would hide a defect we need to see in the log. Both are recorded; neither is
 * ever surfaced to the user as a provider error.
 *
 * WHY THE CACHE IS KEYED ON CONTEXT, NOT ON THE QUESTION
 * ------------------------------------------------------
 * Tiers 1 and 2 only ever see rows the caller's own session could read,
 * because retrieval runs under their cookie before any model call. A cache
 * keyed on the question alone would defeat that in one step: two planners in
 * different regions ask the same words, and the second is served an answer
 * built from the first one's rows. So the cache matches on a hash of the
 * RETRIEVED CONTEXT as well, which makes a hit a replay of an answer this
 * scope already produced.
 */

export type Provider = "gemini" | "openrouter" | "cache";

export type LlmChunk = { text: string };

export type LlmAttempt = {
  provider: Provider;
  model: string;
  ok: boolean;
  status?: number;
  reason?: string;
};

export type LlmStream = {
  provider: Provider;
  model: string;
  /** Yields text as the provider produces it. */
  chunks: AsyncGenerator<string, void, unknown>;
  /** Every tier tried before this one succeeded, for the sources panel. */
  attempts: LlmAttempt[];
};

/** Only these OpenRouter ids may be used. Confirmed working on a credit-less account. */
const OPENROUTER_FREE_MODELS = ["inclusionai/ling-3.0-flash-fin:free"] as const;

const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";
const REQUEST_TIMEOUT_MS = 30_000;

/** 429 and 5xx are worth another provider. 4xx otherwise is our bug, not theirs. */
function shouldFallThrough(status: number): boolean {
  return status === 429 || status >= 500;
}

function timeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

/* -------------------------------------------------------------------------- */
/* Gemini                                                                      */
/* -------------------------------------------------------------------------- */

async function* geminiChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // streamGenerateContent with alt=sse emits "data: {...}" lines.
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        for (const part of parsed.candidates?.[0]?.content?.parts ?? []) {
          if (part.text) yield part.text;
        }
      } catch {
        // A partial JSON frame across a chunk boundary: skip it rather than
        // failing the whole answer. The next frame carries the same content.
      }
    }
  }
}

async function tryGemini(
  system: string,
  user: string,
): Promise<{ stream: LlmStream } | { attempt: LlmAttempt }> {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
  if (!key) {
    return { attempt: { provider: "gemini", model, ok: false, reason: "no key configured" } };
  }

  const { signal, clear } = timeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
        }),
        signal,
      },
    );

    if (!res.ok || !res.body) {
      clear();
      return {
        attempt: {
          provider: "gemini",
          model,
          ok: false,
          status: res.status,
          reason: shouldFallThrough(res.status) ? "transient, fell through" : "request rejected",
        },
      };
    }

    const body = res.body;
    return {
      stream: {
        provider: "gemini",
        model,
        attempts: [],
        chunks: (async function* () {
          try {
            yield* geminiChunks(body);
          } finally {
            clear();
          }
        })(),
      },
    };
  } catch (e) {
    clear();
    return {
      attempt: {
        provider: "gemini",
        model,
        ok: false,
        reason: e instanceof Error ? e.name : "network error",
      },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* OpenRouter                                                                  */
/* -------------------------------------------------------------------------- */

async function* openRouterChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        // Partial frame; the next one carries it.
      }
    }
  }
}

async function tryOpenRouter(
  system: string,
  user: string,
): Promise<{ stream: LlmStream } | { attempt: LlmAttempt }> {
  const key = process.env.OPENROUTER_API_KEY;
  const model = OPENROUTER_FREE_MODELS[0];
  if (!key) {
    return { attempt: { provider: "openrouter", model, ok: false, reason: "no key configured" } };
  }
  // Belt and braces: the constant above is the only source of model ids, but a
  // paid id reaching this call would 402 on every request rather than falling
  // through, so the invariant is asserted rather than assumed.
  if (!model.endsWith(":free")) {
    return {
      attempt: { provider: "openrouter", model, ok: false, reason: "non-free model id refused" },
    };
  }

  const { signal, clear } = timeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "x-title": "StyleVerse Copilot",
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      clear();
      return {
        attempt: {
          provider: "openrouter",
          model,
          ok: false,
          status: res.status,
          reason:
            res.status === 402
              ? "payment required -- the account holds no credits, so only :free ids work"
              : shouldFallThrough(res.status)
                ? "transient, fell through"
                : "request rejected",
        },
      };
    }

    const body = res.body;
    return {
      stream: {
        provider: "openrouter",
        model,
        attempts: [],
        chunks: (async function* () {
          try {
            yield* openRouterChunks(body);
          } finally {
            clear();
          }
        })(),
      },
    };
  } catch (e) {
    clear();
    return {
      attempt: {
        provider: "openrouter",
        model,
        ok: false,
        reason: e instanceof Error ? e.name : "network error",
      },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* The chain                                                                   */
/* -------------------------------------------------------------------------- */

export type CachedAnswer = { answer: string; model: string | null };

/**
 * Run the chain and return the first tier that produced a stream.
 *
 * `cached` is looked up by the CALLER, which already holds the context hash and
 * the session client, so this module never touches the database.
 *
 * Returns null only when every tier is exhausted -- the caller then writes a
 * plain sentence saying the assistant is unavailable, which is the one thing a
 * user is told. No provider status, no model id, no upstream message.
 */
export async function completeWithFailover(
  system: string,
  user: string,
  cached: CachedAnswer | null,
): Promise<LlmStream | null> {
  const attempts: LlmAttempt[] = [];

  const gemini = await tryGemini(system, user);
  if ("stream" in gemini) return { ...gemini.stream, attempts };
  attempts.push(gemini.attempt);

  const openrouter = await tryOpenRouter(system, user);
  if ("stream" in openrouter) return { ...openrouter.stream, attempts };
  attempts.push(openrouter.attempt);

  if (cached) {
    const text = cached.answer;
    return {
      provider: "cache",
      model: cached.model ?? "cache",
      attempts,
      chunks: (async function* () {
        yield text;
      })(),
    };
  }
  attempts.push({
    provider: "cache",
    model: "cache",
    ok: false,
    reason: "no earlier answer for this question and this retrieved context",
  });

  return null;
}

/** Exposed so the sources panel can name the chain without duplicating it. */
export const PROVIDER_CHAIN: readonly Provider[] = ["gemini", "openrouter", "cache"];
