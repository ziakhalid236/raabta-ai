import { describe, expect, it } from "vitest";

import {
  classifyVisionModels,
  visionCandidateModels,
  type ProviderModel,
} from "../lib/provider-catalog";

function model(id: string, inputModalities: string[] = []): ProviderModel {
  return {
    id,
    name: id,
    description: "",
    inputModalities,
    outputModalities: ["text"],
    promptPrice: null,
    completionPrice: null,
    contextLength: null,
  };
}

describe("vision model detection", () => {
  it("detects a vision model from a bare ID, as /models endpoints usually return", () => {
    const detected = classifyVisionModels([
      model("qwen2.5-vl-7b-instruct"),
      model("llava-1.6"),
      model("gpt-4o"),
      model("gemini-2.0-flash"),
      model("moondream2"),
    ]);
    expect(detected.map((m) => m.id)).toHaveLength(5);
  });

  it("detects newer families that the old pattern missed", () => {
    // Regression: gemma-3, gemma4, gpt-4.1, gemini and claude sonnet were not
    // recognised, so an image-capable model appeared missing from the picker.
    const detected = classifyVisionModels([
      model("gemma-3-12b-it"),
      model("gemma4-27b"),
      model("gpt-4.1-mini"),
      model("claude-3-5-sonnet-latest"),
      model("phi-4-vision"),
      model("smolvlm-256m"),
    ]);
    expect(detected.map((m) => m.id)).toHaveLength(6);
  });

  it("trusts reported image input even when the name looks text-only", () => {
    const detected = classifyVisionModels([model("my-internal-model", ["text", "image"])]);
    expect(detected).toHaveLength(1);
  });

  it("does not claim a plain text model can read images", () => {
    expect(classifyVisionModels([model("llama-3.1-8b-instruct")])).toHaveLength(0);
  });
});

describe("vision candidate list", () => {
  it("keeps undetected models selectable, with detected ones first", () => {
    const all = [
      model("llama-3.1-8b"),
      model("qwen2.5-vl-7b"),
      model("mistral-7b"),
    ];
    const ordered = visionCandidateModels(all);

    // Nothing is hidden: a user whose model is not recognised can still pick it.
    expect(ordered).toHaveLength(3);
    expect(ordered.map((m) => m.id)).toEqual([
      "qwen2.5-vl-7b",
      "llama-3.1-8b",
      "mistral-7b",
    ]);
  });

  it("preserves order when no model is detected", () => {
    const all = [model("a"), model("b")];
    expect(visionCandidateModels(all).map((m) => m.id)).toEqual(["a", "b"]);
  });
});
