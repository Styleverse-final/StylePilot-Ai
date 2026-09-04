import { NextResponse } from "next/server";

import type { Json } from "@/lib/database.types";

import {
  checkGrounding,
  extractRoute,
  groundedNumbers,
  sentences,
  ROUTE_WHITELIST,
} from "@/lib/copilot/guard";
import { classifyIntent, contextHash, retrieve, routeForIntent } from "@/lib/copilot/retrieve";
import { completeWithFailover, type LlmAttempt } from "@/lib/llm";
import { getSessionPlanner } from "@/lib/session";
import { createServerAnonClient } from "@/lib/supabase";

/**
 * POST /api/copilot
 *
 * THE ORDER OF THESE STEPS IS THE DESIGN. It is not an implementation detail:
 *
 *   1. classify the intent          -- deterministic, no model call
 *   2. retrieve THROUGH THE USER'S SESSION, so RLS scopes the copilot exactly
 *      as it scopes the screens. This happens BEFORE any model call, so a
 *      planner cannot ask their way into another region's rows: the rows are
 *      never in the process that builds the prompt.
 *   3. empty context -> say so and name the screen that would answer. NO MODEL
 *      CALL. An assistant that improvises when it has nothing is worse than one
 *      that admits it.
 *   4. call the LLM with the retrieved context
 *   5. parse NAVIGATE:<route>, validate against the whitelist, drop if invalid
 *   6. log question, context, route, answer, provider and latency
 *
 * Streaming: the answer is streamed SENTENCE BY SENTENCE rather than token by
 * token. Each sentence is checked against the retrieved context before it is
 * emitted, so a sentence containing an ungrounded number is dropped and never
 * reaches the browser. Token streaming would mean showing a fabricated figure
 * for a few hundred milliseconds before retracting it, which is not a thing a
 * merchandising system should ever do. This is still progressive -- sentences
 * appear as they are produced -- and it is the reason the grounding rule is an
 * actual guarantee rather than a hope.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = [
  "You are the StyleVerse planning copilot, answering a merchandising planner.",
  "",
  "You will be given CONTEXT: rows retrieved from the planner's own database",
  "scope. Answer ONLY from that context.",
  "",
  "HARD RULES:",
  "- Never state a number that is not in the CONTEXT. Not an estimate, not a",
  "  rounded guess, not a figure you remember from elsewhere. If the context",
  "  does not contain the number, say the data does not show it.",
  "- Do not describe your own reasoning or the retrieval process.",
  "- Be brief: two to four sentences. A planner is mid-task.",
  "- Write as a colleague, not as a chatbot. No greetings, no offers to help",
  "  further, no restating the question.",
  "- If a specific screen would show this better, end with NAVIGATE:/route on",
  `  its own line. Valid routes: ${ROUTE_WHITELIST.join(", ")}.`,
].join("\n");

type Body = { question?: unknown };

function sse(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "That question is too long." }, { status: 400 });
  }

  const planner = await getSessionPlanner();
  if (!planner) {
    return NextResponse.json({ error: "Sign in to use the copilot." }, { status: 401 });
  }

  // STEP 2: the caller's own session client. Never the service role -- doing so
  // here would hand the copilot every row in the database.
  const sb = await createServerAnonClient();

  // STEP 1
  const intent = classifyIntent(question);

  // STEP 2 (continued): retrieval under RLS, before any model call.
  const context = await retrieve(sb, intent, question);
  const hash = contextHash(question, context);

  const encoder = new TextEncoder();

  const log = async (fields: {
    answer: string;
    provider: string | null;
    model: string | null;
    route: string | null;
  }) => {
    // STEP 6. Best effort: a failed log must never break an answer the planner
    // is already reading.
    try {
      await sb.from("copilot_log").insert({
        planner_id: planner.employeeId,
        question,
        // The payload is JSON-serialisable by construction (it is exactly what
        // was serialised into the prompt), but Record<string, unknown> is wider
        // than Json, so the assertion is narrowing a true fact rather than
        // hiding an unknown one.
        retrieved_context: {
          intent: context.intent,
          sources: context.sources,
          data: context.data,
        } as unknown as Json,
        route_suggested: fields.route,
        answer: fields.answer,
        model: fields.model,
        provider: fields.provider,
        context_hash: hash,
        latency_ms: Date.now() - startedAt,
      });
    } catch {
      /* logging is not the product */
    }
  };

  // STEP 3: nothing retrieved -> no model call at all.
  if (context.empty) {
    const route = routeForIntent(intent);
    const answer =
      intent === "navigation"
        ? `That is on the ${route} screen.`
        : `I don't have data on that in what your account can read. The ${route} screen is where it would appear if there were any.`;

    await log({ answer, provider: null, model: null, route });

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sse("meta", {
          intent,
          sources: context.sources,
          provider: null,
          model: null,
          attempts: [],
          noData: true,
        })));
        controller.enqueue(encoder.encode(sse("text", { text: answer })));
        controller.enqueue(encoder.encode(sse("done", { route, latencyMs: Date.now() - startedAt })));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
    });
  }

  // The cache tier, looked up here because this is where the session client and
  // the context hash both exist. Matching on question AND context hash, so a
  // hit can only replay an answer built from rows in this same scope.
  const { data: cachedRows } = await sb
    .from("copilot_log")
    .select("answer, model")
    .eq("context_hash", hash)
    .eq("question", question)
    .not("answer", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const cached =
    cachedRows && cachedRows.length > 0 && cachedRows[0].answer
      ? { answer: cachedRows[0].answer, model: cachedRows[0].model }
      : null;

  // STEP 4
  const userPrompt = [
    `QUESTION: ${question}`,
    "",
    "CONTEXT (the only numbers you may use):",
    JSON.stringify(context.data, null, 1).slice(0, 24_000),
  ].join("\n");

  const llm = await completeWithFailover(SYSTEM_PROMPT, userPrompt, cached);

  if (!llm) {
    const answer =
      "The assistant is unavailable right now. Everything it would tell you is on the screens themselves, which are unaffected.";
    await log({ answer, provider: null, model: null, route: null });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sse("meta", {
          intent,
          sources: context.sources,
          provider: null,
          model: null,
          attempts: [],
          unavailable: true,
        })));
        controller.enqueue(encoder.encode(sse("text", { text: answer })));
        controller.enqueue(encoder.encode(sse("done", { route: null, latencyMs: Date.now() - startedAt })));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
    });
  }

  const allowed = groundedNumbers(context.data);
  const attempts: LlmAttempt[] = llm.attempts;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          sse("meta", {
            intent,
            sources: context.sources,
            provider: llm.provider,
            model: llm.model,
            attempts,
          }),
        ),
      );

      let pending = "";
      let emitted = "";
      let dropped = 0;

      const flush = (chunk: string) => {
        // STEP 5 runs per sentence too: a NAVIGATE directive is machine syntax
        // and must never be shown, valid or not.
        const { text } = extractRoute(chunk);
        if (!text.trim()) return;

        const verdict = checkGrounding(text, allowed);
        if (!verdict.grounded) {
          dropped += 1;
          return; // never reaches the browser
        }
        emitted += text;
        controller.enqueue(encoder.encode(sse("text", { text })));
      };

      try {
        for await (const piece of llm.chunks) {
          pending += piece;
          const parts = sentences(pending);
          // Keep the last fragment back: it may be an incomplete sentence.
          while (parts.length > 1) {
            flush(parts.shift() as string);
          }
          pending = parts[0] ?? "";
        }
        if (pending.trim()) flush(pending);
      } catch {
        // Provider died mid-stream. Whatever was validated already stands.
      }

      const { route } = extractRoute(emitted + " " + pending);

      if (!emitted.trim()) {
        const fallback =
          dropped > 0
            ? "I can't answer that from your data without stating a number the rows don't support, so I won't."
            : "I don't have enough in your scope to answer that.";
        emitted = fallback;
        controller.enqueue(encoder.encode(sse("text", { text: fallback })));
      } else if (dropped > 0) {
        const note = ` (${dropped} ${dropped === 1 ? "sentence was" : "sentences were"} withheld for stating figures not in the retrieved rows.)`;
        emitted += note;
        controller.enqueue(encoder.encode(sse("text", { text: note })));
      }

      const finalRoute = route ?? null;
      await log({
        answer: emitted,
        provider: llm.provider,
        model: llm.model,
        route: finalRoute,
      });

      controller.enqueue(
        encoder.encode(
          sse("done", {
            route: finalRoute,
            dropped,
            latencyMs: Date.now() - startedAt,
          }),
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
  });
}
