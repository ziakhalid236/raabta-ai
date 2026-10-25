import * as FileSystem from "expo-file-system/legacy";

const WORKSPACE_FOLDER = "raabta/ai-workspace/";
export const AI_WORKSPACE_MAX_BYTES = 100 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_READ_CHARS = 60_000;

export class AIWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIWorkspaceError";
  }
}

function getRoot(): string {
  const root = FileSystem.documentDirectory;
  if (!root) throw new AIWorkspaceError("Private app file storage is unavailable on this device.");
  return `${root}${WORKSPACE_FOLDER}`;
}

function safeRelativePath(value: string, allowEmpty = false): string {
  const path = value.trim().replace(/\\/g, "/");
  if ((!path && !allowEmpty) || path.startsWith("/") || path.includes("\0")) {
    throw new AIWorkspaceError("Use a relative file path inside the AI workspace.");
  }
  const parts = path.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new AIWorkspaceError("Parent-directory paths are not allowed in the AI workspace.");
  }
  return parts.join("/");
}

function pathInWorkspace(relativePath: string, allowEmpty = false): string {
  const safe = safeRelativePath(relativePath, allowEmpty);
  return safe ? `${getRoot()}${safe}` : getRoot();
}

export async function listAIWorkspaceFiles(directory = ""): Promise<string[]> {
  const root = getRoot();
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const path = pathInWorkspace(directory, true);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || !info.isDirectory) throw new AIWorkspaceError("That AI workspace folder does not exist.");
  const names = await FileSystem.readDirectoryAsync(path);
  const result: string[] = [];
  for (const name of names) {
    const child = directory ? `${directory}/${name}` : name;
    const childInfo = await FileSystem.getInfoAsync(pathInWorkspace(child));
    result.push(childInfo.isDirectory ? `${child}/` : child);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

export async function readAIWorkspaceFile(relativePath: string): Promise<string> {
  const path = pathInWorkspace(relativePath);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || info.isDirectory) throw new AIWorkspaceError("That AI workspace file was not found.");
  if ((info.size ?? 0) > MAX_FILE_BYTES) throw new AIWorkspaceError("This file is larger than the 10 MB per-file limit.");
  const content = await FileSystem.readAsStringAsync(path);
  if (content.length > MAX_READ_CHARS) {
    return `${content.slice(0, MAX_READ_CHARS)}\n\n[Read limit reached; file is kept unchanged.]`;
  }
  return content;
}

export async function deleteAIWorkspaceFile(relativePath: string): Promise<{ path: string; usageBytes: number }> {
  const safePath = safeRelativePath(relativePath);
  const path = pathInWorkspace(safePath);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || info.isDirectory) throw new AIWorkspaceError("That AI workspace file was not found.");
  await FileSystem.deleteAsync(path);
  const usage = await getAIWorkspaceUsage();
  return { path: safePath, usageBytes: usage.usedBytes };
}

export async function writeAIWorkspaceFile(relativePath: string, content: string): Promise<{ path: string; bytes: number; usageBytes: number }> {
  const safePath = safeRelativePath(relativePath);
  const bytes = utf8ByteLength(content);
  if (bytes > MAX_FILE_BYTES) throw new AIWorkspaceError("Files in the AI workspace are limited to 10 MB each.");
  const root = getRoot();
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  const target = pathInWorkspace(safePath);
  const parent = target.slice(0, target.lastIndexOf("/"));
  await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
  const existing = await FileSystem.getInfoAsync(target);
  if (existing.isDirectory) throw new AIWorkspaceError("A folder already exists at that file path.");
  const usage = await calculateUsage(root);
  const nextUsage = usage - (existing.exists ? existing.size ?? 0 : 0) + bytes;
  if (nextUsage > AI_WORKSPACE_MAX_BYTES) {
    throw new AIWorkspaceError("The private AI workspace is at its 100 MB storage limit. Remove unused files in the workspace to continue.");
  }
  await FileSystem.writeAsStringAsync(target, content);
  return { path: safePath, bytes, usageBytes: nextUsage };
}

export async function getAIWorkspaceUsage(): Promise<{ usedBytes: number; limitBytes: number }> {
  const root = getRoot();
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  return { usedBytes: await calculateUsage(root), limitBytes: AI_WORKSPACE_MAX_BYTES };
}

async function calculateUsage(directory: string): Promise<number> {
  let names: string[];
  try {
    names = await FileSystem.readDirectoryAsync(directory);
  } catch {
    throw new AIWorkspaceError("The private workspace could not be inspected safely; no file was written.");
  }
  let total = 0;
  for (const name of names) {
    const child = `${directory}${name}`;
    const info = await FileSystem.getInfoAsync(child);
    if (!info.exists) continue;
    total += info.isDirectory ? await calculateUsage(`${child}/`) : info.size ?? 0;
    if (total > AI_WORKSPACE_MAX_BYTES) return total;
  }
  return total;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}
