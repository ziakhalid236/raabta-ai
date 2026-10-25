import { describe, expect, it } from "vitest";

import { buildAgentPlan } from "../lib/agent/planner";
import type { AgentToolEvent } from "../lib/agent/task";
import { verifyTask } from "../lib/agent/verifier";
import { journalContext, toJournalEntry } from "../lib/agent/journal";

function event(tool: string, status: AgentToolEvent["status"]): AgentToolEvent {
  return { id: `e-${tool}`, tool, status, detail: "ok", at: new Date().toISOString() };
}

describe("task journal", () => {
  it("records the goal, plan progress and verification outcome", () => {
    const plan = buildAgentPlan({ request: "Read the notes file", attachmentKinds: [], githubConnected: false });
    plan.steps.forEach((step) => (step.status = "done"));
    const events = [event("ai_workspace_read_file", "done")];
    const verification = verifyTask({ plan, events, answer: "Here are the notes.", hadSources: false });

    const entry = toJournalEntry({
      id: "j1",
      at: new Date("2026-01-02T03:04:05.000Z"),
      goal: "Read the notes file",
      plan,
      events,
      verification,
      status: "done",
    });

    expect(entry.at).toBe("2026-01-02T03:04:05.000Z");
    expect(entry.intent).toBe(plan.intent);
    expect(entry.stepsTotal).toBe(plan.steps.length);
    expect(entry.stepsDone).toBe(plan.steps.length);
    expect(entry.toolCalls).toBe(1);
    expect(entry.verification.passed).toBe(true);
    expect(entry.actions).toEqual([{ tool: "ai_workspace_read_file", status: "done" }]);
  });

  it("stores only tool names and statuses, never tool arguments", () => {
    const plan = buildAgentPlan({ request: "Commit a file", attachmentKinds: [], githubConnected: true });
    const events = [event("github_update_file", "done")];
    const verification = verifyTask({ plan, events, answer: "Committed.", hadSources: false });
    const entry = toJournalEntry({
      id: "j2",
      at: new Date(),
      goal: "Commit a file",
      plan,
      events,
      verification,
      status: "done",
    });
    // Actions carry no arguments, so a token or file body can never be journalled.
    expect(Object.keys(entry.actions[0])).toEqual(["tool", "status"]);
    expect(Object.keys(entry)).not.toContain("args");
  });

  it("truncates a very long goal so the local store stays bounded", () => {
    const plan = buildAgentPlan({ request: "x", attachmentKinds: [], githubConnected: false });
    const verification = verifyTask({ plan, events: [], answer: "", hadSources: false });
    const entry = toJournalEntry({
      id: "j3",
      at: new Date(),
      goal: "y".repeat(500),
      plan,
      events: [],
      verification,
      status: "done",
    });
    expect(entry.goal.length).toBe(240);
  });

  it("returns an empty context string when there is no history", () => {
    expect(journalContext([])).toBe("");
  });

  it("summarises recent history for the model", () => {
    const plan = buildAgentPlan({ request: "Search the web", attachmentKinds: [], githubConnected: false });
    const verification = verifyTask({ plan, events: [], answer: "Here.", hadSources: true });
    const entry = toJournalEntry({
      id: "j4",
      at: new Date("2026-02-03T00:00:00.000Z"),
      goal: "Search the web for news",
      plan,
      events: [],
      verification,
      status: "done",
    });
    const context = journalContext([entry]);
    expect(context).toContain("2026-02-03");
    expect(context).toContain("Search the web for news");
    expect(context).toContain("verified");
  });
});
