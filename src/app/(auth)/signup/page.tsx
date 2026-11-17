import type { Metadata } from "next";
import Link from "next/link";
import { miscEnv } from "@/lib/env";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign up", robots: { index: false, follow: false }, alternates: { canonical: "/signup" } };

export default function Page() {
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.03em]">Create your account.</h1>
        <p className="m-0 text-[16px] leading-normal text-muted-foreground">Start with your email. You can look around the app before you buy.</p>
      </div>
      <AuthForm mode="signup" turnstileSiteKey={miscEnv.turnstileSiteKey()} />
      <p className="m-0 text-[14px] text-muted-foreground">Already have an account? <Link href="/login" className="text-fg underline underline-offset-[3px]">Log in</Link></p>
      <p className="m-0 text-[13px] leading-normal text-dim">
        By continuing you agree to the <Link href="/terms" className="underline underline-offset-[3px]">Terms</Link> and{" "}
        <Link href="/privacy" className="underline underline-offset-[3px]">Privacy Policy</Link>.
      </p>
    </div>
  );
}
