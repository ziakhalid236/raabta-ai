import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export type LocalAudioFile = {
  uri: string;
  name: string;
  mimeType: string;
  webFile?: Blob;
};

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export async function pickAudioFile(): Promise<LocalAudioFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "audio/*",
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const mimeType = asset.mimeType ?? "audio/mp4";
  if (!mimeType.startsWith("audio/")) throw new Error("Choose an audio recording such as M4A, MP3, WAV, or WebM.");
  if (asset.size && asset.size > MAX_AUDIO_BYTES) throw new Error("Audio files must be 20 MB or smaller for transcription.");
  let uri = asset.uri;
  if (Platform.OS !== "web" && FileSystem.cacheDirectory) {
    const folder = `${FileSystem.cacheDirectory}raabta/recordings/`;
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
    const safeName = asset.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "voice-recording";
    uri = `${folder}${Date.now()}-${safeName}`;
    await FileSystem.copyAsync({ from: asset.uri, to: uri });
  }
  return {
    uri,
    name: asset.name || `voice-recording-${Date.now()}`,
    mimeType,
    webFile: Platform.OS === "web" ? asset.file : undefined,
  };
}

export async function ensureAudioFileSize(file: LocalAudioFile): Promise<void> {
  let size = file.webFile?.size ?? 0;
  if (!file.webFile && Platform.OS !== "web") {
    const info = await FileSystem.getInfoAsync(file.uri);
    if (!info.exists) throw new Error("The selected audio file is no longer available. Choose or record it again.");
    size = info.size ?? 0;
  }
  if (size > MAX_AUDIO_BYTES)
    throw new Error("Audio files must be 20 MB or smaller for transcription.");
}

export async function disposeAudioFile(file: LocalAudioFile): Promise<void> {
  if (Platform.OS === "web") return;
  const allowedRoots = [
    FileSystem.cacheDirectory,
    FileSystem.documentDirectory ? `${FileSystem.documentDirectory}raabta/recordings/` : null,
  ].filter((root): root is string => Boolean(root));
  if (!allowedRoots.some((root) => file.uri.startsWith(root))) return;
  await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => undefined);
}
