import { describe, expect, it } from "vitest";
import { sameProviderEndpoint } from "../lib/provider-identity";

describe("provider key endpoint binding", () => {
  it("normalizes host case and trailing slashes", () => {
    expect(sameProviderEndpoint("HTTPS://API.example.test/v1/", "https://api.example.test/v1")).toBe(true);
  });

  it("does not treat a saved key as portable to another endpoint or path", () => {
    expect(sameProviderEndpoint("https://openrouter.ai/api/v1", "https://codeflow.example/api/v1")).toBe(false);
    expect(sameProviderEndpoint("https://api.example.test/v1", "https://api.example.test/other/v1")).toBe(false);
    expect(sameProviderEndpoint("http://api.example.test/v1", "http://api.example.test/v1")).toBe(false);
    expect(sameProviderEndpoint("", "https://api.example.test/v1")).toBe(false);
  });
});
