import { test, expect, type Page } from "@playwright/test";

/**
 * The demo path, driven through the browser.
 *
 * This is deliberately the walkthrough a reviewer is shown, in order, so that
 * if any part of the story breaks, CI says so before a person discovers it
 * live. The assertions are about what a reader sees, not about implementation.
 */

const PASSWORD = "demo1234";

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signing in lands on the dashboard; the deep pages hang off the workspace. */
async function openNovaProject(page: Page) {
  await expect(
    page.getByRole("heading", { name: /Nova Interiors/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open the full workspace" }).click();
  // Wait for the address, not only the content: this is a client-side
  // navigation, and a caller that reads page.url() straight after can otherwise
  // still see the dashboard.
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/);
  await expect(page.getByText("Evidence ledger")).toBeVisible();
}

// Serial: the first test runs discovery, and the rest read what it produced.
// Running them independently would mean six discovery runs for no extra signal.
test.describe.serial("consultant walkthrough", () => {
  test("signs in, runs discovery, and every stage lands", async ({ page }) => {
    await signIn(page, "ashika@meridian.example");

    // Everything needed to start is on the dashboard: the sources are listed
    // and the button is there, with no navigating first.
    await expect(
      page.getByRole("heading", { name: /Nova Interiors/ }),
    ).toBeVisible();
    await expect(page.getByText(/sources ·/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /WhatsApp — Kharadi site group/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Run discovery" }).click();

    // Six stages, streamed. The brief's grounding line is the one that matters.
    await expect(
      page.getByText(/claims verified against source/),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/contradictions found/)).toBeVisible();
    await expect(page.getByText(/open questions/)).toBeVisible();
    await expect(page.getByText(/changes proposed/)).toBeVisible();
    await expect(page.getByText(/must-have/)).toBeVisible();
    await expect(page.getByText(/screens,/)).toBeVisible({ timeout: 60_000 });
  });

  test("the brief shows its grounding and can be traced to source", async ({
    page,
  }) => {
    await signIn(page, "ashika@meridian.example");
    await openNovaProject(page);
    await page.getByRole("link", { name: "Brief" }).click();

    // The headline number, and the fact that it is not 100%.
    await expect(page.getByText("84%")).toBeVisible();
    await expect(
      page.getByText(/27 of 32 claims verified against source/),
    ).toBeVisible();

    // Click a verified citation and read the sentence behind it.
    await page.getByRole("button", { name: /kickoff-call/ }).first().click();
    const panel = page.getByRole("dialog", { name: "Source evidence" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/Quoted exactly|Found in the source/)).toBeVisible();
    await expect(panel.locator("mark")).toBeVisible();
    await panel.getByRole("button", { name: "Close" }).click();
  });

  test("an unsupported claim is shown as unsupported", async ({ page }) => {
    await signIn(page, "ashika@meridian.example");
    await openNovaProject(page);
    await page.getByRole("link", { name: "Brief" }).click();

    // The planted requirement cites a sentence that appears in no source.
    const tally = page.getByText(/integrate directly with Tally/);
    await expect(tally).toBeVisible();

    const row = page.locator("li", { hasText: "integrate directly with Tally" }).last();
    const chip = row.getByRole("button", { name: /followup-call/ });
    await expect(chip).toHaveAttribute("title", /Not found|unsupported/);

    await chip.click();
    const panel = page.getByRole("dialog", { name: "Source evidence" });
    await expect(
      panel.getByText(/could not be located in the source/),
    ).toBeVisible();
  });

  test("a contradiction can be decided, and stays decided", async ({ page }) => {
    await signIn(page, "ashika@meridian.example");
    await openNovaProject(page);
    await page.getByRole("link", { name: "Conflicts" }).click();

    await expect(page.getByText(/Unresolved ·/)).toBeVisible();
    await expect(page.getByText(/two lakh/).first()).toBeVisible();

    const budgetCard = page.locator("li", { hasText: "two lakh" }).first();
    await budgetCard.getByRole("button", { name: "Record a decision" }).click();
    await budgetCard
      .getByRole("button", { name: /Five lakh|five lakh/ })
      .first()
      .click();

    await expect(page.getByText(/Decided ·/)).toBeVisible();
    await expect(page.getByText(/^Agreed:/)).toBeVisible();
  });

  test("the question pack is ready to send", async ({ page }) => {
    await signIn(page, "ashika@meridian.example");
    await openNovaProject(page);
    await page.getByRole("link", { name: "Questions" }).click();

    await expect(page.getByText("Blind-spot register")).toBeVisible();
    await expect(page.getByText(/Ready to send to Nova Interiors/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy message" })).toBeVisible();
  });

  test("the prototype renders inside a sandboxed frame", async ({ page }) => {
    await signIn(page, "ashika@meridian.example");
    await openNovaProject(page);
    await page.getByRole("link", { name: "Prototype" }).click();

    const frame = page.locator('iframe[title="Generated prototype"]');
    await expect(frame).toBeVisible();
    // No allow-same-origin: with it, the framed document could remove its own
    // sandbox. This assertion is the guard against someone "fixing" a console
    // warning by adding it.
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts");

    // And it is a working app, not a screenshot. `.first()` because the
    // client's project name appears both in the visible heading and in the
    // hidden project-list screen behind it.
    const inner = page.frameLocator('iframe[title="Generated prototype"]');
    await expect(
      inner.getByRole("heading", { name: /Kharadi 3BHK/ }),
    ).toBeVisible();
    await inner.getByRole("button", { name: /Approvals/ }).click();
    await expect(inner.getByRole("heading", { name: "Waiting on you" })).toBeVisible();
  });

  test("the prototype is testable: an action on one screen changes another", async ({
    page,
  }) => {
    await signIn(page, "ashika@meridian.example");
    await openNovaProject(page);
    await page.getByRole("link", { name: "Prototype" }).click();

    // Wait for the frame to exist and finish parsing its srcDoc before reaching
    // inside it. Without this the first locator can resolve against an iframe
    // whose document is still empty, and simply time out.
    await expect(
      page.locator('iframe[title="Generated prototype"]'),
    ).toBeVisible();
    const app = page.frameLocator('iframe[title="Generated prototype"]');
    await expect(app.getByRole("button", { name: "Client view" })).toBeVisible();

    // The whole point of the proposed workflow: a supervisor posts progress,
    // and it reaches the client without waiting for anyone. If this ever stops
    // working, the prototype has gone back to being a picture.
    await app.getByRole("button", { name: "Post update" }).click();
    await app.getByPlaceholder(/Putty second coat/).fill("Second coat done today.");
    await app.getByRole("button", { name: "Publish update" }).click();

    await expect(app.getByText("Second coat done today.")).toBeVisible();
    await expect(app.getByText(/on the client/i)).toBeVisible();

    // And the other half of the rule: anything touching a date, cost or scope
    // queues for approval instead, and only reaches the client once approved.
    await app.getByRole("button", { name: "Post update" }).click();
    await app.getByPlaceholder(/Putty second coat/).fill("Handover moves to 2 May.");
    await app.getByLabel(/date, a cost or a scope/).selectOption("sensitive");
    await app.getByRole("button", { name: "Publish update" }).click();

    await expect(app.getByRole("heading", { name: "Waiting on you" })).toBeVisible();
    await expect(app.getByText("Handover moves to 2 May.")).toBeVisible();

    // `.last()` because the queue is seeded with one item already and new ones
    // are appended — approving the wrong one would leave ours unpublished.
    await app.getByRole("button", { name: "Approve and publish" }).last().click();
    await expect(app.getByRole("heading", { name: /Kharadi 3BHK/ })).toBeVisible();
    await expect(app.getByText("Handover moves to 2 May.")).toBeVisible();
  });
});

test.describe("tenant isolation, through the browser", () => {
  test("another tenant cannot reach the project, even by URL", async ({
    page,
    context,
  }) => {
    await signIn(page, "ashika@meridian.example");
    await openNovaProject(page);
    const url = page.url();

    await context.clearCookies();
    await signIn(page, "dev@northwind.example");
    await expect(
      page.getByRole("heading", { name: /Ellis & Co/ }),
    ).toBeVisible();
    await expect(page.getByText("Nova Interiors")).toHaveCount(0);

    await page.goto(url);
    await expect(page.getByText(/could not be found/i)).toBeVisible();
  });

  test("a client is kept out of the consultant views", async ({ page }) => {
    await signIn(page, "rohit@novainteriors.example");
    await expect(page).toHaveURL(/\/shared$/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/shared$/);
  });
});

test.describe.serial("the client link", () => {
  test("opens with no account and hides the internal analysis", async ({
    page,
    context,
  }) => {
    await signIn(page, "ashika@meridian.example");
    await openNovaProject(page);
    await page.getByRole("link", { name: "Prototype" }).click();

    const create = page.getByRole("button", { name: "Create client link" });
    if (await create.isVisible()) await create.click();

    const link = page.locator("code", { hasText: "/s/" });
    await expect(link).toBeVisible();
    const url = (await link.textContent())!.trim();

    // A genuinely anonymous visitor.
    await context.clearCookies();
    await page.goto(url);

    await expect(page.getByText("What we understand you want")).toBeVisible();
    await expect(page.getByText("A first look")).toBeVisible();

    // None of the consultant's working notes.
    await expect(page.getByText(/Conflict radar/)).toHaveCount(0);
    await expect(page.getByText(/Tally/)).toHaveCount(0);
    await expect(page.getByText(/two lakh/)).toHaveCount(0);
  });
});

/**
 * Signing in and out is the one place where a broken navigation strands
 * somebody with nothing to click, so it is asserted from both ends: the good
 * path must actually land, and the rejected path must hand the form back.
 */
test.describe("the session boundary", () => {
  test("a wrong password returns the form rather than swallowing the click", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("ashika@meridian.example");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    // The button must come back, not sit on "Signing in…" forever.
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
    await expect(page).toHaveURL(/\/login/);
  });

  test("signing in lands on the projects list, and signing out leaves nothing behind", async ({
    page,
  }) => {
    await signIn(page, "ashika@meridian.example");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: /Nova Interiors/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    // The session is gone on the server too, not just visually.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
