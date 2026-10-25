import { describe, expect, it } from "vitest";

import {
  applyDecision,
  approvalRiskOf,
  checkApproval,
  EMPTY_APPROVAL_POLICY,
  isRememberable,
  riskLabel,
} from "../lib/agent/approvals";

describe("approval policy", () => {
  it("never prompts for read-only tools", () => {
    for (const tool of [
      "web_search",
      "read_public_web_page",
      "ai_workspace_list_files",
      "ai_workspace_read_file",
      "github_list_files",
      "github_read_file",
    ]) {
      expect(approvalRiskOf(tool)).toBe("read");
      expect(checkApproval(tool, EMPTY_APPROVAL_POLICY).required).toBe(false);
    }
  });

  it("treats an unknown tool as destructive rather than silently allowing it", () => {
    expect(approvalRiskOf("mystery_tool")).toBe("destructive");
    const check = checkApproval("mystery_tool", EMPTY_APPROVAL_POLICY);
    expect(check.required).toBe(true);
    expect(check.rememberable).toBe(false);
  });

  it("prompts once for a write tool and stops asking after Always allow", () => {
    const first = checkApproval("github_update_file", EMPTY_APPROVAL_POLICY);
    expect(first.required).toBe(true);
    expect(first.rememberable).toBe(true);

    const policy = applyDecision(EMPTY_APPROVAL_POLICY, "github_update_file", "always");
    const second = checkApproval("github_update_file", policy);
    expect(second.required).toBe(false);
    expect(second.remembered).toBe(true);
  });

  it("keeps asking for destructive tools even after approval", () => {
    const policy = applyDecision(EMPTY_APPROVAL_POLICY, "ai_workspace_delete_file", "always");
    expect(isRememberable("ai_workspace_delete_file")).toBe(false);
    expect(checkApproval("ai_workspace_delete_file", policy).required).toBe(true);
  });

  it("remembers a denial and reports it instead of re-prompting", () => {
    const policy = applyDecision(EMPTY_APPROVAL_POLICY, "github_create_issue", "deny");
    const check = checkApproval("github_create_issue", policy);
    expect(check.denied).toBe(true);
    expect(check.required).toBe(false);
  });

  it("lets a later Always allow override an earlier denial", () => {
    let policy = applyDecision(EMPTY_APPROVAL_POLICY, "github_create_issue", "deny");
    policy = applyDecision(policy, "github_create_issue", "always");
    expect(policy.deny).not.toContain("github_create_issue");
    expect(checkApproval("github_create_issue", policy).required).toBe(false);
  });

  it("does not mutate the previous policy object", () => {
    const before = EMPTY_APPROVAL_POLICY;
    applyDecision(before, "github_create_issue", "always");
    expect(before.alwaysAllow).toEqual([]);
  });

  it("labels each risk level in both languages", () => {
    for (const risk of ["read", "write", "destructive"] as const) {
      const label = riskLabel(risk);
      expect(label.english.length).toBeGreaterThan(0);
      expect(label.urdu.length).toBeGreaterThan(0);
    }
  });
});
