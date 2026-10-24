import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { OpenRouterModel } from "@/lib/openrouter";

const C = {
  paper: "#F7F7F3",
  white: "#FFFFFF",
  ink: "#202A28",
  muted: "#78817D",
  teal: "#0F766E",
  tealDark: "#075E58",
  tealPale: "#E7F1EE",
  line: "#E7E9E4",
};

type ModelKind = "chat" | "transcription";

export function ModelPicker({
  visible,
  language,
  kind,
  models,
  selectedModelId,
  loading = false,
  message = "",
  onClose,
  onRefresh,
  onSelect,
}: {
  visible: boolean;
  language: "ur" | "en";
  kind: ModelKind;
  models: OpenRouterModel[];
  selectedModelId: string;
  loading?: boolean;
  message?: string;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (model: OpenRouterModel) => void;
}) {
  const t = (english: string, urdu: string) => language === "ur" ? urdu : english;
  const [query, setQuery] = useState("");
  const [visionOnly, setVisionOnly] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return models.filter((model) => {
      if (kind === "chat" && visionOnly && !model.inputModalities.includes("image"))
        return false;
      if (!needle) return true;
      return `${model.name} ${model.description}`
        .toLowerCase()
        .includes(needle);
    });
  }, [kind, models, query, visionOnly]);

  const title = kind === "chat" ? t("Choose a chat model", "چیٹ ماڈل منتخب کریں") : t("Choose a voice model", "آواز کا ماڈل منتخب کریں");
  const subtitle = kind === "chat"
    ? t("Names and image support from your loaded OpenRouter catalog", "آپ کی OpenRouter فہرست سے ماڈل نام اور image support")
    : t("Models returned for OpenRouter speech transcription", "OpenRouter سے دستیاب آواز کی transcription کے ماڈلز");

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close model picker" onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={21} color={C.ink} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh model list" onPress={onRefresh} disabled={loading} style={styles.headerButton}>
            {loading ? <ActivityIndicator color={C.teal} size="small" /> : <Ionicons name="refresh-outline" size={19} color={C.teal} />}
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={17} color={C.muted} />
          <TextInput
            accessibilityLabel="Search models"
            autoCapitalize="none"
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
            placeholder={t("Search model names", "ماڈل کے نام تلاش کریں")}
            placeholderTextColor="#9AA29E"
            style={styles.searchInput}
          />
          {query ? <Pressable accessibilityLabel="Clear search" onPress={() => setQuery("")}><Ionicons name="close-circle" size={17} color={C.muted} /></Pressable> : null}
        </View>

        {kind === "chat" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: visionOnly }}
            onPress={() => setVisionOnly((current) => !current)}
            style={[styles.filter, visionOnly && styles.filterActive]}
          >
            <Ionicons name="image-outline" size={15} color={visionOnly ? C.teal : C.muted} />
            <Text style={[styles.filterText, visionOnly && styles.filterTextActive]}>
              {visionOnly ? t("Showing image-capable models", "image-capable ماڈلز دکھا رہے ہیں") : t("Filter for image-capable models", "image-capable ماڈلز فلٹر کریں")}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.noticeRow}>
          <Text style={styles.countText}>
            {models.length ? t(`${filtered.length} of ${models.length} models`, `${models.length} میں سے ${filtered.length} ماڈل`) : t("No models loaded", "ماڈلز لوڈ نہیں ہوئے")}
          </Text>
          <Text style={styles.priceNote}>{t("Listed price may change", "درج قیمت بدل سکتی ہے")}</Text>
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {loading && models.length === 0 ? (
          <View style={styles.loading}><ActivityIndicator color={C.teal} /><Text style={styles.emptyText}>{t("Loading OpenRouter models…", "OpenRouter ماڈلز لوڈ ہو رہے ہیں…")}</Text></View>
        ) : filtered.length ? (
          <FlatList
            data={filtered}
            keyExtractor={(model) => model.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const selected = item.id === selectedModelId;
              const canSeeImages = item.inputModalities.includes("image");
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(item)}
                  style={[styles.model, selected && styles.modelSelected]}
                >
                  <View style={styles.modelTop}>
                    <View style={styles.modelCopy}>
                      <Text style={styles.modelName}>{item.name}</Text>
                      {item.description ? <Text numberOfLines={2} style={styles.modelDescription}>{item.description}</Text> : null}
                    </View>
                    {selected ? <Ionicons name="checkmark-circle" size={21} color={C.teal} /> : <Ionicons name="ellipse-outline" size={20} color="#B6C0BB" />}
                  </View>
                  <View style={styles.badges}>
                    {kind === "chat" && canSeeImages ? <Text style={styles.badge}>VISION</Text> : null}
                    {kind === "chat" && item.inputModalities.includes("audio") ? <Text style={styles.badge}>AUDIO INPUT</Text> : null}
                    {item.promptPrice === 0 && item.completionPrice === 0 ? <Text style={styles.freeBadge}>FREE</Text> : null}
                    {item.contextLength ? <Text style={styles.context}>{formatContext(item.contextLength)} context</Text> : null}
                  </View>
              <Text style={styles.price}>{formatPrice(item.promptPrice, item.completionPrice, language)}</Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyText}>{t("No matching models. Try another search or refresh the catalog.", "کوئی ماڈل نہیں ملا۔ دوبارہ تلاش کریں یا فہرست تازہ کریں۔")}</Text>}
          />
        ) : (
          <View style={styles.empty}><Ionicons name="cube-outline" size={28} color="#9AA29E" /><Text style={styles.emptyTitle}>{t("Connect OpenRouter to load models", "ماڈلز لوڈ کرنے کے لیے OpenRouter جوڑیں")}</Text><Text style={styles.emptyText}>{t("The picker only shows models returned by the catalog. Model access can still depend on your account and provider.", "یہاں صرف catalog میں ملنے والے ماڈلز دکھتے ہیں۔ رسائی پھر بھی آپ کے اکاؤنٹ اور provider پر منحصر ہو سکتی ہے۔")}</Text><Pressable onPress={onRefresh} disabled={loading} style={styles.refreshButton}><Text style={styles.refreshText}>{loading ? t("Loading…", "لوڈ ہو رہا ہے…") : t("Refresh catalog", "فہرست تازہ کریں")}</Text></Pressable></View>
        )}
        <Text style={styles.footer}>{t("A catalog entry does not guarantee account access. Inference requests may incur provider charges.", "catalog میں ماڈل ہونا رسائی کی ضمانت نہیں۔ inference پر provider فیس لگ سکتی ہے۔")}</Text>
      </SafeAreaView>
    </Modal>
  );
}

function formatPrice(input: number | null, output: number | null, language: "ur" | "en"): string {
  const urdu = language === "ur";
  if (input === null || output === null) return urdu ? "قیمت درج نہیں" : "Price not listed";
  if (input === 0 && output === 0) return urdu ? "فہرست میں token فیس صفر" : "No listed token charge";
  return urdu
    ? `ان پٹ ${usdPerMillion(input)} · آؤٹ پٹ ${usdPerMillion(output)} / 1M tokens`
    : `Input ${usdPerMillion(input)} · output ${usdPerMillion(output)} / 1M tokens`;
}

function usdPerMillion(value: number): string {
  const amount = value * 1_000_000;
  return amount < 0.01 && amount > 0
    ? `$${amount.toFixed(4)}`
    : `$${amount.toFixed(2)}`;
}

function formatContext(value: number): string {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : `${Math.round(value / 1000)}K`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper },
  header: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, backgroundColor: C.white },
  headerButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.paper },
  headerCopy: { flex: 1 },
  title: { color: C.ink, fontSize: 17, fontWeight: "700" },
  subtitle: { color: C.muted, fontSize: 11, marginTop: 3 },
  searchWrap: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 9, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 13, borderRadius: 15, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  searchInput: { flex: 1, color: C.ink, fontSize: 14, paddingVertical: 9 },
  filter: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 99, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  filterActive: { backgroundColor: C.tealPale, borderColor: "#BEDAD1" },
  filterText: { color: C.muted, fontSize: 11, fontWeight: "600" },
  filterTextActive: { color: C.teal },
  noticeRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 12 },
  countText: { color: C.ink, fontSize: 11, fontWeight: "700" },
  priceNote: { color: C.muted, fontSize: 10 },
  message: { color: "#80561D", fontSize: 11, lineHeight: 16, marginHorizontal: 17, marginTop: 8 },
  list: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 18, gap: 8 },
  model: { padding: 13, borderRadius: 16, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  modelSelected: { borderColor: "#92C1B3", backgroundColor: "#F5FAF8" },
  modelTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  modelCopy: { flex: 1 },
  modelName: { color: C.ink, fontSize: 14, fontWeight: "700" },
  modelDescription: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  badges: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 9, flexWrap: "wrap" },
  badge: { color: C.tealDark, fontSize: 9, fontWeight: "700", letterSpacing: 0.4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 99, backgroundColor: C.tealPale },
  freeBadge: { color: "#6A551E", fontSize: 9, fontWeight: "700", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 99, backgroundColor: "#F8F1D8" },
  context: { color: C.muted, fontSize: 10 },
  price: { color: C.muted, fontSize: 10, marginTop: 8 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 9 },
  emptyTitle: { color: C.ink, fontSize: 16, fontWeight: "700", textAlign: "center" },
  emptyText: { color: C.muted, fontSize: 12, lineHeight: 18, textAlign: "center", padding: 20 },
  refreshButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 13, backgroundColor: C.teal },
  refreshText: { color: C.white, fontSize: 12, fontWeight: "700" },
  footer: { color: C.muted, fontSize: 10, lineHeight: 15, textAlign: "center", paddingHorizontal: 18, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.white },
});
