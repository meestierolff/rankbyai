"use client";

import { useState } from "react";
import { creamClass } from "@/components/marketing/lp";

export function WithdrawButton() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  if (state === "done") return <p role="status" className="m-0 text-[16px] leading-[1.6] text-lp-fg">Done. Your address has been deleted and you will not get further emails from the free check.</p>;
  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        disabled={state === "busy"}
        className={creamClass("md", "cursor-pointer border-0")}
        onClick={async () => {
          setState("busy");
          const token = new URLSearchParams(window.location.search).get("t") ?? "";
          try {
            const res = await fetch("/api/free-check/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
            setState(res.ok ? "done" : "error");
          } catch {
            setState("error");
          }
        }}
      >
        <span>{state === "busy" ? "Removing…" : "Delete my address"}</span>
      </button>
      {state === "error" ? <p role="alert" className="m-0 text-[14px] text-lp-strike">That did not work. Try again, or write to the address on our privacy page.</p> : null}
    </div>
  );
}
