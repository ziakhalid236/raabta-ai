import { describe, expect, it, vi } from "vitest";

import { buildAgentPlan } from "../lib/agent/planner";
import { AgentTaskController, type AgentTask } from "../lib/agent/task";

const plan = () =>
  buildAgentPlan({
    request: "latest news about chips",
    attachmentKinds: [],
    githubConnected: false,
  });

function controller() {
  const seen: AgentTask[] = [];
  const instance = new AgentTaskController(
    plan(),
    (task) => seen.push(task),
    () => new Date("2026-01-01T00:00:00.000Z"),
  );
  return { instance, seen };
}

function githubController() {
  const seen: AgentTask[] = [];
  const instance = new AgentTaskController(
    buildAgentPlan({
      request: "open a pull request for this repo",
      attachmentKinds: [],
      githubConnected: true,
    }),
    (task) => seen.push(task),
    () => new Date("2026-01-01T00:00:00.000Z"),
  );
  return { instance, seen };
}

describe("agent task controller", () => {
  it("starts in the running state with the initial plan", () => {
    const { instance } = controller();
    expect(instance.snapshot.status).toBe("running");
    expect(instance.snapshot.plan.steps.length).toBeGreaterThan(0);
    expect(instance.progress.done).toBe(0);
  });

  it("records a tool event and activates the matching plan step", () => {
    const { instance } = controller();
    const id = instance.recordToolStart("web_search", "Searching the public web");
    expect(instance.snapshot.events).toHaveLength(1);
    const searchStep = instance.snapshot.plan.steps.find(
      (step) => step.tool === "web_search",
    );
    expect(searchStep?.status).toBe("active");
    instance.recordToolEnd(id, "done", "Searching the public web — complete");
    expect(instance.snapshot.events[0].status).toBe("done");
    expect(
      instance.snapshot.plan.steps.find((step) => step.tool === "web_search")?.status,
    ).toBe("done");
  });

  it("marks a blocked (denied) approval as a skipped step, not a failure", () => {
    const { instance } = githubController();
    const id = instance.recordToolStart("github_update_file", "Preparing a commit");
    instance.recordToolEnd(id, "blocked", "Cancelled by you");
    expect(instance.snapshot.events[0].status).toBe("blocked");
    expect(
      instance.snapshot.plan.steps.find((step) => step.tool === "github_update_file")
        ?.status,
    ).toBe("skipped");
  });

  it("notifies the listener on every change", () => {
    const { instance, seen } = controller();
    const before = seen.length;
    instance.recordToolStart("web_search", "searching");
    instance.setStatus("verifying");
    instance.finish("done");
    expect(seen.length).toBeGreaterThan(before + 2);
  });

  it("completes every step when finishing successfully", () => {
    const { instance } = controller();
    const finished = instance.finish("done");
    expect(finished.status).toBe("done");
    expect(finished.plan.steps.every((step) => step.status === "done")).toBe(true);
    expect(finished.finishedAt).toBeTruthy();
  });

  it("does not complete pending steps when the task fails", () => {
    const { instance } = controller();
    const finished = instance.finish("failed");
    expect(finished.status).toBe("failed");
    expect(finished.plan.steps.some((step) => step.status !== "done")).toBe(true);
  });

  it("emits a defensive copy so external mutation cannot corrupt state", () => {
    const { instance } = controller();
    const snapshot = instance.snapshot;
    snapshot.plan.steps[0].status = "failed";
    expect(instance.snapshot.plan.steps[0].status).not.toBe("failed");
  });
});
