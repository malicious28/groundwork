/**
 * Identifiers arriving from a URL.
 *
 * Every id in this schema is a uuid, and Postgres rejects anything else with a
 * type error rather than an empty result. That error surfaced as a 500 with an
 * empty body: a mistyped or stale link crashed the page instead of saying the
 * thing could not be found, and the API did the same to any caller. Checking
 * the shape before the query turns "the database refused to parse that" back
 * into the answer the reader actually needs, which is 404.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: string | undefined | null): boolean =>
  typeof value === "string" && UUID.test(value);
