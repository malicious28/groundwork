"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The five stages, in the order they are produced. Presenting them as a
 * sequence is not decoration — each one is built from the one before it, and a
 * reader who opens the outline without seeing the brief has skipped the
 * evidence the outline rests on.
 */
const TABS = [
  { slug: "", label: "Sources" },
  { slug: "brief", label: "Brief" },
  { slug: "conflicts", label: "Conflicts" },
  { slug: "questions", label: "Questions" },
  { slug: "process", label: "Process" },
  { slug: "outline", label: "Outline" },
  { slug: "prototype", label: "Prototype" },
  { slug: "compare", label: "Compare" },
];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto pt-5">
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = pathname === href;
        return (
          <Link
            key={tab.slug || "sources"}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
              active
                ? "border-accent font-medium text-accent"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
