import "server-only";
import { availableProviders } from "@/lib/keys";
import { ENGINES, type Engine } from "@/lib/pricing-constants";

/** What included-scan credits can run on this deployment today: which of OUR keys are in place. Yes or no only, never a secret. */
export interface IncludedScans {
  /** Maps grids, audits and prospect reports need our DataForSEO key. */
  dataforseo: boolean;
  /** AI engines we hold a key for. */
  engines: Engine[];
}

/**
 * The same answer the scan, audit and prospect routes get from resolveCredentials(…, "credits")
 * when they decide "Included scans are not available right now", so a form can say it before submit.
 */
export async function includedScans(workspaceId: string): Promise<IncludedScans> {
  try {
    const providers = await availableProviders(workspaceId, "credits");
    return { dataforseo: providers.includes("dataforseo"), engines: ENGINES.filter((e) => providers.includes(e)) };
  } catch {
    return { dataforseo: false, engines: [] };
  }
}
