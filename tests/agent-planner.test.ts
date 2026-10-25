import { describe, expect, it } from "vitest";

import {
  advancePlan,
  buildAgentPlan,
  completePlan,
  detectIntent,
  markStepByTool,
  planProgress,
} from "../lib/agent/planner";

const base = {
  request: "",
  attachmentKinds: [] as string[],
  githubConnected: false,
};

describe("agent planner intent detection", () => {
  it("routes live-information questions to research", () => {
    expect(detectIntent({ ...base, request: "What is the latest iPhone price today?" })).toBe(
      "research",
    );
  });

  it("routes code requests to coding", () => {
    expect(detectIntent({ ...base, request: "Fix the bug in my TypeScript function" })).toBe(
      "coding",
    );
  });

  it("routes GitHub work to github only when connected", () => {
    expect(
      detectIntent({ ...base, request: "Open a pull request for this repo", githubConnected: true }),
    ).toBe("github");
    expect(
      detectIntent({ ...base, request: "Open a pull request for this repo", githubConnected: false }),
    ).not.toBe("github");
  });

  it("routes image and audio attachments to media", () => {
    expect(detectIntent({ ...base, request: "what is this", attachmentKinds: ["image"] })).toBe(
      "media",
    );
    expect(detectIntent({ ...base, request: "transcribe", attachmentKinds: ["audio"] })).toBe(
      "media",
    );
  });

  it("understands Urdu keywords", () => {
    expect(detectIntent({ ...base, request: "آج کی تازہ خبر بتائیں" })).toBe("research");
    expect(detectIntent({ ...base, request: "یہ کوڈ ٹھیک کریں" })).toBe("coding");
  });
});

describe("agent planner plan construction", () => {
  it("always starts with planning and ends with verify then answer", () => {
    const plan = buildAgentPlan({ ...base, request: "Summarise this topic" });
    expect(plan.steps[0].kind).toBe("plan");
    expect(plan.steps.at(-2)?.kind).toBe("verify");
    expect(plan.steps.at(-1)?.kind).toBe("answer");
    expect(plan.steps[0].status).toBe("active");
  });

  it("produces a research plan with the expected tools in order", () => {
    const plan = buildAgentPlan({ ...base, request: "latest news about AI chips" });
    const tools = plan.steps.map((step) => step.tool).filter(Boolean);
    expect(tools).toEqual(["web_search", "read_public_web_page"]);
  });

  it("gives a coding plan workspace read and write steps", () => {
    const plan = buildAgentPlan({ ...base, request: "implement a python script" });
    const tools = plan.steps.map((step) => step.tool).filter(Boolean);
    expect(tools).toContain("ai_workspace_read_file");
    expect(tools).toContain("ai_workspace_write_file");
  });

  it("keeps the goal and a timestamp", () => {
    const now = new Date("2026-01-02T03:04:05.000Z");
    const plan = buildAgentPlan({ ...base, request: "  hello world  " }, now);
    expect(plan.goal).toBe("hello world");
    expect(plan.createdAt).toBe("2026-01-02T03:04:05.000Z");
  });
});

describe("agent planner progress transitions", () => {
  it("completes earlier steps when advancing", () => {
    const plan = buildAgentPlan({ ...base, request: "summarise this" });
    const advanced = advancePlan(plan, 2);
    expect(advanced.steps[0].status).toBe("done");
    expect(advanced.steps[1].status).toBe("done");
    expect(advanced.steps[2].status).toBe("active");
    expect(advanced.steps[3].status).toBe("pending");
  });

  it("never re-opens a failed step when advancing past it", () => {
    const plan = buildAgentPlan({ ...base, request: "summarise this" });
    const failed = plan.steps.map((step, index) =>
      index === 0 ? { ...step, status: "failed" as const } : step,
    );
    const advanced = advancePlan({ ...plan, steps: failed }, 2);
    expect(advanced.steps[0].status).toBe("failed");
  });

  it("maps a tool result onto the matching plan step", () => {
    const plan = buildAgentPlan({ ...base, request: "latest news" });
    const started = markStepByTool(plan, "web_search", "active");
    expect(started.steps.find((step) => step.tool === "web_search")?.status).toBe("active");
    const ended = markStepByTool(started, "web_search", "done");
    expect(ended.steps.find((step) => step.tool === "web_search")?.status).toBe("done");
  });

  it("ignores unknown tools", () => {
    const plan = buildAgentPlan({ ...base, request: "latest news" });
    expect(markStepByTool(plan, "no_such_tool", "done")).toEqual(plan);
  });

  it("completes pending and active steps but preserves failures", () => {
    const plan = buildAgentPlan({ ...base, request: "summarise this" });
    const withFailure = {
      ...plan,
      steps: plan.steps.map((step, index) =>
        index === 1 ? { ...step, status: "failed" as const } : step,
      ),
    };
    const done = completePlan(withFailure);
    expect(done.steps[1].status).toBe("failed");
    expect(done.steps.every((step, index) => index === 1 || step.status === "done")).toBe(true);
  });

  it("reports progress counts", () => {
    const plan = buildAgentPlan({ ...base, request: "summarise this" });
    expect(planProgress(plan)).toEqual({ done: 0, total: plan.steps.length });
    expect(planProgress(completePlan(plan))).toEqual({
      done: plan.steps.length,
      total: plan.steps.length,
    });
  });
});
