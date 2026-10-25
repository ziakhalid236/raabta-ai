/**
 * Runtime capability report for the on-device agent.
 *
 * Raabta is an Android app, not a server: it has no shell, no browser engine
 * and no container. Rather than letting the model guess, the app probes the
 * device it is actually running on and reports the truth. This report is fed
 * to the model so it plans within real limits, and shown to the user so the
 * limits are not a surprise.
 */

import * as FileSystem from "expo-file-system/legacy";

export type CapabilityState = "available" | "unavailable" | "limited";

export type Capability = {
  id: string;
  state: CapabilityState;
  english: string;
  urdu: string;
};

export type CapabilityReport = {
  platform: "android" | "ios" | "web" | "unknown";
  /** Tools the model may use right now. */
  tools: string[];
  capabilities: Capability[];
  /** Short summary injected into the model's system context. */
  summary: string;
};

const WORKSPACE_PROBE = "file:///";

async function workspaceWritable(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(WORKSPACE_PROBE);
    return Boolean(info.exists);
  } catch {
    return false;
  }
}

/**
 * Build the capability report. Read-only and cheap: it inspects the running
 * platform and the app's own sandbox, never the user's private files.
 */
export async function detectCapabilities(args: {
  githubConnected: boolean;
  hasVisionModel: boolean;
  hasTranscriptionModel: boolean;
}): Promise<CapabilityReport> {
  const platform: CapabilityReport["platform"] =
    typeof navigator !== "undefined" && /android/i.test(navigator.userAgent ?? "")
      ? "android"
      : typeof navigator !== "undefined" && /iphone|ipad/i.test(navigator.userAgent ?? "")
        ? "ios"
        : typeof window !== "undefined"
          ? "web"
          : "unknown";

  const writable = await workspaceWritable();

  const capabilities: Capability[] = [
    {
      id: "workspace",
      state: writable ? "available" : "unavailable",
      english: writable
        ? "Private app workspace: read, write, move and search files."
        : "Private app workspace is not reachable on this build.",
      urdu: writable
        ? "نجی workspace: فائلیں پڑھیں، لکھیں، منتقل اور تلاش کریں۔"
        : "اس build پر نجی workspace دستیاب نہیں۔",
    },
    {
      id: "shell",
      state: "unavailable",
      english: "No terminal or shell: commands and package installs cannot run.",
      urdu: "کوئی terminal یا shell نہیں: کمانڈ اور پیکج انسٹال نہیں چل سکتے۔",
    },
    {
      id: "browser",
      state: "limited",
      english: "No browser engine: the app reads public pages over HTTP instead.",
      urdu: "کوئی browser انجن نہیں: ایپ عوامی صفحات HTTP سے پڑھتی ہے۔",
    },
    {
      id: "tests",
      state: "unavailable",
      english: "No local test runner: logic is checked by re-reading file contents.",
      urdu: "کوئی test runner نہیں: منطق فائل دوبارہ پڑھ کر جانچی جاتی ہے۔",
    },
    {
      id: "github",
      state: args.githubConnected ? "available" : "unavailable",
      english: args.githubConnected
        ? "GitHub connected: repository reads and approved writes."
        : "GitHub not connected: repository actions are unavailable.",
      urdu: args.githubConnected
        ? "GitHub منسلک: repository پڑھنا اور منظور شدہ تبدیلیاں۔"
        : "GitHub منسلک نہیں: repository کے کام دستیاب نہیں۔",
    },
    {
      id: "vision",
      state: args.hasVisionModel ? "available" : "unavailable",
      english: args.hasVisionModel
        ? "Image understanding is available."
        : "No image-capable model selected.",
      urdu: args.hasVisionModel ? "تصویر سمجھنا دستیاب ہے۔" : "تصویر کے لیے model منتخب نہیں۔",
    },
    {
      id: "voice",
      state: args.hasTranscriptionModel ? "available" : "unavailable",
      english: args.hasTranscriptionModel
        ? "Voice transcription is available."
        : "No transcription model selected.",
      urdu: args.hasTranscriptionModel ? "آواز کا متن دستیاب ہے۔" : "آواز کے لیے model منتخب نہیں۔",
    },
    {
      id: "background",
      state: "unavailable",
      english: "Work stops when the app is closed; nothing runs in the background.",
      urdu: "ایپ بند ہونے پر کام رک جاتا ہے؛ پس منظر میں کچھ نہیں چلتا۔",
    },
  ];

  const tools = [
    "web_search",
    "read_public_web_page",
    "ai_workspace_list_files",
    "ai_workspace_find_text",
    "ai_workspace_read_file",
    "ai_workspace_write_file",
    "ai_workspace_create_directory",
    "ai_workspace_move_file",
    "ai_workspace_file_info",
    "ai_workspace_delete_file",
    ...(args.githubConnected
      ? [
          "github_list_repositories",
          "github_list_files",
          "github_read_file",
          "github_update_file",
          "github_create_issue",
          "github_create_pull_request",
          "github_create_branch",
          "github_dispatch_workflow",
          "github_list_workflow_runs",
          "github_get_workflow_run",
        ]
      : []),
  ];

  const summary = [
    `Running on: ${platform}.`,
    "You cannot run shell commands, install packages, or start a browser.",
    "To verify your own work: read the file back, compare it with the goal, and state clearly what you could not check.",
    args.githubConnected
      ? "GitHub is connected; writes you have already been approved for will not ask again."
      : "GitHub is not connected; do not offer repository actions.",
  ].join(" ");

  return { platform, tools, capabilities, summary };
}
