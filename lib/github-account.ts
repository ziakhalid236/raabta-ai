export type GitHubProfile = {
  login: string;
  avatarUrl: string;
};

export class GitHubProfileError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GitHubProfileError";
  }
}

/** Validate a user-supplied GitHub token by reading identity only; no repo endpoint is called. */
export async function fetchGitHubProfile(
  token: string,
  signal?: AbortSignal,
): Promise<GitHubProfile> {
  const value = token.trim();
  if (!value) throw new GitHubProfileError("Enter a GitHub token first.");

  let response: Response;
  try {
    response = await fetch("https://api.github.com/user", {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${value}`,
        "X-GitHub-Api-Version": "2026-03-10",
      },
      signal,
    });
  } catch {
    if (signal?.aborted) throw new Error("Request stopped.");
    throw new GitHubProfileError(
      "Could not reach GitHub. Check your internet connection and try again.",
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "GitHub rejected this token (401). Check it or create a replacement.",
      403: "GitHub denied the profile request (403). Check token permissions or rate limits.",
      429: "GitHub rate-limited this profile check. Wait briefly and try again.",
    };
    throw new GitHubProfileError(
      messages[response.status] ??
        `GitHub returned HTTP ${response.status} while checking the profile.`,
      response.status,
    );
  }

  const data = asRecord(payload);
  const login = typeof data?.login === "string" ? data.login.trim() : "";
  const avatarUrl = typeof data?.avatar_url === "string" ? data.avatar_url : "";
  if (!login || !isHttpsUrl(avatarUrl)) {
    throw new GitHubProfileError(
      "GitHub returned an unreadable profile. The token was not saved.",
    );
  }
  return { login, avatarUrl };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}
