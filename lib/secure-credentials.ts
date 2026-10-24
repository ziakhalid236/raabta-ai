import { Platform } from "react-native";

const API_KEY_NAME = "raabta.provider.api-key.v1";
let previewSessionKey: string | null = null;

/**
 * Android/iOS secrets are stored in the platform-backed Expo SecureStore.
 * Browser Preview deliberately uses memory only; it never writes a key to
 * localStorage, AsyncStorage, logs, or the conversation database.
 */
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
