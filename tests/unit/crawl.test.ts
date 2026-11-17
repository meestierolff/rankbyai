import { describe, expect, it } from "vitest";
import { assertPublicUrl, extractFacts, isPrivateAddress } from "@/lib/audit/crawl";

describe("website fetcher: SSRF guard", () => {
  const publicDns = async () => ["93.184.216.34"];
  it("recognises private, loopback, link-local and reserved addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("rejects everything that is not a plain public web address", async () => {
    const bad = [
      "file:///etc/passwd", "ftp://example.com/", "gopher://example.com/", "javascript:alert(1)", "http://localhost/", "http://127.0.0.1/", "http://[::1]/",
      "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/", "http://example.com:8080/", "http://example.com:22/", "https://user:pass@example.com/",
      "http://internal.local/", "http://db.internal/", "not a url", "http://2130706433/", "http://0x7f.0.0.1/",
    ];
    for (const u of bad) await expect(assertPublicUrl(u, publicDns), u).rejects.toThrow();
  });

  it("rejects a public-looking name that resolves to a private address, even partly", async () => {
    await expect(assertPublicUrl("https://rebind.example/", async () => ["10.0.0.7"])).rejects.toThrow();
    await expect(assertPublicUrl("https://mixed.example/", async () => ["93.184.216.34", "127.0.0.1"])).rejects.toThrow();
    await expect(assertPublicUrl("https://nxdomain.example/", async () => [])).rejects.toThrow();
  });

  it("accepts ordinary sites on default ports", async () => {
    expect((await assertPublicUrl("https://northgate.example/services", publicDns)).hostname).toBe("northgate.example");
    expect((await assertPublicUrl("http://northgate.example:80/", publicDns)).hostname).toBe("northgate.example");
  });
});

describe("page facts", () => {
  const html = `<!doctype html><html><head><title>Northgate Family Dental | Dentist in Austin, TX</title>
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Dentist","name":"Northgate Family Dental","telephone":"+1-512-555-0174","address":{"@type":"PostalAddress","streetAddress":"100 North Loop","addressLocality":"Austin","addressRegion":"TX","postalCode":"78751"}},{"@type":"FAQPage","mainEntity":[]}]}</script>
    <script type="application/ld+json">{ this is broken json </script></head>
    <body><nav><a href="/services/invisalign">Invisalign</a><a href="/services/implants/">Dental Implants</a><a href="https://other.example/x">Partner</a><a href="/brochure.pdf">Brochure</a></nav>
    <h1>Family Dentist in North Loop, Austin</h1><h2>Frequently Asked Questions</h2>
    <p>Call us at (512) 555-0147 or <a href="tel:+15125550174">+1 512 555 0174</a>.</p>
    <iframe src="https://www.google.com/maps/embed?pb=xyz"></iframe><script>var x = "<h1>not a heading</h1>";</script></body></html>`;
  const f = extractFacts("https://northgate.example/", html);

  it("reads title, headings, phones, map embed and click-to-call", () => {
    expect(f.title).toBe("Northgate Family Dental | Dentist in Austin, TX");
    expect(f.h1[0]).toBe("Family Dentist in North Loop, Austin");
    expect(f.hasTelLink).toBe(true);
    expect(f.hasMapEmbed).toBe(true);
    expect(f.hasFaqSection).toBe(true);
    expect(f.phones).toEqual(expect.arrayContaining(["+15125550174", "(512) 555-0147"]));
  });
  it("reads LocalBusiness and FAQPage schema and ignores broken JSON-LD", () => {
    expect(f.jsonLdTypes).toEqual(expect.arrayContaining(["Dentist", "FAQPage"]));
    expect(f.hasFaqSchema).toBe(true);
    expect(f.localBusiness).toEqual({ type: "Dentist", name: "Northgate Family Dental", telephone: "+1-512-555-0174", address: "100 North Loop, Austin, TX, 78751" });
  });
  it("keeps only same-site page links and nav labels", () => {
    expect(f.links).toEqual(["https://northgate.example/services/invisalign", "https://northgate.example/services/implants"]);
    expect(f.navLabels).toEqual(expect.arrayContaining(["Invisalign", "Dental Implants"]));
  });
});
