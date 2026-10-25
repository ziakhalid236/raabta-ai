import type { ProviderCatalog, ProviderModel } from "./provider-catalog";

type RoutingAttachment = { kind: "image" | "document" | "research" | "audio" };
type RoutingPreferences = {
  modelId: string;
  modelName: string;
  visionModelId: string;
  visionModelName: string;
  codingModelId: string;
  codingModelName: string;
  transcriptionModelId: string;
  transcriptionModelName: string;
};

export type TaskCapability = "chat" | "vision" | "coding" | "transcription";

export type RoutingDecision = {
  model: ProviderModel | null;
  capability: TaskCapability;
  reason: string;
  alternatives: ProviderModel[];
};

const CODING_HINTS = /(?:\b(?:code|coding|debug|bug|repository|repo|pull request|branch|function|typescript|javascript|python|api|deploy|build|test)\b)|(?:کوڈ|کوڈنگ|بگ|ریپوزٹری|برانچ|ٹیسٹ|ڈپلائے)/i;

export function chooseModelForTask(args: {
  catalog: ProviderCatalog | null;
  preferences: RoutingPreferences;
  text: string;
  attachments?: RoutingAttachment[];
  capability?: TaskCapability;
}): RoutingDecision {
  const attachments = args.attachments ?? [];
  const capability = args.capability ?? (
    attachments.some((attachment) => attachment.kind === "image")
      ? "vision"
      : CODING_HINTS.test(args.text)
        ? "coding"
        : "chat"
  );
  const pool = modelsForCapability(args.catalog, capability);
  const preferredId = preferredIdForCapability(args.preferences, capability);
  const preferred = pool.find((model) => model.id === preferredId);
  const model = preferred ?? pool[0] ?? fallbackPreference(args.preferences, capability);
  const alternatives = pool.filter((candidate) => candidate.id !== model?.id).slice(0, 4);
  const reason = reasonFor(capability, model, alternatives);
  return { model, capability, reason, alternatives };
}

export function modelsForCapability(
  catalog: ProviderCatalog | null,
  capability: TaskCapability,
): ProviderModel[] {
  if (!catalog) return [];
  switch (capability) {
    case "vision":
      return catalog.visionModels.length ? catalog.visionModels : catalog.chatModels.filter(isVisionCapable);
    case "coding":
      return catalog.codingModels.length ? catalog.codingModels : catalog.chatModels;
    case "transcription":
      return catalog.transcriptionModels;
    case "chat":
    default:
      return catalog.chatModels;
  }
}

export function isVisionCapable(model: ProviderModel): boolean {
  return model.inputModalities.some((modality) => /image|vision|multimodal/i.test(modality));
}

function preferredIdForCapability(preferences: RoutingPreferences, capability: TaskCapability): string {
  if (capability === "vision") return preferences.visionModelId || preferences.modelId;
  if (capability === "coding") return preferences.codingModelId || preferences.modelId;
  if (capability === "transcription") return preferences.transcriptionModelId;
  return preferences.modelId;
}

function fallbackPreference(preferences: RoutingPreferences, capability: TaskCapability): ProviderModel | null {
  const id = preferredIdForCapability(preferences, capability);
  if (!id) return null;
  return {
    id,
    name:
      capability === "vision"
        ? preferences.visionModelName || preferences.modelName || id
        : capability === "transcription"
          ? preferences.transcriptionModelName || id
          : capability === "coding"
            ? preferences.codingModelName || preferences.modelName || id
            : preferences.modelName || id,
    description: "Previously discovered provider model",
    inputModalities: capability === "vision" ? ["text", "image"] : ["text"],
    outputModalities: capability === "transcription" ? ["transcription"] : ["text"],
    promptPrice: null,
    completionPrice: null,
    contextLength: null,
  };
}

function reasonFor(capability: TaskCapability, model: ProviderModel | null, alternatives: ProviderModel[]): string {
  if (!model) {
    return `No ${capability} capability was discovered in the connected provider catalog.`;
  }
  const alternativeText = alternatives.length
    ? ` Alternatives: ${alternatives.map((candidate) => candidate.name).join(", ")}.`
    : "";
  return `Automatically selected ${model.name} for ${capability} from the provider capability catalog.${alternativeText}`;
}

export function capabilityFailureMessage(args: {
  capability: TaskCapability;
  failedModel: ProviderModel | null;
  alternatives: ProviderModel[];
  error: string;
}): string {
  const capabilityLabel = args.capability === "vision" ? "image analysis" : args.capability === "transcription" ? "voice transcription" : args.capability;
  const alternatives = args.alternatives.length
    ? ` Try: ${args.alternatives.map((model) => model.name).join(", ")}.`
    : " Refresh the provider catalog or connect an endpoint that advertises this capability.";
  return `The provider model${args.failedModel ? ` “${args.failedModel.name}”` : ""} could not complete ${capabilityLabel}: ${args.error}.${alternatives}`;
}
