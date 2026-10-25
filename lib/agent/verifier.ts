/**
 * Local self-verification for a finished agent task.
 *
 * A mobile agent has no shell, no browser and no Chromium, so it cannot run a
 * test suite to check its own work. What it *can* do is reason over the
 * evidence it collected on the device: which plan steps actually ran, which
 * tools returned data, and whether the final answer claims things that no tool
 * result supports.
 *
 * This module is deliberately pure and synchronous. It never invents a result;
 * it only reports what the recorded evidence does and does not support.
 */

import type { AgentPlan } from "./planner";
import type { AgentToolEvent } from "./task";

export type VerificationSeverity = "ok" | "info" | "warning" | "problem";

export type VerificationFinding = {
  id: string;
  severity: VerificationSeverity;
  /** Short machine-stable code, useful for tests and UI grouping. */
  code:
    | "no-steps"
    | "incomplete-plan"
    | "tool-failures"
    | "blocked-steps"
    | "empty-results"
    | "unverified-write-claim"
    | "unverified-read-claim"
    | "uncited-sources"
    | "verification-skipped"
    | "all-clear";
  english: string;
  urdu: string;
};

export type VerificationReport = {
  severity: VerificationSeverity;
  passed: boolean;
  findings: VerificationFinding[];
  /** Fraction of plan steps that reached "done" (0..1). */
  coverage: number;
  toolCalls: number;
  toolFailures: number;
  toolBlocked: number;
};

export type VerificationInput = {
  plan: AgentPlan;
  events: AgentToolEvent[];
  /** The final answer text the agent produced. */
  answer: string;
  /** True when at least one public source was returned by a search/read tool. */
  hadSources: boolean;
};

/**
 * Phrases that assert a real-world change happened. If the answer uses one of
 * these but no matching tool succeeded, the claim is unverified.
 */
const WRITE_CLAIMS: Array<{ pattern: RegExp; tool: string; english: string; urdu: string }> = [
  {
    pattern: /\b(?:committed|pushed|commit\s+[0-9a-f]{7,})/i,
    tool: "github_update_file",
    english: "The answer mentions a commit, but no file commit tool succeeded.",
    urdu: "جواب میں commit کا ذکر ہے، مگر commit tool کامیاب نہیں ہوا۔",
  },
  {
    pattern: /\b(?:pull request|PR\s+#?\d+)\b/i,
    tool: "github_create_pull_request",
    english: "The answer mentions a pull request, but none was created.",
    urdu: "جواب میں pull request کا ذکر ہے، مگر کوئی بنائی نہیں گئی۔",
  },
  {
    pattern: /\b(?:created?|opened?)\s+(?:an?\s+)?issue\b/i,
    tool: "github_create_issue",
    english: "The answer mentions an issue, but no issue was created.",
    urdu: "جواب میں issue کا ذکر ہے، مگر کوئی issue نہیں بنایا گیا۔",
  },
  {
    pattern: /\b(?:saved|wrote|created)\b[\s\S]{0,24}\bfile\b/i,
    tool: "ai_workspace_write_file",
    english: "The answer mentions a saved file, but no workspace write succeeded.",
    urdu: "جواب میں محفوظ فائل کا ذکر ہے، مگر workspace write کامیاب نہیں ہوا۔",
  },
  {
    pattern: /\b(?:ran|triggered|dispatched)\b[\s\S]{0,24}\bworkflow\b/i,
    tool: "github_dispatch_workflow",
    english: "The answer mentions a workflow run, but none was dispatched.",
    urdu: "جواب میں workflow کا ذکر ہے، مگر کوئی dispatch نہیں ہوا۔",
  },
  {
    pattern: /\b(?:created?)\b[\s\S]{0,24}\bbranch\b/i,
    tool: "github_create_branch",
    english: "The answer mentions a branch, but none was created.",
    urdu: "جواب میں branch کا ذکر ہے، مگر کوئی نہیں بنی۔",
  },
];

/** Phrases that assert a page/site was read. */
const READ_CLAIM_TOOLS = [
  "web_search",
  "read_public_web_page",
  "github_read_file",
  "github_list_files",
  "ai_workspace_read_file",
  "ai_workspace_list_files",
];

/** A citation-looking URL in the answer. */
const URL_PATTERN = /https:\/\/[^\s)\]}>"']+/gi;

function succeeded(events: AgentToolEvent[], tool: string): boolean {
  return events.some((event) => event.tool === tool && event.status === "done");
}

function attempted(events: AgentToolEvent[], tool: string): boolean {
  return events.some((event) => event.tool === tool);
}

export function verifyTask(input: VerificationInput): VerificationReport {
  const { plan, events, answer } = input;
  const findings: VerificationFinding[] = [];
  const done = plan.steps.filter((step) => step.status === "done").length;
  const total = plan.steps.length;
  const coverage = total ? done / total : 0;
  const toolFailures = events.filter((event) => event.status === "failed").length;
  const toolBlocked = events.filter((event) => event.status === "blocked").length;
  const toolCalls = events.length;

  const add = (
    severity: VerificationSeverity,
    code: VerificationFinding["code"],
    english: string,
    urdu: string,
  ) => findings.push({ id: `finding-${findings.length + 1}`, severity, code, english, urdu });

  if (!total) {
    add("warning", "no-steps", "No plan was recorded for this task.", "اس کام کا کوئی منصوبہ محفوظ نہیں ہوا۔");
  } else if (coverage < 1) {
    const missing = total - done;
    add(
      "warning",
      "incomplete-plan",
      `${missing} of ${total} plan steps did not finish.`,
      `${total} میں سے ${missing} مرحلے مکمل نہیں ہوئے۔`,
    );
  }

  if (toolFailures) {
    add(
      "warning",
      "tool-failures",
      `${toolFailures} tool ${toolFailures === 1 ? "call" : "calls"} failed during this task.`,
      `اس کام میں ${toolFailures} tool ناکام ہوا۔`,
    );
  }

  if (toolBlocked) {
    add(
      "info",
      "blocked-steps",
      `${toolBlocked} action${toolBlocked === 1 ? " was" : "s were"} not approved, so the result may be partial.`,
      `${toolBlocked} کام کی اجازت نہیں دی گئی، اس لیے نتیجہ ادھورا ہو سکتا ہے۔`,
    );
  }

  const emptyResults = events.filter(
    (event) => event.status === "done" && !event.detail.trim(),
  ).length;
  if (emptyResults) {
    add(
      "info",
      "empty-results",
      `${emptyResults} tool call${emptyResults === 1 ? "" : "s"} returned no usable data.`,
      `${emptyResults} tool سے کوئی قابلِ استعمال ڈیٹا نہیں ملا۔`,
    );
  }

  for (const claim of WRITE_CLAIMS) {
    if (claim.pattern.test(answer) && !succeeded(events, claim.tool)) {
      add("problem", "unverified-write-claim", claim.english, claim.urdu);
    }
  }

  const mentionsRead = /\b(?:according to|source|read|fetched|found at|see)\b/i.test(answer);
  if (mentionsRead && !READ_CLAIM_TOOLS.some((tool) => succeeded(events, tool))) {
    add(
      "problem",
      "unverified-read-claim",
      "The answer cites information, but no read or search tool succeeded.",
      "جواب میں معلومات کا حوالہ ہے، مگر کوئی read یا search tool کامیاب نہیں ہوا۔",
    );
  }

  const cited = answer.match(URL_PATTERN) ?? [];
  if (cited.length && !input.hadSources) {
    add(
      "warning",
      "uncited-sources",
      "The answer contains links, but no search result was retrieved in this task.",
      "جواب میں لنک ہیں، مگر اس کام میں کوئی search نتیجہ حاصل نہیں ہوا۔",
    );
  }

  const verifyStep = plan.steps.find((step) => step.kind === "verify");
  if (verifyStep && verifyStep.status === "pending") {
    add(
      "info",
      "verification-skipped",
      "The plan's verification step did not run.",
      "منصوبے کا جانچ کا مرحلہ نہیں چلا۔",
    );
  }

  const hasProblem = findings.some((finding) => finding.severity === "problem");
  const hasWarning = findings.some((finding) => finding.severity === "warning");
  if (!findings.length) {
    add(
      "ok",
      "all-clear",
      `All ${total} plan steps completed and every claim is backed by a tool result.`,
      `تمام ${total} مراحل مکمل ہوئے اور ہر بات کسی tool کے نتیجے سے ثابت ہے۔`,
    );
  }

  const severity: VerificationSeverity = hasProblem
    ? "problem"
    : hasWarning
      ? "warning"
      : findings.some((finding) => finding.severity === "info")
        ? "info"
        : "ok";

  return {
    severity,
    passed: !hasProblem,
    findings,
    coverage,
    toolCalls,
    toolFailures,
    toolBlocked,
  };
}

/** Build a short corrective instruction from problems, fed back to the model. */
export function buildRepairPrompt(report: VerificationReport): string | null {
  const problems = report.findings.filter((finding) => finding.severity === "problem");
  if (!problems.length) return null;
  return [
    "Your previous answer failed a local verification check. Fix it before answering again:",
    ...problems.map((finding) => `- ${finding.english}`),
    "Either perform the missing action with a tool now, or clearly state that it did not happen. Do not repeat the unsupported claim.",
  ].join("\n");
}
