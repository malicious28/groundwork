import { createInterface } from "node:readline";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Puts the Anthropic key into .env, correctly.
 *
 * This exists because the manual version keeps going wrong in ways that look
 * identical from the app: the editor buffer is never saved, the value ends up
 * wrapped in the quotes it was copied with, or a second ANTHROPIC_API_KEY line
 * is appended below the blank one and the blank one still wins. All three end
 * with the app saying no key is set while the person is certain they set it.
 *
 * The key is read from stdin rather than an argument on purpose — an argument
 * would be written into shell history, and a key in ~/.zsh_history is a key you
 * have to rotate.
 */

const ENV = resolve(process.cwd(), ".env");
const KEY = "ANTHROPIC_API_KEY";

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((done) =>
    rl.question(question, (answer) => {
      rl.close();
      done(answer);
    }),
  );
}

/** Strips the quotes and whitespace a paste usually brings with it. */
function clean(raw: string): string {
  return raw.trim().replace(/^(['"])(.*)\1$/s, "$2").trim();
}

async function main() {
  if (!existsSync(ENV)) {
    const example = resolve(process.cwd(), ".env.example");
    if (!existsSync(example)) {
      console.error("✗ No .env and no .env.example to copy. Are you in the project root?");
      process.exit(1);
    }
    copyFileSync(example, ENV);
    console.log("→ created .env from .env.example");
  }

  const key = clean(await ask("Paste your Anthropic API key (it is not echoed back): "));

  if (!key) {
    console.error("✗ Nothing entered. Run it again.");
    process.exit(1);
  }
  if (!key.startsWith("sk-ant-")) {
    console.error(
      `✗ That does not look like an Anthropic key — they begin "sk-ant-". Nothing was written.`,
    );
    process.exit(1);
  }
  if (/\s/.test(key)) {
    console.error("✗ That has whitespace inside it, so it is probably truncated. Nothing was written.");
    process.exit(1);
  }

  const before = readFileSync(ENV, "utf8");
  const lines = before.split("\n");

  // Replace in place, and drop any duplicates further down: dotenv keeps the
  // first occurrence, so a second line appended at the bottom is silently
  // ignored — which is one of the ways this goes wrong unnoticed.
  const after: string[] = [];
  let written = false;
  for (const [i, line] of lines.entries()) {
    if (!line.startsWith(`${KEY}=`)) {
      after.push(line);
      continue;
    }
    if (written) {
      console.log(`→ removed a duplicate ${KEY} line (line ${i + 1})`);
      continue;
    }
    after.push(`${KEY}=${key}`);
    written = true;
  }

  if (!written) after.push(`${KEY}=${key}`);

  writeFileSync(ENV, after.join("\n"), "utf8");

  const check = readFileSync(ENV, "utf8")
    .split("\n")
    .find((line) => line.startsWith(`${KEY}=`));
  const stored = check?.slice(KEY.length + 1) ?? "";

  if (stored !== key) {
    console.error("✗ The file did not end up with what was entered. Nothing is set.");
    process.exit(1);
  }

  console.log(`\n✓ ${KEY} written to .env — ${key.length} characters, ending ${key.slice(-4)}`);
  console.log("\n  Now restart the dev server. .env is read once at startup, so a");
  console.log("  running server will not pick this up until you stop and start it.\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("✗ failed");
  console.error(error);
  process.exit(1);
});
