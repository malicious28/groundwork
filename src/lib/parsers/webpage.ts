import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

/**
 * Website references.
 *
 * A client's existing site is often the clearest statement of what they think
 * they do — the services they list, the language they use, the claims they make
 * — and the assignment names it as an input. This reads one, strips the
 * navigation and boilerplate, and keeps the article.
 *
 * Deliberately no headless browser. A JavaScript-rendered site returns a shell,
 * and we say so plainly rather than silently ingesting an empty page: shipping
 * Chromium into a serverless function to fix that is a large cost for a case the
 * user can work around by pasting the text.
 */

export type FetchedPage = {
  url: string;
  title: string;
  text: string;
  notes: string[];
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; GroundworkBot/1.0; +https://example.invalid/bot)";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;

export class PageFetchError extends Error {}

/**
 * Turning fetched HTML into readable text, split out from the fetching so it
 * can be tested against real pages without a network.
 */
export function extractArticle(html: string, url: string): {
  title: string;
  markdown: string;
  byline: string | null;
} {
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  const turndown = new TurndownService({ headingStyle: "atx" });
  turndown.remove(["script", "style", "noscript", "iframe", "form"]);

  return {
    title:
      article?.title?.trim() ||
      dom.window.document.title?.trim() ||
      new URL(url).hostname,
    markdown: article?.content
      ? turndown.turndown(article.content).trim()
      : "",
    byline: article?.byline?.trim() || null,
  };
}

/**
 * Blocks private and loopback addresses. Without this the endpoint is a
 * server-side request forgery hole: a signed-in user could aim it at the
 * metadata service or anything else reachable from the deployment's network.
 */
export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PageFetchError("That does not look like a web address.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PageFetchError("Only http and https addresses can be read.");
  }

  const host = url.hostname.toLowerCase();

  const blockedName =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host === "[::1]" ||
    host.startsWith("[fc") ||
    host.startsWith("[fd");

  // The range checks apply to IP literals only. `10.example.com` is a perfectly
  // ordinary hostname, and a prefix match on "10." would refuse it.
  if (blockedName || (isIpv4Literal(host) && isPrivateIpv4(host))) {
    throw new PageFetchError("That address is not reachable from here.");
  }
  return url;
}

const isIpv4Literal = (host: string): boolean =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

function isPrivateIpv4(host: string): boolean {
  const [a, b] = host.split(".").map(Number) as [number, number];
  return (
    a === 0 || // 0.0.0.0/8
    a === 127 || // loopback
    a === 10 || // private
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    a >= 224 // multicast and reserved
  );
}

/**
 * Resolves the hostname and re-checks, because the literal test above only
 * catches an attacker who is not trying. A name they control can point at
 * 169.254.169.254 just as easily.
 *
 * This still leaves a narrow rebinding window — the name could resolve
 * differently between this check and the fetch — which is why this endpoint is
 * limited to signed-in consultants rather than being public.
 */
export async function assertResolvesPublicly(url: URL): Promise<void> {
  if (isIpv4Literal(url.hostname)) return; // already checked above

  const { lookup } = await import("node:dns/promises");
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new PageFetchError("That address could not be resolved.");
  }

  for (const { address, family } of addresses) {
    const isPrivate =
      family === 4
        ? isPrivateIpv4(address)
        : address === "::1" ||
          address.startsWith("fc") ||
          address.startsWith("fd") ||
          address.startsWith("fe80");
    if (isPrivate) {
      throw new PageFetchError("That address is not reachable from here.");
    }
  }
}

export async function fetchPage(raw: string): Promise<FetchedPage> {
  const url = assertPublicUrl(raw);
  await assertResolvesPublicly(url);
  const notes: string[] = [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      signal: controller.signal,
      redirect: "follow",
    });
  } catch {
    throw new PageFetchError(
      "That page could not be reached. It may be down, or blocking automated requests.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new PageFetchError(
      `That page returned ${response.status}. Sites behind a bot check often do; pasting the text works instead.`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html") && !contentType.includes("text")) {
    throw new PageFetchError(
      `That address returned ${contentType || "an unknown type"} rather than a web page.`,
    );
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    throw new PageFetchError("That page is too large to read.");
  }
  const html = new TextDecoder().decode(buffer);

  const { title, markdown, byline } = extractArticle(html, url.toString());

  if (!markdown) {
    throw new PageFetchError(
      "No readable article was found on that page. It may be rendered by JavaScript, which this cannot run — paste the text instead.",
    );
  }

  // A page that renders its content client-side yields a suspiciously short
  // article. Better to flag it than to let a stub into the evidence ledger.
  if (markdown.length < 400) {
    notes.push(
      "Very little text was extracted — this page may render its content with JavaScript.",
    );
  }
  if (byline) notes.push(`Byline: ${byline}`);
  notes.push(`Read from ${url.toString()}`);

  return {
    url: url.toString(),
    title,
    text: `# ${title}\n\n${markdown}`,
    notes,
  };
}
