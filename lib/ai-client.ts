export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatRequestMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[];
  tool_call_id?: string;
  tool_calls?: unknown[];
};
export type ChatToolCallExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<string>;

const DEFAULT_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";
const AUDIO_TRANSCRIPTIONS_URL =
  "https://openrouter.ai/api/v1/audio/transcriptions";

export class AIRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AIRequestError";
  }
}

/** Send only user/assistant content to the fixed OpenRouter chat-completions route. */
export async function requestChatCompletion(args: {
  modelId: string;
  apiKey: string;
  messages: ChatRequestMessage[];
  signal: AbortSignal;
  baseUrl?: string;
  tools?: unknown[];
  executeTool?: ChatToolCallExecutor;
}): Promise<string> {
  const chatUrl = `${(args.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "")}/chat/completions`;
  const messages = [...args.messages] as Array<Record<string, unknown>>;
  const completedToolActions = new Map<string, string>();
  const maxToolRounds = 8;
  for (let round = 0; round < maxToolRounds; round += 1) {
    let response: Response;
    try {
      response = await fetch(chatUrl || DEFAULT_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${args.apiKey}`,
        },
        body: JSON.stringify({
          model: args.modelId.trim(),
          messages,
          ...(args.tools?.length && args.executeTool
            ? { tools: args.tools, tool_choice: "auto" }
            : {}),
        }),
        signal: args.signal,
      });
    } catch (error) {
      if (args.signal.aborted) throw error;
      throw new AIRequestError(
        "Could not reach the configured AI provider. Check the API base URL and internet connection.",
      );
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw responseError(response.status);
    const choices =
      payload && typeof payload === "object"
        ? (payload as { choices?: unknown }).choices
        : undefined;
    const first = Array.isArray(choices) ? choices[0] : undefined;
    const message =
      first && typeof first === "object"
        ? (first as { message?: unknown }).message
        : null;
    const assistantContent =
      message && typeof message === "object"
        ? extractText((message as { content?: unknown }).content)
        : "";
    const toolCalls =
      message &&
      typeof message === "object" &&
      Array.isArray((message as { tool_calls?: unknown }).tool_calls)
        ? (message as { tool_calls: unknown[] }).tool_calls
        : [];
    if (toolCalls.length && args.executeTool) {
      messages.push(message as Record<string, unknown>);
      let duplicateActionRequested = false;
      for (const call of toolCalls) {
        const item = call as {
          id?: unknown;
          function?: { name?: unknown; arguments?: unknown };
        };
        const id = typeof item.id === "string" ? item.id : "tool-call";
        const name =
          typeof item.function?.name === "string" ? item.function.name : "";
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(
            typeof item.function?.arguments === "string"
              ? item.function.arguments
              : "{}",
          );
        } catch {
          toolArgs = {};
        }
        const signature = `${name}:${JSON.stringify(toolArgs)}`;
        const earlierResult = completedToolActions.get(signature);
        if (earlierResult !== undefined) {
          duplicateActionRequested = true;
          messages.push({
            role: "tool",
            tool_call_id: id,
            content:
              "This exact action was already executed. Do not repeat it; use the earlier result.",
          });
          continue;
        }
        const validation = validateToolArguments(name, toolArgs, args.tools ?? []);
        const result = validation ?? (name
          ? await args.executeTool(name, toolArgs)
          : "Unknown tool call.");
        completedToolActions.set(signature, result);
        messages.push({
          role: "tool",
          tool_call_id: id,
          content: result.slice(0, 40_000),
        });
      }
      if (duplicateActionRequested) break;
      continue;
    }
    if (assistantContent && args.executeTool && args.tools?.length) {
      const textToolCall = parseTextToolCall(assistantContent, args.tools);
      if (textToolCall) {
        const signature = `${textToolCall.name}:${JSON.stringify(textToolCall.arguments)}`;
        const earlierResult = completedToolActions.get(signature);
        messages.push({ role: "assistant", content: assistantContent });
        if (earlierResult !== undefined) {
          messages.push({
            role: "user",
            content: `The exact action ${textToolCall.name} was already executed. Earlier result: ${earlierResult}. Do not repeat it; answer using the result already received.`,
          });
          break;
        }
        const result = await args.executeTool(
          textToolCall.name,
          textToolCall.arguments,
        );
        completedToolActions.set(signature, result);
        messages.push({
          role: "user",
          content: `Raabta tool result for ${textToolCall.name}:\n${result.slice(0, 40_000)}\n\nUse this result to continue. If another action is needed, request one listed tool; otherwise answer the user.`,
        });
        continue;
      }
    }
    if (!assistantContent) {
      throw new AIRequestError(
        "The selected model did not return a text answer. Check compatibility or choose another model.",
      );
    }
    return assistantContent;
  }
  // Do not discard successful tool results when a model keeps requesting tools.
  // Make one final request without tools so the model can summarize what it has.
  let finalResponse: Response;
  try {
    finalResponse = await fetch(chatUrl || DEFAULT_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: args.modelId.trim(),
        messages: [
          ...messages,
          {
            role: "system",
            content:
              "The available tool-action limit has been reached. Do not request more tools. Give the best concise answer using the results already present, and state clearly if something remains incomplete.",
          },
        ],
        tool_choice: "none",
      }),
      signal: args.signal,
    });
  } catch (error) {
    if (args.signal.aborted) throw error;
    throw new AIRequestError(
      "The task reached its tool-action limit and a final answer could not be reached. Results already shown in the action timeline remain saved.",
    );
  }
  const finalPayload: unknown = await finalResponse.json().catch(() => null);
  if (!finalResponse.ok) throw responseError(finalResponse.status);
  const finalChoices =
    finalPayload && typeof finalPayload === "object"
      ? (finalPayload as { choices?: unknown }).choices
      : undefined;
  const finalFirst = Array.isArray(finalChoices) ? finalChoices[0] : undefined;
  const finalMessage =
    finalFirst && typeof finalFirst === "object"
      ? (finalFirst as { message?: unknown }).message
      : null;
  const finalContent =
    finalMessage && typeof finalMessage === "object"
      ? extractText((finalMessage as { content?: unknown }).content)
      : "";
  if (finalContent) return finalContent;
  throw new AIRequestError(
    "The task reached its tool-action limit. Some results remain visible in the action timeline, but the model did not produce a final text answer.",
  );
}

/** Send a user-selected or recorded audio file to OpenRouter speech transcription. */
export async function requestAudioTranscription(args: {
  modelId: string;
  apiKey: string;
  file: { uri: string; name: string; mimeType: string; webFile?: Blob };
  signal: AbortSignal;
}): Promise<string> {
  const form = new FormData();
  form.append("model", args.modelId.trim());
  const upload =
    args.file.webFile !== undefined
      ? args.file.webFile
      : ({
          uri: args.file.uri,
          name: args.file.name,
          type: args.file.mimeType,
        } as unknown as Blob);
  form.append("file", upload, args.file.name);

  let response: Response;
  try {
    response = await fetch(AUDIO_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${args.apiKey}` },
      body: form,
      signal: args.signal,
    });
  } catch (error) {
    if (args.signal.aborted) throw error;
    throw new AIRequestError(
      "Could not reach OpenRouter speech transcription. Check your connection and selected transcription model.",
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw responseError(response.status);
  const text =
    payload &&
    typeof payload === "object" &&
    typeof (payload as { text?: unknown }).text === "string"
      ? (payload as { text: string }).text.trim()
      : "";
  if (!text)
    throw new AIRequestError(
      "OpenRouter returned no readable transcription text. Check the selected speech model.",
    );
  return text;
}

function responseError(status: number): AIRequestError {
  const messages: Record<number, string> = {
    400: "The provider could not accept this request (400). Check the model and image compatibility.",
    401: "The provider rejected the API key (401). Check or replace it in Settings.",
    403: "The provider denied this request (403). Check the key's permissions and model access.",
    404: "The provider could not find the selected model (404). Choose another from the model catalog.",
    413: "The provider says this image or recording is too large (413). Try a smaller file.",
    429: "The provider rate limit or quota was reached (429). Try again later or check your plan.",
  };
  return new AIRequestError(
    messages[status] ??
      `OpenRouter returned HTTP ${status}. Check the selected model, file compatibility, and account status.`,
    status,
  );
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
      )
        return (part as { text: string }).text;
      return "";
    })
    .join("")
    .trim();
}

type TextToolCall = { name: string; arguments: Record<string, unknown> };

function parseTextToolCall(
  content: string,
  tools: unknown[],
): TextToolCall | null {
  const marker = "[[RAABTA_TOOL_CALL]]";
  const closing = "[[/RAABTA_TOOL_CALL]]";
  if (!content.includes(marker) && !content.includes(closing)) return null;
  const match = /^\[\[RAABTA_TOOL_CALL\]\](\{[\s\S]*\})\[\[\/RAABTA_TOOL_CALL\]\]$/.exec(
    content.trim(),
  );
  if (!match)
    throw new AIRequestError(
      "The provider returned a malformed Raabta tool request. No action was run; try again or choose a tool-compatible model.",
    );
  let value: unknown;
  try {
    value = JSON.parse(match[1]);
  } catch {
    throw new AIRequestError(
      "The provider returned invalid JSON for a tool request. No action was run.",
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AIRequestError("The provider returned an invalid tool request.");
  const call = value as Record<string, unknown>;
  if (
    typeof call.name !== "string" ||
    !call.arguments ||
    typeof call.arguments !== "object" ||
    Array.isArray(call.arguments)
  )
    throw new AIRequestError("The provider returned an invalid tool request.");
  const toolArgs = call.arguments as Record<string, unknown>;
  const validation = validateToolArguments(call.name, toolArgs, tools);
  if (validation)
    throw new AIRequestError(
      `The provider requested an unavailable or invalid tool action (${validation}). No action was run.`,
    );
  return { name: call.name, arguments: toolArgs };
}

function validateToolArguments(
  name: string,
  args: Record<string, unknown>,
  tools: unknown[],
): string | null {
  const definition = tools.find((item) => {
    if (!item || typeof item !== "object") return false;
    const fn = (item as { function?: { name?: unknown } }).function;
    return fn?.name === name;
  }) as
    | {
        function?: {
          parameters?: {
            properties?: Record<string, { type?: unknown }>;
            required?: string[];
          };
        };
      }
    | undefined;
  if (!definition) return "that tool is not connected or enabled";
  const parameters = definition.function?.parameters;
  const properties = parameters?.properties ?? {};
  for (const key of Object.keys(args)) {
    if (!Object.hasOwn(properties, key)) return `unexpected argument ${key}`;
    const expected = properties[key]?.type;
    if (expected === "string" && typeof args[key] !== "string")
      return `argument ${key} must be text`;
  }
  for (const key of parameters?.required ?? []) {
    if (!Object.hasOwn(args, key)) return `required argument ${key} is missing`;
  }
  return null;
}
