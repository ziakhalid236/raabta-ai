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

const CLOUDFLARE_VISION_MODELS: ProviderModel[] = [
  {
    id: "@cf/moondream/moondream3.1-9B-A2B",
    name: "Cloudflare Moondream 3.1 Vision",
    description:
      "Cloudflare-hosted open model for image questions, OCR and visual reasoning.",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    promptPrice: null,
    completionPrice: null,
    contextLength: null,
  },
  {
    id: "@cf/meta/llama-3.2-11b-vision-instruct",
    name: "Cloudflare Llama 3.2 Vision",
    description:
      "Cloudflare-hosted multimodal Llama model for image understanding.",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    promptPrice: null,
    completionPrice: null,
    contextLength: null,
  },
  {
    id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    name: "Cloudflare Llama 4 Scout Vision",
    description:
      "Cloudflare-hosted multimodal Llama 4 model for image understanding.",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    promptPrice: null,
    completionPrice: null,
    contextLength: null,
  },
  {
    id: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    name: "Cloudflare Mistral Small 3.1 Vision",
    description: "Cloudflare-hosted Mistral model with vision input support.",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    promptPrice: null,
    completionPrice: null,
    contextLength: null,
  },
  {
    id: "@cf/llava-hf/llava-1.5-7b-hf",
    name: "Cloudflare LLaVA Vision",
    description: "Cloudflare-hosted open vision-language model.",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    promptPrice: null,
    completionPrice: null,
    contextLength: null,
  },
];

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
    const providerKind = chatModels.some((model) =>
      model.id.startsWith("zoya-"),
    )
      ? "cloudflare-worker"
      : "generic";
    const visionModels = mergeModels(
      classifyVisionModels(chatModels),
      isCloudflareEndpoint(baseUrl) ? CLOUDFLARE_VISION_MODELS : [],
    );
    return {
      chatModels,
      visionModels,
      codingModels: classifyCodingModels(chatModels),
      transcriptionModels:
        providerKind === "cloudflare-worker"
          ? [
              {
                id: "cloudflare-auto-transcription",
                name: "Cloudflare automatic voice transcription",
                description:
                  "Routes voice files to Cloudflare Whisper automatically.",
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
      visionModels: mergeModels(
        classifyVisionModels(chatModels),
        isCloudflareEndpoint(baseUrl) ? CLOUDFLARE_VISION_MODELS : [],
      ),
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
    throw new ProviderCatalogError(
      "Enter the HTTPS OpenAI-compatible /v1 base URL first.",
    );
  const initial = new URL(`${normalizedBase}/models`);
  if (outputModality === "transcription")
    initial.searchParams.set("output_modalities", "transcription");
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

  const compatibleModels =
    outputModality === "transcription"
      ? models.filter((model) =>
          model.outputModalities.includes("transcription"),
        )
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
  const capability = asRecord(model.capabilities);
  const reportedInputModalities =
    architecture?.input_modalities ??
    model.input_modalities ??
    model.input_modalities_supported ??
    model.modalities;
  const inputModalities = stringArray(reportedInputModalities);
  if (
    (capability?.vision === true ||
      model.vision === true ||
      model.supports_vision === true) &&
    !inputModalities.includes("image")
  ) {
    inputModalities.push("image");
  }
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
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    : [];
}

export function classifyVisionModels(models: ProviderModel[]): ProviderModel[] {
  return models.filter(
    (model) =>
      model.inputModalities.some((modality) =>
        /image|vision|multimodal/i.test(modality),
      ) ||
      /vision|multimodal|\bvl\b|image|llava|pixtral|internvl|moondream|minicpm-v|gemma-3|gpt-4o|claude-3|glm-4v|qwen.*-vl|llama.*vision/i.test(
        `${model.id} ${model.name} ${model.description}`,
      ),
  );
}

function mergeModels(
  primary: ProviderModel[],
  extra: ProviderModel[],
): ProviderModel[] {
  const byId = new Map(primary.map((model) => [model.id, model]));
  for (const model of extra) if (!byId.has(model.id)) byId.set(model.id, model);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function isCloudflareEndpoint(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return /(^|\.)cloudflare\.com$|(^|\.)workers\.dev$|(^|\.)pages\.dev$/i.test(
      url.hostname,
    );
  } catch {
    return false;
  }
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
