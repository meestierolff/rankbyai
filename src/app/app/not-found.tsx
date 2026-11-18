import { EmptyState, PrimaryLink } from "@/components/app/ui";

/** A scan, audit, batch or business that does not exist in this workspace. */
export default function AppNotFound() {
  return (
    <EmptyState
      title="Not found in this workspace"
      body="This link points to something that was deleted, or that belongs to another workspace."
      action={<PrimaryLink href="/app">Back to the dashboard</PrimaryLink>}
    />
  );
}
