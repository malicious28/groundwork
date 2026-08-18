import { describe, it, expect } from "vitest";
import { z } from "zod";
import { tightenForApi } from "../src/lib/ai/client";
import {
  BriefSchema,
  ConflictsSchema,
  OutlineSchema,
  ProcessSchema,
  PrototypeSchema,
  QuestionsSchema,
} from "../src/lib/ai/schemas";

/**
 * The schema sent with a structured-output request is a shape contract, and the
 * API rejects range keywords inside it:
 *
 *   output_config.format.schema: For 'integer' type, properties maximum,
 *   minimum are not supported
 *
 * The request is refused before the model sees it, so one `.min(1).max(3)`
 * anywhere in a schema breaks that entire stage — which is exactly what
 * happened, on the first real run after the demo. Every stage failed at the
 * first call with a message about JSON Schema, which reads like a bug in the
 * documents rather than in the request.
 *
 * Deleting the constraints outright would be worse than the error: severity
 * means nothing if the model may answer 7, and a two-word "quote" is not a
 * citation. So they move into the description, and Zod enforces them when the
 * answer comes back.
 */

const SCHEMAS = {
  brief: BriefSchema,
  conflicts: ConflictsSchema,
  questions: QuestionsSchema,
  process: ProcessSchema,
  outline: OutlineSchema,
  prototype: PrototypeSchema,
};

/**
 * Only what the API actually refuses. Probed against the real endpoint:
 * integer minimum/maximum and array minItems above 1 are rejected; string
 * minLength/maxLength and enum are accepted, and are left in place so the
 * model is held to the quote length while it writes rather than failing
 * validation four minutes later.
 */
const BANNED = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "$schema",
];

function findKeywords(node: unknown, path = "$", found: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((child, i) => findKeywords(child, `${path}[${i}]`, found));
    return found;
  }
  if (!node || typeof node !== "object") return found;
  for (const [key, value] of Object.entries(node)) {
    if (BANNED.includes(key)) found.push(`${path}.${key}`);
    findKeywords(value, `${path}.${key}`, found);
  }
  return found;
}

describe("the schema sent to the structured-output API", () => {
  it.each(Object.entries(SCHEMAS))(
    "%s carries no keyword the API refuses",
    (_name, schema) => {
      const json = tightenForApi(z.toJSONSchema(schema, { io: "output" }));
      expect(findKeywords(json)).toEqual([]);
    },
  );

  it.each(Object.entries(SCHEMAS))("%s still closes every object", (_name, schema) => {
    const json = tightenForApi(z.toJSONSchema(schema, { io: "output" }));
    const open: string[] = [];
    const walk = (node: unknown, path = "$") => {
      if (Array.isArray(node)) return node.forEach((c, i) => walk(c, `${path}[${i}]`));
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (record.type === "object" && record.properties) {
        if (record.additionalProperties !== false) open.push(path);
      }
      for (const [key, value] of Object.entries(record)) walk(value, `${path}.${key}`);
    };
    walk(json);
    expect(open).toEqual([]);
  });
});

describe("the constraint survives as words the model can read", () => {
  it("turns an integer range into a sentence", () => {
    const json = tightenForApi(
      z.toJSONSchema(z.object({ severity: z.number().int().min(1).max(3) })),
    ) as { properties: { severity: { description?: string } } };
    expect(json.properties.severity.description).toBe("Must be between 1 and 3.");
  });

  it("keeps the description that was already there", () => {
    const json = tightenForApi(
      z.toJSONSchema(
        z.object({
          severity: z.number().int().min(1).max(3).describe("3 = would derail the build."),
        }),
      ),
    ) as { properties: { severity: { description?: string } } };
    expect(json.properties.severity.description).toBe(
      "3 = would derail the build. Must be between 1 and 3.",
    );
  });

  it("keeps string lengths, because the API enforces those itself", () => {
    const json = tightenForApi(
      z.toJSONSchema(z.object({ quote: z.string().min(12).max(320) })),
    ) as { properties: { quote: { minLength?: number; maxLength?: number; description?: string } } };
    expect(json.properties.quote.minLength).toBe(12);
    expect(json.properties.quote.maxLength).toBe(320);
    expect(json.properties.quote.description).toBeUndefined();
  });

  it("moves an array minimum into words, since the API refuses it", () => {
    const json = tightenForApi(
      z.toJSONSchema(z.object({ sides: z.array(z.string()).min(2) })),
    ) as { properties: { sides: { minItems?: number; description?: string } } };
    expect(json.properties.sides.minItems).toBeUndefined();
    expect(json.properties.sides.description).toBe("Must be at least 2 items.");
  });

  it("leaves a field with no range alone", () => {
    const json = tightenForApi(z.toJSONSchema(z.object({ title: z.string() }))) as {
      properties: { title: { description?: string } };
    };
    expect(json.properties.title.description).toBeUndefined();
  });
});

describe("the rules are still enforced, just not by the API", () => {
  it("Zod rejects a severity outside the range on the way back", () => {
    const Row = z.object({ severity: z.number().int().min(1).max(3) });
    expect(() => Row.parse({ severity: 7 })).toThrow();
    expect(Row.parse({ severity: 3 })).toEqual({ severity: 3 });
  });

  it("Zod rejects a quote too short to be a citation", () => {
    const Row = z.object({ quote: z.string().min(12).max(320) });
    expect(() => Row.parse({ quote: "too short" })).toThrow();
  });

  it("an out-of-range severity falls back instead of losing the whole run", () => {
    const Row = z.object({ severity: z.number().int().min(1).max(3).catch(2) });
    expect(Row.parse({ severity: 7 }).severity).toBe(2);
    expect(Row.parse({ severity: 3 }).severity).toBe(3);
  });
});
