import { describe, expect, it } from "vitest";
import { capabilityFailureMessage, chooseModelForTask } from "../lib/provider-routing";
import type { ProviderCatalog, ProviderModel } from "../lib/provider-catalog";

const model = (id: string, name: string, inputModalities: string[] = ["text"]): ProviderModel => ({
  id,
  name,
  description: "",
  inputModalities,
  outputModalities: ["text"],
  promptPrice: null,
  completionPrice: null,
  contextLength: null,
});

const catalog: ProviderCatalog = {
  chatModels: [model("text-main", "Text Main"), model("code-main", "Code Main")],
  visionModels: [model("vision-main", "Vision Main", ["text", "image"])],
  codingModels: [model("code-main", "Code Main")],
  transcriptionModels: [
    { ...model("voice-main", "Voice Main", ["audio"]), outputModalities: ["transcription"] },
  ],
  providerKind: "generic",
};
const preferences = {
  modelId: "",
  modelName: "",
  visionModelId: "",
  visionModelName: "",
  codingModelId: "",
  codingModelName: "",
  transcriptionModelId: "",
  transcriptionModelName: "",
};

describe("automatic provider capability routing", () => {
  it("routes image attachments to a vision model without a separate user selection", () => {
    const attachment = { kind: "image" as const };
    const result = chooseModelForTask({ catalog, preferences: { ...preferences, modelId: "text-main", modelName: "Text Main" }, text: "describe this", attachments: [attachment] });
    expect(result.capability).toBe("vision");
    expect(result.model?.id).toBe("vision-main");
  });

  it("routes coding intent to a coding-capable model", () => {
    const result = chooseModelForTask({ catalog, preferences: { ...preferences, modelId: "text-main" }, text: "debug this TypeScript function" });
    expect(result.capability).toBe("coding");
    expect(result.model?.id).toBe("code-main");
  });

  it("routes voice work to the transcription catalog", () => {
    const result = chooseModelForTask({ catalog, preferences, text: "voice", capability: "transcription" });
    expect(result.model?.id).toBe("voice-main");
  });

  it("explains alternatives when a capability is unavailable", () => {
    const message = capabilityFailureMessage({ capability: "vision", failedModel: model("bad", "Bad Vision"), alternatives: [model("backup", "Backup Vision")], error: "HTTP 400" });
    expect(message).toContain("Bad Vision");
    expect(message).toContain("Backup Vision");
    expect(message).toContain("HTTP 400");
  });
});
