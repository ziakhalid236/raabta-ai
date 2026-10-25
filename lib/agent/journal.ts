/**
 * On-device task journal.
 *
 * The backend, database and storage for this agent all live inside the
 * Android app; there is no server. This module is that local store's task
 * record: for every completed task it keeps the goal, the plan, what each
 * tool actually did, and the verification result.
 *
 * It exists so the agent can review its own past work, so a user can see what
 * changed on their device, and so a follow-up request ("do the same for the
 * other file") can be grounded in real history instead of guesswork.
 *
 * Bounded on purpose: only the most recent entries are kept, and only
 * non-secret, already-sanitised text is stored.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AgentPlan } from "./planner";
import type { AgentToolEvent } from "./task";
import type { VerificationReport } from "./verifier";

export type JournalEntry = {
  id: string;
  at: string;
  goal: string;
  intent: string;
  status: "done" | "failed" | "stopped";
  stepsDone: number;
  stepsTotal: number;
  toolCalls: number;
  toolFailures: number;
  verification: {
    severity: VerificationReport["severity"];
    passed: boolean;
    codes: string[];
  };
  /** Tool names and outcome only, never arguments or secrets. */
  actions: Array<{ tool: string; status: AgentToolEvent["status"] }>;
};

const JOURNAL_KEY = "raabta.agent.journal.v1";
const MAX_ENTRIES = 50;
const MAX_GOAL_CHARS = 240;

export function toJournalEntry(args: {
  id: string;
  at: Date;
  goal: string;
  plan: AgentPlan;
  events: AgentToolEvent[];
  verification: VerificationReport;
  status: JournalEntry["status"];
}): JournalEntry {
  const { plan, events, verification } = args;
  return {
    id: args.id,
    at: args.at.toISOString(),
    goal: args.goal.replace(/\s+/g, " ").trim().slice(0, MAX_GOAL_CHARS),
    intent: plan.intent,
    status: args.status,
    stepsDone: plan.steps.filter((step) => step.status === "done").length,
    stepsTotal: plan.steps.length,
    toolCalls: verification.toolCalls,
    toolFailures: verification.toolFailures,
    verification: {
      severity: verification.severity,
      passed: verification.passed,
      codes: verification.findings.map((finding) => finding.code),
    },
    actions: events.map((event) => ({ tool: event.tool, status: event.status })),
  };
}

export async function loadJournal(): Promise<JournalEntry[]> {
  try {
    const stored = await AsyncStorage.getItem(JOURNAL_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isJournalEntry);
  } catch {
    return [];
  }
}

export async function appendJournalEntry(entry: JournalEntry): Promise<JournalEntry[]> {
  const existing = await loadJournal();
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);
  await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
  return next;
}

export async function clearJournal(): Promise<void> {
  await AsyncStorage.removeItem(JOURNAL_KEY);
}

/** Compact context for the model: what this agent has recently done. */
export function journalContext(entries: JournalEntry[], limit = 5): string {
  if (!entries.length) return "";
  return entries
    .slice(0, limit)
    .map((entry) => {
      const outcome = entry.verification.passed ? "verified" : "needs review";
      return `- ${entry.at.slice(0, 10)} [${entry.intent}] ${entry.goal} → ${entry.status}, ${entry.stepsDone}/${entry.stepsTotal} steps, ${entry.toolCalls} tool calls (${outcome})`;
    })
    .join("\n");
}

function isJournalEntry(value: unknown): value is JournalEntry {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<JournalEntry>;
  return (
    typeof item.id === "string" &&
    typeof item.at === "string" &&
    typeof item.goal === "string" &&
    typeof item.intent === "string" &&
    (item.status === "done" || item.status === "failed" || item.status === "stopped") &&
    typeof item.stepsDone === "number" &&
    typeof item.stepsTotal === "number" &&
    typeof item.toolCalls === "number" &&
    typeof item.toolFailures === "number" &&
    Array.isArray(item.actions)
  );
}
