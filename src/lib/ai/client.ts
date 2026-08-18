import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { ModelUsage } from "@/db/schema";

/**
 * The Claude layer.
 *
 * The official Anthropic SDK is used directly rather than a wrapper, for two
 * reasons that matter to this app: prompt caching needs `cache_control` placed
 * on a specific content block, and structured output needs the exact JSON
 * schema on the request. Both are first-class here and abstracted away
 * elsewhere.
 */

export const DEFAULT_MODEL = "claude-opus-5";
/** Cheap pass for per-document summarising at ingest. */
export const FAST_MODEL = "claude-haiku-4-5";

/**
 * Whether there is a key worth trying.
 *
 * `Boolean(value)` was too generous. A line left as `ANTHROPIC_API_KEY=` reads
 * as unset, which is right — but `= " "`, or a value still wrapped in the
 * quotes it was pasted with, read as *set*, and the app would then announce it
 * was analysing for real before failing deep inside an HTTP call with an
 * authentication error that says nothing about the .env file. The three ways a
 * key actually gets mis-set are an empty value, stray whitespace, and quotes,
 * so all three are treated as absent.
 */
export function hasApiKey(): boolean {
  return apiKey().length > 0;
}

/** The key as the SDK should receive it: unquoted and trimmed. */
export function apiKey(): string {
  const raw = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  const unquoted = raw.replace(/^(['"])(.*)\1$/s, "$2").trim();
  return unquoted;
}

export function getModel(): string {
  return process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
}

let cached: Anthropic | null = null;
function getClient(): Anthropic {
  if (!cached) {
    cached = new Anthropic({ apiKey: apiKey() });
  }
  return cached;
}

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly kind: "no_key" | "refusal" | "invalid_output" | "api",
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

/**
 * Anthropic's structured output requires every object to close itself off:
 * `additionalProperties: false`, and every property listed as required. Zod's
 * JSON Schema export does not do the second by default, so it is enforced here
 * rather than repeated across six schema definitions.
 */
function tighten(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tighten);
  if (node === null || typeof node !== "object") return node;

  const schema = { ...(node as Record<string, unknown>) };
  for (const key of Object.keys(schema)) {
    schema[key] = tighten(schema[key]);
  }

  if (schema.type === "object" && schema.properties) {
    schema.additionalProperties = false;
    schema.required = Object.keys(schema.properties as object);
  }
  // `$schema` is not accepted inside the format block.
  delete schema.$schema;
  return schema;
}

export type GenerateArgs<T extends z.ZodType> = {
  system: string;
  /** Stable prefix, cached across calls. Order must not change between them. */
  corpus: string;
  /** Varies per artifact; goes after the cache breakpoint. */
  instruction: string;
  schema: T;
  schemaName: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
};

export type GenerateResult<T> = { output: T; usage: ModelUsage };

export async function generateStructured<T extends z.ZodType>({
  system,
  corpus,
  instruction,
  schema,
  schemaName,
  maxTokens = 16000,
  effort = "high",
}: GenerateArgs<T>): Promise<GenerateResult<z.infer<T>>> {
  if (!hasApiKey()) {
    throw new GenerationError(
      "ANTHROPIC_API_KEY is not set, so nothing can be generated. Add it to .env and restart.",
      "no_key",
    );
  }

  const { z: zod } = await import("zod");
  const jsonSchema = tighten(
    zod.toJSONSchema(schema, { io: "output" }),
  ) as Record<string, unknown>;

  const startedAt = Date.now();
  const client = getClient();

  // Streamed because a long-context call with a large output can otherwise sit
  // past an HTTP timeout, and because it keeps the connection alive while the
  // model works.
  const stream = client.messages.stream({
    model: getModel(),
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: system,
        // System prompt and corpus form the stable prefix. The breakpoint sits
        // on the last corpus block below, so tools + system + corpus are cached
        // together and every later artifact call reads them back at a fraction
        // of the price.
      },
    ],
    output_config: {
      effort,
      format: { type: "json_schema", schema: jsonSchema, name: schemaName },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: corpus,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: instruction },
        ],
      },
    ],
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (error) {
    throw new GenerationError(
      error instanceof Error ? error.message : "The model call failed.",
      "api",
    );
  }

  // A safety decline arrives as a successful response, not an exception, so it
  // has to be checked before the content is read.
  if (message.stop_reason === "refusal") {
    throw new GenerationError(
      "The model declined this request. If the sources contain sensitive material, remove it and try again.",
      "refusal",
    );
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  let parsed: z.infer<T>;
  try {
    parsed = schema.parse(JSON.parse(text));
  } catch (error) {
    throw new GenerationError(
      `The model returned output that did not match the ${schemaName} schema: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      "invalid_output",
    );
  }

  return {
    output: parsed,
    usage: {
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
    },
  };
}
