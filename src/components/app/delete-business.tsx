"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { secondaryClass } from "@/components/brand/primitives";

/**
 * Delete a tracked business. Two steps on the page itself (no browser dialog): the second says
 * exactly what goes with it, because scans, schedules, audits and share links of the business are
 * deleted with it and cannot be restored.
 */
/** `scanCount` null: the page only lists the newest 30, so the exact number is not known. */
export function DeleteBusiness({ businessId, name, scanCount }: { businessId: string; name: string; scanCount: number | null }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  if (step === "idle") {
    return (
      <button type="button" onClick={() => setStep("confirm")} className={secondaryClass("cursor-pointer border-[rgba(239,91,91,0.45)] text-danger")}>
        Delete this business
      </button>
    );
  }

  const remove = async () => {
    setStep("busy");
    setError(null);
    const res = await fetch(`/api/businesses/${businessId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      router.replace("/app/businesses");
      router.refresh();
      return;
    }
    const body = (await res?.json().catch(() => null)) as { message?: string } | null;
    setError(body?.message ?? "The business could not be deleted. Try again.");
    setStep("confirm");
  };

  return (
    <div role="group" aria-label="Confirm delete" className="flex flex-col gap-3">
      <p className="m-0 text-[14px] leading-normal text-fg">
        Delete <strong>{name}</strong>
        {scanCount === null ? " and all its scans" : scanCount > 0 ? ` and its ${scanCount} ${scanCount === 1 ? "scan" : "scans"}` : ""}, with its schedules, audits and share links? This cannot be undone.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={remove}
          disabled={step === "busy"}
          aria-busy={step === "busy"}
          className="cursor-pointer rounded-[9px] border border-danger bg-danger px-[14px] py-[9px] text-[14px] font-medium text-white disabled:opacity-60"
        >
          {step === "busy" ? "Deleting…" : "Yes, delete it"}
        </button>
        <button type="button" onClick={() => { setStep("idle"); setError(null); }} disabled={step === "busy"} className={secondaryClass("cursor-pointer")}>
          Cancel
        </button>
      </div>
      {error ? <p role="alert" className="m-0 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
