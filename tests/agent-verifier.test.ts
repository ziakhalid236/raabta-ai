import { describe, expect, it } from "vitest";

import { buildAgentPlan } from "../lib/agent/planner";
import type { AgentToolEvent } from "../lib/agent/task";
import { buildRepairPrompt, verifyTask } from "../lib/agent/verifier";

function event(
  tool: string,
  status: AgentToolEvent["status"],
  detail = "",
): AgentToolEvent {
  return { id: `e-${tool}-${status}-${detail}`, tool, status, detail, at: new Date().toISOString() };
}

function completedPlan(goal = "Summarise the repository") {
  const plan = buildAgentPlan({ request: goal, attachmentKinds: [], githubConnected: false });
  for (const step of plan.steps) step.status = "done";
  return plan;
}

describe("agent verifier", () => {
  it("passes when every step ran and the answer makes no unsupported claim", () => {
    const report = verifyTask({
      plan: completedPlan(),
      events: [event("ai_workspace_read_file", "done", "read 12 lines")],
      answer: "Here is the summary you asked for.",
      hadSources: false,
    });
    expect(report.passed).toBe(true);
    expect(report.coverage).toBe(1);
    expect(report.findings.map((finding) => finding.code)).toContain("all-clear");
  });

  it("flags an incomplete plan", () => {
    const plan = completedPlan();
    plan.steps[0].status = "pending";
    const report = verifyTask({ plan, events: [], answer: "Done.", hadSources: false });
    expect(report.severity).toBe("warning");
    expect(report.findings.map((finding) => finding.code)).toContain("incomplete-plan");
    expect(report.coverage).toBeLessThan(1);
  });

  it("catches a commit claim that no tool result supports", () => {
    const report = verifyTask({
      plan: completedPlan(),
      events: [event("github_read_file", "done", "file body")],
      answer: "I committed the change to main and pushed it.",
      hadSources: false,
    });
    expect(report.passed).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain("unverified-write-claim");
  });

  it("accepts a commit claim when the commit tool actually succeeded", () => {
    const report = verifyTask({
      plan: completedPlan(),
      events: [event("github_update_file", "done", "commit 1a2b3c4")],
      answer: "I committed the change to main.",
      hadSources: false,
    });
    expect(report.passed).toBe(true);
    expect(report.findings.map((finding) => finding.code)).not.toContain("unverified-write-claim");
  });

  it("flags links in the answer when no source was retrieved", () => {
    const report = verifyTask({
      plan: completedPlan(),
      events: [event("ai_workspace_read_file", "done", "notes")],
      answer: "See https://example.com/report for the numbers.",
      hadSources: false,
    });
    expect(report.findings.map((finding) => finding.code)).toContain("uncited-sources");
  });

  it("does not flag links when a search really ran", () => {
    const report = verifyTask({
      plan: completedPlan(),
      events: [event("web_search", "done", "3 results")],
      answer: "See https://example.com/report for the numbers.",
      hadSources: true,
    });
    expect(report.findings.map((finding) => finding.code)).not.toContain("uncited-sources");
  });

  it("reports blocked approvals as partial rather than failed", () => {
    const report = verifyTask({
      plan: completedPlan(),
      events: [event("github_create_issue", "blocked", "denied by user")],
      answer: "I could not create the issue because you declined.",
      hadSources: false,
    });
    expect(report.toolBlocked).toBe(1);
    expect(report.findings.map((finding) => finding.code)).toContain("blocked-steps");
  });

  it("counts tool failures and surfaces them", () => {
    const report = verifyTask({
      plan: completedPlan(),
      events: [event("web_search", "failed", "network error")],
      answer: "Search was unavailable.",
      hadSources: false,
    });
    expect(report.toolFailures).toBe(1);
    expect(report.findings.map((finding) => finding.code)).toContain("tool-failures");
  });

  it("builds a repair prompt only when there is a real problem", () => {
    const clean = verifyTask({
      plan: completedPlan(),
      events: [event("ai_workspace_read_file", "done", "body")],
      answer: "Summary follows.",
      hadSources: false,
    });
    expect(buildRepairPrompt(clean)).toBeNull();

    const broken = verifyTask({
      plan: completedPlan(),
      events: [],
      answer: "I pushed the commit and opened a pull request.",
      hadSources: false,
    });
    const repair = buildRepairPrompt(broken);
    expect(repair).toContain("failed a local verification check");
    expect(repair).toContain("Do not repeat the unsupported claim");
  });
});
