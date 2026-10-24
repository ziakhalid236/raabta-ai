import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

import type { ChatAttachment } from "@/lib/chat-storage";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_DOCUMENT_CHARS = 80_000;
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "json", "csv", "tsv", "xml", "html", "htm", "log"]);

export async function pickChatImages(): Promise<ChatAttachment[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: 3,
    quality: 0.82,
    base64: false,
  });
  if (result.canceled || !result.assets) return [];

  const attachments: ChatAttachment[] = [];
  for (const asset of result.assets.slice(0, 3)) {
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      throw new Error(`${asset.fileName ?? "Image"} is larger than 6 MB. Choose a smaller image.`);
    }
    const name = asset.fileName ?? `image-${Date.now()}.jpg`;
    const uri = await keepInAppStorage(asset.uri, name);
    attachments.push({
      id: uniqueId("image"),
      kind: "image",
      name,
      mimeType: asset.mimeType ?? mimeFromName(name, "image/jpeg"),
      uri,
    });
  }
  return attachments;
}

export async function pickChatDocuments(): Promise<ChatAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["text/*", "application/json", "image/*", "application/pdf"],
    copyToCacheDirectory: true,
    multiple: true,
    base64: Platform.OS === "web",
  });
  if (result.canceled) return [];

  const attachments: ChatAttachment[] = [];
  const notices: string[] = [];
  for (const asset of result.assets) {
    const mimeType = asset.mimeType ?? mimeFromName(asset.name, "application/octet-stream");
    const isImage = mimeType.startsWith("image/");
    if (isImage) {
      if (asset.size && asset.size > MAX_IMAGE_BYTES) {
        notices.push(`${asset.name}: larger than 6 MB; skipped.`);
        continue;
      }
      attachments.push({
        id: uniqueId("image"),
        kind: "image",
        name: asset.name,
        mimeType,
        uri: await keepInAppStorage(asset.uri, asset.name),
      });
      continue;
    }

    const ext = extension(asset.name);
    if (!mimeType.startsWith("text/") && !TEXT_EXTENSIONS.has(ext) && mimeType !== "application/json") {
      notices.push(`${asset.name}: only text, Markdown, CSV, JSON, XML, HTML, and images can be read in this release.`);
      continue;
    }
    if (asset.size && asset.size > MAX_DOCUMENT_BYTES) {
      notices.push(`${asset.name}: larger than 2 MB; skipped.`);
      continue;
    }

    let text: string;
    try {
      if (Platform.OS === "web" && asset.file) text = await asset.file.text();
      else text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    } catch {
      notices.push(`${asset.name}: could not be opened. Check that the file is still available on this device.`);
      continue;
    }
    if (text.length > MAX_DOCUMENT_CHARS) {
      notices.push(`${asset.name}: text is longer than 80,000 characters; it was shortened for safe model requests.`);
      text = `${text.slice(0, MAX_DOCUMENT_CHARS)}\n\n[Text truncated by Raabta at 80,000 characters.]`;
    }
    const storedUri = await keepInAppStorage(asset.uri, asset.name);
    attachments.push({
      id: uniqueId("document"),
      kind: "document",
      name: asset.name,
      mimeType,
      uri: storedUri,
      extractedText: text,
    });
  }
  if (!attachments.length && notices.length) throw new Error(notices.join("\n"));
  return attachments;
}

export async function readImageAsDataUrl(attachment: ChatAttachment): Promise<string> {
  if (!attachment.uri || attachment.kind !== "image")
    throw new Error("This image is no longer available in local storage. Please attach it again.");
  let dataUrl = "";
  if (Platform.OS === "web") {
    const response = await fetch(attachment.uri);
    if (!response.ok) throw new Error("The selected image could not be read in this browser session.");
    const blob = await response.blob();
    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read the image file."));
      reader.readAsDataURL(blob);
    });
  } else {
    const base64 = await FileSystem.readAsStringAsync(attachment.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    dataUrl = `data:${attachment.mimeType};base64,${base64}`;
  }
  if (!dataUrl.startsWith("data:image/")) throw new Error("The selected file is not a supported image.");
  return dataUrl;
}

async function keepInAppStorage(sourceUri: string, fileName: string): Promise<string> {
  if (Platform.OS === "web") return sourceUri;
  const root = FileSystem.documentDirectory;
  if (!root) return sourceUri;
  const folder = `${root}raabta/attachments/`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "attachment";
  const target = `${folder}${Date.now()}-${uniqueId("file")}-${safeName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: target });
  return target;
}

function extension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function mimeFromName(name: string, fallback: string): string {
  const ext = extension(name);
  const known: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
    gif: "image/gif", txt: "text/plain", md: "text/markdown", csv: "text/csv",
    json: "application/json", html: "text/html", htm: "text/html", xml: "application/xml",
  };
  return known[ext] ?? fallback;
}

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
