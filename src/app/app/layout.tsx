import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, ShellSkeleton } from "@/components/app/app-shell";
import { LockedBanner } from "@/components/app/ui";
import { SignupConversion } from "@/components/analytics/signup-conversion";
import { EarlyAccessBanner } from "@/components/marketing/early-access";
import { HackathonTracker } from "@/components/hackathon-tracker";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { requireSession } from "@/lib/auth";

// The app is fully request-time (auth + live data); pages stream behind the shell.
export const instant = false;

export const metadata: Metadata = { title: { default: "App", template: "%s | RankbyAI" }, robots: { index: false, follow: false } };

async function Authed({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession("/app");
  const lifetime = ctx.workspace.plan === "lifetime";
  return (
    // The early-access note is for people who have not bought yet; a lifetime workspace never sees it in the app.
    <AppShell ctx={ctx} banner={lifetime ? null : <>{ctx.workspace.plan === "locked" ? <LockedBanner /> : null}<EarlyAccessBanner /></>}>
      {children}
    </AppShell>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <HackathonTracker />
      <SignupConversion />
      <Suspense fallback={<ShellSkeleton />}>
        <Authed>{children}</Authed>
      </Suspense>
      <Toaster theme="dark" position="top-center" />
    </TooltipProvider>
  );
}
