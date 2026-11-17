import Link from "next/link";
import { LogoLockup } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="container-page flex items-center justify-between py-[14px]">
          <Link href="/" className="no-underline"><LogoLockup /></Link>
          <Link href="/#pricing" className="text-[15px] text-muted-foreground no-underline hover:text-fg">Pricing</Link>
        </div>
      </header>
      <main className="container-page flex flex-1 items-center justify-center py-16">{children}</main>
    </div>
  );
}
