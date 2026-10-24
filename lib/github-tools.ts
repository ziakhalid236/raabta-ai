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

const API = "https://api.github.com";
const API_VERSION = "2026-03-10";

export class GitHubToolError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GitHubToolError";
  }
}

export async function listGitHubRepositories(token: string, signal?: AbortSignal): Promise<GitHubRepository[]> {
  const results: GitHubRepository[] = [];
  let page = 1;
  while (page <= 10) {
    const response = await githubFetch(`/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100&page=${page}`, token, signal);
    const payload: unknown = await response.json().catch(() => null);
    if (!Array.isArray(payload)) throw new GitHubToolError("GitHub returned an unreadable repository list.", response.status);
    results.push(...payload.flatMap(normalizeRepository));
    if (payload.length < 100) break;
    page += 1;
  }
  return results;
}

export async function listGitHubRepositoryFiles(token: string, repository: string, path = "", branch?: string, signal?: AbortSignal): Promise<GitHubRepositoryFile[]> {
  const suffix = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  const response = await githubFetch(`/repos/${encodeRepository(repository)}/contents/${path.replace(/^\//, "")}${suffix}`, token, signal);
  const payload: unknown = await response.json().catch(() => null);
  const entries = Array.isArray(payload) ? payload : [payload];
  return entries.flatMap(normalizeFile);
}

export async function readGitHubFile(token: string, repository: string, path: string, branch?: string, signal?: AbortSignal): Promise<string> {
  const suffix = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  const response = await githubFetch(`/repos/${encodeRepository(repository)}/contents/${path.replace(/^\//, "")}${suffix}`, token, signal, "application/vnd.github.raw+json");
  const text = await response.text();
  if (text.length > 120_000) throw new GitHubToolError("That GitHub file is larger than the safe reading limit.");
  return text;
}

async function githubFetch(path: string, token: string, signal?: AbortSignal, accept = "application/vnd.github+json") {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { headers: { Accept: accept, Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": API_VERSION }, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new GitHubToolError("Could not reach GitHub. Check the device network.");
  }
  if (!response.ok) {
    const message = response.status === 403 ? "GitHub denied this read request. Check the token's repository read permissions or rate limit." : response.status === 404 ? "GitHub could not find that repository or file, or the token cannot access it." : `GitHub returned HTTP ${response.status}.`;
    throw new GitHubToolError(message, response.status);
  }
  return response;
}

function encodeRepository(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}
function normalizeRepository(value: unknown): GitHubRepository[] {
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  const id = typeof item.id === "number" ? item.id : 0;
  const fullName = typeof item.full_name === "string" ? item.full_name : "";
  if (!id || !fullName) return [];
  return [{ id, name: typeof item.name === "string" ? item.name : fullName.split("/").pop() ?? fullName, fullName, description: typeof item.description === "string" ? item.description : "", private: item.private === true, defaultBranch: typeof item.default_branch === "string" ? item.default_branch : "main", htmlUrl: typeof item.html_url === "string" ? item.html_url : `https://github.com/${fullName}`, updatedAt: typeof item.updated_at === "string" ? item.updated_at : "" }];
}
function normalizeFile(value: unknown): GitHubRepositoryFile[] {
  if (!value || typeof value !== "object") return [];
  const item = value as Record<string, unknown>;
  if (typeof item.name !== "string" || typeof item.path !== "string") return [];
  return [{ name: item.name, path: item.path, type: item.type === "dir" ? "dir" : "file", size: typeof item.size === "number" ? item.size : 0, htmlUrl: typeof item.html_url === "string" ? item.html_url : "", downloadUrl: typeof item.download_url === "string" ? item.download_url : "" }];
}
