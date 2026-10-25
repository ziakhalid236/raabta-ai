import { afterEach, describe, expect, it, vi } from "vitest";

import { requestChatCompletion, type ChatRequestMessage } from "../lib/ai-client";

function okResponse(content = "hello") {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

const baseArgs = {
  modelId: "test-model",
  apiKey: "test-key",
  messages: [{ role: "user", content: "hi" }] as ChatRequestMessage[],
  signal: new AbortController().signal,
  baseUrl: "https://provider.example.com/v1",
};

describe("provider request resilience", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries a rate-limited request and succeeds without losing the task", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(okResponse("recovered"));
    vi.stubGlobal("fetch", fetchMock);

    const answer = await requestChatCompletion(baseArgs);

    expect(answer).toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a provider 500 and then reports the real error if it persists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(503));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestChatCompletion(baseArgs)).rejects.toThrow(/503/);
    // One initial try plus two retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a dropped connection instead of failing the whole task", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(okResponse("second try worked"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await requestChatCompletion(baseArgs)).toBe("second try worked");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a bad API key, so the real cause surfaces at once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestChatCompletion(baseArgs)).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry an unknown model, so the user is not left waiting", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestChatCompletion(baseArgs)).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a non-HTTPS endpoint before making any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestChatCompletion({ ...baseArgs, baseUrl: "http://insecure.example.com/v1" }),
    ).rejects.toThrow(/HTTPS/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
