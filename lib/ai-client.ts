export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatRequestMessage = {
  role: "user" | "assistant";
  content: string | ChatContentPart[];
};

export class AIRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AIRequestError";
  }
}

/** Send only user/assistant content to a user-configured HTTPS completion endpoint. */
export async function requestChatCompletion(args: {
  endpointUrl: string;
  modelId: string;
  apiKey: string;
  messages: ChatRequestMessage[];
  signal: AbortSignal;
}): Promise<string> {
  const endpoint = parseHttpsEndpoint(args.endpointUrl, "chat-completions");
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: args.modelId.trim(),
        messages: args.messages,
      }),
      signal: args.signal,
    });
  } catch (error) {
    if (args.signal.aborted) throw error;
    throw new AIRequestError(
      "Could not reach the endpoint. Check your connection and endpoint URL, then try again.",
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
  const answer =
    message && typeof message === "object"
      ? extractText((message as { content?: unknown }).content)
      : "";
  if (!answer) {
    throw new AIRequestError(
      "The endpoint response did not contain a text answer. Check model compatibility.",
    );
  }
  return answer;
}

/** Send a user-selected or recorded audio file to their optional transcription endpoint. */
export async function requestAudioTranscription(args: {
  endpointUrl: string;
  modelId: string;
  apiKey: string;
  file: { uri: string; name: string; mimeType: string; webFile?: Blob };
  signal: AbortSignal;
}): Promise<string> {
  const endpoint = parseHttpsEndpoint(args.endpointUrl, "audio-transcription");
  const form = new FormData();
  form.append("model", args.modelId.trim());
  const upload =
    args.file.webFile !== undefined
      ? args.file.webFile
      : ({ uri: args.file.uri, name: args.file.name, type: args.file.mimeType } as unknown as Blob);
  form.append("file", upload, args.file.name);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${args.apiKey}` },
      body: form,
      signal: args.signal,
    });
  } catch (error) {
    if (args.signal.aborted) throw error;
    throw new AIRequestError(
      "Could not reach the transcription endpoint. Check the optional speech settings and connection.",
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw responseError(response.status);
  const text =
    payload && typeof payload === "object" &&
    typeof (payload as { text?: unknown }).text === "string"
      ? (payload as { text: string }).text.trim()
      : "";
  if (!text) throw new AIRequestError("The transcription endpoint returned no readable text.");
  return text;
}

function parseHttpsEndpoint(value: string, purpose: string): string {
  try {
    const parsed = new URL(value.trim());
    const sensitiveQuery = [...parsed.searchParams.keys()].some((key) =>
      /key|token|secret|auth|credential/i.test(key),
    );
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      sensitiveQuery
    )
      throw new Error("invalid");
    return parsed.toString();
  } catch {
    throw new AIRequestError(
      `Use a complete HTTPS ${purpose} URL without credentials in the URL.`,
    );
  }
}

function responseError(status: number): AIRequestError {
  const messages: Record<number, string> = {
    400: "The provider could not accept this request (400). Check model and image/audio compatibility.",
    401: "The provider rejected the API key (401). Check or replace it in Settings.",
    403: "The provider denied this request (403). Check the key's permissions and model access.",
    404: "The endpoint or model was not found (404). Check both values in Settings.",
    413: "The provider says this image or recording is too large (413). Try a smaller file.",
    429: "The provider rate limit or quota was reached (429). Try again later or check your plan.",
  };
  return new AIRequestError(
    messages[status] ??
      `The provider returned HTTP ${status}. Check endpoint, model, file compatibility, and provider status.`,
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
