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

export const LIVE_TOOL_DEFINITIONS: AiToolDefinition[] = [
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
      name: "github_list_repositories",
      description:
        "List repositories visible to the connected GitHub account. The token is held by the app and is never an argument.",
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
        "List files and directories in a connected GitHub repository.",
      parameters: {
        type: "object",
        properties: {
          repository: string("owner/repository"),
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
          repository: string("owner/repository"),
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
        "Update and commit a file in a connected GitHub repository. Autonomous coding is enabled by the user's policy.",
      parameters: {
        type: "object",
        properties: {
          repository: string("owner/repository"),
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
      name: "github_create_issue",
      description: "Create an issue in a connected GitHub repository.",
      parameters: {
        type: "object",
        properties: {
          repository: string("owner/repository"),
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
        "Create a pull request. Merging is not available as an automatic tool and requires approval.",
      parameters: {
        type: "object",
        properties: {
          repository: string("owner/repository"),
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
];
