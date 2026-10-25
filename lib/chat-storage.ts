import AsyncStorage from "@react-native-async-storage/async-storage";
import { EMPTY_APPROVAL_POLICY, type ApprovalPolicy } from "@/lib/agent/approvals";
import { DEFAULT_PROVIDER_BASE_URL, sameProviderEndpoint } from "@/lib/provider-identity";

export type ChatAttachment = {
  id: string;
  kind: "image" | "document" | "research" | "audio";
  name: string;
  mimeType: string;
  uri?: string;
  sourceUrl?: string;
  /** Bounded, extracted text for a user-selected document or retrieved source. Never a secret. */
  extractedText?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "activity";
  content: string;
  createdAt: string;
  activityStatus?: "working" | "complete" | "failed" | "stopped";
  activityKind?:
    | "plan"
    | "research"
    | "model"
    | "file"
    | "github"
    | "workspace"
    | "verify"
    | "deploy"
    | "agent";
  activityPlatform?: string;
  attachments?: ChatAttachment[];
};

export type ChatThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type ChatPreferences = {
  language: "ur" | "en";
  providerConnected: boolean;
  providerKind: "generic" | "cloudflare-worker";
  providerBaseUrl: string;
  providerKeyBaseUrl: string;
  modelId: string;
  modelName: string;
  visionModelId: string;
  visionModelName: string;
  codingModelId: string;
  codingModelName: string;
  modelSupportsImages: boolean;
  transcriptionModelId: string;
  transcriptionModelName: string;
  githubLogin: string;
  githubAvatarUrl: string;
  githubRepositories: string;
  /** Remembered tool approvals so the agent does not re-ask for the same action. */
  approvalPolicy: ApprovalPolicy;
};

const THREADS_KEY = "raabta.chat.threads.v2";
const LEGACY_THREADS_KEY = "raabta.chat.threads.v1";
const PREFERENCES_KEY = "raabta.chat.preferences.v4";
const LEGACY_PREFERENCES_KEYS = [
  "raabta.chat.preferences.v3",
  "raabta.chat.preferences.v2",
  "raabta.chat.preferences.v1",
];

export const DEFAULT_PREFERENCES: ChatPreferences = {
  language: "en",
  providerConnected: false,
  providerKind: "generic",
  providerBaseUrl: DEFAULT_PROVIDER_BASE_URL,
  providerKeyBaseUrl: "",
  modelId: "",
  modelName: "",
  visionModelId: "",
  visionModelName: "",
  codingModelId: "",
  codingModelName: "",
  modelSupportsImages: false,
  transcriptionModelId: "",
  transcriptionModelName: "",
  githubLogin: "",
  githubAvatarUrl: "",
  githubRepositories: "",
  approvalPolicy: EMPTY_APPROVAL_POLICY,
};

export async function loadThreads(): Promise<ChatThread[]> {
  let stored = await AsyncStorage.getItem(THREADS_KEY);
  let migrate = false;
  if (!stored) {
    stored = await AsyncStorage.getItem(LEGACY_THREADS_KEY);
    migrate = Boolean(stored);
  }
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const threads = parsed
      .filter(isChatThread)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (migrate) await saveThreads(threads);
    return threads;
  } catch {
    return [];
  }
}

export async function saveThreads(threads: ChatThread[]): Promise<void> {
  await AsyncStorage.setItem(THREADS_KEY, JSON.stringify(threads));
}

export async function loadPreferences(): Promise<ChatPreferences> {
  let stored = await AsyncStorage.getItem(PREFERENCES_KEY);
  let isCurrentSchema = Boolean(stored);
  if (!stored) {
    for (const key of LEGACY_PREFERENCES_KEYS) {
      stored = await AsyncStorage.getItem(key);
      if (stored) break;
    }
  }
  if (!stored) return DEFAULT_PREFERENCES;
  try {
    const parsed: unknown = JSON.parse(stored);
    const data = asRecord(parsed);
    if (!data) return DEFAULT_PREFERENCES;
    const providerBaseUrl =
      isCurrentSchema &&
      typeof data.providerBaseUrl === "string" &&
      data.providerBaseUrl.trim()
        ? data.providerBaseUrl.trim().replace(/\/$/, "")
        : DEFAULT_PROVIDER_BASE_URL;
    const providerKeyBaseUrl = isCurrentSchema
      ? typeof data.providerKeyBaseUrl === "string" && data.providerKeyBaseUrl.trim()
        ? data.providerKeyBaseUrl.trim().replace(/\/$/, "")
        : data.providerConnected === true
          ? providerBaseUrl
          : ""
      : "";
    return {
      language: data.language === "ur" ? "ur" : "en",
      // Credentials are valid only for the endpoint to which they were explicitly connected.
      providerConnected:
        isCurrentSchema &&
        (data.providerConnected === true) &&
        sameProviderEndpoint(providerKeyBaseUrl, providerBaseUrl),
      providerKind: data.providerKind === "cloudflare-worker" ? "cloudflare-worker" : "generic",
      providerBaseUrl,
      providerKeyBaseUrl,
      modelId: isCurrentSchema ? stringValue(data.modelId) : "",
      modelName: isCurrentSchema ? stringValue(data.modelName) : "",
      visionModelId: isCurrentSchema ? stringValue(data.visionModelId) : "",
      visionModelName: isCurrentSchema ? stringValue(data.visionModelName) : "",
      codingModelId: isCurrentSchema ? stringValue(data.codingModelId) : "",
      codingModelName: isCurrentSchema ? stringValue(data.codingModelName) : "",
      modelSupportsImages: isCurrentSchema && data.modelSupportsImages === true,
      transcriptionModelId: isCurrentSchema
        ? stringValue(data.transcriptionModelId)
        : "",
      transcriptionModelName: isCurrentSchema
        ? stringValue(data.transcriptionModelName)
        : "",
      githubLogin: isCurrentSchema ? stringValue(data.githubLogin) : "",
      githubAvatarUrl: isCurrentSchema
        ? safeHttpsString(data.githubAvatarUrl)
        : "",
      githubRepositories: isCurrentSchema
        ? stringValue(data.githubRepositories)
        : "",
      approvalPolicy: isCurrentSchema ? parseApprovalPolicy(data.approvalPolicy) : EMPTY_APPROVAL_POLICY,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(
  preferences: ChatPreferences,
): Promise<void> {
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export function createThread(now = new Date()): ChatThread {
  const stamp = now.toISOString();
  return {
    id: `thread-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "New conversation",
    createdAt: stamp,
    updatedAt: stamp,
    messages: [],
  };
}

function isChatThread(value: unknown): value is ChatThread {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ChatThread>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.messages) &&
    candidate.messages.every(isChatMessage)
  );
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ChatMessage>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.content !== "string" ||
    typeof candidate.createdAt !== "string"
  )
    return false;
  if (candidate.attachments !== undefined) {
    if (
      !Array.isArray(candidate.attachments) ||
      !candidate.attachments.every(isChatAttachment)
    )
      return false;
  }
  if (candidate.role === "user" || candidate.role === "assistant") return true;
  return (
    candidate.role === "activity" &&
    (candidate.activityStatus === "working" ||
      candidate.activityStatus === "complete" ||
      candidate.activityStatus === "failed" ||
      candidate.activityStatus === "stopped")
  );
}

function isChatAttachment(value: unknown): value is ChatAttachment {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ChatAttachment>;
  return (
    typeof item.id === "string" &&
    (item.kind === "image" ||
      item.kind === "document" ||
      item.kind === "research" ||
      item.kind === "audio") &&
    typeof item.name === "string" &&
    typeof item.mimeType === "string" &&
    (item.uri === undefined || typeof item.uri === "string") &&
    (item.sourceUrl === undefined || typeof item.sourceUrl === "string") &&
    (item.extractedText === undefined ||
      (typeof item.extractedText === "string" &&
        item.extractedText.length <= 120_000))
  );
}

function parseApprovalPolicy(value: unknown): ApprovalPolicy {
  const data = asRecord(value);
  if (!data) return EMPTY_APPROVAL_POLICY;
  return {
    alwaysAllow: stringList(data.alwaysAllow),
    deny: stringList(data.deny),
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 64);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeHttpsString(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? value : "";
  } catch {
    return "";
  }
}
