import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { SafeAreaView } from "react-native-safe-area-context";

import type { GitHubProfile } from "@/lib/github-account";

const C = {
  paper: "#F7F7F3",
  white: "#FFFFFF",
  ink: "#202A28",
  muted: "#78817D",
  teal: "#0F766E",
  tealDark: "#075E58",
  tealPale: "#E7F1EE",
  line: "#E7E9E4",
  danger: "#A34037",
  dangerPale: "#FAECEA",
};

export function AccountsSheet({
  visible,
  language,
  openRouterConnected,
  selectedModelName,
  githubProfile,
  repositoryCount,
  repositoryNames,
  connecting,
  status,
  onClose,
  onManageOpenRouter,
  onConnectGitHub,
  onDisconnectGitHub,
}: {
  visible: boolean;
  language: "ur" | "en";
  openRouterConnected: boolean;
  selectedModelName: string;
  githubProfile: GitHubProfile | null;
  repositoryCount: number;
  repositoryNames: string[];
  connecting: boolean;
  status: string;
  onClose: () => void;
  onManageOpenRouter: () => void;
  onConnectGitHub: (token: string) => Promise<boolean>;
  onDisconnectGitHub: () => void;
}) {
  const t = (english: string, urdu: string) => language === "ur" ? urdu : english;
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);

  async function connect() {
    if (!tokenDraft.trim() || connecting) return;
    const success = await onConnectGitHub(tokenDraft.trim());
    if (success) setTokenDraft("");
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close accounts" onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={21} color={C.ink} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.title}>{t("Accounts", "اکاؤنٹس")}</Text>
            <Text style={styles.subtitle}>{t("Your connected services stay under your control", "منسلک خدمات آپ کے اختیار میں رہتی ہیں")}</Text>
          </View>
          <View style={styles.headerGlyph}><Ionicons name="logo-github" size={20} color={C.tealDark} /></View>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.accountCard}>
              <View style={styles.serviceGlyph}><Ionicons name="sparkles" size={19} color={C.teal} /></View>
              <View style={styles.flex}>
                <Text style={styles.serviceName}>OpenRouter</Text>
                <Text style={styles.serviceDetail} numberOfLines={1}>
                  {openRouterConnected
                    ? selectedModelName || t("Connected · choose a chat model", "منسلک · چیٹ ماڈل منتخب کریں")
                    : t("Not connected", "منسلک نہیں")}
                </Text>
              </View>
              <View style={[styles.statusPill, openRouterConnected && styles.statusPillOn]}>
                <View style={[styles.statusDot, openRouterConnected && styles.statusDotOn]} />
                <Text style={[styles.statusLabel, openRouterConnected && styles.statusLabelOn]}>{openRouterConnected ? t("READY", "تیار") : t("OFF", "بند")}</Text>
              </View>
            </View>
            <Pressable accessibilityRole="button" onPress={onManageOpenRouter} style={styles.manageButton}>
              <Ionicons name="key-outline" size={16} color={C.teal} />
              <Text style={styles.manageText}>{t("Manage OpenRouter key & models", "OpenRouter key اور ماڈلز منظم کریں")}</Text>
              <Ionicons name="chevron-forward" size={15} color={C.muted} />
            </Pressable>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>GitHub</Text>
              <Text style={styles.sectionEyebrow}>{t("PROFILE ONLY", "صرف پروفائل")}</Text>
            </View>
            <View style={styles.accountCard}>
              {githubProfile ? (
                <Image source={{ uri: githubProfile.avatarUrl }} accessibilityLabel={`GitHub avatar for ${githubProfile.login}`} style={styles.avatar} />
              ) : (
                <View style={[styles.serviceGlyph, styles.githubGlyph]}><Ionicons name="logo-github" size={20} color={C.ink} /></View>
              )}
              <View style={styles.flex}>
                <Text style={styles.serviceName}>{githubProfile ? `@${githubProfile.login}` : "Connect GitHub"}</Text>
                <Text style={styles.serviceDetail}>{githubProfile ? t(`${repositoryCount} repositories verified for read-only access`, `${repositoryCount} repositories read-only رسائی کے لیے verified`) : t("No account connected", "کوئی اکاؤنٹ منسلک نہیں")}</Text>
              </View>
              {githubProfile ? <Ionicons name="checkmark-circle" size={20} color={C.teal} /> : null}
            </View>

            {githubProfile && repositoryNames.length ? (
              <View style={styles.repositoryList}>
                <Text style={styles.repositoryListTitle}>{t("Verified repositories", "تصدیق شدہ repositories")}</Text>
                {repositoryNames.slice(0, 20).map((name) => <Text key={name} style={styles.repositoryName}>• {name}</Text>)}
                {repositoryNames.length > 20 ? <Text style={styles.repositoryName}>+ {repositoryNames.length - 20} more</Text> : null}
              </View>
            ) : null}

            {!githubProfile ? (
              <>
                <Text style={styles.explanation}>
                  {t("Paste a personal access token to verify your profile. Raabta calls only GitHub’s authenticated profile endpoint; repository access and actions are not enabled.", "پروفائل کی تصدیق کے لیے personal access token درج کریں۔ رابطہ صرف GitHub profile endpoint پڑھتا ہے؛ repository access یا actions فعال نہیں ہیں۔")}
                </Text>
                <View style={styles.tokenWrap}>
                  <TextInput
                    accessibilityLabel="GitHub personal access token"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!tokenVisible}
                    value={tokenDraft}
                    onChangeText={setTokenDraft}
                    placeholder={t("Paste GitHub token", "GitHub token درج کریں")}
                    placeholderTextColor="#9AA29E"
                    style={styles.tokenInput}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel={tokenVisible ? t("Hide GitHub token", "GitHub token چھپائیں") : t("Show GitHub token", "GitHub token دکھائیں")} disabled={!tokenDraft} onPress={() => setTokenVisible((value) => !value)} style={styles.revealButton}>
                    <Ionicons name={tokenVisible ? "eye-off-outline" : "eye-outline"} size={18} color={tokenDraft ? C.teal : C.muted} />
                  </Pressable>
                </View>
                <Pressable accessibilityRole="button" onPress={() => void Linking.openURL("https://github.com/settings/personal-access-tokens/new").catch(() => undefined)} style={styles.createTokenButton}>
                  <Ionicons name="open-outline" size={15} color={C.teal} />
                  <Text style={styles.createTokenText}>{t("Create a GitHub token", "GitHub token بنائیں")}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={!tokenDraft.trim() || connecting} onPress={() => void connect()} style={[styles.primaryButton, (!tokenDraft.trim() || connecting) && styles.buttonDisabled]}>
                  {connecting ? <ActivityIndicator size="small" color={C.white} /> : <Ionicons name="link-outline" size={17} color={C.white} />}
                  <Text style={styles.primaryButtonText}>{connecting ? t("Checking GitHub…", "GitHub کی تصدیق ہو رہی ہے…") : t("Connect GitHub", "GitHub جوڑیں")}</Text>
                </Pressable>
                <Text style={styles.scopeNote}>{t("Use the minimum user-profile read permission if GitHub requires it. Do not grant repository access. The token is saved only after the profile check succeeds.", "اگر GitHub اجازت مانگے تو صرف کم سے کم profile read اجازت دیں۔ Repository access نہ دیں۔ token صرف کامیاب پروفائل تصدیق کے بعد محفوظ ہو گا۔")}</Text>
              </>
            ) : (
              <Pressable accessibilityRole="button" onPress={onDisconnectGitHub} style={styles.disconnectButton}>
                <Ionicons name="unlink-outline" size={16} color={C.danger} />
                <Text style={styles.disconnectText}>{t("Disconnect from Raabta", "رابطہ سے منقطع کریں")}</Text>
              </Pressable>
            )}

            {status ? <Text style={styles.statusMessage}>{status}</Text> : null}
            <View style={styles.privacyCard}>
              <Ionicons name="shield-checkmark-outline" size={19} color={C.teal} />
              <Text style={styles.privacyText}>
                {Platform.OS === "web"
                  ? t("Preview keeps tokens in this browser session only; they are not saved to web storage.", "Preview میں tokens صرف اسی browser session میں رہتے ہیں، web storage میں محفوظ نہیں ہوتے۔")
                  : t("GitHub and OpenRouter tokens use separate Android SecureStore entries. Profile details and model choices remain local.", "GitHub اور OpenRouter tokens الگ Android SecureStore entries میں محفوظ ہیں۔ پروفائل اور ماڈل انتخاب فون پر رہتے ہیں۔")}
              </Text>
            </View>
            <View style={styles.futureCard}>
              <Ionicons name="git-network-outline" size={17} color={C.muted} />
              <Text style={styles.futureText}>{t("Repository tools, YouTube and MCP connections are future work and will need separate permissions and your approval.", "Repository tools، YouTube اور MCP کنکشن مستقبل کے مراحل ہیں؛ ان کے لیے الگ اجازت اور آپ کی منظوری درکار ہو گی۔")}</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, backgroundColor: C.white },
  headerButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
  headerGlyph: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.tealPale },
  title: { color: C.ink, fontSize: 17, fontWeight: "700" },
  subtitle: { color: C.muted, fontSize: 11, marginTop: 3 },
  content: { padding: 16, paddingBottom: 28, gap: 12 },
  accountCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderRadius: 16, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  serviceGlyph: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.tealPale },
  githubGlyph: { backgroundColor: "#F1F2EF" },
  avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.tealPale },
  serviceName: { color: C.ink, fontSize: 14, fontWeight: "700" },
  serviceDetail: { color: C.muted, fontSize: 11, marginTop: 3 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99, backgroundColor: "#F0F1EF" },
  statusPillOn: { backgroundColor: C.tealPale },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.muted },
  statusDotOn: { backgroundColor: C.teal },
  statusLabel: { color: C.muted, fontSize: 9, fontWeight: "700" },
  statusLabelOn: { color: C.tealDark },
  manageButton: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 9, paddingVertical: 6 },
  manageText: { color: C.teal, fontSize: 11, fontWeight: "700" },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  sectionTitle: { color: C.ink, fontSize: 15, fontWeight: "700" },
  sectionEyebrow: { color: C.teal, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  explanation: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 1 },
  tokenWrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.white },
  tokenInput: { flex: 1, color: C.ink, fontSize: 13, paddingVertical: 14 },
  revealButton: { padding: 8 },
  createTokenButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5 },
  createTokenText: { color: C.teal, fontSize: 11, fontWeight: "700" },
  primaryButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, backgroundColor: C.teal },
  buttonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: C.white, fontSize: 13, fontWeight: "700" },
  scopeNote: { color: C.muted, fontSize: 10, lineHeight: 15 },
  disconnectButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, backgroundColor: C.dangerPale },
  disconnectText: { color: C.danger, fontSize: 11, fontWeight: "700" },
  statusMessage: { color: C.tealDark, fontSize: 11, lineHeight: 16, padding: 10, borderRadius: 12, backgroundColor: C.tealPale },
  privacyCard: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderRadius: 14, backgroundColor: C.tealPale, marginTop: 7 },
  privacyText: { flex: 1, color: C.tealDark, fontSize: 11, lineHeight: 16 },
  futureCard: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderRadius: 14, backgroundColor: "#F0F1EE" },
  futureText: { flex: 1, color: C.muted, fontSize: 10, lineHeight: 15 },
  repositoryList: { padding: 12, borderRadius: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  repositoryListTitle: { color: C.ink, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  repositoryName: { color: C.muted, fontSize: 11, lineHeight: 18 },
});
