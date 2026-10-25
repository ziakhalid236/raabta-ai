import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system/legacy", () => ({
  getInfoAsync: vi.fn(async () => ({ exists: true })),
}));

import { detectCapabilities } from "../lib/agent/capabilities";

describe("device capability report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("states plainly that no shell or browser is available", async () => {
    const report = await detectCapabilities({
      githubConnected: false,
      hasVisionModel: false,
      hasTranscriptionModel: false,
    });
    const byId = Object.fromEntries(report.capabilities.map((c) => [c.id, c]));
    expect(byId.shell.state).toBe("unavailable");
    expect(byId.browser.state).toBe("limited");
    expect(byId.tests.state).toBe("unavailable");
    expect(byId.background.state).toBe("unavailable");
    expect(report.summary).toContain("cannot run shell commands");
  });

  it("omits GitHub tools when no account is connected", async () => {
    const report = await detectCapabilities({
      githubConnected: false,
      hasVisionModel: false,
      hasTranscriptionModel: false,
    });
    expect(report.tools).toContain("ai_workspace_read_file");
    expect(report.tools).not.toContain("github_update_file");
  });

  it("adds GitHub tools and reports them when connected", async () => {
    const report = await detectCapabilities({
      githubConnected: true,
      hasVisionModel: true,
      hasTranscriptionModel: true,
    });
    expect(report.tools).toContain("github_update_file");
    expect(report.summary).toContain("GitHub is connected");
    const byId = Object.fromEntries(report.capabilities.map((c) => [c.id, c]));
    expect(byId.github.state).toBe("available");
    expect(byId.vision.state).toBe("available");
    expect(byId.voice.state).toBe("available");
  });

  it("reports an unreachable workspace instead of assuming it works", async () => {
    const fs = await import("expo-file-system/legacy");
    vi.mocked(fs.getInfoAsync).mockResolvedValueOnce({ exists: false } as never);
    const report = await detectCapabilities({
      githubConnected: false,
      hasVisionModel: false,
      hasTranscriptionModel: false,
    });
    const workspace = report.capabilities.find((c) => c.id === "workspace");
    expect(workspace?.state).toBe("unavailable");
  });
});
