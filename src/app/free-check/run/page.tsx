import type { Metadata } from "next";
import Link from "next/link";
import { LogoLockup } from "@/components/brand/logo";
import { RunFreeCheck } from "./run-client";

export const metadata: Metadata = { title: "Running your free check", robots: { index: false, follow: false } };

/** Landing page of the free-check magic link. The proxy sends signed-out visitors to /login first. */
export default function FreeCheckRunPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="container-page py-[14px]"><Link href="/" className="no-underline"><LogoLockup /></Link></div>
      </header>
      <main className="container-page flex flex-1 items-center justify-center py-16">
        <RunFreeCheck />
      </main>
    </div>
  );
}
