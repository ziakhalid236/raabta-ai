export type AiToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: false;
    };
  };
};

const string = (description: string) => ({ type: "string", description });
const boolean = (description: string) => ({ type: "boolean", description });

const BASE_TOOLS: AiToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the live public web for current information and return real source URLs.",
      parameters: {
        type: "object",
        properties: { query: string("The focused search query") },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_public_web_page",
      description:
        "Read a public HTTPS HTML, text, JSON or XML page and return bounded text.",
      parameters: {
        type: "object",
        properties: { url: string("A complete public HTTPS URL") },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ai_workspace_list_files",
      description:
        "List files only inside Raabta's private, size-limited AI workspace on this device.",
      parameters: {
        type: "object",
        properties: { directory: string("Relative workspace folder; empty means the workspace root") },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ai_workspace_find_text",
      description:
        "Search text inside files in Raabta's private, size-limited AI workspace. Returns bounded file paths, line numbers and matching excerpts; it cannot access the phone's other files or run shell commands.",
      parameters: {
        type: "object",
        properties: {
          query: string("Text to find"),
          directory: string("Optional relative workspace folder"),
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ai_workspace_read_file",
      description:
        "Read a text file only from the private Raabta AI workspace on this device.",
      parameters: {
        type: "object",
        properties: { path: string("Relative file path inside the AI workspace") },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ai_workspace_write_file",
      description:
        "Create or replace a text file only inside the private Raabta AI workspace. Never use paths outside that workspace.",
      parameters: {
        type: "object",
        properties: {
          path: string("Relative file path inside the AI workspace"),
          content: string("Complete text content to write"),
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ai_workspace_create_directory",
      description:
        "Create a folder (including any parents) inside the private Raabta AI workspace.",
      parameters: {
        type: "object",
        properties: {
          path: string("Relative folder path inside the AI workspace"),
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ai_workspace_move_file",
      description:
        "Move or rename a single text file within the private Raabta AI workspace. Refuses if the destination already exists.",
      parameters: {
        type: "object",
        properties: {
          fromPath: string("Current relative file path"),
          toPath: string("New relative file path"),
        },
        required: ["fromPath", "toPath"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ai_workspace_file_info",
      description:
        "Return size, line count and existence for a path in the private Raabta AI workspace without loading the whole file.",
      parameters: {
        type: "object",
        properties: {
          path: string("Relative path inside the AI workspace"),
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ai_workspace_delete_file",
      description:
        "Delete a file only from Raabta's private AI workspace. The app requires the user's explicit approval first.",
      parameters: {
        type: "object",
        properties: { path: string("Relative file path inside the AI workspace") },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
];

const GITHUB_TOOLS: AiToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "github_list_repositories",
      description:
        "List or refresh repositories visible to the connected GitHub account. The token is held by the app and is never an argument.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_list_files",
      description:
        "List files and directories in a connected GitHub repository the user can access.",
      parameters: {
        type: "object",
        properties: {
          repository: string("Repository full name owner/repository"),
          path: string("Directory path, empty for root"),
          branch: string("Optional branch"),
        },
        required: ["repository"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_read_file",
      description: "Read a text file from a connected GitHub repository.",
      parameters: {
        type: "object",
        properties: {
          repository: string("Repository full name owner/repository"),
          path: string("File path"),
          branch: string("Optional branch"),
        },
        required: ["repository", "path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_update_file",
      description:
        "Prepare a text file update or creation and commit it in a connected GitHub repository. Files up to 50 MB use GitHub's Git Data API; the app asks the user to approve the exact change before writing.",
      parameters: {
        type: "object",
        properties: {
          repository: string("Repository full name owner/repository"),
          path: string("File path"),
          content: string("Complete new file content"),
          message: string("Commit message"),
          branch: string("Optional branch"),
        },
        required: ["repository", "path", "content", "message"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_create_repository",
      description:
        "Create a new GitHub repository for the connected account. It is created with an initial README commit (auto_init) so files can be written to it immediately. The app asks the user to approve before creating it.",
      parameters: {
        type: "object",
        properties: {
          name: string("Repository name, letters/digits/-/_/."),
          description: string("Optional short description"),
          isPrivate: boolean("Create as private; defaults to true"),
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_create_issue",
      description:
        "Prepare an issue in a connected GitHub repository. The app asks the user to approve the exact issue before creating it.",
      parameters: {
        type: "object",
        properties: {
          repository: string("Repository full name owner/repository"),
          title: string("Issue title"),
          body: string("Issue body"),
        },
        required: ["repository", "title", "body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_create_pull_request",
      description:
        "Prepare a pull request in a connected GitHub repository. The app asks the user to approve before creating it. Merging is not available as an automatic tool.",
      parameters: {
        type: "object",
        properties: {
          repository: string("Repository full name owner/repository"),
          title: string("Pull request title"),
          body: string("Pull request body"),
          head: string("Source branch"),
          base: string("Target branch"),
        },
        required: ["repository", "title", "body", "head", "base"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_create_branch",
      description:
        "Create an isolated branch from an existing branch in a connected GitHub repository. The app asks the user to approve before writing.",
      parameters: {
        type: "object",
        properties: {
          repository: string("Repository full name owner/repository"),
          branch: string("New branch name"),
          fromBranch: string("Optional source branch; defaults to main"),
        },
        required: ["repository", "branch"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_dispatch_workflow",
      description:
        "Start only the repository-controlled engineering-checks.yml workflow on main or master. The app validates the exact workflow/ref and asks the user to approve before dispatching it.",
      parameters: {
        type: "object",
        properties: {
          repository: string("Repository full name owner/repository"),
          workflow: string("Workflow file name, for example engineering-checks.yml"),
          ref: string("Branch or tag to run the workflow on"),
          inputs: string("Optional JSON object of workflow_dispatch inputs"),
        },
        required: ["repository", "workflow", "ref"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_list_workflow_runs",
      description:
        "List recent GitHub Actions runs for a connected repository or a specific workflow.",
      parameters: {
        type: "object",
        properties: {
          repository: string("Repository full name owner/repository"),
          workflow: string("Optional workflow file name"),
        },
        required: ["repository"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_get_workflow_run",
      description:
        "Inspect one GitHub Actions run by numeric run ID and return its status, conclusion, branch, and URL.",
      parameters: {
        type: "object",
        properties: {
          repository: string("Repository full name owner/repository"),
          runId: { type: "number", description: "GitHub Actions run ID" },
        },
        required: ["repository", "runId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_list_commits",
      description:
        "List recent commits on a branch. Use this after a write to confirm the commit actually landed on GitHub.",
      parameters: {
        type: "object",
        properties: {
          repository: string("Repository full name owner/repository"),
          branch: string("Optional branch name; defaults to the repository default branch"),
        },
        required: ["repository"],
        additionalProperties: false,
      },
    },
  },
];

export function getLiveToolDefinitions(options: {
  githubConnected: boolean;
}): AiToolDefinition[] {
  return options.githubConnected
    ? [...BASE_TOOLS.slice(0, 2), ...GITHUB_TOOLS, ...BASE_TOOLS.slice(2)]
    : [...BASE_TOOLS];
}

/** @deprecated Prefer getLiveToolDefinitions with the current connection state. */
export const LIVE_TOOL_DEFINITIONS = getLiveToolDefinitions({
  githubConnected: true,
});
