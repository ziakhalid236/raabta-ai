import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isChallengePage,
  parseLiteSearchResults,
  searchWeb,
  searchWithSearxng,
  WebSearchError,
} from "../lib/web-tools";

afterEach(() => vi.unstubAllGlobals());

const signal = () => new AbortController().signal;

// The exact interstitial DuckDuckGo now serves to a scripted client. Captured
// live: HTTP 202, no results, and a CAPTCHA prompt in the body.
const DDG_CHALLENGE = `<!DOCTYPE html><html><body>
<div class="anomaly-modal__content">
Unfortunately, bots use DuckDuckGo too.
Please complete the following challenge to confirm this search was made by a human.
Select all squares containing a duck:
</div></body></html>`;

const DDG_LITE_RESULTS = `<html><body><table>
<tr><td valign="top">1.&nbsp;</td><td>
<a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Freactnative.dev%2F&rut=abc" class='result-link'>React Native - Learn once</a>
</td></tr>
<tr><td>&nbsp;</td><td class='result-snippet'>A framework for building native apps.</td></tr>
</table></body></html>`;

const SEARXNG_JSON = {
  results: [
    {
      title: "Expo documentation",
      url: "https://docs.expo.dev/",
      content: "Expo is a framework for React Native.",
    },
    { title: "Bad entry", url: "http://insecure.example.com/", content: "" },
    { title: "", url: "https://ignored.example.com/", content: "" },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("search challenge detection", () => {
  it("recognises the DuckDuckGo bot challenge instead of reporting zero results", () => {
    expect(isChallengePage(DDG_CHALLENGE)).toBe(true);
  });

  it("recognises an Anubis-style gate page", () => {
    expect(isChallengePage("<title>Making sure you&#39;re not a bot!</title>")).toBe(true);
  });

  it("does not flag ordinary result pages", () => {
    expect(isChallengePage(DDG_LITE_RESULTS)).toBe(false);
  });
});

describe("DuckDuckGo Lite parsing", () => {
  it("extracts the real target from a wrapped duckduckgo.com link", () => {
    const results = parseLiteSearchResults(DDG_LITE_RESULTS);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://reactnative.dev/");
    expect(results[0].title).toBe("React Native - Learn once");
    expect(results[0].snippet).toContain("framework for building native apps");
  });

  it("drops links that are not public HTTPS addresses", () => {
    const html = `<a class='result-link' href="//duckduckgo.com/l/?uddg=http%3A%2F%2Flocalhost%2Fx">Local</a>`;
    expect(parseLiteSearchResults(html)).toEqual([]);
  });
});

describe("SearXNG provider", () => {
  it("reads JSON results and rejects non-public URLs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(SEARXNG_JSON)));
    const results = await searchWithSearxng("expo", "https://searx.example.org", signal());
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://docs.expo.dev/");
  });

  it("explains how to enable the JSON API when HTML is returned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>no json</html>", { status: 200 })),
    );
    await expect(
      searchWithSearxng("expo", "https://searx.example.org", signal()),
    ).rejects.toThrow(/json format/i);
  });

  it("reports the instance HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    await expect(
      searchWithSearxng("expo", "https://searx.example.org", signal()),
    ).rejects.toThrow(/403/);
  });
});

describe("searchWeb provider chain", () => {
  it("falls through a blocked DuckDuckGo to the next provider", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("html.duckduckgo.com"))
        return new Response(DDG_CHALLENGE, { status: 202 });
      if (url.includes("lite.duckduckgo.com"))
        return new Response(DDG_LITE_RESULTS, { status: 200 });
      return new Response("", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchWeb("react native", signal());
    expect(results[0].url).toBe("https://reactnative.dev/");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("prefers the configured SearXNG instance before DuckDuckGo", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("searx.example.org"))
        return jsonResponse(SEARXNG_JSON);
      return new Response(DDG_CHALLENGE, { status: 202 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchWeb("expo", signal(), {
      searxngUrl: "https://searx.example.org",
    });
    expect(results[0].url).toBe("https://docs.expo.dev/");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses Wikipedia when every HTML provider is blocked, rather than inventing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("wikipedia.org"))
        return jsonResponse({
          query: {
            search: [
              { title: "React Native", snippet: "<span>framework</span> by Meta" },
            ],
          },
        });
      return new Response(DDG_CHALLENGE, { status: 202 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchWeb("react native", signal());
    expect(results).toHaveLength(1);
    expect(results[0].url).toContain("wikipedia.org/wiki/React_Native");
    expect(results[0].snippet).toBe("framework by Meta");
  });

  it("names what every provider did when all of them fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("wikipedia.org"))
          return new Response("", { status: 503 });
        return new Response(DDG_CHALLENGE, { status: 202 });
      }),
    );

    const error = await searchWeb("react native", signal()).catch((e) => e);
    expect(error).toBeInstanceOf(WebSearchError);
    // SearXNG is only attempted when the user configured an instance.
    expect(error.diagnostics).toHaveLength(3);
    expect(error.diagnostics.map((d: { provider: string }) => d.provider)).toEqual([
      "DuckDuckGo",
      "DuckDuckGo Lite",
      "Wikipedia",
    ]);
    expect(error.diagnostics[0].outcome).toMatch(/human-verification/i);
    expect(error.message).toMatch(/nothing was invented/i);
  });

  it("returns no invented sources for an empty query", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(searchWeb("   ", signal())).rejects.toThrow(/search phrase/i);
  });
});
