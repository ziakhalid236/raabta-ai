const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";
const MAX_MODEL_PAGES = 8;

export type OpenRouterModel = {
  id: string;
  name: string;
  description: string;
  inputModalities: string[];
  outputModalities: string[];
  promptPrice: number | null;
  completionPrice: number | null;
  contextLength: number | null;
};

export type OpenRouterCatalog = {
  chatModels: OpenRouterModel[];
  transcriptionModels: OpenRouterModel[];
  transcriptionWarning?: string;
};

export class OpenRouterCatalogError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterCatalogError";
  }
}

/** Fetch model catalogs only; this does not submit a billable inference. */
export async function discoverOpenRouterModels(
  apiKey: string,
  signal?: AbortSignal,
  baseUrl = OPENROUTER_API_BASE,
): Promise<OpenRouterCatalog> {
  const key = apiKey.trim();
  if (!key)
    throw new OpenRouterCatalogError("Enter the AI provider API key first.");

  const chatModels = await fetchModelCollection(key, "text", signal, baseUrl);
  if (!chatModels.length) {
    throw new OpenRouterCatalogError(
      "The provider returned no text-chat models for this catalog request. Check the API base URL and key.",
    );
  }

  try {
    const transcriptionModels = await fetchModelCollection(
      key,
      "transcription",
      signal,
      baseUrl,
    );
    return { chatModels, transcriptionModels };
  } catch {
    return {
      chatModels,
      transcriptionModels: [],
      transcriptionWarning:
        "The chat catalog loaded, but the optional transcription-model list could not be loaded. Refresh it later.",
    };
  }
}

async function fetchModelCollection(
  apiKey: string,
  outputModality: "text" | "transcription",
  signal?: AbortSignal,
  baseUrl = OPENROUTER_API_BASE,
): Promise<OpenRouterModel[]> {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const initial = new URL(`${normalizedBase}/models`);
  const isOpenRouter = new URL(normalizedBase).hostname === "openrouter.ai";
  if (isOpenRouter) {
    initial.searchParams.set("output_modalities", outputModality);
    initial.searchParams.set("limit", "1000");
  }
  const origin = new URL(normalizedBase).origin;
  let nextUrl: URL | null = initial;
  const models: OpenRouterModel[] = [];
  const seen = new Set<string>();

  for (let page = 0; nextUrl && page < MAX_MODEL_PAGES; page += 1) {
    if (nextUrl.origin !== origin || !nextUrl.pathname.endsWith("/models")) {
      throw new OpenRouterCatalogError(
        "The provider returned an unexpected model-catalog link.",
      );
    }

    let response: Response;
    try {
      response = await fetch(nextUrl.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal,
      });
    } catch {
      if (signal?.aborted) throw new Error("Request stopped.");
      throw new OpenRouterCatalogError(
        "Could not reach the configured AI provider. Check the base URL and internet connection.",
      );
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw catalogResponseError(response.status);
    const envelope = asRecord(payload);
    const data = envelope?.data;
    if (!Array.isArray(data)) {
      throw new OpenRouterCatalogError(
        "The AI provider returned an unreadable model catalog. Please check its OpenAI-compatible /models response.",
      );
    }

    for (const entry of data) {
      const model = normalizeModel(entry);
      if (!model || seen.has(model.id)) continue;
      seen.add(model.id);
      models.push(model);
    }

    const links = asRecord(envelope?.links);
    const next = typeof links?.next === "string" ? links.next : "";
    if (!next) {
      nextUrl = null;
    } else {
      try {
        nextUrl = new URL(next, normalizedBase);
      } catch {
        throw new OpenRouterCatalogError(
          "The provider returned an unreadable pagination link.",
        );
      }
    }
  }

  if (nextUrl) {
    throw new OpenRouterCatalogError(
      "The model catalog exceeded the safe page limit. Refresh to retry.",
    );
  }

  const compatibleModels = isOpenRouter
    ? models
    : outputModality === "transcription"
      ? models.filter((model) => model.outputModalities.includes("transcription"))
      : models.filter(
          (model) =>
            model.outputModalities.length === 0 ||
            model.outputModalities.includes("text"),
        );
  return compatibleModels.sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeModel(value: unknown): OpenRouterModel | null {
  const model = asRecord(value);
  if (!model) return null;
  const id = typeof model.id === "string" ? model.id.trim() : "";
  const reportedName = typeof model.name === "string" ? model.name.trim() : "";
  if (!id) return null;
  // Many OpenAI-compatible /models endpoints return only { id, object }.
  // Keep those models selectable by falling back to the model ID as its label.
  const name = reportedName || id;

  const architecture = asRecord(model?.architecture);
  const inputModalities = stringArray(
    architecture?.input_modalities ?? model.input_modalities,
  );
  const outputModalities = stringArray(
    architecture?.output_modalities ?? model.output_modalities,
  );
  const pricing = asRecord(model?.pricing);
  const contextLength =
    typeof model?.context_length === "number" &&
    Number.isFinite(model.context_length)
      ? model.context_length
      : null;

  return {
    id,
    name,
    description: typeof model.description === "string" ? model.description : "",
    inputModalities,
    outputModalities,
    promptPrice: finitePrice(pricing?.prompt),
    completionPrice: finitePrice(pricing?.completion),
    contextLength,
  };
}

function finitePrice(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function catalogResponseError(status: number): OpenRouterCatalogError {
  const messages: Record<number, string> = {
    400: "The provider rejected the model-list request (400). Check that the URL ends in the correct /v1 base path.",
    401: "The provider rejected this API key (401). Check it or enter a new key.",
    403: "The provider denied access to the model catalog (403). Check the key and account status.",
    429: "The provider rate-limited the catalog request (429). Wait briefly and refresh.",
  };
  return new OpenRouterCatalogError(
    messages[status] ??
      `The configured AI provider returned HTTP ${status} while loading models.`,
    status,
  );
}
