import "server-only";
import type { GenerateRequestV1, SEOPostV1 } from "@/lib/types";
import type { AIProvider } from "./provider";
import { env } from "../env";
import { seoPostSchema } from "../validation";
import { ApiError } from "../apiErrors";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_MS = 45_000;

function buildPrompt(req: GenerateRequestV1): string {
  return `Generate a long-form, SEO-formatted blog post as pure JSON (no markdown fences, no prose outside the JSON object).

Keywords: ${req.keywords.join(", ")}
${req.topic ? `Topic: ${req.topic}` : ""}
Language: ${req.language}
Tone: ${req.tone}
${req.targetAudience ? `Target audience: ${req.targetAudience}` : ""}
${req.industry ? `Industry: ${req.industry}` : ""}
Max words: ${req.constraints.maxWords}
${req.constraints.minWords ? `Min words: ${req.constraints.minWords}` : ""}
Include FAQs: ${req.constraints.includeFAQs ? "yes" : "no"}

Respond with ONLY a JSON object matching exactly this TypeScript shape:
{
  "title": string,
  "slugSuggestion": string,
  "meta": { "description": string, "primaryKeyword": string },
  "outline": { "h1": string, "h2": string[] },
  "sections": Array<{ "type": "introduction"|"body"|"faq"|"conclusion"|"callout", "heading"?: string, "contentMarkdown": string, "callout"?: { "label": string, "text": string } }>,
  "faqs"?: Array<{ "question": string, "answer": string }>,
  "conclusion": string,
  "coverageNotes"?: { "keywordCoverage": Array<{ "keyword": string, "covered": boolean, "evidence": string }> }
}`;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model response did not contain a JSON object");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function callAnthropicOnce(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const isTransient = response.status === 429 || response.status >= 500;
      const err = new Error(`Anthropic API responded with ${response.status}`);
      (err as Error & { transient?: boolean }).transient = isTransient;
      throw err;
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content.find((b) => b.type === "text");
    if (!textBlock?.text) {
      throw new Error("Anthropic response contained no text content");
    }
    return textBlock.text;
  } finally {
    clearTimeout(timeout);
  }
}

export class AnthropicProvider implements AIProvider {
  async generate(request: GenerateRequestV1): Promise<SEOPostV1> {
    const prompt = buildPrompt(request);
    let lastError: unknown;

    // One retry on transient upstream failures only — never on validation issues.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await callAnthropicOnce(prompt);
        const parsed = extractJson(text);
        const result = seoPostSchema.safeParse(parsed);
        if (!result.success) {
          throw new Error("Model output failed schema validation");
        }
        return result.data as SEOPostV1;
      } catch (err) {
        lastError = err;
        const transient = (err as { transient?: boolean } | undefined)?.transient;
        if (!transient) break;
      }
    }

    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        level: "error",
        message: "generation_provider_failure",
        error: lastError instanceof Error ? lastError.message : String(lastError),
      })
    );
    throw new ApiError(
      "INTERNAL_ERROR",
      "Content generation is temporarily unavailable. Please try again shortly."
    );
  }
}

export function getAIProvider(): AIProvider {
  return new AnthropicProvider();
}
