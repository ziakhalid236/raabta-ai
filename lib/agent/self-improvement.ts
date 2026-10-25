import AsyncStorage from "@react-native-async-storage/async-storage";

export type AgentIssueKind = "provider" | "capability" | "tool" | "verification" | "storage" | "unknown";
export type AgentIssue = {
  id: string;
  at: string;
  kind: AgentIssueKind;
  message: string;
  context: string;
  resolved: boolean;
};

const ISSUES_KEY = "raabta.agent.issues.v1";
const MAX_ISSUES = 40;

export function classifyAgentIssue(message: string): AgentIssueKind {
  const value = message.toLowerCase();
  if (/model|provider|api key|endpoint|http 4\d\d|http 5\d\d|quota|rate limit/.test(value)) return "provider";
  if (/image|vision|audio|transcri|capabil/.test(value)) return "capability";
  if (/tool|github|workspace|research/.test(value)) return "tool";
  if (/verif|unsupported|claim/.test(value)) return "verification";
  if (/storage|file|permission/.test(value)) return "storage";
  return "unknown";
}

export function makeAgentIssue(message: string, context = ""): AgentIssue {
  return {
    id: `issue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    kind: classifyAgentIssue(message),
    message: message.slice(0, 600),
    context: context.slice(0, 240),
    resolved: false,
  };
}

export async function recordAgentIssue(issue: AgentIssue): Promise<AgentIssue[]> {
  const existing = await loadAgentIssues();
  const next = [issue, ...existing].slice(0, MAX_ISSUES);
  await AsyncStorage.setItem(ISSUES_KEY, JSON.stringify(next));
  return next;
}

export async function loadAgentIssues(): Promise<AgentIssue[]> {
  try {
    const raw = await AsyncStorage.getItem(ISSUES_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isAgentIssue).slice(0, MAX_ISSUES) : [];
  } catch {
    return [];
  }
}

export function buildImprovementGuidance(issues: AgentIssue[]): string {
  const unresolved = issues.filter((issue) => !issue.resolved).slice(0, 8);
  if (!unresolved.length) return "No unresolved local agent issues are recorded.";
  const grouped = new Map<AgentIssueKind, number>();
  for (const issue of unresolved) grouped.set(issue.kind, (grouped.get(issue.kind) ?? 0) + 1);
  const summary = [...grouped.entries()].map(([kind, count]) => `${kind}: ${count}`).join(", ");
  return `Local improvement report: ${unresolved.length} unresolved issue(s) (${summary}). Diagnose the current request using real tool/provider results, explain the limitation, and suggest a safe repair. Do not claim that the app source code, provider account, or device was automatically modified.`;
}

export function buildIssueRepairSuggestion(issue: AgentIssue): string {
  switch (issue.kind) {
    case "provider":
      return "Refresh the provider catalog, verify the HTTPS Base URL and key, then retry with an advertised model. If the provider returns a capability error, explain it and offer alternatives from the catalog.";
    case "capability":
      return "Check the discovered input/output modalities before dispatch. Do not send an image or audio file to a model that does not advertise the required capability.";
    case "tool":
      return "Retry only the failed tool with the same user intent, or explain that the required external action is unavailable or needs approval.";
    case "verification":
      return "Remove unsupported claims or perform the missing approved tool action and verify its real result before answering.";
    default:
      return "Inspect the real error, preserve user data, and propose a reversible repair instead of silently changing the app.";
  }
}

function isAgentIssue(value: unknown): value is AgentIssue {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AgentIssue>;
  return typeof item.id === "string" && typeof item.at === "string" && typeof item.message === "string" && typeof item.context === "string" && typeof item.resolved === "boolean" && ["provider", "capability", "tool", "verification", "storage", "unknown"].includes(item.kind as string);
}
