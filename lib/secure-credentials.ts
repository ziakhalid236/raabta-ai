import { Platform } from "react-native";

const API_KEY_NAME = "raabta.provider.api-key.v1";
const GITHUB_TOKEN_NAME = "raabta.github.profile-token.v1";
let previewSessionKey: string | null = null;
let previewGitHubToken: string | null = null;

/** Android/iOS secrets use platform-backed Expo SecureStore. Web Preview is memory-only. */
export async function readApiKey(): Promise<string | null> {
  if (Platform.OS === "web") return previewSessionKey;
  const SecureStore = await import("expo-secure-store");
  return SecureStore.getItemAsync(API_KEY_NAME);
}

export async function writeApiKey(value: string): Promise<void> {
  if (Platform.OS === "web") {
    previewSessionKey = value;
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.setItemAsync(API_KEY_NAME, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function deleteApiKey(): Promise<void> {
  if (Platform.OS === "web") {
    previewSessionKey = null;
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.deleteItemAsync(API_KEY_NAME);
}

export async function readGitHubToken(): Promise<string | null> {
  if (Platform.OS === "web") return previewGitHubToken;
  const SecureStore = await import("expo-secure-store");
  return SecureStore.getItemAsync(GITHUB_TOKEN_NAME);
}

export async function writeGitHubToken(value: string): Promise<void> {
  if (Platform.OS === "web") {
    previewGitHubToken = value;
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.setItemAsync(GITHUB_TOKEN_NAME, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function deleteGitHubToken(): Promise<void> {
  if (Platform.OS === "web") {
    previewGitHubToken = null;
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.deleteItemAsync(GITHUB_TOKEN_NAME);
}
