export type WebSource = {
  title: string;
  url: string;
  snippet: string;
  downloadedUri?: string;
};

export type WebResearchResult = {
  sources: WebSource[];
  failedUrls: string[];
};

export class WebToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebToolError";
  }
}

const SEARXNG_INSTANCES = [
  "https://searx.be/search",
  "https://search.bus-hit.me/search",
];

/** Uses DuckDuckGo's public HTML results without an app-owned search key or backend. */
export async function searchWeb(
  query: string,
  signal: AbortSignal,
): Promise<WebSource[]> {
  const cleanQuery = query.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!cleanQuery)
    throw new WebToolError("Enter a question or search phrase first.");
  const openResults = await searchSearxng(cleanQuery, signal);
  if (openResults.length) return openResults.slice(0, 8);
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
  let html: string;
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml" },
      signal,
    });
    if (!response.ok)
      throw new WebToolError(
        `The search provider returned HTTP ${response.status}.`,
      );
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 4 * 1024 * 1024)
      throw new WebToolError("The search results page was unexpectedly large.");
    html = await response.text();
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof WebToolError) throw error;
    throw new WebToolError(
      "Web search could not reach DuckDuckGo. Try again or check the device network.",
    );
  }
  if (html.length > 4 * 1024 * 1024)
    throw new WebToolError("The search results page was unexpectedly large.");
  const sources = parseSearchResults(html).slice(0, 6);
  if (!sources.length) {
    throw new WebToolError(
      "DuckDuckGo did not return readable search results. No source or answer was invented.",
    );
  }
  return sources;
}

/** SearXNG is open-source and aggregates public engines without an app-owned search key. */
async function searchSearxng(
  query: string,
  signal: AbortSignal,
): Promise<WebSource[]> {
  for (const endpoint of SEARXNG_INSTANCES) {
    try {
      const url = new URL(endpoint);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("language", "auto");
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok) continue;
      const payload: any = await response.json().catch(() => null);
      const results = Array.isArray(payload?.results) ? payload.results : [];
      const sources = results.flatMap((item: any) => {
        const title = typeof item?.title === "string" ? item.title.trim() : "";
        const target = typeof item?.url === "string" ? item.url : "";
        const snippet = typeof item?.content === "string" ? item.content : "";
        if (!title || !isPublicHttpsUrl(target)) return [];
        return [
          {
            title: title.slice(0, 180),
            url: target,
            snippet: snippet.slice(0, 900),
          } satisfies WebSource,
        ];
      });
      if (sources.length) return sources;
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  return [];
}

/** Search, then follow a bounded number of public results so answers use page text rather than snippets alone. */
export async function researchWeb(
  query: string,
  signal: AbortSignal,
): Promise<WebResearchResult> {
  const searchResults = await searchWeb(query, signal);
  const followed = await Promise.all(
    searchResults.slice(0, 3).map(async (source) => {
      try {
        return await readWebPage(source.url, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        return null;
      }
    }),
  );
  const extracted = followed.filter((source): source is WebSource =>
    Boolean(source),
  );
  const extractedUrls = new Set(extracted.map((source) => source.url));
  return {
    sources: [
      ...extracted,
      ...searchResults.filter((source) => !extractedUrls.has(source.url)),
    ],
    failedUrls: searchResults
      .slice(0, 3)
      .filter((source) => !extractedUrls.has(source.url))
      .map((source) => source.url),
  };
}

/** Download a public HTTPS HTML/text/JSON page into memory and return bounded readable text. */
export async function readWebPage(
  rawUrl: string,
  signal: AbortSignal,
): Promise<WebSource> {
  const url = validatePublicHttpsUrl(rawUrl);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "text/html,text/plain,application/json,application/xml",
      },
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new WebToolError(
      "That page could not be downloaded. The site may block app reading, require a login, or not allow this network request.",
    );
  }
  if (!response.ok)
    throw new WebToolError(
      `The page returned HTTP ${response.status}; it was not added as a source.`,
    );
  const resolvedUrl = validatePublicHttpsUrl(response.url || url);
  const mime =
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ??
    "";
  if (mime.includes("pdf") || mime.includes("application/octet-stream"))
    throw new WebToolError(
      "This release reads public HTML, text and JSON pages. PDF/binary URL extraction is not supported yet.",
    );
  if (
    !(mime.startsWith("text/") || mime.includes("json") || mime.includes("xml"))
  )
    throw new WebToolError(
      "This URL did not return a readable text or HTML page.",
    );
  const declaredBytes = Number(response.headers.get("content-length") ?? 0);
  if (declaredBytes > 4 * 1024 * 1024)
    throw new WebToolError("The page is larger than the 4 MB reading limit.");
  const body = await response.text();
  if (body.length > 4 * 1024 * 1024)
    throw new WebToolError("The page is larger than the 4 MB reading limit.");
  const title = extractPageTitle(body) || new URL(resolvedUrl).hostname;
  const text = mime.includes("html")
    ? htmlToText(body)
    : body.replace(/\s+/g, " ").trim();
  if (!text) throw new WebToolError("The page did not contain readable text.");
  return {
    title: title.slice(0, 160),
    url: resolvedUrl,
    snippet: text.slice(0, 35_000),
  };
}

export async function downloadReadablePage(
  url: string,
  signal: AbortSignal,
): Promise<WebSource> {
  const page = await readWebPage(url, signal);
  // Keep a local text rendition in app documents so this page remains usable in chat history offline.
  const { Platform } = await import("react-native");
  if (Platform.OS !== "web") {
    const FileSystem = await import("expo-file-system/legacy");
    if (FileSystem.documentDirectory) {
      const folder = `${FileSystem.documentDirectory}raabta/downloads/`;
      await FileSystem.makeDirectoryAsync(folder, {
        intermediates: true,
      }).catch(() => undefined);
      const safeHost = new URL(page.url).hostname.replace(
        /[^A-Za-z0-9.-]/g,
        "_",
      );
      const path = `${folder}${Date.now()}-${safeHost}.txt`;
      await FileSystem.writeAsStringAsync(
        path,
        `${page.title}\n${page.url}\n\n${page.snippet}`,
      );
      return { ...page, downloadedUri: path };
    }
  }
  return page;
}

function parseSearchResults(html: string): WebSource[] {
  const matches = [
    ...html.matchAll(
      /<a\b(?=[^>]*\bclass\s*=\s*["'][^"']*result__a[^"']*["'])[^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ];
  return matches.flatMap((match, index) => {
    const opening = match[0].slice(0, match[0].indexOf(">") + 1);
    const href = opening.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    const title = decodeEntities(stripTags(match[1])).trim();
    if (!href || !title) return [];
    let target = decodeEntities(href);
    try {
      const absolute = target.startsWith("//") ? `https:${target}` : target;
      const parsed = new URL(absolute);
      target = parsed.searchParams.get("uddg") ?? absolute;
      target = validatePublicHttpsUrl(decodeURIComponent(target));
    } catch {
      return [];
    }
    const start = match.index ?? 0;
    const region = html.slice(start, matches[index + 1]?.index ?? start + 2200);
    const snippetMatch = region.match(
      /class\s*=\s*["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    );
    const snippet = snippetMatch
      ? decodeEntities(stripTags(snippetMatch[1])).replace(/\s+/g, " ").trim()
      : "";
    return [
      {
        title: title.slice(0, 180),
        url: target,
        snippet: snippet.slice(0, 900),
      },
    ];
  });
}

export function isPublicHttpsUrl(value: string): boolean {
  try {
    validatePublicHttpsUrl(value);
    return true;
  } catch {
    return false;
  }
}

function validatePublicHttpsUrl(value: string): string {
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      parsed.protocol !== "https:" ||
      !host ||
      parsed.username ||
      parsed.password ||
      isPrivateHost(host)
    )
      throw new Error("invalid");
    return parsed.toString();
  } catch {
    throw new WebToolError(
      "Enter a complete public HTTPS address without login details in its URL.",
    );
  }
}

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1")
    return true;
  // IPv6-only checks must not use bare "fc"/"fd" prefixes: those would also block
  // ordinary domain names such as fcm.example.com, fdic.gov or fcbank.com.
  if (host.includes(":")) {
    return (
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:") ||
      host.startsWith("::ffff:") ||
      host === "::" ||
      host.startsWith("ff")
    );
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = ipv4.slice(1).map(Number);
  if (a > 255 || b > 255) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function htmlToText(html: string): string {
  return decodeEntities(
    stripTags(
      html
        .replace(
          /<(script|style|noscript|svg|iframe|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi,
          " ",
        )
        .replace(/<!--([\s\S]*?)-->/g, " ")
        .replace(/<(br|hr|p|div|li|h[1-6]|section|article)[^>]*>/gi, "\n"),
    ),
  )
    .replace(/[\t\r ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function extractPageTitle(html: string): string {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ? decodeEntities(
        stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
      ).trim()
    : "";
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x?[\da-f]+|amp|quot|apos|#39|lt|gt|nbsp);/gi,
    (_full, entity: string) => {
      const named: Record<string, string> = {
        amp: "&",
        quot: '"',
        apos: "'",
        "#39": "'",
        lt: "<",
        gt: ">",
        nbsp: " ",
      };
      const lower = entity.toLowerCase();
      if (named[lower]) return named[lower];
      try {
        const code = lower.startsWith("#x")
          ? Number.parseInt(lower.slice(2), 16)
          : Number.parseInt(lower.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : "";
      } catch {
        return "";
      }
    },
  );
}
