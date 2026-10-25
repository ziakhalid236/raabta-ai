import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGitHubRepository,
  GitHubToolError,
  inspectGitHubToken,
  listGitHubCommits,
  updateGitHubFile,
} from "../lib/github-tools";

afterEach(() => vi.unstubAllGlobals());

const signal = () => new AbortController().signal;

describe("GitHub error reporting", () => {
  it("surfaces GitHub's own explanation instead of a bare status", async () => {
    // The real body GitHub returns for a write to a repository with no commits.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            message: "Git Repository is empty.",
            documentation_url: "https://docs.github.com/rest",
          }),
          { status: 422 },
        ),
      ),
    );

    const error = await updateGitHubFile({
      token: "t",
      repository: "owner/repo",
      path: "README.md",
      content: "hi",
      message: "add readme",
      signal: signal(),
    }).catch((e) => e);

    expect(error).toBeInstanceOf(GitHubToolError);
    expect(error.status).toBe(422);
    expect(error.message).toContain("Git Repository is empty.");
    expect(error.message).toContain("HTTP 422");
  });

  it("explains a stale-sha conflict from GitHub's errors array", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        // First call reads the current file, second call is the failed write.
        if (call === 1)
          return new Response(JSON.stringify({ sha: "old-sha" }), { status: 200 });
        return new Response(
          JSON.stringify({
            message: "Conflict",
            errors: [{ field: "sha", code: "invalid", message: "is at abc but expected def" }],
          }),
          { status: 409 },
        );
      }),
    );

    const error = await updateGitHubFile({
      token: "t",
      repository: "owner/repo",
      path: "a.ts",
      content: "x",
      message: "edit",
      signal: signal(),
    }).catch((e) => e);

    expect(error.message).toContain("Conflict");
    expect(error.message).toContain("sha: invalid: is at abc but expected def");
  });

  it("never includes the token in an error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 })),
    );

    const error = await updateGitHubFile({
      token: "ghp_SUPERSECRETVALUE",
      repository: "owner/repo",
      path: "a.ts",
      content: "x",
      message: "edit",
      signal: signal(),
    }).catch((e) => e);

    expect(error.message).not.toContain("ghp_SUPERSECRETVALUE");
    expect(error.message).toContain("Bad credentials");
  });
});

describe("repository creation", () => {
  it("creates with auto_init so the first file write has a commit to attach to", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.github.com/user/repos");
      const body = JSON.parse(String(init?.body));
      expect(body.auto_init).toBe(true);
      expect(body.name).toBe("my-project");
      expect(body.private).toBe(true);
      return new Response(
        JSON.stringify({
          id: 1,
          name: "my-project",
          full_name: "owner/my-project",
          default_branch: "main",
          html_url: "https://github.com/owner/my-project",
        }),
        { status: 201 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const repository = await createGitHubRepository({
      token: "t",
      name: "my-project",
      signal: signal(),
    });

    expect(repository.fullName).toBe("owner/my-project");
    expect(repository.defaultBranch).toBe("main");
  });

  it("reports the real reason a repository could not be created", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            message: "Repository creation failed.",
            errors: [{ field: "name", code: "already_exists" }],
          }),
          { status: 422 },
        ),
      ),
    );

    const error = await createGitHubRepository({
      token: "t",
      name: "existing",
      signal: signal(),
    }).catch((e) => e);

    expect(error.status).toBe(422);
    expect(error.message).toContain("Repository creation failed.");
    expect(error.message).toContain("name: already_exists");
  });
});

describe("commit confirmation", () => {
  it("lists commits so a write can be confirmed on the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              sha: "abc123",
              commit: {
                message: "add readme\n\nlong body",
                author: { name: "Zia", date: "2026-10-25T00:00:00Z" },
              },
              html_url: "https://github.com/owner/repo/commit/abc123",
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    const commits = await listGitHubCommits("t", "owner/repo", "main", signal());
    expect(commits).toHaveLength(1);
    expect(commits[0].sha).toBe("abc123");
    expect(commits[0].message).toBe("add readme");
    expect(commits[0].author).toBe("Zia");
  });
});

describe("token permission inspection", () => {
  function userResponse(headers: Record<string, string>) {
    return new Response(JSON.stringify({ login: "zia" }), { status: 200, headers });
  }

  it("flags a read-only classic token so the failure is explainable up front", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        // read:user and read:org authenticate but grant no write anywhere.
        userResponse({ "x-oauth-scopes": "read:user, read:org" }),
      ),
    );
    const permission = await inspectGitHubToken("t", signal());
    expect(permission.canWriteCode).toBe(false);
    expect(permission.summary).toMatch(/read-only/i);
    expect(permission.summary).toMatch(/workflow/);
  });

  it("accepts a classic token that carries the repo and workflow scopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => userResponse({ "x-oauth-scopes": "repo, workflow, read:user" })),
    );
    const permission = await inspectGitHubToken("t", signal());
    expect(permission.canWriteCode).toBe(true);
    expect(permission.canManageWorkflows).toBe(true);
    expect(permission.canCreateRepositories).toBe(true);
    expect(permission.summary).toMatch(/can read, write code/);
  });

  it("explains that a fine-grained token sets permission per repository", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        userResponse({ "x-accepted-oauth-scopes": "repo, workflow" }),
      ),
    );
    const permission = await inspectGitHubToken("t", signal());
    expect(permission.isFineGrained).toBe(true);
    expect(permission.canWriteCode).toBe(true);
    expect(permission.summary).toMatch(/Contents: Read and write/);
  });
});
