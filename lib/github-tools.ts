export type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  description: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  updatedAt: string;
};
export type GitHubRepositoryFile = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  htmlUrl: string;
  downloadUrl: string;
};
export type GitHubWriteResult = { url: string; message: string; sha?: string };
export type GitHubWorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  branch: string;
  url: string;
  createdAt: string;
};
const API = "https://api.github.com";
const API_VERSION = "2026-03-10";
export class GitHubToolError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GitHubToolError";
  }
}
export async function listGitHubRepositories(
  token: string,
  signal?: AbortSignal,
): Promise<GitHubRepository[]> {
  const results: GitHubRepository[] = [];
  let page = 1;
  while (page <= 10) {
    const response = await githubFetch(
      `/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100&page=${page}`,
      token,
      signal,
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!Array.isArray(payload))
      throw new GitHubToolError(
        "GitHub returned an unreadable repository list.",
        response.status,
      );
    results.push(...payload.flatMap(normalizeRepository));
    if (payload.length < 100) break;
    page += 1;
  }
  return results;
}
export async function listGitHubRepositoryFiles(
  token: string,
  repository: string,
  path = "",
  branch?: string,
  signal?: AbortSignal,
): Promise<GitHubRepositoryFile[]> {
  const suffix = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  const response = await githubFetch(
    `/repos/${encodeRepository(repository)}/contents/${path.replace(/^\//, "")}${suffix}`,
    token,
    signal,
  );
  const payload: unknown = await response.json().catch(() => null);
  const entries = Array.isArray(payload) ? payload : [payload];
  return entries.flatMap(normalizeFile);
}
export async function readGitHubFile(
  token: string,
  repository: string,
  path: string,
  branch?: string,
  signal?: AbortSignal,
): Promise<string> {
  const suffix = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  const response = await githubFetch(
    `/repos/${encodeRepository(repository)}/contents/${path.replace(/^\//, "")}${suffix}`,
    token,
    signal,
    "application/vnd.github.raw+json",
  );
  const text = await response.text();
  if (text.length > 120_000)
    throw new GitHubToolError(
      "That GitHub file is larger than the safe reading limit.",
    );
  return text;
}
export async function updateGitHubFile(args: {
  token: string;
  repository: string;
  path: string;
  content: string;
  message: string;
  branch?: string;
  signal?: AbortSignal;
}): Promise<GitHubWriteResult> {
  let currentSha: string | undefined;
  try {
    const currentResponse = await githubFetch(
      `/repos/${encodeRepository(args.repository)}/contents/${args.path.replace(/^\//, "")}${args.branch ? `?ref=${encodeURIComponent(args.branch)}` : ""}`,
      args.token,
      args.signal,
    );
    const current: any = await currentResponse.json();
    currentSha = typeof current?.sha === "string" ? current.sha : undefined;
  } catch (error) {
    if (!(error instanceof GitHubToolError) || error.status !== 404) throw error;
  }
  const response = await fetch(
    `${API}/repos/${encodeRepository(args.repository)}/contents/${args.path.replace(/^\//, "")}`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${args.token}`,
        "X-GitHub-Api-Version": API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: args.message,
        content: toBase64Utf8(args.content),
        ...(currentSha ? { sha: currentSha } : {}),
        ...(args.branch ? { branch: args.branch } : {}),
      }),
      signal: args.signal,
    },
  );
  const payload: any = await response.json().catch(() => null);
  if (!response.ok)
    throw new GitHubToolError(
      `GitHub could not update the file (HTTP ${response.status}).`,
      response.status,
    );
  return {
    url:
      typeof payload?.content?.html_url === "string"
        ? payload.content.html_url
        : `https://github.com/${args.repository}/blob/${args.branch ?? "main"}/${args.path}`,
        message: currentSha
          ? "File updated and committed by the connected GitHub tool."
          : "New file created and committed by the connected GitHub tool.",
    sha: payload?.content?.sha,
  };
}
export async function createGitHubIssue(args: {
  token: string;
  repository: string;
  title: string;
  body: string;
  signal?: AbortSignal;
}): Promise<GitHubWriteResult> {
  const response = await githubWrite(
    `/repos/${encodeRepository(args.repository)}/issues`,
    args.token,
    { title: args.title, body: args.body },
    args.signal,
  );
  const payload: any = await response.json().catch(() => null);
  return {
    url: typeof payload?.html_url === "string" ? payload.html_url : "",
    message: "Issue created by the connected GitHub tool.",
  };
}
export async function createGitHubPullRequest(args: {
  token: string;
  repository: string;
  title: string;
  body: string;
  head: string;
  base: string;
  signal?: AbortSignal;
}): Promise<GitHubWriteResult> {
  const response = await githubWrite(
    `/repos/${encodeRepository(args.repository)}/pulls`,
    args.token,
    { title: args.title, body: args.body, head: args.head, base: args.base },
    args.signal,
  );
  const payload: any = await response.json().catch(() => null);
  return {
    url: typeof payload?.html_url === "string" ? payload.html_url : "",
    message: "Pull request created. Merge still requires approval.",
  };
}

export async function createGitHubBranch(args: {
  token: string;
  repository: string;
  branch: string;
  fromBranch?: string;
  signal?: AbortSignal;
}): Promise<GitHubWriteResult> {
  const source = args.fromBranch ?? "main";
  const refResponse = await githubFetch(
    `/repos/${encodeRepository(args.repository)}/git/ref/heads/${encodeURIComponent(source)}`,
    args.token,
    args.signal,
  );
  const ref: any = await refResponse.json().catch(() => null);
  const sha = typeof ref?.object?.sha === "string" ? ref.object.sha : "";
  if (!sha) throw new GitHubToolError("GitHub returned no source commit for that branch.");
  const response = await githubWrite(
    `/repos/${encodeRepository(args.repository)}/git/refs`,
    args.token,
    { ref: `refs/heads/${args.branch}`, sha },
    args.signal,
  );
  const payload: any = await response.json().catch(() => null);
  return {
    url: `https://github.com/${args.repository}/tree/${encodeURIComponent(args.branch)}`,
    message: "Branch created by the connected GitHub tool.",
    sha: payload?.object?.sha,
  };
}

export async function dispatchGitHubWorkflow(args: {
  token: string;
  repository: string;
  workflow: string;
  ref: string;
  inputs?: Record<string, string>;
  signal?: AbortSignal;
}): Promise<GitHubWriteResult> {
  await githubWrite(
    `/repos/${encodeRepository(args.repository)}/actions/workflows/${encodeURIComponent(args.workflow)}/dispatches`,
    args.token,
    { ref: args.ref, inputs: args.inputs ?? {} },
    args.signal,
  );
  return {
    url: `https://github.com/${args.repository}/actions/workflows/${encodeURIComponent(args.workflow)}`,
    message: "GitHub Actions workflow dispatched. Use workflow-run inspection to monitor it.",
  };
}

export async function listGitHubWorkflowRuns(
  token: string,
  repository: string,
  workflow?: string,
  signal?: AbortSignal,
): Promise<GitHubWorkflowRun[]> {
  const suffix = workflow
    ? `/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=20`
    : "/actions/runs?per_page=20";
  const response = await githubFetch(
    `/repos/${encodeRepository(repository)}${suffix}`,
    token,
    signal,
  );
  const payload: any = await response.json().catch(() => null);
  const runs = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
  return runs.flatMap((run: any) => {
    if (typeof run?.id !== "number") return [];
    return [{
      id: run.id,
      name: typeof run.name === "string" ? run.name : "GitHub Actions",
      status: typeof run.status === "string" ? run.status : "unknown",
      conclusion: typeof run.conclusion === "string" ? run.conclusion : null,
      branch: typeof run.head_branch === "string" ? run.head_branch : "",
      url: typeof run.html_url === "string" ? run.html_url : "",
      createdAt: typeof run.created_at === "string" ? run.created_at : "",
    } satisfies GitHubWorkflowRun];
  });
}

export async function getGitHubWorkflowRun(
  token: string,
  repository: string,
  runId: number,
  signal?: AbortSignal,
): Promise<GitHubWorkflowRun> {
  const response = await githubFetch(
    `/repos/${encodeRepository(repository)}/actions/runs/${runId}`,
    token,
    signal,
  );
  const run: any = await response.json().catch(() => null);
  if (typeof run?.id !== "number")
    throw new GitHubToolError("GitHub returned an unreadable workflow run.");
  return {
    id: run.id,
    name: typeof run.name === "string" ? run.name : "GitHub Actions",
    status: typeof run.status === "string" ? run.status : "unknown",
    conclusion: typeof run.conclusion === "string" ? run.conclusion : null,
    branch: typeof run.head_branch === "string" ? run.head_branch : "",
    url: typeof run.html_url === "string" ? run.html_url : "",
    createdAt: typeof run.created_at === "string" ? run.created_at : "",
  };
}
async function githubFetch(
  path: string,
  token: string,
  signal?: AbortSignal,
  accept = "application/vnd.github+json",
) {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
      },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new GitHubToolError(
      "Could not reach GitHub. Check the device network.",
    );
  }
  if (!response.ok) {
    const message =
      response.status === 403
        ? "GitHub denied this request. Check token permissions or rate limit."
        : response.status === 404
          ? "GitHub could not find that repository or file, or the token cannot access it."
          : `GitHub returned HTTP ${response.status}.`;
    throw new GitHubToolError(message, response.status);
  }
  return response;
}
async function githubWrite(
  path: string,
  token: string,
  body: unknown,
  signal?: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new GitHubToolError(
      "Could not reach GitHub. Check the device network.",
    );
  }
  if (!response.ok)
    throw new GitHubToolError(
      `GitHub write request failed (HTTP ${response.status}).`,
      response.status,
    );
  return response;
}
function encodeRepository(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}
function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}
function normalizeRepository(value: unknown): GitHubRepository[] {
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  const id = typeof item.id === "number" ? item.id : 0;
  const fullName = typeof item.full_name === "string" ? item.full_name : "";
  if (!id || !fullName) return [];
  return [
    {
      id,
      name:
        typeof item.name === "string"
          ? item.name
          : (fullName.split("/").pop() ?? fullName),
      fullName,
      description: typeof item.description === "string" ? item.description : "",
      private: item.private === true,
      defaultBranch:
        typeof item.default_branch === "string" ? item.default_branch : "main",
      htmlUrl:
        typeof item.html_url === "string"
          ? item.html_url
          : `https://github.com/${fullName}`,
      updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    },
  ];
}
function normalizeFile(value: unknown): GitHubRepositoryFile[] {
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  if (typeof item.name !== "string" || typeof item.path !== "string") return [];
  return [
    {
      name: item.name,
      path: item.path,
      type: item.type === "dir" ? "dir" : "file",
      size: typeof item.size === "number" ? item.size : 0,
      htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
      downloadUrl:
        typeof item.download_url === "string" ? item.download_url : "",
    },
  ];
}
