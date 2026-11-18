/** Shown inside the app frame while a page's data loads. Shapes match the usual page: title, tiles, a panel. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-6">
      <div className="h-8 w-56 max-w-full animate-pulse rounded-lg bg-surface-2" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-[14px] border border-border bg-surface" />)}
      </div>
      <div className="h-64 animate-pulse rounded-[14px] border border-border bg-surface" />
    </div>
  );
}
