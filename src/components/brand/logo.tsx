import Image from "next/image";
import { cn } from "@/lib/utils";

/** The folded-map mark. Designed for dark backgrounds only. Source ratio 148:80. */
export function Logo({ height = 34, className, priority }: { height?: number; className?: string; priority?: boolean }) {
  const width = Math.round((height * 148) / 80);
  return (
    <Image
      src="/brand/logo-80.png"
      alt=""
      width={width}
      height={height}
      priority={priority}
      className={cn("block shrink-0", className)}
      style={{ height, width: "auto" }}
    />
  );
}

/** Two-line wordmark used in the marketing header. */
export function Wordmark({ tagline = true, size = "md" }: { tagline?: boolean; size?: "sm" | "md" }) {
  return (
    <span className="flex flex-col gap-[3px]">
      <span className={cn("leading-none font-semibold tracking-[-0.02em]", size === "md" ? "text-[17px]" : "text-[15px]")}>
        rankbyai<span className="text-dim">.live</span>
      </span>
      {tagline ? (
        <span className="font-mono text-[10px] leading-none font-medium tracking-[0.12em] text-dim">AI VISIBILITY, PAID ONCE</span>
      ) : null}
    </span>
  );
}

export function LogoLockup({ height = 34, tagline = true, priority }: { height?: number; tagline?: boolean; priority?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <Logo height={height} priority={priority} />
      <Wordmark tagline={tagline} />
      <span className="sr-only">RankbyAI</span>
    </span>
  );
}
