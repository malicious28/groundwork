import { describe, it, expect } from "vitest";
import {
  assertPublicUrl,
  extractArticle,
  PageFetchError,
} from "../src/lib/parsers/webpage";
import { parseText } from "../src/lib/parsers/text";

/**
 * The URL endpoint takes an address from a signed-in user and makes the server
 * fetch it. That is a server-side request forgery hole unless private addresses
 * are refused, so those cases are tested first and hardest.
 */

describe("URL safety", () => {
  it("accepts ordinary public addresses", () => {
    expect(assertPublicUrl("https://novainteriors.example/about").hostname).toBe(
      "novainteriors.example",
    );
    expect(assertPublicUrl("http://example.com").protocol).toBe("http:");
  });

  const blocked = [
    "http://localhost:3000/admin",
    "http://127.0.0.1/",
    "http://0.0.0.0/",
    "http://10.0.0.5/secrets",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://169.254.169.254/latest/meta-data/", // cloud metadata service
    "http://db.internal/",
    "http://app.localhost/",
  ];

  it.each(blocked)("refuses %s", (url) => {
    expect(() => assertPublicUrl(url)).toThrow(PageFetchError);
  });

  it("refuses non-http schemes", () => {
    expect(() => assertPublicUrl("file:///etc/passwd")).toThrow(PageFetchError);
    expect(() => assertPublicUrl("ftp://example.com")).toThrow(PageFetchError);
    expect(() => assertPublicUrl("javascript:alert(1)")).toThrow(PageFetchError);
  });

  it("refuses nonsense", () => {
    expect(() => assertPublicUrl("not a url")).toThrow(PageFetchError);
  });

  it("lets through addresses that merely look private", () => {
    // 172.32 is outside the private range; 10.example.com is a hostname.
    expect(() => assertPublicUrl("http://172.32.0.1/")).not.toThrow();
    expect(() => assertPublicUrl("https://10.example.com/")).not.toThrow();
  });
});

describe("article extraction", () => {
  const page = `<!doctype html>
<html><head><title>Nova Interiors — Turnkey home interiors in Pune</title></head>
<body>
  <nav><a href="/">Home</a><a href="/contact">Contact</a></nav>
  <header><h1>Site navigation you do not want in the brief</h1></header>
  <article>
    <h1>Turnkey home interiors in Pune</h1>
    <p>We design and deliver complete home interiors across Pune and Pimpri-Chinchwad, handling everything from drawings to handover so you deal with one team rather than six contractors.</p>
    <h2>What we do</h2>
    <ul><li>Modular kitchens</li><li>Wardrobes and storage</li><li>False ceilings and lighting</li></ul>
    <p>Every project is assigned a dedicated project manager who is your single point of contact from the day you sign to the day you move in. We have completed over four hundred homes since 2016.</p>
  </article>
  <footer><p>© Nova Interiors. All rights reserved. Privacy policy.</p></footer>
  <script>console.log("tracking");</script>
</body></html>`;

  const result = extractArticle(page, "https://novainteriors.example/");

  // What gets stored is the title followed by the extracted article — Readability
  // deliberately drops the <h1> that duplicates the page title, so the composed
  // document is what the assertion has to be about.
  const stored = `# ${result.title}\n\n${result.markdown}`;

  it("keeps the article and drops the chrome", () => {
    expect(stored).toContain("Turnkey home interiors in Pune");
    expect(stored).toContain("dedicated project manager");
    expect(stored).toContain("Modular kitchens");
    expect(stored).not.toContain("Privacy policy");
    expect(stored).not.toContain("tracking");
    expect(stored).not.toContain("Site navigation you do not want");
  });

  it("converts structure to markdown rather than flattening it", () => {
    expect(result.markdown).toMatch(/^##?\s/m);
    expect(result.markdown).toContain("Modular kitchens");
  });

  it("recovers a title", () => {
    expect(result.title).toContain("Nova Interiors");
  });

  it("produces text the span parser can address", () => {
    const parsed = parseText(`# ${result.title}\n\n${result.markdown}`);
    expect(parsed.spans.length).toBeGreaterThan(2);
    for (const span of parsed.spans) {
      expect(parsed.text.slice(span.charStart, span.charEnd)).toBe(span.text);
    }
  });

  it("returns nothing readable for a JavaScript-rendered shell", () => {
    const shell = `<!doctype html><html><head><title>App</title></head>
      <body><div id="root"></div><script src="/bundle.js"></script></body></html>`;
    expect(extractArticle(shell, "https://app.example/").markdown).toBe("");
  });
});
