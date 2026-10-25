import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

export type StorageReport = {
  documentBytes: number;
  asyncStorageBytes: number;
  totalBytes: number;
  breakdown: { label: string; bytes: number }[];
};

const DERIVED_FOLDERS = ["raabta/downloads/", "raabta/recordings/"];

export async function getStorageReport(): Promise<StorageReport> {
  const root = FileSystem.documentDirectory;
  const documentBytes = root ? await directoryBytes(root) : 0;
  let asyncStorageBytes = 0;
  try {
    const entries = await AsyncStorage.multiGet(
      await AsyncStorage.getAllKeys(),
    );
    asyncStorageBytes = entries.reduce(
      (total, [, value]) => total + utf8Bytes(value ?? ""),
      0,
    );
  } catch {
    // A report must never block the settings screen if a platform storage adapter is unavailable.
  }
  const workspaceBytes = root
    ? await directoryBytes(`${root}raabta/ai-workspace/`)
    : 0;
  const downloadsBytes = root
    ? await directoryBytes(`${root}raabta/downloads/`)
    : 0;
  const recordingsBytes = root
    ? await directoryBytes(`${root}raabta/recordings/`)
    : 0;
  const otherDocumentBytes = Math.max(
    0,
    documentBytes - workspaceBytes - downloadsBytes - recordingsBytes,
  );
  return {
    documentBytes,
    asyncStorageBytes,
    totalBytes: documentBytes + asyncStorageBytes,
    breakdown: [
      { label: "Conversations and settings", bytes: asyncStorageBytes },
      { label: "AI workspace", bytes: workspaceBytes },
      { label: "Research downloads", bytes: downloadsBytes },
      { label: "Voice recordings", bytes: recordingsBytes },
      { label: "Other app files", bytes: otherDocumentBytes },
    ],
  };
}

/** Remove only regenerable research/voice artifacts. Chats, workspace files and credentials remain untouched. */
export async function clearRegenerableFiles(): Promise<number> {
  const root = FileSystem.documentDirectory;
  if (!root) return 0;
  let removedBytes = 0;
  for (const relative of DERIVED_FOLDERS) {
    const path = `${root}${relative}`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) continue;
    removedBytes += await directoryBytes(path);
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
  return removedBytes;
}

export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

async function directoryBytes(path: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return 0;
  if (!info.isDirectory) return info.size ?? 0;
  let total = 0;
  let names: string[] = [];
  try {
    names = await FileSystem.readDirectoryAsync(path);
  } catch {
    return 0;
  }
  for (const name of names)
    total += await directoryBytes(`${path.replace(/\/$/, "")}/${name}`);
  return total;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}
