import type { Brief, ProcessArtifact, Prototype } from "@/lib/ai/schemas";
import { MermaidDiagram } from "@/components/mermaid-diagram";

/**
 * What a client sees, wherever they arrive from — a signed-in client account or
 * a forwarded share link. One component, so the two entry points cannot drift
 * apart and start disclosing different things.
 *
 * Deliberately not the whole brief. The conflict radar quotes the client's own
 * people disagreeing with each other, and the assumptions register lists what we
 * guessed. Both are working notes for the consultant; putting them in front of a
 * client would be a mistake dressed up as transparency.
 */
export function ClientView({
  projectName,
  brief,
  process,
  prototype,
}: {
  projectName: string;
  brief: Brief | null;
  process: ProcessArtifact | null;
  prototype: Prototype | null;
}) {
  const nothingPublished = !brief && !process && !prototype;

  return (
    <>
      <h1 className="mb-6 font-serif text-3xl font-semibold tracking-tight text-balance">
        {projectName}
      </h1>

      {nothingPublished ? (
        <p className="rounded border border-line bg-surface px-5 py-8 text-muted">
          Your consultant has not published anything for this project yet.
        </p>
      ) : null}

      {brief ? (
        <section className="mb-10">
          <p className="max-w-prose font-serif text-xl leading-snug text-balance">
            {brief.headline}
          </p>

          <h2 className="mt-8 mb-2 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
            What we understand you want
          </h2>
          <p className="max-w-prose">{brief.goal.text}</p>

          <h2 className="mt-8 mb-2 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
            What we heard is not working
          </h2>
          <ul className="flex flex-col gap-3">
            {brief.painPoints
              .filter((pain) => pain.severity >= 2)
              .map((pain, i) => (
                <li key={i} className="rounded border border-line bg-surface p-4">
                  <p className="font-medium">{pain.title}</p>
                  <p className="mt-1 text-sm text-ink-2">{pain.detail}</p>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {process ? (
        <section className="mb-10">
          <h2 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
            What we propose changes
          </h2>
          <div className="mb-4">
            <MermaidDiagram
              source={process.toBeMermaid}
              title="Proposed process"
            />
          </div>
          <ul className="flex flex-col gap-2">
            {process.changes.map((change, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{change.change}</span>
                <span className="text-muted"> — removes {change.removes}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {prototype ? (
        <section>
          <h2 className="mb-3 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
            A first look
          </h2>
          <p className="mb-3 max-w-prose text-sm text-muted">
            Clickable, and built from your own project names and terminology. It
            shows the idea rather than the finished product.
          </p>
          <div className="overflow-hidden rounded border border-line">
            <iframe
              title="Prototype"
              srcDoc={prototype.html}
              sandbox="allow-scripts"
              className="h-[700px] w-full border-0 bg-white"
            />
          </div>
        </section>
      ) : null}
    </>
  );
}
