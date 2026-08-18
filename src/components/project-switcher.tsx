"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NewProjectForm } from "./new-project-form";

type Row = { id: string; name: string };

/**
 * Switching projects and starting one, without leaving the dashboard. A
 * separate index page for a list that is usually one item long was a screen
 * standing between somebody and their work.
 */
export function ProjectSwitcher({
  projects,
  currentId,
}: {
  projects: Row[];
  currentId: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {projects.length > 1 ? (
          <select
            value={currentId}
            onChange={(event) => {
              router.push(`/dashboard?project=${event.target.value}`);
              router.refresh();
            }}
            aria-label="Switch project"
            className="max-w-[15rem] rounded border border-line bg-surface px-2 py-1.5 text-sm"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          onClick={() => setCreating((open) => !open)}
          aria-expanded={creating}
          className="rounded border border-line px-2.5 py-1.5 font-mono text-[11px] text-muted hover:border-accent hover:text-accent"
        >
          {creating ? "Cancel" : "New project"}
        </button>
      </div>

      {creating ? (
        <div className="w-full min-w-[min(32rem,80vw)] rounded border border-line bg-surface p-4">
          <NewProjectForm first={false} />
        </div>
      ) : null}
    </div>
  );
}
