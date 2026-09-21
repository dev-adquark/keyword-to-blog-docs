import "server-only";
import { env } from "../env";
import { ApiError } from "../apiErrors";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS_PER_KEY = 3;

/**
 * Shared low-level Anthropic Messages API client — used by both the
 * evergreen generate/repair provider (anthropic.ts) and the freshness-
 * sensitive source-grounded rewriter (rewriter.ts), so retry/parse/timeout/
 * key-failover behavior can never drift between them. Deliberately has no
 * concept of tools/web search: neither caller ever offers Anthropic a
 * research capability (see rewriter.ts's module comment for why).
 */

/** Configured Anthropic API keys in try-order — the primary is always
 * present (required by env.ts); the secondary is only included if actually
 * configured. Keys are tried strictly one at a time, never concurrently —
 * see runWithRetries. */
function configuredApiKeys(): string[] {
  return [env.ANTHROPIC_API_KEY, env.ANTHROPIC_API_KEY_SECONDARY].filter((k): k is string => Boolean(k));
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model response did not contain a JSON object");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

interface AnthropicCallResult {
  text: string;
}

async function callAnthropicOnce(
  prompt: string,
  opts: { maxTokens?: number; model?: string; system?: string; apiKey: string }
): Promise<AnthropicCallResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = {
      model: opts.model ?? env.AI_MODEL,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [{ role: "user", content: prompt }],
    };
    if (opts.system) {
      // Prompt caching: this exact system text recurs on every call of the
      // same kind, so marking it as an ephemeral cache breakpoint lets
      // Anthropic skip re-processing it on cache hits within the TTL.
      body.system = [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }];
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 401/403 mean THIS key is invalid/unauthorized — no amount of
      // retrying it will help, so it's marked distinctly from "transient"
      // (which means "worth retrying the same key") to trigger an
      // immediate failover to the next configured key instead of wasting
      // this key's retry budget. 429/5xx are genuinely transient — retried
      // on the same key first (a rate limit or blip often clears in
      // seconds), and only escalate to failover once this key's own retry
      // budget is exhausted.
      const isAuthFailure = response.status === 401 || response.status === 403;
      const isTransient = response.status === 429 || response.status >= 500;
      const err = new Error(`Anthropic API responded with ${response.status}`);
      (err as Error & { transient?: boolean; authFailure?: boolean }).transient = isTransient;
      (err as Error & { transient?: boolean; authFailure?: boolean }).authFailure = isAuthFailure;
      throw err;
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
      stop_reason?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };

    if (data.stop_reason === "refusal") {
      const err = new Error("Content was refused by the model's safety system");
      (err as Error & { prohibited?: boolean }).prohibited = true;
      throw err;
    }

    const textBlock = data.content.find((b) => b.type === "text" && b.text);
    if (!textBlock?.text) {
      throw new Error("Anthropic response contained no text content");
    }

    const usage = {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      cacheReadInputTokens: data.usage?.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: data.usage?.cache_creation_input_tokens ?? 0,
    };
    // Internal token-usage tracking (never exposed publicly) — useful for
    // cost observability and confirming prompt caching is actually hitting.
    // Never logs which key was used — only that a call succeeded.
    console.info(JSON.stringify({ level: "info", message: "anthropic_call_usage", ...usage }));

    return { text: textBlock.text };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      const timeoutErr = new Error("Anthropic API request timed out");
      (timeoutErr as Error & { transient?: boolean }).transient = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Shared retry/parse/validate/key-failover orchestration for any prompt
 * that must return schema-valid JSON. For each configured Anthropic API
 * key, in order, up to 3 attempts are made (covering transient upstream
 * failures and truncated/malformed JSON responses — both plausibly a
 * one-off model hiccup, not a request-shape problem); an auth failure
 * (invalid/unauthorized key) short-circuits that key's remaining attempts
 * and moves straight to the next configured key. Keys are NEVER tried
 * concurrently, and the loop returns immediately on the first success —
 * so once any key produces a valid response, no further Anthropic call is
 * made, keeping the "N Anthropic calls per request" budgets in
 * anthropic.ts/rewriter.ts/engine.ts meaningful regardless of how many
 * keys are configured or how many of them are broken.
 */
export async function runWithRetries<T>(params: {
  prompt: string;
  system: string;
  maxTokens: number;
  model?: string;
  schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } };
  schemaFailureMessage: string;
  finalFailureMessage: string;
}): Promise<T> {
  let lastError: unknown;
  const apiKeys = configuredApiKeys();

  for (const apiKey of apiKeys) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_KEY; attempt++) {
      try {
        const { text } = await callAnthropicOnce(params.prompt, {
          maxTokens: params.maxTokens,
          system: params.system,
          model: params.model,
          apiKey,
        });
        const parsed = extractJson(text);
        const result = params.schema.safeParse(parsed);
        if (!result.success) {
          // Safe to log — this is the shape of the model's own JSON output, never a secret.
          console.error(
            JSON.stringify({
              level: "error",
              message: params.schemaFailureMessage,
              issues: result.error?.issues.map((i) => ({ path: i.path, message: i.message })),
            })
          );
          const validationErr = new Error("Model output failed schema validation");
          (validationErr as Error & { transient?: boolean }).transient = true;
          throw validationErr;
        }
        return result.data as T;
      } catch (err) {
        if (err instanceof Error && (err as Error & { prohibited?: boolean }).prohibited) {
          throw new ApiError(
            "PROHIBITED_INPUT",
            "The request could not be completed because the model declined to generate content for it."
          );
        }
        lastError = err;
        const authFailure = (err as { authFailure?: boolean } | undefined)?.authFailure;
        if (authFailure) break; // this key is broken — stop wasting its retry budget, try the next key
        const transient = (err as { transient?: boolean } | undefined)?.transient;
        if (!transient) break; // non-transient, non-auth failure — also try the next key rather than looping forever
      }
    }
  }

  console.error(
    JSON.stringify({
      level: "error",
      message: params.finalFailureMessage,
      error: lastError instanceof Error ? lastError.message : String(lastError),
      keysConfigured: apiKeys.length,
    })
  );
  throw new ApiError(
    "INTERNAL_ERROR",
    "Content generation is temporarily unavailable. Please try again shortly."
  );
}
