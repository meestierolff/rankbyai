import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { RedeemForm } from "./redeem-form";

export const metadata: Metadata = { title: "Redeem your AppSumo code", robots: { index: false, follow: false } };

export default function RedeemPage() {
  return <Suspense fallback={<p role="status">Loading your workspace…</p>}><RedeemWorkspace /></Suspense>;
}

async function RedeemWorkspace() {
  const ctx = await requireSession("/redeem");
  return (
    <div className="flex flex-col gap-5">
      <h1 className="m-0 text-[32px] leading-tight font-semibold tracking-tight">Redeem your AppSumo code</h1>
      <p className="m-0 text-[15px] leading-relaxed text-muted-foreground">Activate lifetime access for <strong className="text-fg">{ctx.workspace.name}</strong>, signed in as {ctx.user.email}.</p>
      {ctx.role !== "owner" ? <p role="alert">Ask your workspace owner to redeem this code.</p> : <RedeemForm />}
      <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">One code unlocks one workspace. Codes do not stack. Connect your own provider keys to run scans; API vendors bill usage separately.</p>
      <p className="m-0 text-[13px] text-muted-foreground">Need help? <a href="mailto:mees@rankbyai.live" className="underline">mees@rankbyai.live</a></p>
      <Link href="/app" className="text-[14px] text-fg underline">Go to your workspace</Link>
    </div>
  );
}
