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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  AIRequestError,
  requestAudioTranscription,
  requestChatCompletion,
} from "@/lib/ai-client";
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
  readApiKey,
  writeApiKey,
} from "@/lib/secure-credentials";
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
  const [endpointDraft, setEndpointDraft] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [transcriptionEndpointDraft, setTranscriptionEndpointDraft] =
    useState("");
  const [transcriptionModelDraft, setTranscriptionModelDraft] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showError, setShowError] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const [showEmptyKeyHint, setShowEmptyKeyHint] = useState(false);
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
        const [storedThreads, storedPreferences, apiKey] = await Promise.all([
          loadThreads(),
          loadPreferences(),
          readApiKey(),
        ]);
        if (!active) return;
        const hydratedThreads = storedThreads.length
          ? storedThreads
          : [createThread()];
        threadsRef.current = hydratedThreads;
        setThreads(hydratedThreads);
        setActiveThreadId(hydratedThreads[0].id);
        setPreferences(storedPreferences);
        setEndpointDraft(storedPreferences.endpointUrl);
        setModelDraft(storedPreferences.modelId);
        setTranscriptionEndpointDraft(
          storedPreferences.transcriptionEndpointUrl,
        );
        setTranscriptionModelDraft(storedPreferences.transcriptionModelId);
        setHasKey(Boolean(apiKey));
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
      !preferences.endpointUrl.trim() ||
      !preferences.modelId.trim() ||
      !hasKey
    ) {
      setShowError(
        "Add your endpoint, model and API key in Settings before sending.\nبھیجنے سے پہلے Settings میں اپنی API تفصیل شامل کریں۔",
      );
      setPanel("settings");
      return;
    }

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
            ? `${attachments.length} منسلک فائل(یں) ${preferences.modelId.trim()} کے لیے تیار کی جا رہی ہیں۔`
            : `Preparing ${attachments.length} attachment${attachments.length === 1 ? "" : "s"} for ${preferences.modelId.trim()}.`
          : isUrdu
            ? `${preferences.modelId.trim()} کے لیے درخواست تیار کی جا رہی ہے۔`
            : `Preparing a request for ${preferences.modelId.trim()}.`),
      activityStatus: "working",
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
    const addActivity = (content: string) => {
      activeActivityId = makeId("activity");
      const createdAt = new Date().toISOString();
      updateThread(currentThread.id, (thread) => ({
        ...thread,
        updatedAt: createdAt,
        messages: [
          ...thread.messages,
          {
            id: activeActivityId,
            role: "activity",
            content,
            activityStatus: "working",
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
        );
      }
      if (controller.signal.aborted)
        throw new Error("Request stopped before sending.");
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
      );
      updateActivity(
        isUrdu
          ? `${preferences.modelId.trim()} کے لیے سوال اور معاون منسلکات تیار ہیں۔`
          : `Prepared the prompt and supported attachments for ${preferences.modelId.trim()}.`,
        "complete",
      );
      addActivity(
        isUrdu
          ? `${preferences.modelId.trim()} کو درخواست بھیجی؛ provider کے جواب کا انتظار ہے۔`
          : `Sent a request to ${preferences.modelId.trim()}. Waiting for the provider’s response.`,
      );
      const answer = await requestChatCompletion({
        endpointUrl: preferences.endpointUrl,
        modelId: preferences.modelId,
        apiKey,
        messages: providerMessages,
        signal: controller.signal,
      });
      const assistantMessage: ChatMessage = {
        id: makeId("message"),
        role: "assistant",
        content: answer,
        createdAt: new Date().toISOString(),
      };
      updateActivity(
        isUrdu
          ? `${preferences.modelId.trim()} سے جواب موصول ہو گیا۔`
          : `Response received from ${preferences.modelId.trim()}.`,
        "complete",
      );
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
      !preferences.transcriptionEndpointUrl ||
      !preferences.transcriptionModelId ||
      !hasKey
    ) {
      setShowError(
        "Set an HTTPS audio-transcription endpoint, model and API key in Settings before sending voice for transcription.",
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
          content: isUrdu
            ? `${preferences.transcriptionModelId.trim()} پر آواز کا transcript بنانے کے لیے بھیجا جا رہا ہے…`
            : `Sending selected voice to ${preferences.transcriptionModelId.trim()} for transcription…`,
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
      const transcript = await requestAudioTranscription({
        endpointUrl: preferences.transcriptionEndpointUrl,
        modelId: preferences.transcriptionModelId,
        apiKey,
        file,
        signal: controller.signal,
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
                  content: isUrdu
                    ? `${preferences.transcriptionModelId.trim()} سے transcript موصول ہوا۔`
                    : `Transcription received from ${preferences.transcriptionModelId.trim()}.`,
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
        !preferences.transcriptionEndpointUrl ||
        !preferences.transcriptionModelId ||
        !hasKey
      ) {
        setShowError(
          "Set an HTTPS audio-transcription endpoint, model and API key in Settings before recording.",
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

  async function saveConnection() {
    const nextPreferences = {
      language: preferences.language,
      endpointUrl: endpointDraft.trim(),
      modelId: modelDraft.trim(),
      transcriptionEndpointUrl: transcriptionEndpointDraft.trim(),
      transcriptionModelId: transcriptionModelDraft.trim(),
    };
    if (
      nextPreferences.endpointUrl &&
      !isHttpsUrl(nextPreferences.endpointUrl)
    ) {
      setSettingsNotice(
        "Enter a complete HTTPS chat-completions URL, including its path.",
      );
      return;
    }
    if (
      nextPreferences.transcriptionEndpointUrl &&
      !isHttpsUrl(nextPreferences.transcriptionEndpointUrl)
    ) {
      setSettingsNotice("Use a complete HTTPS audio-transcription URL.");
      return;
    }
    try {
      await savePreferences(nextPreferences);
      setPreferences(nextPreferences);
      if (keyDraft.trim()) {
        await writeApiKey(keyDraft.trim());
        setHasKey(true);
        setKeyDraft("");
      }
      setSettingsNotice(
        "Settings saved on this device. Your API key is stored separately.",
      );
      setShowEmptyKeyHint(false);
      setKeyVisible(false);
    } catch {
      setSettingsNotice(
        "Could not save securely. Please try again; the API key was not saved to chat history.",
      );
    }
  }

  async function testConnection() {
    if (isTestingConnection) return;
    const endpointUrl = endpointDraft.trim();
    const modelId = modelDraft.trim();
    let apiKey = keyDraft.trim();
    if (!apiKey) {
      try {
        apiKey = (await readApiKey()) ?? "";
      } catch {
        setSettingsNotice(
          t(
            "Could not read the saved key securely. Try again or enter a new key.",
            "محفوظ key محفوظ طریقے سے نہیں پڑھی جا سکی۔ دوبارہ کوشش کریں یا نئی key دیں۔",
          ),
        );
        return;
      }
    }
    if (!endpointUrl || !modelId || !apiKey) {
      setSettingsNotice(
        t(
          "Enter an endpoint, model ID and API key before testing.",
          "ٹیسٹ سے پہلے endpoint، model ID اور API key درج کریں۔",
        ),
      );
      return;
    }
    if (!isHttpsUrl(endpointUrl)) {
      setSettingsNotice(
        t(
          "Enter a complete HTTPS chat-completions URL before testing.",
          "ٹیسٹ سے پہلے مکمل HTTPS chat-completions URL درج کریں۔",
        ),
      );
      return;
    }

    setIsTestingConnection(true);
    setSettingsNotice("");
    try {
      await requestChatCompletion({
        endpointUrl,
        modelId,
        apiKey,
        messages: [{ role: "user", content: "Reply with the single word OK." }],
        signal: new AbortController().signal,
      });
      setSettingsNotice(
        t(
          "Connection works. Press Save to keep these settings on this device.",
          "کنکشن درست ہے۔ ان ترتیبات کو فون پر رکھنے کے لیے Save دبائیں۔",
        ),
      );
    } catch (error) {
      setSettingsNotice(
        `${t("Connection test failed:", "کنکشن ٹیسٹ ناکام:")} ${safeTaskError(error)}`,
      );
    } finally {
      setIsTestingConnection(false);
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
      setKeyDraft("");
      setKeyVisible(false);
      setSettingsNotice("Saved API key removed from secure storage.");
    } catch {
      setSettingsNotice(
        "The saved API key could not be removed. Please try again.",
      );
    }
  }

  function openSettings() {
    setKeyVisible(false);
    setEndpointDraft(preferences.endpointUrl);
    setModelDraft(preferences.modelId);
    setTranscriptionEndpointDraft(preferences.transcriptionEndpointUrl);
    setTranscriptionModelDraft(preferences.transcriptionModelId);
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
                  style={[styles.urduHeadline, { writingDirection: "rtl" }]}
                >
                  آپ کی گفتگو، آپ کے اختیار میں
                </Text>
                <Text style={styles.welcomeTitle}>
                  {t(
                    "A quieter place to think.",
                    "سوچنے اور بات کرنے کی پُرسکون جگہ۔",
                  )}
                </Text>
                <Text style={styles.welcomeCopy}>
                  {t(
                    "Set up your own AI endpoint, model and key. Your conversation history stays on this device.",
                    "اپنا AI endpoint، ماڈل اور API key جوڑیں۔ آپ کی گفتگو اسی فون پر محفوظ رہے گی۔",
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
                      {hasKey && preferences.endpointUrl
                        ? t("Connection ready", "کنکشن تیار ہے")
                        : t("Connect your model", "اپنا ماڈل جوڑیں")}
                    </Text>
                    <Text style={styles.setupSubtitle}>
                      {hasKey && preferences.endpointUrl
                        ? t(
                            "Review your private connection settings",
                            "اپنی نجی کنکشن ترتیبات دیکھیں",
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

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.toolRailViewport}
            contentContainerStyle={styles.toolRail}
            keyboardShouldPersistTaps="handled"
          >
            <ToolChip
              icon="globe-outline"
              label={t("Research", "تحقیق")}
              onPress={() => {
                setShowError("");
                setPanel("research");
              }}
              disabled={!isReady || isSending || isTranscribing}
            />
            <ToolChip
              icon="image-outline"
              label={t("Photo", "تصویر")}
              onPress={() => void addImages()}
              disabled={!isReady || isSending || isTranscribing}
            />
            <ToolChip
              icon="attach-outline"
              label={t("File", "فائل")}
              onPress={() => void addDocuments()}
              disabled={!isReady || isSending || isTranscribing}
            />
            <ToolChip
              icon="musical-notes-outline"
              label={t("Audio file", "آڈیو فائل")}
              onPress={() => void chooseAudioFile()}
              disabled={!isReady || isSending || isTranscribing || isRecording}
            />
            <ToolChip
              icon={isRecording ? "stop-circle-outline" : "mic-outline"}
              label={
                isRecording
                  ? t("Stop voice", "ریکارڈنگ روکیں")
                  : t("Voice", "آواز")
              }
              onPress={() => void toggleVoiceRecording()}
              active={isRecording}
              disabled={!isReady || isSending || isTranscribing}
            />
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
              <TextInput
                accessibilityLabel="Message your AI model"
                value={draft}
                onChangeText={setDraft}
                placeholder={t(
                  "پیغام لکھیں یا type a message…",
                  "پیغام لکھیں…",
                )}
                placeholderTextColor="#909995"
                multiline
                maxLength={12000}
                style={[styles.composerInput, styles.autoDirection]}
                textAlignVertical="center"
                returnKeyType="default"
                editable={isReady && !isSending && !isTranscribing}
              />
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
              <Ionicons
                name="shield-checkmark-outline"
                size={21}
                color={C.teal}
              />
            </View>
            <View style={styles.flex}>
              <Text style={styles.settingsIntroTitle}>
                {t("Connect your AI", "اپنا AI جوڑیں")}
              </Text>
              <Text style={styles.settingsIntroCopy}>
                {t(
                  "Works with OpenAI-compatible chat completion APIs, including your own hosted endpoint.",
                  "OpenAI-compatible chat completion APIs اور آپ کے اپنے hosted endpoint کے ساتھ کام کرتا ہے۔",
                )}
              </Text>
            </View>
          </View>

          <FieldLabel
            title={t("API endpoint", "API endpoint")}
            subtitle={t(
              "Paste the complete HTTPS chat-completions URL · no keys in the URL",
              "مکمل HTTPS chat-completions URL دیں · URL میں key شامل نہ کریں",
            )}
          />
          <TextInput
            accessibilityLabel="API endpoint URL"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={endpointDraft}
            onChangeText={setEndpointDraft}
            placeholder="https://your-provider.com/v1/chat/completions"
            placeholderTextColor="#9AA29E"
            style={[styles.fieldInput, styles.autoDirection]}
          />

          <FieldLabel
            title={t("Model ID", "Model ID")}
            subtitle={t(
              "The exact model name your provider expects",
              "اپنے provider کا بالکل درست model نام",
            )}
          />
          <TextInput
            accessibilityLabel="Model identifier"
            autoCapitalize="none"
            autoCorrect={false}
            value={modelDraft}
            onChangeText={setModelDraft}
            placeholder="e.g. your-model-name"
            placeholderTextColor="#9AA29E"
            style={[styles.fieldInput, styles.autoDirection]}
          />

          <FieldLabel
            title={t(
              "Voice transcription endpoint · optional",
              "آواز کے transcript کا endpoint · اختیاری",
            )}
            subtitle={t(
              "OpenAI-compatible audio/transcriptions URL · same secure API key",
              "OpenAI-compatible audio/transcriptions URL · وہی محفوظ API key",
            )}
          />
          <TextInput
            accessibilityLabel="Audio transcription endpoint URL"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={transcriptionEndpointDraft}
            onChangeText={setTranscriptionEndpointDraft}
            placeholder="https://your-provider.com/v1/audio/transcriptions"
            placeholderTextColor="#9AA29E"
            style={[styles.fieldInput, styles.autoDirection]}
          />

          <FieldLabel
            title={t(
              "Transcription model ID · optional",
              "Transcription model ID · اختیاری",
            )}
            subtitle={t(
              "Enable voice only after both optional fields are set",
              "آواز کا اختیار تب فعال ہو گا جب دونوں optional fields بھریں",
            )}
          />
          <TextInput
            accessibilityLabel="Audio transcription model identifier"
            autoCapitalize="none"
            autoCorrect={false}
            value={transcriptionModelDraft}
            onChangeText={setTranscriptionModelDraft}
            placeholder="e.g. whisper-1 (if your provider supports it)"
            placeholderTextColor="#9AA29E"
            style={[styles.fieldInput, styles.autoDirection]}
          />

          <FieldLabel
            title={t("API key", "API key")}
            subtitle={t(
              "Never shown in chat or stored with conversations",
              "chat میں نہیں دکھائی جاتی اور گفتگو کے ساتھ محفوظ نہیں ہوتی",
            )}
          />
          <View style={styles.keyInputWrap}>
            <TextInput
              accessibilityLabel="API key"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!keyVisible}
              value={keyDraft}
              onChangeText={setKeyDraft}
              placeholder={
                hasKey
                  ? t(
                      "Saved securely · paste only to replace",
                      "محفوظ ہے · بدلنے کے لیے نئی key دیں",
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
              accessibilityState={{ selected: keyVisible, disabled: !keyDraft }}
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
              name={hasKey ? "lock-closed" : "information-circle-outline"}
              size={15}
              color={hasKey ? C.teal : C.muted}
            />
            <Text
              style={[styles.keyStatusText, hasKey && styles.keyStatusReady]}
            >
              {hasKey
                ? Platform.OS === "web"
                  ? t(
                      "Key is available in this browser session only",
                      "key صرف اس browser session میں موجود ہے",
                    )
                  : t(
                      "Key saved in Android SecureStore",
                      "key Android SecureStore میں محفوظ ہے",
                    )
                : t("No key saved yet", "ابھی کوئی key محفوظ نہیں")}
            </Text>
            {hasKey ? (
              <Pressable
                accessibilityRole="button"
                onPress={removeConnectionKey}
              >
                <Text style={styles.removeKey}>
                  {t("Remove key", "key حذف کریں")}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {Platform.OS === "web" ? (
            <Text style={styles.webStorageNote}>
              {t(
                "Preview only: the key remains in memory for this browser session and is not saved.",
                "صرف Preview میں: key browser session کی memory میں رہتی ہے، محفوظ نہیں ہوتی۔",
              )}
            </Text>
          ) : null}

          {settingsNotice ? <Notice text={settingsNotice} /> : null}
          {showEmptyKeyHint ? (
            <Notice
              text={t(
                "Paste a new key to save it, or keep the key already stored securely.",
                "نئی key محفوظ کرنے کے لیے درج کریں، یا موجودہ محفوظ key برقرار رکھیں۔",
              )}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isTestingConnection }}
            disabled={isTestingConnection}
            onPress={() => void testConnection()}
            style={({ pressed }) => [
              styles.secondaryButton,
              isTestingConnection && styles.secondaryButtonDisabled,
              pressed && !isTestingConnection && styles.pressed,
            ]}
          >
            {isTestingConnection ? (
              <ActivityIndicator size="small" color={C.teal} />
            ) : (
              <Ionicons name="pulse-outline" size={18} color={C.teal} />
            )}
            <Text style={styles.secondaryButtonText}>
              {isTestingConnection
                ? t("Testing connection…", "کنکشن ٹیسٹ ہو رہا ہے…")
                : t("Test connection", "کنکشن ٹیسٹ کریں")}
            </Text>
          </Pressable>
          <Text style={[styles.testConnectionNote, styles.autoDirection]}>
            {t(
              "Sends a short “OK” prompt to the selected provider. Provider charges may apply.",
              "منتخب provider کو مختصر “OK” سوال بھیجا جائے گا۔ provider فیس لے سکتا ہے۔",
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (!keyDraft.trim() && !hasKey) setShowEmptyKeyHint(true);
              void saveConnection();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={18}
              color={C.white}
            />
            <Text style={styles.primaryButtonText}>
              {t("Save on this device", "اس فون پر محفوظ کریں")}
            </Text>
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

function ToolChip({
  icon,
  label,
  onPress,
  disabled = false,
  active = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolChip,
        active && styles.toolChipActive,
        disabled && styles.toolChipDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={15} color={active ? C.danger : C.teal} />
      <Text style={[styles.toolChipText, active && styles.toolChipTextActive]}>
        {label}
      </Text>
    </Pressable>
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
    const icon: IconName =
      status === "working"
        ? "sync-outline"
        : status === "failed"
          ? "alert-circle-outline"
          : status === "stopped"
            ? "stop-circle-outline"
            : "checkmark-circle-outline";
    return (
      <View
        style={[
          styles.activityRow,
          status === "failed" && styles.activityRowFailed,
          status === "stopped" && styles.activityRowStopped,
        ]}
      >
        <Ionicons
          name={icon}
          size={14}
          color={
            status === "failed"
              ? C.danger
              : status === "stopped"
                ? C.muted
                : C.teal
          }
        />
        <Text style={[styles.activityText, styles.autoDirection]}>
          {message.content}
        </Text>
        <Text style={styles.activityTime}>{formatTime(message.createdAt)}</Text>
      </View>
    );
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
        <Text
          selectable
          style={[
            styles.messageText,
            isUser && styles.userMessageText,
            { writingDirection: "auto" },
          ]}
        >
          {message.content}
        </Text>
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
  urduHeadline: {
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
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: "#EEF4F1",
    borderWidth: 1,
    borderColor: "#DDEAE5",
  },
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
    minHeight: 56,
    maxHeight: 126,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingLeft: 15,
    paddingRight: 7,
    paddingVertical: 6,
    borderRadius: 22,
    backgroundColor: C.white,
    borderColor: C.line,
    borderWidth: 1,
  },
  composerInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 108,
    paddingVertical: 8,
    color: C.ink,
    fontSize: 15,
    lineHeight: 21,
  },
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
