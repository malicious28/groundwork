"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className="rounded border border-line px-2 py-1 font-mono text-[11px] hover:border-accent hover:text-accent"
    >
      Sign out
    </button>
  );
}
