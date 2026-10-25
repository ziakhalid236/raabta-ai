/**
 * Approval policy for the agent's consequential tools.
 *
 * The app is a mobile agent running entirely on the device, so a single
 * GitHub connection is the common case. Asking again for every file commit
 * makes the agent feel broken, so the user's decision is remembered per
 * tool and honoured for the rest of the session.
 *
 * Nothing here weakens the boundary: an unknown tool is always treated as
 * needing approval, and a stored "deny" is never silently upgraded.
 */

export type ApprovalRisk = "read" | "write" | "destructive";

export type ApprovalDecision = "once" | "always" | "deny";

export type ApprovalPolicy = {
  /** Tools the user approved for this session; the agent stops asking. */
  alwaysAllow: string[];
  /** Tools the user declined; the agent must not attempt them again. */
  deny: string[];
};

export const EMPTY_APPROVAL_POLICY: ApprovalPolicy = { alwaysAllow: [], deny: [] };

/**
 * Read-only tools never prompt. Write tools prompt once and can be remembered.
 * Destructive tools prompt every time and cannot be remembered, because a
 * deletion or a workflow dispatch is not something to blanket-approve.
 */
const TOOL_RISK: Record<string, ApprovalRisk> = {
  web_search: "read",
  read_public_web_page: "read",
  ai_workspace_list_files: "read",
  ai_workspace_find_text: "read",
  ai_workspace_read_file: "read",
  ai_workspace_file_info: "read",
  github_list_repositories: "read",
  github_list_files: "read",
  github_read_file: "read",
  github_list_workflow_runs: "read",
  github_get_workflow_run: "read",
  github_list_commits: "read",

  ai_workspace_write_file: "write",
  ai_workspace_create_directory: "write",
  ai_workspace_move_file: "write",
  github_update_file: "write",
  github_create_issue: "write",
  github_create_branch: "write",
  github_create_repository: "write",

  ai_workspace_delete_file: "destructive",
  github_create_pull_request: "destructive",
  github_dispatch_workflow: "destructive",
};

export function approvalRiskOf(tool: string): ApprovalRisk {
  return TOOL_RISK[tool] ?? "destructive";
}

export function isRememberable(tool: string): boolean {
  return approvalRiskOf(tool) === "write";
}

export type ApprovalCheck = {
  required: boolean;
  risk: ApprovalRisk;
  /** True when the user already approved this tool for the session. */
  remembered: boolean;
  /** True when the user previously declined this tool. */
  denied: boolean;
  rememberable: boolean;
};

export function checkApproval(tool: string, policy: ApprovalPolicy): ApprovalCheck {
  const risk = approvalRiskOf(tool);
  const rememberable = risk === "write";
  const denied = policy.deny.includes(tool);
  const remembered = rememberable && policy.alwaysAllow.includes(tool);
  return {
    required: risk !== "read" && !remembered && !denied,
    risk,
    remembered,
    denied,
    rememberable,
  };
}

/** Apply a decision to the policy, returning a new immutable policy. */
export function applyDecision(
  policy: ApprovalPolicy,
  tool: string,
  decision: ApprovalDecision,
): ApprovalPolicy {
  const alwaysAllow = policy.alwaysAllow.filter((name) => name !== tool);
  const deny = policy.deny.filter((name) => name !== tool);
  if (decision === "always" && isRememberable(tool)) alwaysAllow.push(tool);
  if (decision === "deny") deny.push(tool);
  return { alwaysAllow, deny };
}

/** One-line bilingual-ish risk label for the approval card. */
export function riskLabel(risk: ApprovalRisk): { english: string; urdu: string } {
  if (risk === "read") return { english: "Read only", urdu: "صرف پڑھنا" };
  if (risk === "write") return { english: "Changes data", urdu: "ڈیٹا تبدیل ہوگا" };
  return { english: "Cannot be undone", urdu: "واپس نہیں ہو سکتا" };
}
