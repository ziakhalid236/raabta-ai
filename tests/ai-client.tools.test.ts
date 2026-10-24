import { afterEach, describe, expect, it, vi } from "vitest";
import { requestChatCompletion } from "../lib/ai-client";

afterEach(() => vi.unstubAllGlobals());

describe("requestChatCompletion tool action limits", () => {
  it("blocks an identical repeated tool action and finalizes instead of failing", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          tool_choice?: string;
        };
        if (body.tool_choice === "none") {
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: "Summary of completed actions." } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: `call-${calls}`,
                      function: { name: "lookup", arguments: "{}" },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    const executeTool = vi.fn(async () => "A real tool result");

    const answer = await requestChatCompletion({
      modelId: "test-model",
      apiKey: "test-key",
      messages: [{ role: "user", content: "Do the work" }],
      signal: new AbortController().signal,
      baseUrl: "https://api.example.test/v1",
      tools: [{ type: "function" }],
      executeTool,
    });

    expect(answer).toBe("Summary of completed actions.");
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(calls).toBe(3);
  });
});
