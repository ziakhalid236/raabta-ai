import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

const C = {
  paper: "#F7F7F3",
  white: "#FFFFFF",
  ink: "#202A28",
  muted: "#78817D",
  teal: "#0F766E",
  tealPale: "#E7F1EE",
  line: "#E7E9E4",
};

export function AttachmentSheet({
  visible,
  language,
  onClose,
  onPhoto,
  onFile,
  onAudio,
}: {
  visible: boolean;
  language: "ur" | "en";
  onClose: () => void;
  onPhoto: () => void;
  onFile: () => void;
  onAudio: () => void;
}) {
  const t = (english: string, urdu: string) => language === "ur" ? urdu : english;
  const actions = [
    { icon: "image-outline" as const, label: t("Choose a photo", "تصویر منتخب کریں"), onPress: onPhoto },
    { icon: "document-attach-outline" as const, label: t("Choose documents", "دستاویزات منتخب کریں"), onPress: onFile },
    { icon: "musical-notes-outline" as const, label: t("Choose an audio file", "آڈیو فائل منتخب کریں"), onPress: onAudio },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("Close attachment menu", "منسلکہ مینو بند کریں")} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t("Add to your message", "پیغام میں شامل کریں")}</Text>
          <Text style={styles.subtitle}>{t("Selected files stay local until you choose to send or transcribe.", "منتخب فائلیں تب تک فون پر رہتی ہیں جب تک آپ انہیں بھیجنے یا transcript بنانے کا انتخاب نہ کریں۔")}</Text>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={() => { onClose(); action.onPress(); }}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <View style={styles.icon}><Ionicons name={action.icon} size={19} color={C.teal} /></View>
              <Text style={styles.actionText}>{action.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={C.muted} />
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20,30,28,0.25)" },
  sheet: { paddingHorizontal: 17, paddingTop: 10, paddingBottom: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  handle: { width: 34, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: "#C9D0CB", marginBottom: 14 },
  title: { color: C.ink, fontSize: 17, fontWeight: "700" },
  subtitle: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: 12 },
  action: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 11, borderRadius: 15, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, marginTop: 7 },
  icon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.tealPale },
  actionText: { flex: 1, color: C.ink, fontSize: 13, fontWeight: "600" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
});
