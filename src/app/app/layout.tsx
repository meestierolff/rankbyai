import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, ShellSkeleton } from "@/components/app/app-shell";
import { LockedBanner } from "@/components/app/ui";
import { EarlyAccessBanner } from "@/components/marketing/early-access";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { requireSession } from "@/lib/auth";

// The app is fully request-time (auth + live data); pages stream behind the shell.
export const instant = false;

export const metadata: Metadata = { title: { default: "App", template: "%s | RankbyAI" }, robots: { index: false, follow: false } };

async function Authed({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession("/app");
  return (
    <AppShell ctx={ctx} banner={<>{ctx.workspace.plan === "locked" ? <LockedBanner /> : null}<EarlyAccessBanner /></>}>
      {children}
    </AppShell>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Suspense fallback={<ShellSkeleton />}>
        <Authed>{children}</Authed>
      </Suspense>
      <Toaster theme="dark" position="top-center" />
    </TooltipProvider>
  );
}
