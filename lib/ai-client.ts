export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatRequestMessage = {
  role: "user" | "assistant";
  content: string | ChatContentPart[];
};

const CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const AUDIO_TRANSCRIPTIONS_URL = "https://openrouter.ai/api/v1/audio/transcriptions";

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
}): Promise<string> {
  let response: Response;
  try {
    response = await fetch(CHAT_COMPLETIONS_URL, {
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
      "Could not reach OpenRouter. Check your internet connection and try again.",
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
      "The selected OpenRouter model did not return a text answer. Choose another catalog model and try again.",
    );
  }
  return answer;
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
      : ({ uri: args.file.uri, name: args.file.name, type: args.file.mimeType } as unknown as Blob);
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
    payload && typeof payload === "object" &&
    typeof (payload as { text?: unknown }).text === "string"
      ? (payload as { text: string }).text.trim()
      : "";
  if (!text) throw new AIRequestError("OpenRouter returned no readable transcription text. Check the selected speech model.");
  return text;
}

function responseError(status: number): AIRequestError {
  const messages: Record<number, string> = {
    400: "The provider could not accept this request (400). Check model and image/audio compatibility.",
    401: "The provider rejected the API key (401). Check or replace it in Settings.",
    403: "The provider denied this request (403). Check the key's permissions and model access.",
    404: "OpenRouter could not find the selected model (404). Choose another from the model catalog.",
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
