import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import type { MarkdownStyle } from "react-native-enriched-markdown";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  AIRequestError,
  requestCloudflareFileAnalysis,
  requestAudioTranscription,
  requestChatCompletion,
} from "@/lib/ai-client";
import { getLiveToolDefinitions } from "@/lib/ai-tools";
import { DEFAULT_PROVIDER_BASE_URL, sameProviderEndpoint } from "@/lib/provider-identity";
import {
  deleteAIWorkspaceFile,
  getAIWorkspaceUsage,
  listAIWorkspaceFiles,
  readAIWorkspaceFile,
  writeAIWorkspaceFile,
} from "@/lib/ai-workspace";
import {
  createThread,
  DEFAULT_PREFERENCES,
  loadPreferences,
  loadThreads,
  savePreferences,
  saveThreads,
  type ChatMessage,
  type ChatAttachment,
  type ChatPreferences,
  type ChatThread,
} from "@/lib/chat-storage";
import {
  deleteApiKey,
  deleteGitHubToken,
  readGitHubToken,
  readApiKey,
  writeGitHubToken,
  writeApiKey,
} from "@/lib/secure-credentials";
import {
  classifyCodingModels,
  classifyVisionModels,
  discoverProviderModels,
  type ProviderCatalog,
  type ProviderModel,
} from "@/lib/provider-catalog";
import { fetchGitHubProfile, type GitHubProfile } from "@/lib/github-account";
import {
  createGitHubBranch,
  createGitHubIssue,
  createGitHubPullRequest,
  dispatchGitHubWorkflow,
  getGitHubWorkflowRun,
  listGitHubRepositories,
  listGitHubRepositoryFiles,
  listGitHubWorkflowRuns,
  readGitHubFile,
  updateGitHubFile,
  type GitHubRepository,
} from "@/lib/github-tools";
import { AttachmentSheet } from "@/components/raabta/attachment-sheet";
import { AccountsSheet } from "@/components/raabta/accounts-sheet";
import { ModelPicker } from "@/components/raabta/model-picker";
import {
  disposeAudioFile,
  ensureAudioFileSize,
  pickAudioFile,
  type LocalAudioFile,
} from "@/lib/audio-tools";
import { pickChatDocuments, pickChatImages } from "@/lib/mobile-media";
import { makeProviderMessages } from "@/lib/provider-messages";
import {
  downloadReadablePage,
  searchWeb,
  type WebSource,
  WebToolError,
} from "@/lib/web-tools";

type SourceAction = {
  progressLabel: string;
  resolve: (signal: AbortSignal) => Promise<ChatAttachment[]>;
};

type Panel = "chat" | "history" | "roadmap" | "research" | "settings";
type IconName = React.ComponentProps<typeof Ionicons>["name"];

const C = {
  paper: "#F7F7F3",
  white: "#FFFFFF",
  ink: "#202A28",
  muted: "#78817D",
  teal: "#0F766E",
  tealDark: "#075E58",
  tealPale: "#E7F1EE",
  line: "#E7E9E4",
  amber: "#A56B1F",
  amberPale: "#FAF1E4",
  danger: "#A34037",
  dangerPale: "#FAECEA",
};

const assistantMarkdownStyle: MarkdownStyle = {
  paragraph: { fontSize: 15, color: C.ink, lineHeight: 23, marginBottom: 8 },
  h1: { fontSize: 22, fontWeight: "700", color: C.ink, marginBottom: 10 },
  h2: { fontSize: 19, fontWeight: "700", color: C.ink, marginBottom: 8 },
  h3: { fontSize: 16, fontWeight: "700", color: C.ink, marginBottom: 6 },
  link: { color: C.teal, underline: true },
  code: { color: C.tealDark, backgroundColor: "#EDF3F0" },
  codeBlock: {
    fontSize: 12,
    color: "#E7F1EE",
    backgroundColor: "#253330",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  blockquote: {
    borderColor: C.teal,
    backgroundColor: "#F0F6F3",
    borderRadius: 10,
    padding: 9,
    marginBottom: 10,
  },
  list: {
    fontSize: 15,
    bulletColor: C.teal,
    markerColor: C.teal,
    gapWidth: 8,
    marginLeft: 18,
  },
  table: {
    fontSize: 12,
    borderColor: C.line,
    borderRadius: 10,
    headerBackgroundColor: "#EDF3F0",
    cellPaddingHorizontal: 8,
    cellPaddingVertical: 6,
  },
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const audioRecorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const [panel, setPanel] = useState<Panel>("chat");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const threadsRef = useRef<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [preferences, setPreferences] =
    useState<ChatPreferences>(DEFAULT_PREFERENCES);
  const isUrdu = preferences.language === "ur";
  const t = (english: string, urdu: string) => (isUrdu ? urdu : english);
  const [keyDraft, setKeyDraft] = useState("");
  const [providerBaseUrlDraft, setProviderBaseUrlDraft] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [providerConnected, setProviderConnected] = useState(false);
  const isProviderDraftConnected =
    providerConnected &&
    sameProviderEndpoint(
      preferences.providerKeyBaseUrl,
      providerBaseUrlDraft.trim() || preferences.providerBaseUrl,
    );
  const [modelCatalog, setModelCatalog] = useState<ProviderCatalog | null>(
    null,
  );
  const [modelPickerKind, setModelPickerKind] = useState<
    "chat" | "transcription" | null
  >(null);
  const [accountsVisible, setAccountsVisible] = useState(false);
  const [githubProfile, setGithubProfile] = useState<GitHubProfile | null>(
    null,
  );
  const [githubRepositories, setGithubRepositories] = useState<
    GitHubRepository[]
  >([]);
  const [isConnectingGitHub, setIsConnectingGitHub] = useState(false);
  const [accountsNotice, setAccountsNotice] = useState("");
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showError, setShowError] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<
    ChatAttachment[]
  >([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [pageUrlDraft, setPageUrlDraft] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const replaceThreads = useCallback((next: ChatThread[]) => {
    const sorted = [...next].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    threadsRef.current = sorted;
    setThreads(sorted);
    void saveThreads(sorted).catch(() => {
      setHistoryNotice(
        "Could not save local history. Check device storage space.",
      );
    });
  }, []);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      try {
        const [storedThreads, storedPreferences, apiKey, githubToken] =
          await Promise.all([
            loadThreads(),
            loadPreferences(),
            readApiKey(),
            readGitHubToken(),
          ]);
        if (!active) return;
        const hydratedThreads = storedThreads.length
          ? storedThreads
          : [createThread()];
        threadsRef.current = hydratedThreads;
        setThreads(hydratedThreads);
        setActiveThreadId(hydratedThreads[0].id);
        setPreferences(storedPreferences);
        setProviderBaseUrlDraft(storedPreferences.providerBaseUrl);
        setHasKey(Boolean(apiKey));
        setProviderConnected(
          Boolean(apiKey && storedPreferences.providerConnected),
        );
        setGithubProfile(
          githubToken && storedPreferences.githubLogin
            ? {
                login: storedPreferences.githubLogin,
                avatarUrl: storedPreferences.githubAvatarUrl,
              }
            : null,
        );
        try {
          const saved = JSON.parse(
            storedPreferences.githubRepositories || "[]",
          );
          setGithubRepositories(Array.isArray(saved) ? saved : []);
        } catch {
          setGithubRepositories([]);
        }
        if (!storedThreads.length) void saveThreads(hydratedThreads);
      } catch {
        if (!active) return;
        const initial = [createThread()];
        threadsRef.current = initial;
        setThreads(initial);
        setActiveThreadId(initial[0].id);
        setHistoryNotice(
          "Local storage could not be opened. Conversation history may not persist.",
        );
      } finally {
        if (active) setIsReady(true);
      }
    }
    void hydrate();
    return () => {
      active = false;
      controllerRef.current?.abort();
    };
  }, []);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? threads[0],
    [activeThreadId, threads],
  );

  const startNewChat = useCallback(() => {
    const nextThread = createThread();
    replaceThreads([nextThread, ...threadsRef.current]);
    setActiveThreadId(nextThread.id);
    setPanel("chat");
    setShowError("");
    setDraft("");
    setPendingAttachments([]);
    Keyboard.dismiss();
  }, [replaceThreads]);

  function updateThread(
    threadId: string,
    transform: (thread: ChatThread) => ChatThread,
  ) {
    const current = threadsRef.current;
    const next = current.map((thread) =>
      thread.id === threadId ? transform(thread) : thread,
    );
    replaceThreads(next);
  }

  async function dispatchUserTask(
    rawText: string,
    attachments: ChatAttachment[] = pendingAttachments,
    sourceAction?: SourceAction,
  ) {
    const text = rawText.trim();
    if (
      (!text && !attachments.length) ||
      isSending ||
      isTranscribing ||
      !isReady
    )
      return;
    setShowError("");
    if (
      !providerConnected ||
      !sameProviderEndpoint(preferences.providerKeyBaseUrl, preferences.providerBaseUrl) ||
      !preferences.modelId.trim() ||
      !hasKey
    ) {
      setShowError(
        t(
          "Connect an AI provider and choose a chat model in Settings before sending.",
          "بھیجنے سے پہلے Settings میں AI provider جوڑیں اور chat model منتخب کریں۔",
        ),
      );
      setPanel("settings");
      return;
    }
    if (
      attachments.some((attachment) => attachment.kind === "image") &&
      !preferences.modelSupportsImages &&
      !preferences.visionModelId
    ) {
      setShowError(
        t(
          "This chat model does not list image input. Choose an image-capable model before sending your photo.",
          "اس chat model میں image input درج نہیں۔ تصویر بھیجنے سے پہلے image-capable model منتخب کریں۔",
        ),
      );
      setModelPickerKind("chat");
      return;
    }

    const chatDisplayName =
      preferences.modelName.trim() ||
      t("your selected model", "آپ کا منتخب ماڈل");
    const selectedTaskModelId = selectTaskModel(
      preferences,
      text,
      attachments,
    );
    let currentThread = activeThread;
    if (!currentThread) {
      currentThread = createThread();
      replaceThreads([currentThread, ...threadsRef.current]);
      setActiveThreadId(currentThread.id);
    }
    const createdAt = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: makeId("message"),
      role: "user",
      content:
        text ||
        t(
          "Please examine the attached image or document.",
          "براہِ کرم منسلک تصویر یا دستاویز دیکھیں۔",
        ),
      createdAt,
      ...(attachments.length ? { attachments } : {}),
    };
    const activityId = makeId("activity");
    const requestEvent: ChatMessage = {
      id: activityId,
      role: "activity",
      content:
        sourceAction?.progressLabel ??
        (attachments.length
          ? isUrdu
            ? `${attachments.length} منسلک فائل(یں) ${chatDisplayName} کے لیے تیار کی جا رہی ہیں۔`
            : `Preparing ${attachments.length} attachment${attachments.length === 1 ? "" : "s"} for ${chatDisplayName}.`
          : isUrdu
            ? `${chatDisplayName} کے لیے درخواست تیار کی جا رہی ہے۔`
            : `Preparing a request for ${chatDisplayName}.`),
      activityStatus: "working",
      activityKind: "plan",
      activityPlatform: "Raabta",
      createdAt,
    };
    const title = currentThread.messages.some(
      (message) => message.role === "user",
    )
      ? currentThread.title
      : titleFromMessage(text || "Question about an attachment");
    updateThread(currentThread.id, (thread) => ({
      ...thread,
      title,
      updatedAt: createdAt,
      messages: [...thread.messages, userMessage, requestEvent],
    }));
    setDraft("");
    setPendingAttachments([]);
    setPanel("chat");
    Keyboard.dismiss();
    setIsSending(true);
    const controller = new AbortController();
    controllerRef.current = controller;

    let activeActivityId = activityId;
    const updateActivity = (
      content: string,
      status: ChatMessage["activityStatus"] = "working",
    ) => {
      updateThread(currentThread.id, (thread) => ({
        ...thread,
        messages: thread.messages.map((message) =>
          message.id === activeActivityId
            ? { ...message, content, activityStatus: status }
            : message,
        ),
      }));
    };
    const addActivity = (
      content: string,
      metadata: Pick<ChatMessage, "activityKind" | "activityPlatform"> = {},
    ) => {
      const previousActivityId = activeActivityId;
      activeActivityId = makeId("activity");
      const createdAt = new Date().toISOString();
      updateThread(currentThread.id, (thread) => ({
        ...thread,
        updatedAt: createdAt,
        messages: [
          ...thread.messages.map((message) =>
            message.id === previousActivityId && message.activityStatus === "working"
              ? { ...message, activityStatus: "complete" as const }
              : message,
          ),
          {
            id: activeActivityId,
            role: "activity",
            content,
            activityStatus: "working",
            activityKind: metadata.activityKind ?? "agent",
            activityPlatform: metadata.activityPlatform ?? "Raabta",
            createdAt,
          },
        ],
      }));
    };

    try {
      const apiKey = await readApiKey();
      if (!apiKey)
        throw new AIRequestError(
          t(
            "Your API key is not available in secure storage. Add it again in Settings.",
            "محفوظ storage میں API key نہیں ملی۔ Settings میں دوبارہ درج کریں۔",
          ),
        );
      const githubToken = await readGitHubToken();
      const availableTools = getLiveToolDefinitions({
        githubConnected: Boolean(githubToken),
      });
      const githubContext = githubToken
        ? JSON.stringify({
            connected: true,
            account: githubProfile?.login || preferences.githubLogin || null,
            repositories: githubRepositories.map((repository) => ({
              fullName: repository.fullName,
              private: repository.private,
              defaultBranch: repository.defaultBranch,
              description: repository.description,
            })),
            cachedRepositoryList: true,
            availableActions: [
              "list/refresh repositories",
              "list repository files",
              "read text files",
              "update and commit a file (requires approval)",
              "create an issue (requires approval)",
              "open a pull request (requires approval)",
              "create an isolated branch (requires approval)",
              "dispatch an existing workflow (requires approval)",
              "inspect workflow runs",
              "inspect one workflow run",
            ],
            unavailableActions: ["delete repositories", "merge pull requests", "arbitrary shell execution"],
          })
        : "";
      const executeToolAction = async (
        name: string,
        args: Record<string, unknown>,
      ): Promise<string> => {
        if (name === "web_search")
          return JSON.stringify(
            await searchWeb(String(args.query ?? text), controller.signal),
          );
        if (name === "read_public_web_page")
          return JSON.stringify(
            await downloadReadablePage(
              String(args.url ?? ""),
              controller.signal,
            ),
          );
        if (name === "ai_workspace_list_files")
          return JSON.stringify({
            files: await listAIWorkspaceFiles(
              typeof args.directory === "string" ? args.directory : "",
            ),
            ...(await getAIWorkspaceUsage()),
          });
        if (name === "ai_workspace_read_file")
          return JSON.stringify({
            path: String(args.path ?? ""),
            content: await readAIWorkspaceFile(String(args.path ?? "")),
          });
        if (name === "ai_workspace_write_file")
          return JSON.stringify(
            await writeAIWorkspaceFile(
              String(args.path ?? ""),
              String(args.content ?? ""),
            ),
          );
        if (name === "ai_workspace_delete_file")
          return JSON.stringify(
            await deleteAIWorkspaceFile(String(args.path ?? "")),
          );
        if (!githubToken)
          return "GitHub is not connected in this app. Ask the user to connect it first.";
        if (name === "github_list_repositories") {
          const repositories = await listGitHubRepositories(
            githubToken,
            controller.signal,
          );
          setGithubRepositories(repositories);
          const nextPreferences = {
            ...preferences,
            githubRepositories: JSON.stringify(repositories),
          };
          setPreferences(nextPreferences);
          void savePreferences(nextPreferences).catch(() => {
            setSettingsNotice("The refreshed GitHub repository list could not be saved locally.");
          });
          return JSON.stringify(repositories);
        }
        if (name === "github_list_files")
          return JSON.stringify(
            await listGitHubRepositoryFiles(
              githubToken,
              String(args.repository),
              typeof args.path === "string" ? args.path : "",
              typeof args.branch === "string" ? args.branch : undefined,
              controller.signal,
            ),
          );
        if (name === "github_read_file")
          return JSON.stringify({
            content: await readGitHubFile(
              githubToken,
              String(args.repository),
              String(args.path),
              typeof args.branch === "string" ? args.branch : undefined,
              controller.signal,
            ),
          });
        if (name === "github_update_file")
          return JSON.stringify(
            await updateGitHubFile({
              token: githubToken,
              repository: String(args.repository),
              path: String(args.path),
              content: String(args.content),
              message: String(args.message),
              branch: typeof args.branch === "string" ? args.branch : undefined,
              signal: controller.signal,
            }),
          );
        if (name === "github_create_issue")
          return JSON.stringify(
            await createGitHubIssue({
              token: githubToken,
              repository: String(args.repository),
              title: String(args.title),
              body: String(args.body),
              signal: controller.signal,
            }),
          );
        if (name === "github_create_pull_request")
          return JSON.stringify(
            await createGitHubPullRequest({
              token: githubToken,
              repository: String(args.repository),
              title: String(args.title),
              body: String(args.body),
              head: String(args.head),
              base: String(args.base),
              signal: controller.signal,
            }),
          );
        if (name === "github_create_branch")
          return JSON.stringify(
            await createGitHubBranch({
              token: githubToken,
              repository: String(args.repository),
              branch: String(args.branch),
              fromBranch: typeof args.fromBranch === "string" ? args.fromBranch : undefined,
              signal: controller.signal,
            }),
          );
        if (name === "github_dispatch_workflow") {
          let inputs: Record<string, string> | undefined;
          if (typeof args.inputs === "string" && args.inputs.trim()) {
            const parsed: unknown = JSON.parse(args.inputs);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
              throw new Error("Workflow inputs must be a JSON object.");
            inputs = Object.fromEntries(
              Object.entries(parsed).map(([key, value]) => [key, String(value)]),
            );
          }
          return JSON.stringify(
            await dispatchGitHubWorkflow({
              token: githubToken,
              repository: String(args.repository),
              workflow: String(args.workflow),
              ref: String(args.ref),
              inputs,
              signal: controller.signal,
            }),
          );
        }
        if (name === "github_list_workflow_runs")
          return JSON.stringify(
            await listGitHubWorkflowRuns(
              githubToken,
              String(args.repository),
              typeof args.workflow === "string" ? args.workflow : undefined,
              controller.signal,
            ),
          );
        if (name === "github_get_workflow_run")
          return JSON.stringify(
            await getGitHubWorkflowRun(
              githubToken,
              String(args.repository),
              Number(args.runId),
              controller.signal,
            ),
          );
        return `Tool ${name} is not available. Delete, merge and deploy are approval-gated and are not autonomous tools.`;
      };
      const executeTool = async (
        name: string,
        args: Record<string, unknown>,
      ): Promise<string> => {
        const repo = typeof args.repository === "string" ? args.repository : "";
        const path = typeof args.path === "string" ? args.path : "";
        const labels: Record<string, [string, string]> = {
          web_search: ["Searching the public web", "عوامی ویب پر تلاش جاری ہے"],
          read_public_web_page: ["Reading a public web page", "عوامی ویب صفحہ پڑھا جا رہا ہے"],
          ai_workspace_list_files: ["Listing files in the private AI workspace", "نجی AI workspace کی فائلیں دیکھی جا رہی ہیں"],
          ai_workspace_read_file: ["Reading a private workspace file", "نجی workspace فائل پڑھی جا رہی ہے"],
          ai_workspace_write_file: ["Writing a private workspace file", "نجی workspace فائل لکھی جا رہی ہے"],
          ai_workspace_delete_file: ["Preparing to delete a private workspace file", "نجی workspace فائل حذف کرنے کی تیاری"],
          github_list_repositories: ["Listing GitHub repositories", "GitHub repositories دیکھی جا رہی ہیں"],
          github_list_files: ["Listing repository files", "repository کی فائلیں دیکھی جا رہی ہیں"],
          github_read_file: ["Reading a repository file", "repository کی فائل پڑھی جا رہی ہے"],
          github_update_file: ["Preparing a GitHub file update", "GitHub فائل کی تبدیلی تیار ہو رہی ہے"],
          github_create_issue: ["Preparing a GitHub issue", "GitHub issue تیار ہو رہا ہے"],
          github_create_pull_request: ["Preparing a GitHub pull request", "GitHub pull request تیار ہو رہی ہے"],
          github_create_branch: ["Preparing an isolated GitHub branch", "الگ GitHub branch تیار ہو رہی ہے"],
          github_dispatch_workflow: ["Preparing a GitHub Actions run", "GitHub Actions run تیار ہو رہا ہے"],
          github_list_workflow_runs: ["Inspecting GitHub Actions runs", "GitHub Actions runs دیکھی جا رہی ہیں"],
          github_get_workflow_run: ["Inspecting a GitHub Actions run", "ایک GitHub Actions run دیکھی جا رہی ہے"],
        };
        const [englishLabel, urduLabel] = labels[name] ?? [
          `Running ${name}`,
          `${name} چل رہا ہے`,
        ];
        const suffix = repo ? ` · ${repo}${path ? `/${path}` : ""}` : "";
        const label = `${t(englishLabel, urduLabel)}${suffix}`;
        const eventId = makeId("activity");
        const createdAt = new Date().toISOString();
        const writeAction =
          name === "github_update_file" ||
          name === "github_create_issue" ||
          name === "github_create_pull_request" ||
          name === "github_create_branch" ||
          name === "github_dispatch_workflow" ||
          name === "ai_workspace_delete_file";
        updateThread(currentThread.id, (thread) => ({
          ...thread,
          updatedAt: createdAt,
          messages: [
            ...thread.messages,
            {
              id: eventId,
              role: "activity",
              content: label,
              activityStatus: "working",
              ...toolActivityMetadata(name),
              createdAt,
            },
          ],
        }));
        const finishEvent = (
          content: string,
          status: ChatMessage["activityStatus"],
        ) =>
          updateThread(currentThread.id, (thread) => ({
            ...thread,
            messages: thread.messages.map((message) =>
              message.id === eventId
                ? { ...message, content, activityStatus: status }
                : message,
            ),
          }));
        try {
          if (writeAction) {
            const summary =
              name === "ai_workspace_delete_file"
                ? `Delete ${path} from the private AI workspace`
                : name === "github_update_file"
                ? `Commit ${path} in ${repo}`
                  : name === "github_create_issue"
                  ? `Create issue in ${repo}: ${String(args.title ?? "")}`
                  : name === "github_create_pull_request"
                    ? `Open pull request in ${repo}: ${String(args.title ?? "")}`
                    : name === "github_create_branch"
                      ? `Create branch ${String(args.branch ?? "")} in ${repo}`
                      : `Dispatch workflow ${String(args.workflow ?? "")} on ${repo}`;
            const approved = await requestSensitiveActionApproval(summary);
            if (!approved) {
              const cancelled = t(
                "Cancelled by you; no change was made.",
                "آپ نے منسوخ کیا؛ کوئی تبدیلی نہیں کی گئی۔",
              );
              finishEvent(cancelled, "stopped");
              return cancelled;
            }
          }
          const result = await executeToolAction(name, args);
          finishEvent(`${label} — ${t("complete", "مکمل")}`, "complete");
          return result;
        } catch (error) {
          finishEvent(
            `${label} — ${t("failed", "ناکام")}: ${safeTaskError(error)}`,
            "failed",
          );
          throw error;
        }
      };
      if (sourceAction) {
        const retrieved = await sourceAction.resolve(controller.signal);
        if (controller.signal.aborted) throw new Error("Request stopped.");
        updateThread(currentThread.id, (thread) => ({
          ...thread,
          messages: thread.messages.map((message) =>
            message.id === userMessage.id
              ? { ...message, attachments: retrieved }
              : message,
          ),
        }));
        updateActivity(
          isUrdu
            ? `${retrieved.length} حقیقی source ملے؛ اصل روابط آپ کے سوال کے ساتھ شامل ہیں۔`
            : `Retrieved ${retrieved.length} real source${retrieved.length === 1 ? "" : "s"}; source links are attached to your prompt.`,
          "complete",
        );
        addActivity(
          t(
            "Preparing the source excerpts and conversation for your chosen model.",
            "آپ کے منتخب model کے لیے source اقتباسات اور گفتگو تیار ہو رہی ہے۔",
          ),
          { activityKind: "research", activityPlatform: "Web research" },
        );
      } else if (shouldAutoResearch(text)) {
        const retrieved = await searchWeb(text, controller.signal);
        updateThread(currentThread.id, (thread) => ({
          ...thread,
          messages: thread.messages.map((message) =>
            message.id === userMessage.id
              ? {
                  ...message,
                  attachments: retrieved.map((source) =>
                    sourceToAttachment(source),
                  ),
                }
              : message,
          ),
        }));
      }
      if (controller.signal.aborted)
        throw new Error("Request stopped before sending.");
      addActivity(
        t(
          `Selected the task model: ${selectedTaskModelId}`,
          `اس task کے لیے model منتخب کیا گیا: ${selectedTaskModelId}`,
        ),
        { activityKind: "model", activityPlatform: "AI provider" },
      );
      addActivity(
        t(
          "Analyzing the task and preparing the model context.",
          "task کا تجزیہ اور model context تیار کیا جا رہا ہے۔",
        ),
        { activityKind: "plan", activityPlatform: "Raabta" },
      );
      const latestThread = threadsRef.current.find(
        (thread) => thread.id === currentThread.id,
      );
      if (!latestThread)
        throw new AIRequestError(
          "This conversation is no longer available. Reopen it and try again.",
        );
      const providerMessages = await makeProviderMessages(
        latestThread.messages,
        controller.signal,
        githubContext,
        availableTools,
        preferences.providerKind === "cloudflare-worker"
          ? async (attachment, prompt) => {
              if (!attachment.uri)
                throw new AIRequestError("This image is no longer available on the device.");
              return requestCloudflareFileAnalysis({
                apiKey,
                baseUrl: preferences.providerBaseUrl,
                file: {
                  uri: attachment.uri,
                  name: attachment.name,
                  mimeType: attachment.mimeType,
                },
                prompt,
                signal: controller.signal,
              });
            }
          : undefined,
      );
      const answer = await requestChatCompletion({
        modelId: selectedTaskModelId,
        apiKey,
        messages: providerMessages,
        signal: controller.signal,
        baseUrl: preferences.providerBaseUrl,
        tools: availableTools,
        executeTool,
      });
      updateActivity(
        t(
          "Model response received and verified for display.",
          "model کا جواب موصول اور display کے لیے verify ہو گیا ہے۔",
        ),
        "complete",
      );
      const assistantMessage: ChatMessage = {
        id: makeId("message"),
        role: "assistant",
        content: answer,
        createdAt: new Date().toISOString(),
      };
      updateThread(currentThread.id, (thread) => ({
        ...thread,
        updatedAt: assistantMessage.createdAt,
        messages: [...thread.messages, assistantMessage],
      }));
    } catch (error) {
      const stopped = controller.signal.aborted;
      const safeError = safeTaskError(error);
      updateActivity(
        stopped
          ? t("Request stopped by you.", "آپ نے درخواست روک دی۔")
          : `${t("Task failed", "کام مکمل نہیں ہوا")}: ${safeError}`,
        stopped ? "stopped" : "failed",
      );
      setShowError(
        stopped
          ? t(
              "Task stopped. Your question and action history remain saved on this device.",
              "کام روک دیا گیا۔ سوال اور actions کی تاریخ اسی فون پر محفوظ ہے۔",
            )
          : safeError,
      );
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setIsSending(false);
    }
  }

  function sendMessage() {
    void dispatchUserTask(draft, pendingAttachments);
  }

  function startWebResearch() {
    const query = searchDraft.trim();
    if (!query) {
      setShowError("Enter a research question or search phrase.");
      return;
    }
    void dispatchUserTask(query, [], {
      progressLabel: t(
        "Searching DuckDuckGo for public sources…",
        "DuckDuckGo پر عوامی ذرائع تلاش ہو رہے ہیں…",
      ),
      resolve: async (signal) => {
        const results = await searchWeb(query, signal);
        return results.map((source) => sourceToAttachment(source));
      },
    });
  }

  function startPageRead() {
    const url = pageUrlDraft.trim();
    if (!isHttpsUrl(url)) {
      setShowError("Enter a complete public HTTPS page URL.");
      return;
    }
    void dispatchUserTask(`Read and summarize this public page: ${url}`, [], {
      progressLabel: t(
        "Downloading and reading the public HTTPS page…",
        "عوامی HTTPS صفحہ ڈاؤن لوڈ اور پڑھا جا رہا ہے…",
      ),
      resolve: async (signal) => [
        sourceToAttachment(await downloadReadablePage(url, signal)),
      ],
    });
  }

  async function addImages() {
    try {
      const images = await pickChatImages();
      if (images.length) {
        setPendingAttachments((current) => [...current, ...images].slice(0, 4));
        setShowError("");
      }
    } catch (error) {
      setShowError(safeTaskError(error));
    }
  }

  async function addDocuments() {
    try {
      const documents = await pickChatDocuments();
      if (documents.length) {
        setPendingAttachments((current) =>
          [...current, ...documents].slice(0, 4),
        );
        setShowError("");
      }
    } catch (error) {
      setShowError(safeTaskError(error));
    }
  }

  async function transcribeAudioFile(file: LocalAudioFile) {
    if (
      !providerConnected ||
      !sameProviderEndpoint(preferences.providerKeyBaseUrl, preferences.providerBaseUrl) ||
      !preferences.transcriptionModelId ||
      !hasKey
    ) {
      setShowError(
        t(
          "Connect AI provider and choose a transcription model in Settings before using voice input.",
          "آواز استعمال کرنے سے پہلے Settings میں AI provider جوڑیں اور transcription model منتخب کریں۔",
        ),
      );
      setPanel("settings");
      return;
    }
    try {
      await ensureAudioFileSize(file);
    } catch (error) {
      setShowError(safeTaskError(error));
      return;
    }
    const transcriptionDisplayName =
      preferences.transcriptionModelName.trim() ||
      t("the selected transcription model", "منتخب transcription ماڈل");
    let currentThread = activeThread;
    if (!currentThread) {
      currentThread = createThread();
      replaceThreads([currentThread, ...threadsRef.current]);
      setActiveThreadId(currentThread.id);
    }
    const activityId = makeId("activity");
    const selectedActivityId = makeId("activity");
    const startedAt = new Date().toISOString();
    updateThread(currentThread.id, (thread) => ({
      ...thread,
      messages: [
        ...thread.messages,
        {
          id: selectedActivityId,
          role: "activity",
          content: t(
            "Voice clip selected locally; preparing the optional transcription request.",
            "آواز کی فائل فون پر منتخب ہوئی؛ اختیاری transcription درخواست تیار ہے۔",
          ),
          activityStatus: "complete",
          createdAt: startedAt,
        },
        {
          id: activityId,
          role: "activity",
          content: t(
            `Sending selected voice to ${transcriptionDisplayName} for transcription…`,
            `منتخب آواز ${transcriptionDisplayName} کو transcript بنانے کے لیے بھیجی جا رہی ہے…`,
          ),
          activityStatus: "working",
          createdAt: new Date(Date.now() + 1).toISOString(),
        },
      ],
      updatedAt: startedAt,
    }));
    setIsTranscribing(true);
    setShowError("");
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const apiKey = await readApiKey();
      if (!apiKey)
        throw new AIRequestError(
          t(
            "Your API key is not available in secure storage. Add it again in Settings.",
            "محفوظ storage میں API key نہیں ملی۔ Settings میں دوبارہ درج کریں۔",
          ),
        );
      const transcript =
        preferences.providerKind === "cloudflare-worker"
          ? await requestCloudflareFileAnalysis({
              apiKey,
              baseUrl: preferences.providerBaseUrl,
              file,
              signal: controller.signal,
            })
          : await requestAudioTranscription({
              modelId: preferences.transcriptionModelId,
              apiKey,
              file,
              signal: controller.signal,
              baseUrl: preferences.providerBaseUrl,
            });
      const completedAt = new Date().toISOString();
      updateThread(currentThread.id, (thread) => ({
        ...thread,
        updatedAt: completedAt,
        messages: [
          ...thread.messages.map((message) =>
            message.id === activityId
              ? {
                  ...message,
                  content: t(
                    `Transcription received from ${transcriptionDisplayName}.`,
                    `${transcriptionDisplayName} سے transcript موصول ہوا۔`,
                  ),
                  activityStatus: "complete" as const,
                }
              : message,
          ),
          {
            id: makeId("activity"),
            role: "activity",
            content: t(
              "Transcript added to the message composer; review it before you send it.",
              "متن پیغام میں شامل ہے؛ بھیجنے سے پہلے اسے دیکھ لیں۔",
            ),
            activityStatus: "complete",
            createdAt: new Date(Date.parse(completedAt) + 1).toISOString(),
          },
        ],
      }));
      setDraft((current) =>
        current ? `${current}\n${transcript}` : transcript,
      );
      await disposeAudioFile(file);
    } catch (error) {
      const stopped = controller.signal.aborted;
      const safeError = safeTaskError(error);
      updateThread(currentThread.id, (thread) => ({
        ...thread,
        messages: thread.messages.map((message) =>
          message.id === activityId
            ? {
                ...message,
                content: stopped
                  ? t(
                      "Voice transcription stopped by you.",
                      "آپ نے آواز کا transcription روک دیا۔",
                    )
                  : `${t("Voice transcription failed", "آواز کا transcript نہیں بن سکا")}: ${safeError}`,
                activityStatus: stopped ? "stopped" : "failed",
              }
            : message,
        ),
      }));
      setShowError(safeError);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setIsTranscribing(false);
    }
  }

  async function toggleVoiceRecording() {
    if (isSending || isTranscribing) return;
    try {
      if (isRecording) {
        await audioRecorder.stop();
        setIsRecording(false);
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });
        if (!audioRecorder.uri)
          throw new Error(
            "The recording did not produce an audio file. Please try again.",
          );
        const uri = audioRecorder.uri;
        const name = uri.split("/").pop() || `raabta-voice-${Date.now()}.m4a`;
        await transcribeAudioFile({
          uri,
          name,
          mimeType: name.toLowerCase().endsWith(".3gp")
            ? "audio/3gpp"
            : "audio/mp4",
        });
        return;
      }
      if (
        !providerConnected ||
        !preferences.transcriptionModelId ||
        !hasKey
      ) {
        setShowError(
          t(
            "Connect AI provider and choose a transcription model in Settings before recording.",
            "ریکارڈنگ سے پہلے Settings میں AI provider جوڑیں اور transcription model منتخب کریں۔",
          ),
        );
        setPanel("settings");
        return;
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setShowError(
          "Microphone access was not granted. Allow it in Android settings if you want to record a voice message.",
        );
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setShowError("");
      setIsRecording(true);
    } catch (error) {
      setIsRecording(false);
      setShowError(safeTaskError(error));
    }
  }

  async function chooseAudioFile() {
    try {
      const file = await pickAudioFile();
      if (file) await transcribeAudioFile(file);
    } catch (error) {
      setShowError(safeTaskError(error));
    }
  }

  async function connectProvider() {
    if (isTestingConnection) return;
    const providerBaseUrl = (
      providerBaseUrlDraft.trim() ||
      preferences.providerBaseUrl ||
      DEFAULT_PROVIDER_BASE_URL
    ).replace(/\/$/, "");
    let candidateKey = keyDraft.trim();
    if (
      !candidateKey &&
      preferences.providerConnected &&
      sameProviderEndpoint(preferences.providerKeyBaseUrl, providerBaseUrl)
    ) {
      try {
        candidateKey = (await readApiKey()) ?? "";
      } catch {
        setSettingsNotice(
            "Could not read the saved key securely. Try again or paste a new provider key.",
        );
        return;
      }
    }
    if (!candidateKey) {
      setSettingsNotice(
        t(
          "Paste the API key for this endpoint. The saved key belongs to a different endpoint and was not sent.",
          "اس endpoint کی API key درج کریں۔ محفوظ key کسی دوسرے endpoint سے منسلک ہے، اس لیے اسے نہیں بھیجا گیا۔",
        ),
      );
      return;
    }

    setIsTestingConnection(true);
    setSettingsNotice("");
    try {
      const catalog = await discoverProviderModels(
        candidateKey,
        undefined,
        providerBaseUrl,
      );
      const selectedChat = catalog.chatModels.find(
        (model) => model.id === preferences.modelId,
      );
      const selectedVoice = catalog.transcriptionModels.find(
        (model) => model.id === preferences.transcriptionModelId,
      );
      const selectedVision =
        classifyVisionModels(catalog.chatModels).find(
          (model) => model.id === preferences.visionModelId,
        ) ?? classifyVisionModels(catalog.chatModels)[0];
      const selectedCoding =
        classifyCodingModels(catalog.chatModels).find(
          (model) => model.id === preferences.codingModelId,
        ) ?? classifyCodingModels(catalog.chatModels)[0];
      // Bind the key to this endpoint only after the model catalog succeeds.
      await writeApiKey(candidateKey);
      setHasKey(true);
      setProviderConnected(true);
      setKeyDraft("");
      setKeyVisible(false);
      setModelCatalog(catalog);
      const nextPreferences = {
        ...preferences,
        providerConnected: true,
        providerKind: catalog.providerKind,
        providerBaseUrl,
        providerKeyBaseUrl: providerBaseUrl,
        modelId: selectedChat?.id ?? "",
        modelName: selectedChat?.name ?? "",
        visionModelId: selectedVision?.id ?? "",
        visionModelName: selectedVision?.name ?? "",
        codingModelId: selectedCoding?.id ?? "",
        codingModelName: selectedCoding?.name ?? "",
        modelSupportsImages:
          catalog.providerKind === "cloudflare-worker" ||
          Boolean(selectedChat?.inputModalities.includes("image")),
        transcriptionModelId:
          selectedVoice?.id ??
          (catalog.transcriptionWarning
            ? preferences.transcriptionModelId
            : ""),
        transcriptionModelName:
          selectedVoice?.name ??
          (catalog.transcriptionWarning
            ? preferences.transcriptionModelName
            : ""),
      };
      setPreferences(nextPreferences);
      await savePreferences(nextPreferences);
      setSettingsNotice(
        `${catalog.chatModels.length} chat models loaded; ${catalog.transcriptionModels.length} transcription models loaded. A catalog entry does not guarantee account access or price.${catalog.transcriptionWarning ? ` ${catalog.transcriptionWarning}` : ""}`,
      );
      if (!nextPreferences.modelId) setModelPickerKind("chat");
    } catch (error) {
      setSettingsNotice(safeTaskError(error));
    } finally {
      setIsTestingConnection(false);
    }
  }

  function refreshModelCatalog() {
    void connectProvider();
  }

  async function selectChatModel(model: ProviderModel) {
    const nextPreferences = {
      ...preferences,
      modelId: model.id,
      modelName: model.name,
      modelSupportsImages: model.inputModalities.includes("image"),
    };
    setPreferences(nextPreferences);
    setModelPickerKind(null);
    try {
      await savePreferences(nextPreferences);
    } catch {
      setSettingsNotice("The selected model could not be saved locally.");
    }
  }

  async function selectTranscriptionModel(model: ProviderModel) {
    const nextPreferences = {
      ...preferences,
      transcriptionModelId: model.id,
      transcriptionModelName: model.name,
    };
    setPreferences(nextPreferences);
    setModelPickerKind(null);
    try {
      await savePreferences(nextPreferences);
    } catch {
      setSettingsNotice(
        "The selected transcription model could not be saved locally.",
      );
    }
  }

  async function connectGitHub(token: string): Promise<boolean> {
    if (isConnectingGitHub) return false;
    setIsConnectingGitHub(true);
    setAccountsNotice("");
    try {
      const profile = await fetchGitHubProfile(token);
      const repositories = await listGitHubRepositories(token);
      await writeGitHubToken(token);
      const nextPreferences = {
        ...preferences,
        githubLogin: profile.login,
        githubAvatarUrl: profile.avatarUrl,
        githubRepositories: JSON.stringify(repositories),
      };
      try {
        await savePreferences(nextPreferences);
      } catch {
        await deleteGitHubToken();
        throw new Error(
          "The profile could not be saved locally; the token was not kept.",
        );
      }
      setPreferences(nextPreferences);
      setGithubProfile(profile);
      setGithubRepositories(repositories);
      setAccountsNotice(
        `Connected as @${profile.login}. ${repositories.length} repositories are visible to this token. Repository actions depend on the token permissions and ask before creating or changing GitHub content.`,
      );
      return true;
    } catch (error) {
      setAccountsNotice(safeTaskError(error));
      return false;
    } finally {
      setIsConnectingGitHub(false);
    }
  }

  async function disconnectGitHub() {
    try {
      await deleteGitHubToken();
      const nextPreferences = {
        ...preferences,
        githubLogin: "",
        githubAvatarUrl: "",
        githubRepositories: "",
      };
      setPreferences(nextPreferences);
      setGithubProfile(null);
      setGithubRepositories([]);
      await savePreferences(nextPreferences);
      setAccountsNotice(
        "GitHub token removed from this device. Revoke the token at GitHub separately if you no longer need it.",
      );
    } catch {
      setAccountsNotice(
        "Could not remove the GitHub token from secure storage. Please try again.",
      );
    }
  }

  async function chooseLanguage(language: "ur" | "en") {
    const nextPreferences = { ...preferences, language };
    setPreferences(nextPreferences);
    try {
      await savePreferences(nextPreferences);
    } catch {
      setSettingsNotice(
        t(
          "Language could not be saved locally.",
          "زبان کی ترجیح محفوظ نہیں ہو سکی۔",
        ),
      );
    }
  }

  async function removeConnectionKey() {
    try {
      await deleteApiKey();
      setHasKey(false);
      setProviderConnected(false);
      setModelCatalog(null);
      setKeyDraft("");
      setKeyVisible(false);
      const nextPreferences = {
        ...preferences,
        providerConnected: false,
        providerKind: "generic" as const,
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
      };
      setPreferences(nextPreferences);
      await savePreferences(nextPreferences);
      setSettingsNotice("Saved API key removed from secure storage.");
    } catch {
      setSettingsNotice(
        "The saved API key could not be removed. Please try again.",
      );
    }
  }

  function openSettings() {
    setKeyVisible(false);
    setSettingsNotice("");
    setPanel("settings");
  }

  const openThread = (id: string) => {
    setActiveThreadId(id);
    setPanel("chat");
    setShowError("");
    setDraft("");
    setPendingAttachments([]);
  };

  const navItems: { id: Panel; icon: IconName; label: string }[] = [
    {
      id: "chat",
      icon: "chatbubble-ellipses-outline",
      label: t("Chat", "چیٹ"),
    },
    { id: "history", icon: "time-outline", label: t("History", "تاریخ") },
    { id: "roadmap", icon: "map-outline", label: t("Roadmap", "مراحل") },
    {
      id: "settings",
      icon: "settings-outline",
      label: t("Settings", "ترتیبات"),
    },
  ];

  return (
    <SafeAreaView
      style={[
        styles.safe,
        isUrdu && Platform.OS !== "web" ? { direction: "rtl" } : undefined,
      ]}
      edges={["top", "left", "right"]}
    >
      {panel === "chat" && (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <View style={styles.topBar}>
            <Brand lockup language={preferences.language} />
            <View style={styles.topActions}>
              <IconButton
                icon="add"
                label={t("Start a new chat", "نئی گفتگو")}
                onPress={startNewChat}
              />
              <IconButton
                icon="time-outline"
                label={t("Chat history", "گفتگوؤں کی فہرست")}
                onPress={() => setPanel("history")}
              />
              <IconButton
                icon="settings-outline"
                label={t("Settings", "ترتیبات")}
                onPress={openSettings}
              />
            </View>
          </View>

          <View style={styles.conversationMeta}>
            <View style={styles.localBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.localBadgeText}>
                {t("LOCAL HISTORY", "صرف فون پر محفوظ")}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("Choose chat model", "چیٹ ماڈل منتخب کریں")}
              onPress={() => {
                if (!providerConnected) {
                  openSettings();
                  return;
                }
                setModelPickerKind("chat");
                if (!modelCatalog) void connectProvider();
              }}
              style={styles.modelBadge}
            >
              <Ionicons name="sparkles" size={12} color={C.teal} />
              <Text numberOfLines={1} style={styles.modelBadgeText}>
                {preferences.modelName || t("Model", "ماڈل")}
              </Text>
            </Pressable>
            <Text numberOfLines={1} style={styles.threadTitle}>
              {activeThread?.title && activeThread.title !== "New conversation"
                ? activeThread.title
                : t("New conversation", "نئی گفتگو")}
            </Text>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={[
              styles.messageList,
              activeThread?.messages.length
                ? styles.messageListWithContent
                : styles.messageListEmpty,
            ]}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() =>
              scrollRef.current?.scrollToEnd({ animated: true })
            }
          >
            {!isReady ? (
              <View style={styles.loadingHistory}>
                <ActivityIndicator color={C.teal} />
                <Text style={styles.mutedText}>
                  {t(
                    "Opening this device's conversations…",
                    "فون میں محفوظ گفتگوئیں کھولی جا رہی ہیں…",
                  )}
                </Text>
              </View>
            ) : activeThread?.messages.length ? (
              activeThread.messages.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  language={preferences.language}
                />
              ))
            ) : (
              <View style={styles.emptyWelcome}>
                <View style={styles.welcomeMark}>
                  <RaabtaGlyph size={28} color={C.white} />
                </View>
                <Text
                  style={[
                    styles.welcomeEyebrow,
                    {
                      writingDirection:
                        preferences.language === "ur" ? "rtl" : "ltr",
                    },
                  ]}
                >
                  {t(
                    "Your conversations, your way.",
                    "آپ کی گفتگو، آپ کے اختیار میں",
                  )}
                </Text>
                <Text style={styles.welcomeTitle}>
                  {t(
                    "A quieter place to think.",
                    "سوچنے اور بات کرنے کی پُرسکون جگہ۔",
                  )}
                </Text>
                <Text style={styles.welcomeCopy}>
                  {t(
          "Connect an AI provider, choose a model by name, and keep your conversation history on this device.",
          "ایک AI provider جوڑیں، نام سے model منتخب کریں، اور اپنی گفتگو اسی فون پر محفوظ رکھیں۔",
                  )}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={openSettings}
                  style={styles.setupCallout}
                >
                  <View style={styles.setupIcon}>
                    <Ionicons name="key-outline" size={17} color={C.teal} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.setupTitle}>
                      {providerConnected && preferences.modelId
                        ? t("Connection ready", "کنکشن تیار ہے")
                        : t("Connect your model", "اپنا ماڈل جوڑیں")}
                    </Text>
                    <Text style={styles.setupSubtitle}>
                      {providerConnected && preferences.modelId
                        ? t(
                            "Tap to change the model or review your connection",
                            "ماڈل بدلنے یا کنکشن دیکھنے کے لیے کھولیں",
                          )
                        : t(
                            "Your API key is never built into the app",
                            "آپ کی API key ایپ میں پہلے سے شامل نہیں",
                          )}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.muted} />
                </Pressable>
              </View>
            )}
            {(isSending || isTranscribing) && (
              <View style={styles.thinkingRow}>
                <ActivityIndicator color={C.teal} size="small" />
                <Text style={styles.thinkingText}>
                  {isTranscribing
                    ? t(
                        "Transcribing your voice…",
                        "آواز کا متن بنایا جا رہا ہے…",
                      )
                    : t(
                        "Working on your task…",
                        "آپ کے کام پر کارروائی جاری ہے…",
                      )}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => controllerRef.current?.abort()}
                  style={styles.stopButton}
                >
                  <Ionicons name="stop" size={13} color={C.danger} />
                  <Text style={styles.stopText}>{t("Stop", "روکیں")}</Text>
                </Pressable>
              </View>
            )}
            {!!showError && (
              <View style={styles.errorCard}>
                <Ionicons
                  name="alert-circle-outline"
                  size={19}
                  color={C.danger}
                />
                <Text style={styles.errorText}>{showError}</Text>
                <Pressable accessibilityRole="button" onPress={openSettings}>
                  <Text style={styles.errorAction}>
                    {t("Settings", "ترتیبات")}
                  </Text>
                </Pressable>
              </View>
            )}
          </ScrollView>

          {pendingAttachments.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.attachmentTray}
              keyboardShouldPersistTaps="handled"
            >
              {pendingAttachments.map((attachment) => (
                <View key={attachment.id} style={styles.pendingAttachment}>
                  <Ionicons
                    name={
                      attachment.kind === "image"
                        ? "image-outline"
                        : "document-text-outline"
                    }
                    size={14}
                    color={C.teal}
                  />
                  <Text numberOfLines={1} style={styles.pendingAttachmentText}>
                    {attachment.name}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${attachment.name}`}
                    hitSlop={6}
                    onPress={() =>
                      setPendingAttachments((current) =>
                        current.filter((item) => item.id !== attachment.id),
                      )
                    }
                  >
                    <Ionicons name="close-circle" size={16} color={C.muted} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.composerWrap}>
            <View style={styles.composer}>
              <View style={styles.composerInputRow}>
                <TextInput
                  accessibilityLabel="Message your AI model"
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={t("Message Raabta…", "پیغام لکھیں…")}
                  placeholderTextColor="#909995"
                  multiline
                  maxLength={12000}
                  style={[styles.composerInput, styles.autoDirection]}
                  textAlignVertical="top"
                  returnKeyType="default"
                  editable={isReady && !isSending && !isTranscribing}
                />
              </View>
              <View style={styles.composerActions}>
                <ComposerIconButton
                  icon="add"
                  label={t(
                    "Add an image, file or audio",
                    "تصویر، فائل یا آڈیو شامل کریں",
                  )}
                  onPress={() => setAttachmentMenuVisible(true)}
                  disabled={
                    !isReady || isSending || isTranscribing || isRecording
                  }
                />
                <ComposerIconButton
                  icon="logo-github"
                  label={t("Connected accounts", "منسلک اکاؤنٹس")}
                  onPress={() => {
                    setAccountsNotice("");
                    setAccountsVisible(true);
                  }}
                  active={Boolean(githubProfile)}
                />
                <ComposerIconButton
                  icon="laptop-outline"
                  label={t("Web research and links", "ویب تحقیق اور لنکس")}
                  onPress={() => {
                    setShowError("");
                    setPanel("research");
                  }}
                  disabled={!isReady || isSending || isTranscribing}
                />
                <ComposerIconButton
                  icon={isRecording ? "stop-circle-outline" : "mic-outline"}
                  label={
                    isRecording
                      ? t("Stop recording", "ریکارڈنگ روکیں")
                      : t("Record voice", "آواز ریکارڈ کریں")
                  }
                  onPress={() => void toggleVoiceRecording()}
                  active={isRecording}
                  disabled={!isReady || isSending || isTranscribing}
                />
                <View style={styles.composerActionsSpacer} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isSending || isTranscribing
                      ? t("Stop current task", "موجودہ کام روکیں")
                      : t("Send message", "پیغام بھیجیں")
                  }
                  onPress={
                    isSending || isTranscribing
                      ? () => controllerRef.current?.abort()
                      : sendMessage
                  }
                  disabled={
                    !(isSending || isTranscribing) &&
                    ((!draft.trim() && !pendingAttachments.length) || !isReady)
                  }
                  style={({ pressed }) => [
                    styles.sendButton,
                    !(isSending || isTranscribing) &&
                      ((!draft.trim() && !pendingAttachments.length) ||
                        !isReady) &&
                      styles.sendButtonDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {isSending || isTranscribing ? (
                    <Ionicons name="stop" size={17} color={C.white} />
                  ) : (
                    <Ionicons name="arrow-up" size={20} color={C.white} />
                  )}
                </Pressable>
              </View>
            </View>
            <Text style={styles.privacyFootnote}>
              {t(
                "Prompts go to your chosen provider · chats stay on this device",
                "سوال آپ کے منتخب AI کو بھیجا جائے گا · گفتگو اسی فون پر محفوظ",
              )}
            </Text>
          </View>
        </KeyboardAvoidingView>
      )}

      {panel === "history" && (
        <PanelShell
          title={t("Your conversations", "آپ کی گفتگوئیں")}
          subtitle={t("Saved on this device only", "صرف اس فون پر محفوظ")}
          icon="time-outline"
          onBack={() => setPanel("chat")}
          action={
            <IconButton
              icon="add"
              label={t("Start a new chat", "نئی گفتگو")}
              onPress={startNewChat}
            />
          }
        >
          {historyNotice ? <Notice text={historyNotice} danger /> : null}
          {threads.length ? (
            [...threads]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((thread) => (
                <Pressable
                  accessibilityRole="button"
                  key={thread.id}
                  onPress={() => openThread(thread.id)}
                  style={({ pressed }) => [
                    styles.historyItem,
                    thread.id === activeThreadId && styles.historyItemActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.historyIcon}>
                    <Ionicons
                      name="chatbubble-outline"
                      size={18}
                      color={C.teal}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={styles.historyTitle}>
                      {thread.title}
                    </Text>
                    <Text style={styles.historyMeta}>
                      {formatDate(thread.updatedAt)} ·{" "}
                      {
                        thread.messages.filter(
                          (message) => message.role !== "activity",
                        ).length
                      }{" "}
                      messages
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color="#A4ACA8" />
                </Pressable>
              ))
          ) : (
            <EmptyPanel
              icon="chatbubbles-outline"
              title={t(
                "No saved conversations yet",
                "ابھی کوئی گفتگو محفوظ نہیں",
              )}
              copy={t(
                "Start a chat and it will appear here on this device.",
                "نئی گفتگو شروع کریں؛ وہ اسی فون پر یہاں نظر آئے گی۔",
              )}
            />
          )}
          <PrivacyNote compact language={preferences.language} />
        </PanelShell>
      )}

      {panel === "roadmap" && (
        <PanelShell
          title={t("Built step by step", "مرحلہ وار تعمیر")}
          subtitle={t(
            "Raabta grows with your permission",
            "رابطہ آپ کی اجازت کے مطابق آگے بڑھے گی",
          )}
          icon="map-outline"
          onBack={() => setPanel("chat")}
          action={
            <IconButton
              icon="globe-outline"
              label={t(
                "Open research and media tools",
                "تحقیق اور میڈیا کے اوزار کھولیں",
              )}
              onPress={() => setPanel("research")}
            />
          }
        >
          <View style={styles.roadmapIntro}>
            <Text style={styles.roadmapEyebrow}>OUR ROADMAP</Text>
            <Text style={styles.roadmapHeading}>
              One thoughtful step at a time.
            </Text>
            <Text style={styles.roadmapCopy}>
              {t(
                "Chat, selected research/media tools and bounded assistant tasks are available now. Connected accounts and autonomous agent actions remain future stages.",
                "چیٹ، منتخب تحقیق/میڈیا اوزار اور محدود assistant tasks ابھی دستیاب ہیں۔ اکاؤنٹ کنکشن اور خودکار agent actions آئندہ مراحل میں ہیں۔",
              )}
            </Text>
          </View>
          <RoadmapCard
            number="01"
            title={t("AI chat", "AI چیٹ")}
            status={t("ACTIVE", "فعال")}
            active
            language={preferences.language}
            icon="chatbubble-ellipses-outline"
            items={[
              t("Your endpoint, model and key", "آپ کا endpoint، ماڈل اور key"),
              t("Device-only conversation history", "گفتگو صرف فون پر محفوظ"),
              t(
                "Real answers from your chosen provider",
                "آپ کے منتخب provider سے حقیقی جواب",
              ),
            ]}
          />
          <RoadmapCard
            number="02"
            title={t("Research & media", "تحقیق اور میڈیا")}
            status={t("AVAILABLE", "دستیاب")}
            active
            language={preferences.language}
            icon="globe-outline"
            items={[
              t(
                "Search the public web and keep visible source links",
                "عوامی ویب تلاش کریں اور اصل source links دیکھیں",
              ),
              t(
                "Read public HTML, text and JSON pages via HTTPS",
                "HTTPS سے HTML، text اور JSON صفحے پڑھیں",
              ),
              t(
                "Ask about selected images with a compatible vision model",
                "منتخب تصویر سے vision model کے ذریعے سوال کریں",
              ),
              t(
                "Record/import voice and transcribe with an optional endpoint",
                "آواز ریکارڈ/منتخب کر کے optional endpoint سے transcript بنائیں",
              ),
            ]}
          />
          <RoadmapCard
            number="03"
            title={t("Assistant", "معاون")}
            status={t("LIMITED · AVAILABLE", "محدود دستیاب")}
            active
            language={preferences.language}
            icon="sparkles-outline"
            items={[
              t(
                "Guided web research → sources → your model's response",
                "رہنمائی میں web research → sources → آپ کے model کا جواب",
              ),
              t(
                "Each retrieval, preparation, dispatch and result appears in chat",
                "ہر retrieval، تیاری، dispatch اور نتیجہ chat میں دکھائی دیتا ہے",
              ),
              t(
                "Stop in-flight work; review transcripts before sending",
                "جاری کام روکیں؛ transcript دیکھ کر پھر بھیجیں",
              ),
            ]}
          />
          <RoadmapCard
            number="04"
            title={t("Permissioned agent", "اجازت والا ایجنٹ")}
            status={t("PLANNED", "منصوبہ بند")}
            language={preferences.language}
            icon="git-network-outline"
            items={[
              t(
                "Connect accounts such as GitHub or YouTube",
                "GitHub یا YouTube جیسے اکاؤنٹس جوڑیں",
              ),
              t(
                "Tools and MCP with permissions you control",
                "اپنی اجازت کے تحت tools اور MCP",
              ),
              t(
                "No account action without your approval",
                "آپ کی منظوری کے بغیر کوئی account action نہیں",
              ),
            ]}
          />
          <PrivacyNote language={preferences.language} />
        </PanelShell>
      )}

      {panel === "research" && (
        <PanelShell
          title={t("Research & media", "تحقیق اور میڈیا")}
          subtitle={t(
            "Public sources · chosen model · visible actions",
            "عوامی ذرائع · منتخب model · واضح actions",
          )}
          icon="globe-outline"
          onBack={() => setPanel("chat")}
        >
          <View style={styles.roadmapIntro}>
            <Text style={styles.roadmapEyebrow}>
              {t("STAGE 02 · AVAILABLE", "مرحلہ 02 · دستیاب")}
            </Text>
            <Text style={styles.roadmapHeading}>
              {t(
                "Bring the web into the conversation.",
                "انٹرنیٹ سے متعلقہ معلومات گفتگو میں لائیں۔",
              )}
            </Text>
            <Text style={styles.roadmapCopy}>
              {t(
                "Raabta retrieves public material, shows its sources in the chat, then sends the excerpts and your question to your configured model.",
                "رابطہ عوامی معلومات اور اصل sources دکھاتا ہے، پھر منتخب model کو اقتباسات اور آپ کا سوال بھیجتا ہے۔",
              )}
            </Text>
          </View>

          <View style={styles.researchCard}>
            <FieldLabel
              title={t("Research the web", "ویب پر تحقیق")}
              subtitle={t(
                "DuckDuckGo public search · up to 6 source links",
                "DuckDuckGo عوامی تلاش · زیادہ سے زیادہ 6 اصل links",
              )}
            />
            <TextInput
              accessibilityLabel="Web research question"
              value={searchDraft}
              onChangeText={setSearchDraft}
              placeholder={t(
                "What would you like to research?",
                "آپ کس موضوع پر تحقیق چاہتے ہیں؟",
              )}
              placeholderTextColor="#9AA29E"
              style={[styles.fieldInput, styles.autoDirection]}
              multiline
              maxLength={300}
              editable={!isSending && !isTranscribing}
            />
            <Pressable
              accessibilityRole="button"
              onPress={startWebResearch}
              disabled={isSending || isTranscribing || !searchDraft.trim()}
              style={({ pressed }) => [
                styles.primaryButton,
                (isSending || isTranscribing || !searchDraft.trim()) &&
                  styles.primaryButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="search-outline" size={18} color={C.white} />
              <Text style={styles.primaryButtonText}>
                {t("Search & ask my AI", "تلاش کریں اور AI سے پوچھیں")}
              </Text>
            </Pressable>
          </View>

          <View style={styles.researchCard}>
            <FieldLabel
              title={t(
                "Download and read a public page",
                "عوامی ویب صفحہ ڈاؤن لوڈ اور پڑھیں",
              )}
              subtitle={t(
                "HTTPS HTML, text or JSON · readable excerpt saved on this device",
                "HTTPS HTML، text یا JSON · پڑھا گیا متن اسی فون میں محفوظ",
              )}
            />
            <TextInput
              accessibilityLabel="Public webpage URL to read"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={pageUrlDraft}
              onChangeText={setPageUrlDraft}
              placeholder="https://example.com/article"
              placeholderTextColor="#9AA29E"
              style={[styles.fieldInput, styles.autoDirection]}
              editable={!isSending && !isTranscribing}
            />
            <Pressable
              accessibilityRole="button"
              onPress={startPageRead}
              disabled={isSending || isTranscribing || !pageUrlDraft.trim()}
              style={({ pressed }) => [
                styles.primaryButton,
                (isSending || isTranscribing || !pageUrlDraft.trim()) &&
                  styles.primaryButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="download-outline" size={18} color={C.white} />
              <Text style={styles.primaryButtonText}>
                {t(
                  "Download, read & ask my AI",
                  "ڈاؤن لوڈ، مطالعہ اور AI سے سوال",
                )}
              </Text>
            </Pressable>
          </View>

          {showError ? <Notice text={showError} danger /> : null}
          <Notice
            text={t(
              "The search query goes to DuckDuckGo. Retrieved excerpts, image/document text and your question are sent to the AI endpoint you chose only when you run the task. Login-required websites, PDF/binary URL extraction and private account connectors are not included in this release.",
              "تلاش کا سوال DuckDuckGo کو جاتا ہے۔ منتخب task چلانے پر ہی excerpts، image/document text اور آپ کا سوال آپ کے AI endpoint کو بھیجے جاتے ہیں۔ Login-required ویب سائٹس، PDF/binary پڑھنا اور private account connections اس ورژن میں شامل نہیں۔",
            )}
          />
        </PanelShell>
      )}

      {panel === "settings" && (
        <PanelShell
          title={t("Connection settings", "کنکشن کی ترتیبات")}
          subtitle={t(
            "Your model. Your key. Your choice.",
            "آپ کا model، آپ کی key، آپ کا اختیار۔",
          )}
          icon="settings-outline"
          onBack={() => {
            setPanel("chat");
            setKeyVisible(false);
          }}
        >
          <View style={styles.languageCard}>
            <View style={styles.languageCopy}>
              <Text style={styles.languageTitle}>
                {t("App language", "ایپ کی زبان")}
              </Text>
              <Text style={styles.languageSubtitle}>
                {t("Choose English or Urdu", "English یا اردو منتخب کریں")}
              </Text>
            </View>
            <View style={styles.languageButtons}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isUrdu }}
                onPress={() => void chooseLanguage("ur")}
                style={[
                  styles.languageButton,
                  isUrdu && styles.languageButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.languageButtonText,
                    isUrdu && styles.languageButtonTextActive,
                  ]}
                >
                  اردو
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: !isUrdu }}
                onPress={() => void chooseLanguage("en")}
                style={[
                  styles.languageButton,
                  !isUrdu && styles.languageButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.languageButtonText,
                    !isUrdu && styles.languageButtonTextActive,
                  ]}
                >
                  English
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.settingsIntro}>
            <View style={styles.settingsShield}>
              <Ionicons name="sparkles" size={21} color={C.teal} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.settingsIntroTitle}>AI provider</Text>
              <Text style={styles.settingsIntroCopy}>
                {t(
                  "Enter an API key and an OpenAI-compatible /v1 base URL. Raabta loads the catalog; you select a model.",
                  "API key اور OpenAI-compatible /v1 base URL درج کریں۔ رابطہ فہرست لوڈ کرے گا اور آپ ماڈل منتخب کریں گے۔",
                )}
              </Text>
            </View>
          </View>

          <FieldLabel
            title={t("Provider API key", "Provider API key")}
            subtitle={t(
              "Stored separately from chats. Connect loads /models but does not send a test prompt.",
              "یہ chats سے الگ محفوظ ہوتی ہے۔ Connect صرف /models لوڈ کرتا ہے، آزمائشی پیغام نہیں بھیجتا۔",
            )}
          />
          <FieldLabel
            title={t("Provider API base URL", "Provider API base URL")}
            subtitle={t(
              "AI provider is the default. Use an HTTPS OpenAI-compatible /v1 base URL; the key stays bound to that endpoint.",
              "AI provider پہلے سے منتخب ہے۔ HTTPS OpenAI-compatible /v1 base URL دیں؛ key اسی endpoint سے منسلک رہتی ہے۔",
            )}
          />
          <TextInput
            accessibilityLabel="Provider API base URL"
            autoCapitalize="none"
            autoCorrect={false}
            value={providerBaseUrlDraft}
            onChangeText={setProviderBaseUrlDraft}
            placeholder="https://your-provider.example/v1"
            placeholderTextColor="#9AA29E"
            style={[styles.fieldInput, styles.autoDirection]}
          />
          <Notice
            text={t(
              "AI workspace files stay in Raabta's private app storage (100 MB total; 10 MB per file). The agent cannot access your other phone files or run arbitrary terminal commands.",
              "AI workspace کی فائلیں Raabta کی نجی app storage میں رہتی ہیں (کل 100 MB؛ فی فائل 10 MB)۔ ایجنٹ دوسری فون فائلیں نہیں پڑھ سکتا اور خود سے terminal commands نہیں چلا سکتا۔",
            )}
          />
          <View style={styles.keyInputWrap}>
            <TextInput
              accessibilityLabel="Provider API key"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!keyVisible}
              value={keyDraft}
              onChangeText={setKeyDraft}
              placeholder={
                hasKey
                  ? isProviderDraftConnected
                    ? t(
                        "Key stored securely · paste only to replace",
                        "key محفوظ ہے · بدلنے کے لیے نئی key درج کریں",
                      )
                    : t(
                        "Enter the key for this provider; the saved key will not be sent",
                        "اس provider کی key درج کریں؛ محفوظ key یہاں نہیں بھیجی جائے گی",
                      )
                  : t(
                      "Paste your provider API key",
                      "اپنے provider کی API key درج کریں",
                    )
              }
              placeholderTextColor="#9AA29E"
              style={[styles.fieldInput, styles.keyInput, styles.autoDirection]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                keyVisible
                  ? t("Hide API key", "API key چھپائیں")
                  : t("Show API key", "API key دکھائیں")
              }
              disabled={!keyDraft}
              onPress={() => setKeyVisible((visible) => !visible)}
              style={styles.keyVisibilityButton}
            >
              <Ionicons
                name={keyVisible ? "eye-off-outline" : "eye-outline"}
                size={19}
                color={keyDraft ? C.teal : C.muted}
              />
            </Pressable>
          </View>
          <View style={styles.keyStatus}>
            <Ionicons
              name={
                isProviderDraftConnected
                  ? "checkmark-circle"
                  : hasKey
                    ? "lock-closed"
                    : "information-circle-outline"
              }
              size={15}
              color={isProviderDraftConnected ? C.teal : C.muted}
            />
            <Text
              style={[
                styles.keyStatusText,
                isProviderDraftConnected && styles.keyStatusReady,
              ]}
            >
              {isProviderDraftConnected
                ? Platform.OS === "web"
                  ? t(
                      "Connected in this browser session",
                      "اس browser session میں منسلک",
                    )
                  : t(
                      "Connected · key stored in Android SecureStore",
                      "منسلک · key Android SecureStore میں محفوظ",
                    )
                : hasKey
                  ? t(
                      "A key is stored; enter this endpoint's key and connect to load models",
                      "ایک key محفوظ ہے؛ اس endpoint کی key درج کرکے ماڈلز لوڈ کریں",
                    )
                  : t(
                      "No provider key connected",
                      "provider کی key منسلک نہیں",
                    )}
            </Text>
            {hasKey ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void removeConnectionKey()}
              >
                <Text style={styles.removeKey}>{t("Remove", "حذف کریں")}</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isTestingConnection }}
            disabled={isTestingConnection}
            onPress={() => void connectProvider()}
            style={({ pressed }) => [
              styles.primaryButton,
              isTestingConnection && styles.primaryButtonDisabled,
              pressed && !isTestingConnection && styles.pressed,
            ]}
          >
            {isTestingConnection ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <Ionicons
                name="cloud-download-outline"
                size={18}
                color={C.white}
              />
            )}
            <Text style={styles.primaryButtonText}>
              {isTestingConnection
                ? t("Loading available models…", "ماڈلز لوڈ ہو رہے ہیں…")
                : t("Connect & load models", "منسلک کریں اور ماڈلز لوڈ کریں")}
            </Text>
          </Pressable>
          <FieldLabel
            title={t("Chat model", "چیٹ ماڈل")}
            subtitle={t(
              "Choose a model by its name from the connected catalog.",
              "منسلک فہرست سے نام کے ذریعے ماڈل منتخب کریں۔",
            )}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (!isProviderDraftConnected) {
                setSettingsNotice(
                  t(
                    "Connect your AI provider before browsing models.",
                    "ماڈلز دیکھنے سے پہلے اپنا AI provider جوڑیں۔",
                  ),
                );
                return;
              }
              setModelPickerKind("chat");
              if (!modelCatalog) void connectProvider();
            }}
            style={[
              styles.researchCard,
              { flexDirection: "row", alignItems: "center" },
            ]}
          >
            <View style={styles.setupIcon}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={17}
                color={C.teal}
              />
            </View>
            <View style={styles.flex}>
              <Text style={styles.setupTitle}>
                {preferences.modelName ||
                  t("Choose a chat model", "چیٹ ماڈل منتخب کریں")}
              </Text>
              <Text style={styles.setupSubtitle}>
                {preferences.modelId
                  ? t(
                      "Selected from the loaded catalog",
                      "لوڈ کی گئی فہرست سے منتخب",
                    )
                  : t(
                      "Tap to browse and choose by name",
                      "نام سے ماڈل دیکھنے اور منتخب کرنے کے لیے دبائیں",
                    )}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={C.muted} />
          </Pressable>
          {preferences.modelId ? (
            <Text style={styles.fieldSubtitle}>
              {preferences.modelSupportsImages
                ? t(
                    "Image input listed · can send selected photos",
                    "Image input دستیاب · تصاویر بھیج سکتے ہیں",
                  )
                : t(
                    "Text chat model · choose an image-capable model to ask about photos",
                    "Text model · تصاویر کے لیے image-capable model منتخب کریں",
                  )}
            </Text>
          ) : null}
          {preferences.modelId ? (
            <View style={styles.routingCard}>
              <View style={styles.routingHeader}>
                <Ionicons name="git-network-outline" size={16} color={C.teal} />
                <Text style={styles.routingTitle}>
                  {t("Automatic task routing", "خودکار task routing")}
                </Text>
              </View>
              <Text style={styles.routingLine}>
                {t("Text: ", "Text: ")}{preferences.modelName || preferences.modelId}
              </Text>
              <Text style={styles.routingLine}>
                {t("Vision: ", "Vision: ")}
                {preferences.visionModelName || t("Not reported by provider", "provider نے نہیں بتایا")}
              </Text>
              <Text style={styles.routingLine}>
                {t("Coding: ", "Coding: ")}
                {preferences.codingModelName || t("Text model fallback", "text model fallback")}
              </Text>
              <Text style={styles.routingLine}>
                {t("Voice: ", "Voice: ")}
                {preferences.transcriptionModelName || t("Not available", "دستیاب نہیں")}
              </Text>
            </View>
          ) : null}

          <FieldLabel
            title={t("Voice transcription · optional", "آواز کا متن · اختیاری")}
            subtitle={t(
              "Uses the same AI provider key, with a model listed for transcription.",
              "اسی AI provider key سے transcription کے لیے درج ماڈل استعمال ہوتا ہے۔",
            )}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (
                !isProviderDraftConnected ||
                !sameProviderEndpoint(preferences.providerKeyBaseUrl, preferences.providerBaseUrl)
              ) {
                setSettingsNotice(
                  t(
                    "Voice transcription currently requires a connected AI provider endpoint and its matching key.",
                    "آواز کی transcription کے لیے AI provider endpoint اور اسی سے منسلک key درکار ہے۔",
                  ),
                );
                return;
              }
              setModelPickerKind("transcription");
              if (!modelCatalog) void connectProvider();
            }}
            style={[
              styles.researchCard,
              { flexDirection: "row", alignItems: "center" },
            ]}
          >
            <View style={styles.setupIcon}>
              <Ionicons name="mic-outline" size={17} color={C.teal} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.setupTitle}>
                {preferences.transcriptionModelName ||
                  t(
                    "Choose a transcription model",
                    "آواز کے متن کا ماڈل منتخب کریں",
                  )}
              </Text>
              <Text style={styles.setupSubtitle}>
                {preferences.transcriptionModelId
                  ? t(
                      "Selected from the transcription catalog",
                      "transcription فہرست سے منتخب",
                    )
                  : t(
                      "Voice stays optional until selected",
                      "ماڈل منتخب ہونے تک آواز بند رہے گی",
                    )}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={C.muted} />
          </Pressable>
          {modelCatalog?.transcriptionWarning ? (
            <Notice text={modelCatalog.transcriptionWarning} />
          ) : null}
          {settingsNotice ? <Notice text={settingsNotice} /> : null}
          <Text style={styles.testConnectionNote}>
            {t(
              "A catalog entry does not guarantee account access. Sending a chat, image or recording may incur provider charges; loading models sends no inference.",
              "فہرست میں ماڈل آنے سے account access کی ضمانت نہیں۔ پیغام، تصویر یا ریکارڈنگ بھیجنے پر provider فیس لے سکتا ہے؛ ماڈلز لوڈ کرنے پر inference نہیں بھیجا جاتا۔",
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setAccountsNotice("");
              setAccountsVisible(true);
            }}
            style={styles.secondaryButton}
          >
            <Ionicons name="logo-github" size={18} color={C.teal} />
            <Text style={styles.secondaryButtonText}>
              {t("Accounts", "اکاؤنٹس")} ·{" "}
              {githubProfile
                ? `GitHub @${githubProfile.login}`
                : t("connect GitHub", "GitHub جوڑیں")}
            </Text>
            <Ionicons name="chevron-forward" size={15} color={C.muted} />
          </Pressable>

          <View style={styles.divider} />
          <PrivacyNote language={preferences.language} />
        </PanelShell>
      )}

      <View
        style={[
          styles.bottomNav,
          { paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        {navItems.map((item) => {
          const selected = item.id === panel;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={item.id}
              onPress={() => {
                if (item.id === "settings") openSettings();
                else setPanel(item.id);
              }}
              style={styles.navItem}
            >
              <Ionicons
                name={item.icon}
                size={20}
                color={selected ? C.teal : C.muted}
              />
              <Text
                style={[
                  styles.navLabel,
                  styles.autoDirection,
                  selected && styles.navLabelSelected,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <AccountsSheet
        key={accountsVisible ? "open" : "closed"}
        visible={accountsVisible}
        language={preferences.language}
        providerConnected={providerConnected}
        selectedModelName={preferences.modelName}
        githubProfile={githubProfile}
        repositoryCount={githubRepositories.length}
        repositoryNames={githubRepositories.map(
          (repository) => repository.fullName,
        )}
        connecting={isConnectingGitHub}
        status={accountsNotice}
        onClose={() => setAccountsVisible(false)}
        onManageProvider={() => {
          setAccountsVisible(false);
          openSettings();
        }}
        onConnectGitHub={connectGitHub}
        onDisconnectGitHub={() => void disconnectGitHub()}
      />
      <ModelPicker
        key={modelPickerKind ?? "closed"}
        visible={modelPickerKind !== null}
        language={preferences.language}
        kind={modelPickerKind ?? "chat"}
        models={
          modelPickerKind === "transcription"
            ? (modelCatalog?.transcriptionModels ?? [])
            : (modelCatalog?.chatModels ?? [])
        }
        selectedModelId={
          modelPickerKind === "transcription"
            ? preferences.transcriptionModelId
            : preferences.modelId
        }
        loading={isTestingConnection}
        message={
          modelPickerKind === "transcription"
            ? (modelCatalog?.transcriptionWarning ?? "")
            : ""
        }
        onClose={() => setModelPickerKind(null)}
        onRefresh={refreshModelCatalog}
        onSelect={(model) => {
          if (modelPickerKind === "transcription")
            void selectTranscriptionModel(model);
          else void selectChatModel(model);
        }}
      />
      <AttachmentSheet
        visible={attachmentMenuVisible}
        language={preferences.language}
        onClose={() => setAttachmentMenuVisible(false)}
        onPhoto={() => void addImages()}
        onFile={() => void addDocuments()}
        onAudio={() => void chooseAudioFile()}
      />
    </SafeAreaView>
  );
}

function Brand({
  lockup = false,
  language = "ur",
}: {
  lockup?: boolean;
  language?: "ur" | "en";
}) {
  return (
    <View style={styles.brandRow}>
      <View style={styles.brandMark}>
        <RaabtaGlyph size={23} color={C.white} />
      </View>
      {lockup ? (
        <View>
          <Text style={styles.brandName}>raabta</Text>
          <Text style={[styles.brandCaption, styles.autoDirection]}>
            {language === "ur" ? "AI · آپ کے اختیار میں" : "AI · YOUR WAY"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function RaabtaGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path
        d="M17.8 7.1c-1.3-1.4-3.1-2.2-5.1-2.2H10C6.1 4.9 3 8 3 11.9s3.1 7 7 7h5.1"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <Path
        d="M14.2 24.9c1.3 1.4 3.1 2.2 5.1 2.2H22c3.9 0 7-3.1 7-7s-3.1-7-7-7h-5.1"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <Path
        d="m11.1 20.7 9.8-9.4"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={C.ink} />
    </Pressable>
  );
}

function ComposerIconButton({
  icon,
  label,
  onPress,
  active = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const iconColor = active
    ? icon === "logo-github"
      ? C.teal
      : C.danger
    : C.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.composerIconButton,
        active && styles.composerIconButtonActive,
        disabled && styles.composerIconButtonDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={19} color={iconColor} />
    </Pressable>
  );
}

function shouldAutoResearch(text: string): boolean {
  return /\b(latest|current|today|news|research|search|internet|web|online|real[- ]?time|recent|price|weather|قیمت|تازہ|آج|تحقیق|انٹرنیٹ|ویب|خبر)\b/i.test(
    text,
  );
}

function selectTaskModel(
  preferences: ChatPreferences,
  text: string,
  attachments: ChatAttachment[],
): string {
  if (attachments.some((attachment) => attachment.kind === "image") && preferences.visionModelId)
    return preferences.visionModelId;
  if (
    preferences.codingModelId &&
    /\b(code|coding|debug|bug|repository|repo|pull request|branch|function|typescript|javascript|python|api|deploy|build|test)\b|کوڈ|کوڈنگ|بگ|ریپوزٹری|برانچ|ٹیسٹ|ڈپلائے/i.test(
      text,
    )
  )
    return preferences.codingModelId;
  return preferences.modelId;
}

function toolActivityMetadata(
  name: string,
): Pick<ChatMessage, "activityKind" | "activityPlatform"> {
  if (name.startsWith("github_")) {
    const kind: ChatMessage["activityKind"] =
      name.includes("workflow") || name.includes("branch") || name.includes("pull")
        ? "deploy"
        : name.includes("file") || name.includes("issue")
          ? "file"
          : "github";
    return { activityKind: kind, activityPlatform: "GitHub" };
  }
  if (name.startsWith("web_") || name.includes("research"))
    return { activityKind: "research", activityPlatform: "Web research" };
  if (name.startsWith("ai_workspace_"))
    return { activityKind: "workspace", activityPlatform: "Raabta workspace" };
  if (name.includes("test") || name.includes("check") || name.includes("verify"))
    return { activityKind: "verify", activityPlatform: "Engineering checks" };
  return { activityKind: "agent", activityPlatform: "Raabta" };
}

function activityVisual(message: ChatMessage): { icon: IconName; platform: string } {
  switch (message.activityKind) {
    case "research":
      return { icon: "search-outline", platform: "Web research" };
    case "model":
      return { icon: "sparkles-outline", platform: "AI model" };
    case "file":
      return { icon: "document-text-outline", platform: message.activityPlatform ?? "Files" };
    case "github":
      return { icon: "logo-github", platform: "GitHub" };
    case "workspace":
      return { icon: "folder-open-outline", platform: "Raabta workspace" };
    case "verify":
      return { icon: "shield-checkmark-outline", platform: "Verification" };
    case "deploy":
      return { icon: "cloud-upload-outline", platform: message.activityPlatform ?? "Deployment" };
    case "plan":
      return { icon: "git-branch-outline", platform: message.activityPlatform ?? "Agent plan" };
    default:
      return { icon: "construct-outline", platform: message.activityPlatform ?? "Raabta agent" };
  }
}

function LiveActivityIcon({
  icon,
  color,
  status,
}: {
  icon: IconName;
  color: string;
  status: ChatMessage["activityStatus"];
}) {
  const pulse = useMemo(() => new Animated.Value(1), []);
  const rotation = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (status !== "working") {
      pulse.stopAnimation();
      rotation.stopAnimation();
      Animated.spring(pulse, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }).start();
      return;
    }
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 720,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.96,
          duration: 720,
          useNativeDriver: true,
        }),
      ]),
    );
    const rotationLoop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
      }),
    );
    pulseLoop.start();
    rotationLoop.start();
    return () => {
      pulseLoop.stop();
      rotationLoop.stop();
    };
  }, [pulse, rotation, status]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  return (
    <Animated.View
      style={[
        styles.activityIconBadge,
        styles.activityIcon3d,
        { transform: [{ scale: pulse }] },
      ]}
    >
      <View style={[styles.activityIconDepth, { backgroundColor: C.tealPale }]} />
      <Animated.View
        style={[
          styles.activityIconFace,
          { borderColor: color, transform: [{ rotate }] },
        ]}
      >
        <Ionicons name={icon} size={15} color={color} />
      </Animated.View>
    </Animated.View>
  );
}

function LiveActivityRow({ message }: { message: ChatMessage }) {
  const status = message.activityStatus ?? "complete";
  const entrance = useMemo(() => new Animated.Value(0), []);
  const visual = activityVisual(message);
  const iconColor =
    status === "failed" ? C.danger : status === "stopped" ? C.muted : C.teal;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entrance, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();
  }, [entrance]);

  return (
    <Animated.View
      style={[
        styles.activityRow,
        status === "failed" && styles.activityRowFailed,
        status === "stopped" && styles.activityRowStopped,
        {
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 0],
              }),
            },
          ],
        },
      ]}
    >
      <LiveActivityIcon icon={visual.icon} color={iconColor} status={status} />
      <View style={styles.activityBody}>
        <View style={styles.activityPlatformRow}>
          <View style={[styles.activityPlatformDot, { backgroundColor: iconColor }]} />
          <Text style={styles.activityPlatform}>
            {message.activityPlatform ?? visual.platform}
          </Text>
        </View>
        <Text style={[styles.activityText, styles.autoDirection]}>
          {message.content}
        </Text>
      </View>
      <View style={styles.activityStatusIcon}>
        {status === "working" ? (
          <ActivityIndicator size="small" color={C.teal} />
        ) : (
          <Ionicons
            name={
              status === "failed"
                ? "alert-circle-outline"
                : status === "stopped"
                  ? "stop-circle-outline"
                  : "checkmark-circle-outline"
            }
            size={14}
            color={iconColor}
          />
        )}
      </View>
      <Text style={styles.activityTime}>{formatTime(message.createdAt)}</Text>
    </Animated.View>
  );
}

function MessageRow({
  message,
  language,
}: {
  message: ChatMessage;
  language: "ur" | "en";
}) {
  if (message.role === "activity") {
    const status = message.activityStatus ?? "complete";
    if (
      status === "complete" &&
      /^(Preparing the prompt|Sent a request|Response received|Preparing a request|Prepared the prompt|.*سوال اور معاون منسلکات تیار ہیں|.*کو درخواست بھیجی|.*سے جواب موصول ہو گیا)/i.test(
        message.content,
      )
    )
      return null;
    return <LiveActivityRow message={message} />;
  }
  const isUser = message.role === "user";
  return (
    <View
      style={[
        styles.messageRow,
        isUser ? styles.userMessageRow : styles.assistantMessageRow,
      ]}
    >
      {!isUser ? (
        <View style={styles.assistantMark}>
          <Ionicons name="sparkles" size={13} color={C.teal} />
        </View>
      ) : null}
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        {!isUser ? <Text style={styles.assistantLabel}>RAABTA</Text> : null}
        {isUser ? (
          <Text
            selectable
            style={[
              styles.messageText,
              styles.userMessageText,
              { writingDirection: "auto" },
            ]}
          >
            {message.content}
          </Text>
        ) : (
          <EnrichedMarkdownText
            markdown={message.content}
            flavor="github"
            writingDirection="auto"
            selectable
            markdownStyle={assistantMarkdownStyle}
            onLinkPress={({ url }) => {
              if (isHttpsUrl(url))
                void Linking.openURL(url).catch(() => undefined);
            }}
          />
        )}
        {message.attachments?.length ? (
          <View style={styles.messageAttachments}>
            {message.attachments.map((attachment) =>
              attachment.kind === "image" && attachment.uri ? (
                <ImagePreview
                  key={attachment.id}
                  uri={attachment.uri}
                  name={attachment.name}
                  language={language}
                />
              ) : (
                <Pressable
                  key={attachment.id}
                  accessibilityRole={attachment.sourceUrl ? "link" : "text"}
                  accessibilityLabel={
                    attachment.sourceUrl
                      ? `Open source ${attachment.name}`
                      : attachment.name
                  }
                  disabled={!attachment.sourceUrl}
                  onPress={() => {
                    if (
                      attachment.sourceUrl &&
                      isHttpsUrl(attachment.sourceUrl)
                    )
                      void Linking.openURL(attachment.sourceUrl).catch(
                        () => undefined,
                      );
                  }}
                  style={styles.messageAttachmentChip}
                >
                  <Ionicons
                    name={
                      attachment.kind === "research"
                        ? "open-outline"
                        : "document-text-outline"
                    }
                    size={14}
                    color={C.teal}
                  />
                  <Text numberOfLines={2} style={styles.messageAttachmentText}>
                    {attachment.kind === "research" ? "Source · " : "File · "}
                    {attachment.name}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
        ) : null}
        <Text style={[styles.messageTime, isUser && styles.userMessageTime]}>
          {formatTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

function ImagePreview({
  uri,
  name,
  language,
}: {
  uri: string;
  name: string;
  language: "ur" | "en";
}) {
  const [visible, setVisible] = useState(false);
  const isUrdu = language === "ur";
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isUrdu ? `تصویر دیکھیں: ${name}` : `Preview image: ${name}`
        }
        onPress={() => setVisible(true)}
        style={styles.imageThumbButton}
      >
        <Image
          source={{ uri }}
          accessibilityLabel={name}
          resizeMode="cover"
          style={styles.messageImage}
        />
        <View pointerEvents="none" style={styles.thumbnailExpandBadge}>
          <Ionicons name="expand-outline" size={13} color={C.white} />
        </View>
      </Pressable>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.previewModal} accessibilityViewIsModal>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isUrdu ? "تصویر بند کریں" : "Close image preview"
            }
            onPress={() => setVisible(false)}
            style={styles.previewDismissLayer}
          />
          <Image
            source={{ uri }}
            accessibilityLabel={name}
            resizeMode="contain"
            style={styles.previewImage}
          />
          <Text numberOfLines={2} style={styles.previewImageName}>
            {name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isUrdu ? "بند کریں" : "Close"}
            onPress={() => setVisible(false)}
            style={styles.previewCloseButton}
          >
            <Ionicons name="close" size={23} color={C.white} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

function PanelShell({
  title,
  subtitle,
  icon,
  onBack,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  onBack: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.flex}>
      <View style={styles.panelHeader}>
        <IconButton icon="arrow-back" label="Back to chat" onPress={onBack} />
        <View style={styles.panelTitleBlock}>
          <View style={styles.panelTitleLine}>
            <Ionicons name={icon} size={17} color={C.teal} />
            <Text style={[styles.panelTitle, styles.autoDirection]}>
              {title}
            </Text>
          </View>
          <Text style={[styles.panelSubtitle, styles.autoDirection]}>
            {subtitle}
          </Text>
        </View>
        {action ?? <View style={styles.iconButtonPlaceholder} />}
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.panelContent}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

function FieldLabel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.fieldLabelWrap}>
      <Text style={[styles.fieldLabel, styles.autoDirection]}>{title}</Text>
      <Text style={[styles.fieldSubtitle, styles.autoDirection]}>
        {subtitle}
      </Text>
    </View>
  );
}

function Notice({ text, danger = false }: { text: string; danger?: boolean }) {
  return (
    <View style={[styles.notice, danger && styles.noticeDanger]}>
      <Ionicons
        name={danger ? "alert-circle-outline" : "information-circle-outline"}
        size={17}
        color={danger ? C.danger : C.teal}
      />
      <Text
        style={[
          styles.noticeText,
          styles.autoDirection,
          danger && styles.errorText,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function EmptyPanel({
  icon,
  title,
  copy,
}: {
  icon: IconName;
  title: string;
  copy: string;
}) {
  return (
    <View style={styles.emptyPanel}>
      <View style={styles.emptyPanelIcon}>
        <Ionicons name={icon} size={23} color={C.teal} />
      </View>
      <Text style={styles.emptyPanelTitle}>{title}</Text>
      <Text style={styles.emptyPanelCopy}>{copy}</Text>
    </View>
  );
}

function PrivacyNote({
  compact = false,
  language = "ur",
}: {
  compact?: boolean;
  language?: "ur" | "en";
}) {
  return (
    <View style={[styles.privacyCard, compact && styles.privacyCardCompact]}>
      <View style={styles.privacyIcon}>
        <Ionicons name="shield-checkmark-outline" size={19} color={C.teal} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.privacyTitle, styles.autoDirection]}>
          {language === "ur"
            ? "آپ کی privacy، واضح الفاظ میں۔"
            : "Your privacy, clearly."}
        </Text>
        <Text style={[styles.privacyCopy, styles.autoDirection]}>
          {language === "ur"
            ? "گفتگو اور action history اسی فون کے app storage میں رہتے ہیں؛ Raabta انہیں الگ سے encrypt نہیں کرتا۔ Task چلانے پر سوال اور منتخب فائلیں آپ کے provider کو، اور web search کا سوال DuckDuckGo کو بھیجا جاتا ہے۔ Login یا cloud sync نہیں۔ آئندہ account actions کے لیے آپ کی واضح اجازت ضروری ہو گی۔"
            : "Chats and action history stay in this device's app storage; they are not separately encrypted. A task sends your prompt and selected files to your configured provider; web-search terms go to DuckDuckGo. Raabta has no sign-in or cloud sync. Future account actions need your explicit permission."}
        </Text>
      </View>
    </View>
  );
}

function RoadmapCard({
  number,
  title,
  status,
  icon,
  items,
  active = false,
  language = "ur",
}: {
  number: string;
  title: string;
  status: string;
  icon: IconName;
  items: string[];
  active?: boolean;
  language?: "ur" | "en";
}) {
  return (
    <View style={[styles.roadmapCard, active && styles.roadmapCardActive]}>
      <View style={styles.roadmapTop}>
        <View style={[styles.roadmapIcon, active && styles.roadmapIconActive]}>
          <Ionicons name={icon} size={18} color={active ? C.white : C.teal} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.roadmapNumber, styles.autoDirection]}>
            {language === "ur" ? `مرحلہ ${number}` : `STAGE ${number}`}
          </Text>
          <Text style={[styles.roadmapTitle, styles.autoDirection]}>
            {title}
          </Text>
        </View>
        <View style={[styles.stageStatus, active && styles.stageStatusActive]}>
          <Text
            style={[
              styles.stageStatusText,
              active && styles.stageStatusTextActive,
            ]}
          >
            {status}
          </Text>
        </View>
      </View>
      <View style={styles.roadmapItems}>
        {items.map((item) => (
          <View key={item} style={styles.roadmapItem}>
            <View
              style={[
                styles.roadmapBullet,
                active && styles.roadmapBulletActive,
              ]}
            />
            <Text style={[styles.roadmapItemText, styles.autoDirection]}>
              {item}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function requestSensitiveActionApproval(summary: string): Promise<boolean> {
  const isGitHubAction = summary.includes(" in ") || summary.startsWith("Open pull request");
  const message = `${summary}\n\n${isGitHubAction ? "This will change your GitHub account." : "This will permanently delete a private workspace file."} Continue?`;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert(
      isGitHubAction ? "Approve GitHub action?" : "Approve deletion?",
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Approve", style: "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

function titleFromMessage(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 44
    ? `${compact.slice(0, 41).trimEnd()}…`
    : compact || "New conversation";
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sourceToAttachment(source: WebSource): ChatAttachment {
  return {
    id: makeId("source"),
    kind: "research",
    name: source.title,
    mimeType: "text/plain",
    uri: source.downloadedUri,
    sourceUrl: source.url,
    extractedText: source.snippet,
  };
}

function safeTaskError(error: unknown): string {
  if (error instanceof AIRequestError || error instanceof WebToolError)
    return error.message;
  if (error instanceof Error) {
    const message = error.message
      .replace(/(?:file|content):\/\/\S+/gi, "[local file]")
      .slice(0, 260);
    if (message && !/(?:bearer\s+|api.?key|access.?token)/i.test(message))
      return message;
  }
  return "Could not complete this task. Check the connection, file type and provider settings, then try again.";
}

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved locally";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper },
  autoDirection: { writingDirection: "auto", textAlign: "auto" },
  flex: { flex: 1 },
  languageCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 13,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    backgroundColor: C.white,
  },
  languageCopy: { flex: 1 },
  languageTitle: { color: C.ink, fontSize: 14, fontWeight: "700" },
  languageSubtitle: { color: C.muted, fontSize: 11, marginTop: 3 },
  languageButtons: { flexDirection: "row", gap: 5 },
  languageButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: C.paper,
  },
  languageButtonActive: { backgroundColor: C.teal },
  languageButtonText: { color: C.ink, fontSize: 12, fontWeight: "600" },
  languageButtonTextActive: { color: C.white },
  topBar: {
    minHeight: 66,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.teal,
  },
  brandName: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  brandCaption: {
    color: C.muted,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: -1,
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: 5 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  iconButtonPlaceholder: { width: 40 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.98 }] },
  conversationMeta: {
    minHeight: 45,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  localBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: C.tealPale,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.teal },
  localBadgeText: {
    color: C.tealDark,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
  },
  modelBadge: {
    maxWidth: 116,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: C.tealPale,
  },
  modelBadgeText: {
    color: C.tealDark,
    fontSize: 9,
    fontWeight: "700",
    flexShrink: 1,
  },
  threadTitle: { flex: 1, color: C.muted, textAlign: "right", fontSize: 12 },
  messageList: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 26,
    gap: 17,
  },
  messageListWithContent: { flexGrow: 1, justifyContent: "flex-start" },
  messageListEmpty: { flexGrow: 1, justifyContent: "center" },
  loadingHistory: { alignItems: "center", gap: 12 },
  mutedText: { color: C.muted, fontSize: 13 },
  emptyWelcome: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 24,
  },
  welcomeMark: {
    width: 52,
    height: 52,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.teal,
    marginBottom: 19,
  },
  welcomeEyebrow: {
    color: C.tealDark,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 7,
  },
  welcomeTitle: {
    color: C.ink,
    fontSize: 25,
    fontWeight: "600",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  welcomeCopy: {
    maxWidth: 300,
    color: C.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 9,
  },
  setupCallout: {
    width: "100%",
    maxWidth: 360,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginTop: 23,
    borderRadius: 18,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  },
  setupIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.tealPale,
  },
  setupTitle: { color: C.ink, fontSize: 14, fontWeight: "600" },
  setupSubtitle: { color: C.muted, fontSize: 11, marginTop: 3 },
  routingCard: {
    padding: 12,
    borderRadius: 15,
    backgroundColor: "#F0F7F4",
    borderWidth: 1,
    borderColor: "#D6E8E1",
    gap: 4,
  },
  routingHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2 },
  routingTitle: { color: C.tealDark, fontSize: 12, fontWeight: "700" },
  routingLine: { color: C.muted, fontSize: 11, lineHeight: 17 },
  messageRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  userMessageRow: { justifyContent: "flex-end" },
  assistantMessageRow: { justifyContent: "flex-start" },
  assistantMark: {
    width: 26,
    height: 26,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.tealPale,
    marginTop: 1,
  },
  messageBubble: {
    maxWidth: "88%",
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 19,
  },
  userBubble: { backgroundColor: C.tealPale, borderBottomRightRadius: 6 },
  assistantBubble: {
    backgroundColor: "transparent",
    paddingHorizontal: 3,
    paddingTop: 2,
    maxWidth: "88%",
  },
  activityRow: {
    alignSelf: "center",
    maxWidth: "96%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: "#EEF4F1",
    borderWidth: 1,
    borderColor: "#DDEAE5",
  },
  activityIconBadge: {
    width: 25,
    height: 25,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.white,
  },
  activityIcon3d: {
    position: "relative",
    shadowColor: "#173E38",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  activityIconDepth: {
    position: "absolute",
    width: 22,
    height: 22,
    top: 3,
    left: 3,
    borderRadius: 8,
    opacity: 0.9,
  },
  activityIconFace: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: C.white,
    borderWidth: 1.2,
  },
  activityBody: { flex: 1, minWidth: 0 },
  activityPlatformRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  activityPlatformDot: { width: 5, height: 5, borderRadius: 99 },
  activityPlatform: { color: C.tealDark, fontSize: 9, fontWeight: "700" },
  activityStatusIcon: { width: 16, alignItems: "center", paddingTop: 4 },
  activityRowFailed: { backgroundColor: C.dangerPale, borderColor: "#F1D2CD" },
  activityRowStopped: { backgroundColor: "#F0F1EE", borderColor: C.line },
  activityText: {
    flexShrink: 1,
    color: "#47635E",
    fontSize: 10,
    lineHeight: 14,
  },
  activityTime: { color: C.muted, fontSize: 9 },
  assistantLabel: {
    color: C.teal,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 5,
  },
  messageText: { color: C.ink, fontSize: 15, lineHeight: 23 },
  userMessageText: { color: "#193E39" },
  messageTime: {
    color: C.muted,
    fontSize: 10,
    textAlign: "right",
    marginTop: 5,
  },
  userMessageTime: { color: "#64847C" },
  thinkingRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 7,
  },
  thinkingText: { color: C.muted, fontSize: 13 },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: C.dangerPale,
  },
  stopText: { color: C.danger, fontSize: 11, fontWeight: "600" },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F1D2CD",
    borderRadius: 15,
    backgroundColor: C.dangerPale,
  },
  errorText: { flex: 1, color: "#82352E", fontSize: 12, lineHeight: 18 },
  errorAction: {
    color: C.tealDark,
    fontSize: 12,
    fontWeight: "700",
    paddingLeft: 4,
  },
  composerWrap: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: C.paper,
  },
  composer: {
    minHeight: 104,
    maxHeight: 224,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 5,
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 7,
    borderRadius: 22,
    backgroundColor: C.white,
    borderColor: C.line,
    borderWidth: 1,
  },
  composerInput: {
    flex: 1,
    minHeight: 50,
    maxHeight: 108,
    paddingVertical: 5,
    color: C.ink,
    fontSize: 15,
    lineHeight: 21,
  },
  composerInputRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  composerActions: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  composerActionsSpacer: { flex: 1 },
  composerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.paper,
  },
  composerIconButtonActive: { backgroundColor: C.tealPale },
  composerIconButtonDisabled: { opacity: 0.4 },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.teal,
  },
  sendButtonDisabled: { backgroundColor: "#AFC5BF" },
  privacyFootnote: {
    color: C.muted,
    textAlign: "center",
    fontSize: 9,
    marginTop: 7,
  },
  bottomNav: {
    minHeight: 60,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
    backgroundColor: C.white,
  },
  navItem: {
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  navLabel: { color: C.muted, fontSize: 10, fontWeight: "500" },
  navLabelSelected: { color: C.teal, fontWeight: "700" },
  panelHeader: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  panelTitleBlock: { flex: 1, paddingLeft: 4 },
  panelTitleLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  panelTitle: { color: C.ink, fontSize: 17, fontWeight: "700" },
  panelSubtitle: { color: C.muted, fontSize: 11, marginTop: 3 },
  panelContent: { padding: 18, paddingBottom: 28, gap: 12 },
  historyItem: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 17,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  },
  historyItemActive: { borderColor: "#B7D6CF", backgroundColor: "#F3F9F6" },
  historyIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: C.tealPale,
  },
  historyTitle: { color: C.ink, fontSize: 14, fontWeight: "600" },
  historyMeta: { color: C.muted, fontSize: 11, marginTop: 4 },
  privacyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    padding: 14,
    borderRadius: 17,
    backgroundColor: C.tealPale,
    marginTop: 3,
  },
  privacyCardCompact: { marginTop: 10 },
  privacyIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: C.white,
  },
  privacyTitle: {
    color: C.tealDark,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  privacyCopy: { color: "#47635E", fontSize: 11, lineHeight: 17 },
  emptyPanel: {
    alignItems: "center",
    paddingHorizontal: 25,
    paddingVertical: 38,
  },
  emptyPanelIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.tealPale,
    marginBottom: 12,
  },
  emptyPanelTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyPanelCopy: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
  },
  roadmapIntro: { padding: 4, marginBottom: 2 },
  roadmapEyebrow: {
    color: C.teal,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.7,
  },
  roadmapHeading: {
    color: C.ink,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginTop: 7,
  },
  roadmapCopy: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  roadmapCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  },
  roadmapCardActive: { borderColor: "#B6D8D1", backgroundColor: "#F6FBF8" },
  roadmapTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  roadmapIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.tealPale,
  },
  roadmapIconActive: { backgroundColor: C.teal },
  roadmapNumber: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.3,
  },
  roadmapTitle: { color: C.ink, fontSize: 15, fontWeight: "700", marginTop: 3 },
  stageStatus: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: "#F0F1EE",
  },
  stageStatusActive: { backgroundColor: C.tealPale },
  stageStatusText: {
    color: C.muted,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  stageStatusTextActive: { color: C.tealDark },
  roadmapItems: { gap: 8, paddingLeft: 4, marginTop: 13 },
  roadmapItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  roadmapBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#A1ACA7",
    marginTop: 6,
  },
  roadmapBulletActive: { backgroundColor: C.teal },
  roadmapItemText: { flex: 1, color: C.muted, fontSize: 12, lineHeight: 17 },
  settingsIntro: {
    flexDirection: "row",
    gap: 11,
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 17,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 6,
  },
  settingsShield: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.tealPale,
  },
  settingsIntroTitle: { color: C.ink, fontSize: 14, fontWeight: "700" },
  settingsIntroCopy: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  fieldLabelWrap: { marginTop: 6, marginBottom: -5 },
  fieldLabel: { color: C.ink, fontSize: 13, fontWeight: "700" },
  fieldSubtitle: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  fieldInput: {
    width: "100%",
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
    color: C.ink,
    fontSize: 13,
  },
  keyInputWrap: {
    width: "100%",
    justifyContent: "center",
    position: "relative",
  },
  keyInput: { paddingRight: 54 },
  keyVisibilityButton: {
    position: "absolute",
    right: 7,
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  keyStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 3,
    marginTop: -4,
  },
  keyStatusText: { flex: 1, color: C.muted, fontSize: 10 },
  keyStatusReady: { color: C.tealDark },
  removeKey: {
    color: C.danger,
    fontSize: 11,
    fontWeight: "600",
    paddingVertical: 6,
  },
  webStorageNote: {
    color: C.amber,
    fontSize: 10,
    lineHeight: 15,
    paddingHorizontal: 3,
  },
  notice: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    padding: 11,
    borderRadius: 13,
    backgroundColor: C.tealPale,
  },
  noticeDanger: { backgroundColor: C.dangerPale },
  noticeText: { flex: 1, color: C.tealDark, fontSize: 11, lineHeight: 16 },
  primaryButton: {
    minHeight: 48,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: C.teal,
    marginTop: 3,
  },
  primaryButtonText: { color: C.white, fontSize: 14, fontWeight: "700" },
  primaryButtonDisabled: { backgroundColor: "#AFC5BF", opacity: 0.75 },
  secondaryButton: {
    minHeight: 46,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFD7D1",
    backgroundColor: C.white,
  },
  secondaryButtonDisabled: { opacity: 0.65 },
  secondaryButtonText: { color: C.tealDark, fontSize: 13, fontWeight: "700" },
  testConnectionNote: {
    color: C.muted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    paddingHorizontal: 9,
    marginTop: -5,
  },
  researchCard: {
    padding: 14,
    gap: 11,
    borderRadius: 18,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  },
  toolRailViewport: { height: 48, flexGrow: 0, flexShrink: 0 },
  toolRail: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    gap: 4,
    alignItems: "center",
  },
  toolChip: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
  },
  toolChipActive: { backgroundColor: C.dangerPale, borderColor: "#F1D2CD" },
  toolChipDisabled: { opacity: 0.45 },
  toolChipText: { color: C.ink, fontSize: 10, fontWeight: "600" },
  toolChipTextActive: { color: C.danger },
  attachmentTray: {
    paddingHorizontal: 14,
    paddingTop: 3,
    paddingBottom: 3,
    gap: 7,
  },
  pendingAttachment: {
    maxWidth: 230,
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: C.tealPale,
  },
  pendingAttachmentText: { flexShrink: 1, color: C.tealDark, fontSize: 10 },
  messageAttachments: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
    marginTop: 9,
  },
  imageThumbButton: {
    width: 80,
    height: 80,
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: C.white,
  },
  messageImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
    backgroundColor: C.white,
  },
  thumbnailExpandBadge: {
    position: "absolute",
    right: 5,
    bottom: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(32,42,40,0.78)",
  },
  previewModal: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: "rgba(16,26,24,0.96)",
  },
  previewDismissLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  previewImage: { width: "100%", height: "70%" },
  previewImageName: {
    maxWidth: "84%",
    marginTop: 16,
    color: C.white,
    fontSize: 13,
    textAlign: "center",
  },
  previewCloseButton: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  messageAttachmentChip: {
    alignSelf: "flex-start",
    maxWidth: 230,
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  messageAttachmentText: { flexShrink: 1, color: C.tealDark, fontSize: 10 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 5 },
});
