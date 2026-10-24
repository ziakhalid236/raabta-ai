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
    throw new OpenRouterCatalogError("Enter an OpenRouter API key first.");

  const chatModels = await fetchModelCollection(key, "text", signal, baseUrl);
  if (!chatModels.length) {
    throw new OpenRouterCatalogError(
      "OpenRouter returned no text-chat models for this catalog request. Check the key and try again.",
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
  initial.searchParams.set("output_modalities", outputModality);
  initial.searchParams.set("limit", "1000");
  const origin = new URL(normalizedBase).origin;
  let nextUrl: URL | null = initial;
  const models: OpenRouterModel[] = [];
  const seen = new Set<string>();

  for (let page = 0; nextUrl && page < MAX_MODEL_PAGES; page += 1) {
    if (nextUrl.origin !== origin || !nextUrl.pathname.endsWith("/models")) {
      throw new OpenRouterCatalogError(
        "OpenRouter returned an unexpected model-catalog link.",
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
        "Could not reach OpenRouter. Check your internet connection and try again.",
      );
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw catalogResponseError(response.status);
    const envelope = asRecord(payload);
    const data = envelope?.data;
    if (!Array.isArray(data)) {
      throw new OpenRouterCatalogError(
        "OpenRouter returned an unreadable model catalog. Please try again.",
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
          "OpenRouter returned an unreadable pagination link.",
        );
      }
    }
  }

  if (nextUrl) {
    throw new OpenRouterCatalogError(
      "The model catalog exceeded the safe page limit. Refresh to retry.",
    );
  }

  return models.sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeModel(value: unknown): OpenRouterModel | null {
  const model = asRecord(value);
  if (!model) return null;
  const id = typeof model.id === "string" ? model.id.trim() : "";
  const name = typeof model.name === "string" ? model.name.trim() : "";
  if (!id || !name) return null;

  const architecture = asRecord(model?.architecture);
  const inputModalities = stringArray(architecture?.input_modalities);
  const outputModalities = stringArray(architecture?.output_modalities);
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
    400: "OpenRouter could not read the model request (400). Check the app version and retry.",
    401: "OpenRouter rejected this API key (401). Check it or enter a new key.",
    403: "OpenRouter denied access to the model catalog (403). Check the key and account status.",
    429: "OpenRouter rate-limited the catalog request (429). Wait briefly and refresh.",
  };
  return new OpenRouterCatalogError(
    messages[status] ??
      `OpenRouter returned HTTP ${status} while loading models.`,
    status,
  );
}
