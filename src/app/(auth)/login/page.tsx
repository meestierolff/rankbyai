import type { Metadata } from "next";
import Link from "next/link";
import { miscEnv } from "@/lib/env";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Log in", robots: { index: false, follow: false }, alternates: { canonical: "/login" } };

export default function Page() {
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.03em]">Welcome back.</h1>
        <p className="m-0 text-[16px] leading-normal text-muted-foreground">Enter your email and we will send you a sign-in link.</p>
      </div>
      <AuthForm mode="login" turnstileSiteKey={miscEnv.turnstileSiteKey()} />
      <p className="m-0 text-[14px] text-muted-foreground">New here? <Link href="/signup" className="text-fg underline underline-offset-[3px]">Create an account</Link></p>
      <p className="m-0 text-[13px] leading-normal text-dim">
        By continuing you agree to the <Link href="/terms" className="underline underline-offset-[3px]">Terms</Link> and{" "}
        <Link href="/privacy" className="underline underline-offset-[3px]">Privacy Policy</Link>.
      </p>
    </div>
  );
}
