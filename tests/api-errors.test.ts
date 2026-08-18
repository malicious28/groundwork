import { describe, it, expect } from "vitest";
import { explainApiFailure } from "../src/lib/ai/client";

/**
 * What the model call failed with has to survive the trip to the screen.
 *
 * The SDK throws with the HTTP status followed by the raw JSON body, so the
 * useful sentence is buried inside `400 {"type":"error","error":{...}}`. That
 * is what a consultant saw when the account ran out of credit — a JSON blob in
 * an alert box, from which they were expected to work out that the problem was
 * billing rather than their documents.
 */

const sdkError = (status: number, type: string, message: string) =>
  new Error(
    `${status} ${JSON.stringify({ type: "error", error: { type, message }, request_id: "req_x" })}`,
  );

describe("explaining a failed model call", () => {
  it("names a spent quota, and says the demo still works", () => {
    const out = explainApiFailure(
      sdkError(
        400,
        "invalid_request_error",
        "You have reached your specified API usage limits. You will regain access on 2026-09-01 at 00:00 UTC.",
      ),
    );
    expect(out).toMatch(/no capacity left/i);
    expect(out).toContain("2026-09-01");
    expect(out).not.toContain("{");
  });

  it("tells you to wait when it is a rate limit", () => {
    const out = explainApiFailure(
      sdkError(429, "rate_limit_error", "Number of requests has exceeded your rate limit."),
    );
    expect(out).toMatch(/rate-limiting/i);
    expect(out).toMatch(/nothing was lost/i);
  });

  it("points at the key when the key is rejected", () => {
    const out = explainApiFailure(
      sdkError(401, "authentication_error", "invalid x-api-key"),
    );
    expect(out).toMatch(/rejected the API key/i);
    expect(out).toContain("set-key");
  });

  it("keeps the API's own sentence rather than inventing one", () => {
    const out = explainApiFailure(
      sdkError(500, "api_error", "Something specific went wrong upstream."),
    );
    expect(out).toBe("Something specific went wrong upstream.");
  });

  it("survives an error that is not JSON at all", () => {
    expect(explainApiFailure(new Error("socket hang up"))).toBe("socket hang up");
    expect(explainApiFailure("plain string")).toBe("plain string");
  });
})
