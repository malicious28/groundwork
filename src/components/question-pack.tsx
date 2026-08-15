"use client";

import { useState } from "react";

/**
 * The open questions, composed into something a consultant can actually send.
 *
 * A list of gaps is an observation; a message ready to paste into WhatsApp is
 * the next action. The gap between those two is where most discovery findings
 * quietly die.
 */
export function QuestionPack({
  clientName,
  questions,
}: {
  clientName: string;
  questions: string[];
}) {
  const [copied, setCopied] = useState(false);

  const message = [
    `Hello — following up on our two calls, there are a few things we need before we can scope this properly.`,
    ``,
    ...questions.map((question, i) => `${i + 1}. ${question}`),
    ``,
    `Answers to these change what goes into the first release, so it is worth getting them right rather than fast. Happy to talk any of them through on a call.`,
  ].join("\n");

  return (
    <section className="rounded border border-accent bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold">
            Ready to send to {clientName}
          </h3>
          <p className="mt-1 text-sm text-muted">
            Every open question, phrased for a client rather than a backlog.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(message);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white"
        >
          {copied ? "Copied" : "Copy message"}
        </button>
      </div>

      <pre className="mt-4 max-h-80 overflow-y-auto rounded border border-line bg-ground p-4 font-sans text-sm whitespace-pre-wrap text-ink-2">
        {message}
      </pre>
    </section>
  );
}
