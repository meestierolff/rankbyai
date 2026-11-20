import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { reviewerLoginOn } from "@/lib/reviewer-login";
import { ReviewerForm } from "./reviewer-form";

export const metadata: Metadata = { title: "Reviewer sign-in", robots: { index: false, follow: false } };

/** Password sign-in for app-directory reviewers only. 404 unless REVIEWER_LOGIN_EMAILS lists an address. */
export default function Page() {
  if (!reviewerLoginOn()) notFound();
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[clamp(30px,6vw,38px)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance">Reviewer sign-in.</h1>
        <p className="m-0 text-[16px] leading-[1.6] text-muted-foreground">For app directory reviewers with a RankbyAI test account. Everyone else signs in with Google.</p>
      </div>
      <ReviewerForm />
      <p className="m-0 text-[14px] text-muted-foreground">
        <Link href="/login" className="text-fg underline underline-offset-[3px]">Sign in with Google instead</Link>
      </p>
    </div>
  );
}
