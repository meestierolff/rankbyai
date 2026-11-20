import { HackathonTracker } from "@/components/hackathon-tracker";

/** Marketing pages: adds only the hackathon tracker (moved into <head> by React); each page keeps its own shell. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HackathonTracker />
      {children}
    </>
  );
}
