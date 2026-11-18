import { DotMark, LpWordmark } from "@/components/marketing/lp";
import { cn } from "@/lib/utils";

/*
 * The brand mark: the 3×3 dot grid (eight off-white dots around an orange centre) and the
 * "RankbyAI" wordmark in the display face. One drawing for the whole product: this file reuses
 * the landing page's DotMark and LpWordmark, so the app, the login pages, share pages and the
 * landing header cannot drift apart.
 *
 * Places that cannot use CSS variables or web fonts draw the same mark with literal colours:
 * the icons (scripts/make-icons.mjs) and anything rendered outside the browser.
 */

export { DotMark };

/**
 * The mark alone. `height` is its size in px (the mark is square). `priority` is accepted for
 * callers written for the old image logo; an inline SVG has nothing to preload.
 */
export function Logo({ height = 22, className }: { height?: number; className?: string; priority?: boolean }) {
  return <DotMark size={height} className={cn("block", className)} />;
}

/** The wordmark. `tagline` adds the mono line under it; `size` is "md" (headers) or "sm" (sidebars). */
export function Wordmark({ tagline = false, size = "md", className }: { tagline?: boolean; size?: "sm" | "md"; className?: string }) {
  const word = <LpWordmark className={cn(size === "sm" && "text-[16px]", !tagline && className)} />;
  if (!tagline) return word;
  return (
    <span className={cn("flex flex-col gap-[4px]", className)}>
      {word}
      <span className="font-mono text-[10px] leading-none font-medium tracking-[0.12em] text-dim">AI VISIBILITY, PAID ONCE</span>
    </span>
  );
}

/** Mark and wordmark side by side, as in the landing header. */
export function LogoLockup({ height = 22, tagline = false, size = "md", priority }: { height?: number; tagline?: boolean; size?: "sm" | "md"; priority?: boolean }) {
  return (
    <span className="flex items-center gap-[10px] text-fg">
      <Logo height={height} priority={priority} />
      <Wordmark tagline={tagline} size={size} />
    </span>
  );
}
