import {
  advancePlan,
  completePlan,
  markStepByTool,
  planProgress,
  type AgentPlan,
  type AgentStepStatus,
} from "./planner";

export type AgentTaskStatus = "planning" | "running" | "verifying" | "done" | "failed" | "stopped";

export type AgentToolEvent = {
  id: string;
  tool: string;
  status: "running" | "done" | "failed" | "blocked";
  detail: string;
  at: string;
};

export type AgentTask = {
  id: string;
  status: AgentTaskStatus;
  plan: AgentPlan;
  events: AgentToolEvent[];
  startedAt: string;
  finishedAt?: string;
};

export type AgentTaskListener = (task: AgentTask) => void;

/** Creates a running task around a plan and notifies listeners on every change. */
export class AgentTaskController {
  private task: AgentTask;
  private readonly listener: AgentTaskListener;
  private readonly now: () => Date;

  constructor(
    plan: AgentPlan,
    listener: AgentTaskListener,
    now: () => Date = () => new Date(),
  ) {
    this.listener = listener;
    this.now = now;
    this.task = {
      id: `task-${now().getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "running",
      plan,
      events: [],
      startedAt: now().toISOString(),
    };
    this.emit();
  }

  get snapshot(): AgentTask {
    return {
      ...this.task,
      plan: { ...this.task.plan, steps: this.task.plan.steps.map((step) => ({ ...step })) },
      events: this.task.events.map((event) => ({ ...event })),
    };
  }

  recordToolStart(tool: string, detail: string): string {
    const id = `event-${this.task.events.length + 1}`;
    this.task.events.push({
      id,
      tool,
      status: "running",
      detail,
      at: this.now().toISOString(),
    });
    this.task.plan = markStepByTool(this.task.plan, tool, "active");
    this.emit();
    return id;
  }

  recordToolEnd(
    id: string,
    status: Extract<AgentToolEvent["status"], "done" | "failed" | "blocked">,
    detail: string,
  ): void {
    const event = this.task.events.find((item) => item.id === id);
    if (!event) return;
    event.status = status;
    event.detail = detail;
    event.at = this.now().toISOString();
    const stepStatus: AgentStepStatus = status === "done" ? "done" : status === "blocked" ? "skipped" : "failed";
    this.task.plan = markStepByTool(this.task.plan, event.tool, stepStatus);
    this.emit();
  }

  advanceTo(index: number): void {
    this.task.plan = advancePlan(this.task.plan, index);
    this.emit();
  }

  setStatus(status: AgentTaskStatus): void {
    this.task.status = status;
    this.emit();
  }

  /** Finish the task, completing the plan unless it failed or was stopped. */
  finish(status: Exclude<AgentTaskStatus, "running" | "planning">): AgentTask {
    this.task.status = status;
    if (status === "done") this.task.plan = completePlan(this.task.plan);
    this.task.finishedAt = this.now().toISOString();
    this.emit();
    return this.task;
  }

  get progress(): { done: number; total: number } {
    return planProgress(this.task.plan);
  }

  private emit(): void {
    this.listener({ ...this.task, plan: { ...this.task.plan, steps: [...this.task.plan.steps] } });
  }
}
