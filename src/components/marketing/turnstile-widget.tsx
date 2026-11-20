"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: { sitekey: string; theme?: "dark" | "light" | "auto" }) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};
const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

/**
 * Cloudflare Turnstile, rendered explicitly. Implicit rendering scans the page once, when the script
 * first loads, so a form that mounts later (after a client-side navigation, or when /free-check
 * shows the form again after a failed check) would get no widget and no token. `onReady` runs on
 * every mount once the script is loaded. The container has no `cf-turnstile` class, so the implicit
 * scan never renders a second widget. The token arrives in the form as `cf-turnstile-response`.
 */
export function TurnstileWidget({ siteKey }: { siteKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const host = useRef<HTMLDivElement | null>(null);

  // Each render gets its own child element. During a route transition React can run this effect's
  // cleanup and then render again at once; Turnstile finishes removing the old widget after that, and
  // would wipe a new widget that shared its element (seen in testing: a widget id, an empty box).
  const render = useCallback(() => {
    const t = api();
    if (!t || !box.current || id.current) return;
    host.current = document.createElement("div");
    box.current.appendChild(host.current);
    id.current = t.render(host.current, { sitekey: siteKey, theme: "dark" });
    box.current.dataset.widgetId = id.current;
  }, [siteKey]);

  useEffect(() => {
    render();
    return () => {
      if (id.current) api()?.remove(id.current);
      host.current?.remove();
      host.current = null;
      id.current = null;
    };
  }, [render]);

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" onReady={render} />
      <div ref={box} data-turnstile-widget="" />
    </>
  );
}

/** A Turnstile token is single-use: call after every failed submit so the next attempt gets a fresh one. */
export function resetTurnstile(form: HTMLElement) {
  const widgetId = form.querySelector<HTMLElement>("[data-turnstile-widget]")?.dataset.widgetId;
  if (widgetId) api()?.reset(widgetId);
}
