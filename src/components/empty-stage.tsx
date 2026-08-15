export function EmptyStage({ what }: { what: string }) {
  return (
    <div className="rounded border border-line bg-surface px-5 py-8">
      <p className="font-serif text-lg">Nothing here yet</p>
      <p className="mt-1 max-w-prose text-sm text-muted">
        {what} appears once you run discovery. Use the button at the top of the
        page — it reads every source in the ledger and verifies each claim it
        makes against them.
      </p>
    </div>
  );
}
