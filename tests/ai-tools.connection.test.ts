import { describe, expect, it } from "vitest";
import { getLiveToolDefinitions } from "../lib/ai-tools";

describe("connection-aware live tools", () => {
  it("omits all GitHub actions when no GitHub credential is connected", () => {
    const names = getLiveToolDefinitions({ githubConnected: false }).map(
      (tool) => tool.function.name,
    );
    expect(names.some((name) => name.startsWith("github_"))).toBe(false);
    expect(names).toContain("web_search");
    expect(names).toContain("ai_workspace_read_file");
  });

  it("exposes the supported GitHub read and approval-gated write tools when connected", () => {
    const names = getLiveToolDefinitions({ githubConnected: true }).map(
      (tool) => tool.function.name,
    );
    expect(names).toContain("github_list_repositories");
    expect(names).toContain("github_list_files");
    expect(names).toContain("github_read_file");
    expect(names).toContain("github_update_file");
    expect(names).toContain("github_create_issue");
    expect(names).toContain("github_create_pull_request");
    expect(names).not.toContain("github_delete_repository");
    expect(names).not.toContain("github_merge_pull_request");
  });
});
