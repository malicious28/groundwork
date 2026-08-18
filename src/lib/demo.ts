/**
 * The demo credentials, in one place.
 *
 * They appear on the sign-in screen, in the seed script's output and in the
 * README, and three copies of the same list is three chances for one of them to
 * drift and send a reviewer to an account that does not exist.
 */

export const DEMO_PASSWORD = "demo1234";

export const DEMO_ACCOUNTS = [
  {
    email: "ashika@meridian.example",
    description: "the consultant — the full workspace, with the demo project",
  },
  {
    email: "rohit@novainteriors.example",
    description: "their client — sees only what was shared, read-only",
  },
  {
    email: "dev@northwind.example",
    description: "an unrelated firm — proof that it sees none of the above",
  },
] as const;
