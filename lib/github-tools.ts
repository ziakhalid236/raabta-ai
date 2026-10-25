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
export type GitHubCommit = {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
};
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
const CONTENTS_API_MAX_BYTES = 900 * 1024;
const MAX_GITHUB_TEXT_BYTES = 50 * 1024 * 1024;
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
  const contentBytes = new TextEncoder().encode(args.content).length;
  if (contentBytes > MAX_GITHUB_TEXT_BYTES)
    throw new GitHubToolError("GitHub text files are limited to 50 MB per commit.");
  if (contentBytes > CONTENTS_API_MAX_BYTES)
    return commitLargeGitHubFile(args);
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
  // The body can only be read once, so reuse the parsed payload for the error
  // detail instead of calling gitHubErrorDetail (which would re-read it and
  // silently lose GitHub's explanation).
  const payload: any = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = describeGitHubPayload(payload);
    const hint = gitHubStatusHint(response.status, "PUT", `/contents/${args.path}`);
    throw new GitHubToolError(
      `GitHub could not update the file (HTTP ${response.status}). ${detail || hint}`.trim(),
      response.status,
    );
  }
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

async function commitLargeGitHubFile(args: {
  token: string;
  repository: string;
  path: string;
  content: string;
  message: string;
  branch?: string;
  signal?: AbortSignal;
}): Promise<GitHubWriteResult> {
  const branch = args.branch || "main";
  const refResponse = await githubFetch(
    `/repos/${encodeRepository(args.repository)}/git/ref/heads/${encodeURIComponent(branch)}`,
    args.token,
    args.signal,
  );
  const ref: any = await refResponse.json().catch(() => null);
  const headSha = typeof ref?.object?.sha === "string" ? ref.object.sha : "";
  if (!headSha) throw new GitHubToolError("GitHub returned no branch head for the large-file commit.");

  const commitResponse = await githubFetch(
    `/repos/${encodeRepository(args.repository)}/git/commits/${headSha}`,
    args.token,
    args.signal,
  );
  const commit: any = await commitResponse.json().catch(() => null);
  const baseTree = typeof commit?.tree?.sha === "string" ? commit.tree.sha : "";
  if (!baseTree) throw new GitHubToolError("GitHub returned no base tree for the large-file commit.");

  const blobResponse = await githubWrite(
    `/repos/${encodeRepository(args.repository)}/git/blobs`,
    args.token,
    { content: toBase64Utf8(args.content), encoding: "base64" },
    args.signal,
  );
  const blob: any = await blobResponse.json().catch(() => null);
  const blobSha = typeof blob?.sha === "string" ? blob.sha : "";
  if (!blobSha) throw new GitHubToolError("GitHub returned no blob identifier for the large file.");

  const treeResponse = await githubWrite(
    `/repos/${encodeRepository(args.repository)}/git/trees`,
    args.token,
    {
      base_tree: baseTree,
      tree: [{ path: args.path.replace(/^\//, ""), mode: "100644", type: "blob", sha: blobSha }],
    },
    args.signal,
  );
  const tree: any = await treeResponse.json().catch(() => null);
  const treeSha = typeof tree?.sha === "string" ? tree.sha : "";
  if (!treeSha) throw new GitHubToolError("GitHub returned no tree identifier for the large file.");

  const newCommitResponse = await githubWrite(
    `/repos/${encodeRepository(args.repository)}/git/commits`,
    args.token,
    { message: args.message, tree: treeSha, parents: [headSha] },
    args.signal,
  );
  const newCommit: any = await newCommitResponse.json().catch(() => null);
  const newCommitSha = typeof newCommit?.sha === "string" ? newCommit.sha : "";
  if (!newCommitSha) throw new GitHubToolError("GitHub returned no commit identifier for the large file.");

  await githubPatch(
    `/repos/${encodeRepository(args.repository)}/git/refs/heads/${encodeURIComponent(branch)}`,
    args.token,
    { sha: newCommitSha, force: false },
    args.signal,
  );
  return {
    url: `https://github.com/${args.repository}/blob/${encodeURIComponent(branch)}/${args.path}`,
    message: "Large file committed through GitHub's Git Data API.",
    sha: blobSha,
  };
}

/**
 * Create a repository for the connected user. `autoInit: true` is required
 * before the Git Data API can write to it, because an empty repository has no
 * branch and no commit for a file write to attach to. Writing a file into a
 * repository with no commits is the most common source of GitHub HTTP 422.
 */
export async function createGitHubRepository(args: {
  token: string;
  name: string;
  description?: string;
  isPrivate?: boolean;
  signal?: AbortSignal;
}): Promise<GitHubRepository> {
  const response = await githubWrite(
    "/user/repos",
    args.token,
    {
      name: args.name,
      description: args.description ?? "",
      private: args.isPrivate ?? true,
      auto_init: true,
    },
    args.signal,
  );
  const payload: unknown = await response.json().catch(() => null);
  const [repository] = normalizeRepository(payload);
  if (!repository)
    throw new GitHubToolError("GitHub created the repository but returned no details for it.");
  return repository;
}

/**
 * A token can authenticate and still be unable to write: fine-grained tokens
 * need "Contents: Read and write" per repository, and classic tokens need the
 * `repo` scope. GitHub reports the granted scopes in a header on every
 * response, so this reads them instead of failing later on a confusing 403.
 */
export type GitHubTokenPermission = {
  /** Scopes GitHub reports, for example ["repo", "workflow"]. */
  scopes: string[];
  /** Fine-grained tokens report no scopes; permission is per repository. */
  isFineGrained: boolean;
  canWriteCode: boolean;
  canManageWorkflows: boolean;
  canCreateRepositories: boolean;
  summary: string;
};

export async function inspectGitHubToken(
  token: string,
  signal?: AbortSignal,
): Promise<GitHubTokenPermission> {
  const response = await githubFetch("/user", token, signal);
  const raw = response.headers.get("x-oauth-scopes") ?? "";
  const scopes = raw
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  // Fine-grained tokens send neither x-oauth-scopes nor x-accepted-oauth-scopes.
  const isFineGrained =
    scopes.length === 0 && response.headers.get("x-accepted-oauth-scopes") !== null;

  const canWriteCode = isFineGrained || scopes.includes("repo") || scopes.includes("public_repo");
  const canManageWorkflows = isFineGrained || scopes.includes("workflow");
  const canCreateRepositories =
    isFineGrained || scopes.includes("repo") || scopes.includes("public_repo");

  const missing: string[] = [];
  if (!canWriteCode) missing.push("repo (write code and files)");
  if (!canManageWorkflows) missing.push("workflow (run and read Actions)");
  if (!canCreateRepositories) missing.push("repo (create repositories)");

  return {
    scopes,
    isFineGrained,
    canWriteCode,
    canManageWorkflows,
    canCreateRepositories,
    summary: isFineGrained
      ? "This is a fine-grained token. Permission is set per repository, so grant Contents: Read and write plus Actions: Read and write on each repository you want Raabta to change."
      : missing.length
        ? `This token is read-only for some actions. It is missing: ${missing.join(", ")}. Recreate the token with those scopes.`
        : "This token can read, write code, run workflows and create repositories.",
  };
}

/** Recent commits on a branch, so the agent can confirm a write actually landed. */
export async function listGitHubCommits(
  token: string,
  repository: string,
  branch?: string,
  signal?: AbortSignal,
): Promise<GitHubCommit[]> {
  const suffix = branch ? `?sha=${encodeURIComponent(branch)}&per_page=15` : "?per_page=15";
  const response = await githubFetch(
    `/repos/${encodeRepository(repository)}/commits${suffix}`,
    token,
    signal,
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!Array.isArray(payload))
    throw new GitHubToolError("GitHub returned an unreadable commit list.");
  return payload.flatMap((entry: any) => {
    if (typeof entry?.sha !== "string") return [];
    return [{
      sha: entry.sha,
      message:
        typeof entry?.commit?.message === "string"
          ? entry.commit.message.split("\n")[0].slice(0, 200)
          : "",
      author:
        typeof entry?.commit?.author?.name === "string"
          ? entry.commit.author.name
          : typeof entry?.author?.login === "string"
            ? entry.author.login
            : "",
      date:
        typeof entry?.commit?.author?.date === "string" ? entry.commit.author.date : "",
      url: typeof entry?.html_url === "string" ? entry.html_url : "",
    } satisfies GitHubCommit];
  });
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
/**
 * GitHub explains every 4xx/5xx in the JSON body (message + errors[]). That
 * explanation is the only way to tell a real cause apart: a 422 for an empty
 * commit, a 409 for a stale sha, a 403 for a missing token scope all look the
 * same if the body is discarded. Never include the request headers here, so a
 * token can never leak into an error message or the task journal.
 */
async function gitHubErrorDetail(response: Response): Promise<string> {
  const payload: any = await response.json().catch(() => null);
  return describeGitHubPayload(payload);
}

/** Flatten GitHub's { message, errors[] } into one actionable sentence. */
function describeGitHubPayload(payload: any): string {
  const parts: string[] = [];
  if (typeof payload?.message === "string") parts.push(payload.message);
  if (Array.isArray(payload?.errors)) {
    for (const item of payload.errors) {
      if (typeof item === "string") parts.push(item);
      else if (item && typeof item === "object") {
        const field = typeof item.field === "string" ? item.field : "";
        const code = typeof item.code === "string" ? item.code : "";
        const message = typeof item.message === "string" ? item.message : "";
        parts.push([field, code, message].filter(Boolean).join(": "));
      }
    }
  }
  if (typeof payload?.documentation_url === "string")
    parts.push(`See ${payload.documentation_url}`);
  return parts.filter(Boolean).join(" ").slice(0, 400);
}

/**
 * Turn an HTTP status into something a user can act on. The status alone is
 * useless ("HTTP 422"); the detail is what makes the next attempt succeed.
 */
function gitHubStatusHint(status: number, method: string, path: string): string {
  if (status === 422)
    return path.includes("/contents/")
      ? "GitHub rejected the file write. Usually the branch does not exist yet, the file's current sha is stale, or the branch is protected. Create the branch first, then re-read the file before updating it."
      : "GitHub rejected the request body. A required field is missing or has the wrong type.";
  if (status === 409)
    return "The branch moved while this task was running. Re-read the file and retry.";
  if (status === 403)
    return "The token lacks permission for this action, or the rate limit was hit. Check the token's scopes.";
  if (status === 404)
    return "The repository, branch, or path was not found, or the token cannot see it (private repo without repo scope).";
  if (status === 401)
    return "The token is missing or expired. Reconnect GitHub.";
  if (status === 451)
    return "GitHub blocked this request for legal reasons.";
  if (status >= 500)
    return "GitHub had a server-side problem. This is safe to retry.";
  return `The ${method} request to ${path.split("?")[0]} was refused.`;
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
    const detail = await gitHubErrorDetail(response);
    const hint = gitHubStatusHint(response.status, "GET", path);
    throw new GitHubToolError(
      `GitHub could not complete that request (HTTP ${response.status}). ${detail || hint}`.trim(),
      response.status,
    );
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
  if (!response.ok) {
    const detail = await gitHubErrorDetail(response);
    const hint = gitHubStatusHint(response.status, "POST", path);
    throw new GitHubToolError(
      `GitHub write request failed (HTTP ${response.status}). ${detail || hint}`.trim(),
      response.status,
    );
  }
  return response;
}

async function githubPatch(
  path: string,
  token: string,
  body: unknown,
  signal?: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: "PATCH",
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
    throw new GitHubToolError("Could not reach GitHub. Check the device network.");
  }
  if (!response.ok) {
    const detail = await gitHubErrorDetail(response);
    const hint = gitHubStatusHint(response.status, "PATCH", path);
    throw new GitHubToolError(
      `GitHub branch update failed (HTTP ${response.status}). ${detail || hint}`.trim(),
      response.status,
    );
  }
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
