import { afterEach, describe, expect, it, vi } from "vitest";
import { isPublicHttpsUrl, researchWeb } from "../lib/web-tools";

afterEach(() => vi.unstubAllGlobals());

describe("web safety and research", () => {
  it("rejects credential-bearing, private, and non-HTTPS links", () => {
    expect(isPublicHttpsUrl("https://example.com/path")).toBe(true);
    expect(isPublicHttpsUrl("http://example.com")).toBe(false);
    expect(isPublicHttpsUrl("https://user:pass@example.com")).toBe(false);
    expect(isPublicHttpsUrl("https://127.0.0.1/private")).toBe(false);
    expect(isPublicHttpsUrl("https://192.168.1.10/private")).toBe(false);
  });

  it("follows the first public results and preserves blocked links as snippets", async () => {
    const searchHtml = `
      <a class="result__a" href="https://example.com/one">First source</a>
      <div class="result__snippet">First snippet</div>
      <a class="result__a" href="https://blocked.example/two">Blocked source</a>
      <div class="result__snippet">Blocked snippet</div>
    `;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("duckduckgo.com"))
        return new Response(searchHtml, { status: 200, headers: { "Content-Type": "text/html" } });
      if (url.includes("example.com/one"))
        return new Response("<html><title>First page</title><p>Verified page text.</p></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      throw new Error("blocked");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await researchWeb("public research", new AbortController().signal);

    expect(result.sources[0]).toMatchObject({ title: "First page", url: "https://example.com/one" });
    expect(result.sources[1]).toMatchObject({ title: "Blocked source", url: "https://blocked.example/two" });
    expect(result.failedUrls).toEqual(["https://blocked.example/two"]);
  });
});
