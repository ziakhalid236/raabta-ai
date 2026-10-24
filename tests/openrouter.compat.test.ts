import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverOpenRouterModels } from "../lib/openrouter";

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI-compatible model catalog", () => {
  it("accepts model entries with an id but no display name or OpenRouter metadata", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({
          object: "list",
          data: [{ id: "local/qwen-7b", object: "model" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await discoverOpenRouterModels(
      "secret",
      undefined,
      "https://codeflow.example/v1",
    );

    expect(catalog.chatModels).toHaveLength(1);
    expect(catalog.chatModels[0]).toMatchObject({
      id: "local/qwen-7b",
      name: "local/qwen-7b",
      inputModalities: [],
    });
    expect(catalog.transcriptionModels).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://codeflow.example/v1/models",
    );
  });
});
