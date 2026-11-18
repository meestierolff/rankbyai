import { describe, expect, it } from "vitest";
import { checkoutReady, packsForSale, packsReady } from "@/lib/availability";

/**
 * Money is only taken when the purchase can also be delivered.
 */
describe("checkout opens only when a purchase can be delivered", () => {
  const live = { secretKey: "rk_live_abc", lifetimeProductId: "prod_1", webhookSecret: "whsec_1", vercelEnv: "production" };

  it("opens on production with a live key, the product and the webhook secret", () => {
    expect(checkoutReady(live)).toBe(true);
    expect(checkoutReady({ ...live, secretKey: "sk_live_abc" })).toBe(true);
  });
  it("stays closed without the webhook secret: a buyer would pay and receive nothing", () => {
    expect(checkoutReady({ ...live, webhookSecret: undefined })).toBe(false);
    expect(checkoutReady({ ...live, webhookSecret: "" })).toBe(false);
  });
  it("stays closed without a key or a product", () => {
    expect(checkoutReady({ ...live, secretKey: undefined })).toBe(false);
    expect(checkoutReady({ ...live, lifetimeProductId: undefined })).toBe(false);
  });
  it("stays closed when the key does not match the site", () => {
    expect(checkoutReady({ ...live, secretKey: "rk_test_abc" })).toBe(false);
    expect(checkoutReady({ ...live, vercelEnv: "preview" })).toBe(false);
    expect(checkoutReady({ ...live, secretKey: "sk_test_abc", vercelEnv: "preview" })).toBe(true);
  });
});

describe("packs open only when the scans they promise can run", () => {
  const ready = { checkout: true, pack25PriceId: "price_25", pack100PriceId: "price_100", dataKey: true, aiKeys: 3 };

  it("opens with checkout, both prices, the data key and all three AI keys", () => {
    expect(packsReady(ready)).toBe(true);
  });
  it("stays closed while any AI key is missing, because a credit is sold as a three-engine grid", () => {
    expect(packsReady({ ...ready, aiKeys: 2 })).toBe(false);
    expect(packsReady({ ...ready, aiKeys: 0 })).toBe(false);
  });
  it("stays closed without the data key, a price, or checkout", () => {
    expect(packsReady({ ...ready, dataKey: false })).toBe(false);
    expect(packsReady({ ...ready, pack25PriceId: undefined })).toBe(false);
    expect(packsReady({ ...ready, pack100PriceId: undefined })).toBe(false);
    expect(packsReady({ ...ready, checkout: false })).toBe(false);
  });
  it("stays closed while the owner has switched pack sales off, even when everything is ready", () => {
    expect(packsReady({ ...ready, forSale: false })).toBe(false);
    for (const v of ["0", "off", "false", "No", " OFF "]) expect(packsForSale(v), v).toBe(false);
    for (const v of [undefined, "", "1", "on", "true"]) expect(packsForSale(v), String(v)).toBe(true);
  });
});
