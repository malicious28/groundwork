"use client";

import { useState } from "react";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          // Even if the request failed, leave. A signed-out-looking screen that
          // still holds a live session is worse than a wasted round trip, and
          // the document load is what guarantees nothing of the old session is
          // left rendered behind it. See the note in the login form.
          window.location.assign("/login");
        }
      }}
      className="rounded border border-line px-2 py-1 font-mono text-[11px] hover:border-accent hover:text-accent disabled:opacity-60"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
