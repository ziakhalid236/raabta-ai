import { afterEach, describe, expect, it, vi } from "vitest";
import { requestChatCompletion } from "../lib/ai-client";

afterEach(() => vi.unstubAllGlobals());

const lookupTool = {
  type: "function",
  function: {
    name: "lookup",
    description: "Look up a value",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

describe("requestChatCompletion tool execution", () => {
  it("blocks an identical repeated native tool action and finalizes", async () => {
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
                      function: {
                        name: "lookup",
                        arguments: '{"query":"raabta"}',
                      },
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
      tools: [lookupTool],
      executeTool,
    });

    expect(answer).toBe("Summary of completed actions.");
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(calls).toBe(3);
  });

  it("executes the exact text-envelope fallback for providers that ignore function calls", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages: Array<{ role: string; content: string }>;
      };
      const result = calls === 1
        ? '[[RAABTA_TOOL_CALL]]{"name":"lookup","arguments":{"query":"raabta"}}[[/RAABTA_TOOL_CALL]]'
        : "Found the connected repository details.";
      if (calls === 2) {
        expect(body.messages.some((message) =>
          message.role === "user" && message.content.includes("A real tool result"),
        )).toBe(true);
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { role: "assistant", content: result } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const executeTool = vi.fn(async () => "A real tool result");

    const answer = await requestChatCompletion({
      modelId: "test-model",
      apiKey: "test-key",
      messages: [{ role: "user", content: "List the connected repositories" }],
      signal: new AbortController().signal,
      baseUrl: "https://api.example.test/v1",
      tools: [lookupTool],
      executeTool,
    });

    expect(answer).toBe("Found the connected repository details.");
    expect(executeTool).toHaveBeenCalledWith("lookup", { query: "raabta" });
    expect(calls).toBe(2);
  });

  it("does not execute text envelopes for tools that were not supplied", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '[[RAABTA_TOOL_CALL]]{"name":"github_list_repositories","arguments":{}}[[/RAABTA_TOOL_CALL]]' } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const executeTool = vi.fn(async () => "should not run");

    await expect(requestChatCompletion({
      modelId: "test-model",
      apiKey: "test-key",
      messages: [{ role: "user", content: "List repositories" }],
      signal: new AbortController().signal,
      baseUrl: "https://api.example.test/v1",
      tools: [lookupTool],
      executeTool,
    })).rejects.toThrow("unavailable or invalid tool action");
    expect(executeTool).not.toHaveBeenCalled();
  });
});
