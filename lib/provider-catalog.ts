const DEFAULT_COMPATIBLE_API_BASE = "";
const MAX_MODEL_PAGES = 8;

export type ProviderModel = {
  id: string;
  name: string;
  description: string;
  inputModalities: string[];
  outputModalities: string[];
  promptPrice: number | null;
  completionPrice: number | null;
  contextLength: number | null;
};

export type ProviderCatalog = {
  chatModels: ProviderModel[];
  visionModels: ProviderModel[];
  codingModels: ProviderModel[];
  transcriptionModels: ProviderModel[];
  transcriptionWarning?: string;
  providerKind: "generic" | "cloudflare-worker";
};

export class ProviderCatalogError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderCatalogError";
  }
}

/** Fetch model catalogs only; this does not submit a billable inference. */
export async function discoverProviderModels(
  apiKey: string,
  signal?: AbortSignal,
  baseUrl = DEFAULT_COMPATIBLE_API_BASE,
): Promise<ProviderCatalog> {
  const key = apiKey.trim();
  if (!key)
    throw new ProviderCatalogError("Enter the AI provider API key first.");

  const chatModels = await fetchModelCollection(key, "text", signal, baseUrl);
  if (!chatModels.length) {
    throw new ProviderCatalogError(
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
    const providerKind = chatModels.some((model) => model.id.startsWith("zoya-"))
      ? "cloudflare-worker"
      : "generic";
    return {
      chatModels,
      visionModels: classifyVisionModels(chatModels),
      codingModels: classifyCodingModels(chatModels),
      transcriptionModels:
        providerKind === "cloudflare-worker"
          ? [
              {
                id: "cloudflare-auto-transcription",
                name: "Cloudflare automatic voice transcription",
                description: "Routes voice files to Cloudflare Whisper automatically.",
                inputModalities: ["audio"],
                outputModalities: ["transcription"],
                promptPrice: null,
                completionPrice: null,
                contextLength: null,
              },
            ]
          : transcriptionModels,
      providerKind,
    };
  } catch {
    return {
      chatModels,
      visionModels: classifyVisionModels(chatModels),
      codingModels: classifyCodingModels(chatModels),
      transcriptionModels: [],
      providerKind: chatModels.some((model) => model.id.startsWith("zoya-"))
        ? "cloudflare-worker"
        : "generic",
      transcriptionWarning:
        "The chat catalog loaded, but the optional transcription-model list could not be loaded. Refresh it later.",
    };
  }
}

async function fetchModelCollection(
  apiKey: string,
  outputModality: "text" | "transcription",
  signal?: AbortSignal,
  baseUrl = DEFAULT_COMPATIBLE_API_BASE,
): Promise<ProviderModel[]> {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  if (!normalizedBase)
    throw new ProviderCatalogError("Enter the HTTPS OpenAI-compatible /v1 base URL first.");
  const initial = new URL(`${normalizedBase}/models`);
  if (initial.protocol !== "https:") {
    throw new ProviderCatalogError(
      "Use an HTTPS API base URL so the provider key is not sent in plain text.",
    );
  }
  const origin = new URL(normalizedBase).origin;
  let nextUrl: URL | null = initial;
  const models: ProviderModel[] = [];
  const seen = new Set<string>();

  for (let page = 0; nextUrl && page < MAX_MODEL_PAGES; page += 1) {
    if (nextUrl.origin !== origin || !nextUrl.pathname.endsWith("/models")) {
      throw new ProviderCatalogError(
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
      throw new ProviderCatalogError(
        "Could not reach the configured AI provider. Check the base URL and internet connection.",
      );
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw catalogResponseError(response.status);
    const envelope = asRecord(payload);
    const data = envelope?.data;
    if (!Array.isArray(data)) {
      throw new ProviderCatalogError(
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
        throw new ProviderCatalogError(
          "The provider returned an unreadable pagination link.",
        );
      }
    }
  }

  if (nextUrl) {
    throw new ProviderCatalogError(
      "The model catalog exceeded the safe page limit. Refresh to retry.",
    );
  }

  const compatibleModels = outputModality === "transcription"
      ? models.filter((model) => model.outputModalities.includes("transcription"))
      : models.filter(
          (model) =>
            model.outputModalities.length === 0 ||
            model.outputModalities.includes("text"),
        );
  return compatibleModels.sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeModel(value: unknown): ProviderModel | null {
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

export function classifyVisionModels(models: ProviderModel[]): ProviderModel[] {
  return models.filter(
    (model) =>
      model.inputModalities.some((modality) =>
        /image|vision|multimodal/i.test(modality),
      ) || /vision|multimodal|vl|image/i.test(`${model.id} ${model.name} ${model.description}`),
  );
}

export function classifyCodingModels(models: ProviderModel[]): ProviderModel[] {
  return models.filter((model) =>
    /code|coder|coding|codestral|devstral|starcoder|program|engineering|developer/i.test(
      `${model.id} ${model.name} ${model.description}`,
    ),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function catalogResponseError(status: number): ProviderCatalogError {
  const messages: Record<number, string> = {
    400: "The provider rejected the model-list request (400). Check that the URL ends in the correct /v1 base path.",
    401: "The provider rejected this API key (401). Check it or enter a new key.",
    403: "The provider denied access to the model catalog (403). Check the key and account status.",
    429: "The provider rate-limited the catalog request (429). Wait briefly and refresh.",
  };
  return new ProviderCatalogError(
    messages[status] ??
      `The configured AI provider returned HTTP ${status} while loading models.`,
    status,
  );
}
