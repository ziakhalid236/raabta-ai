import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { riskLabel, type ApprovalDecision, type ApprovalRisk } from "@/lib/agent/approvals";

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

export type ApprovalRequest = {
  id: string;
  tool: string;
  risk: ApprovalRisk;
  /** One-line what-will-happen, already sanitised. */
  english: string;
  urdu: string;
  /** Optional exact payload preview, e.g. the content being committed. */
  preview?: string;
  /** True when the user can choose "Always allow" for this tool. */
  rememberable: boolean;
};

type Props = {
  request: ApprovalRequest | null;
  isUrdu: boolean;
  onDecide: (decision: ApprovalDecision) => void;
};

function riskVisual(risk: ApprovalRisk) {
  if (risk === "destructive")
    return { icon: "warning-outline" as const, color: C.danger, bg: C.dangerPale };
  return { icon: "create-outline" as const, color: C.amber, bg: C.amberPale };
}

export function ApprovalSheet({ request, isUrdu, onDecide }: Props) {
  if (!request) return null;
  const visual = riskVisual(request.risk);
  const label = riskLabel(request.risk);

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => onDecide("deny")}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.head}>
            <View style={[styles.headIcon, { backgroundColor: visual.bg }]}>
              <Ionicons name={visual.icon} size={20} color={visual.color} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.headTitle}>
                {isUrdu ? "اجازت درکار ہے" : "Approval needed"}
              </Text>
              <Text style={styles.headTool}>{request.tool}</Text>
            </View>
            <View style={[styles.riskPill, { backgroundColor: visual.bg }]}>
              <Text style={[styles.riskPillText, { color: visual.color }]}>
                {isUrdu ? label.urdu : label.english}
              </Text>
            </View>
          </View>

          <Text style={styles.summary}>{isUrdu ? request.urdu : request.english}</Text>

          {request.preview ? (
            <View style={styles.previewWrap}>
              <View style={styles.previewHead}>
                <Ionicons name="document-text-outline" size={13} color={C.muted} />
                <Text style={styles.previewTitle}>
                  {isUrdu ? "جو بھیجا جائے گا" : "Exact content"}
                </Text>
              </View>
              <ScrollView style={styles.previewScroll} nestedScrollEnabled>
                <Text style={styles.previewText}>{request.preview}</Text>
              </ScrollView>
            </View>
          ) : null}

          {request.rememberable ? (
            <View style={styles.note}>
              <Ionicons name="repeat-outline" size={14} color={C.teal} />
              <Text style={styles.noteText}>
                {isUrdu
                  ? "“ہمیشہ اجازت دیں” چنیں تو اس کام کے لیے بار بار نہیں پوچھا جائے گا۔"
                  : "Choose “Always allow” and the agent will stop asking for this action."}
              </Text>
            </View>
          ) : (
            <View style={styles.note}>
              <Ionicons name="alert-circle-outline" size={14} color={C.amber} />
              <Text style={styles.noteText}>
                {isUrdu
                  ? "یہ کام واپس نہیں ہو سکتا، اس لیے ہر بار اجازت پوچھی جائے گی۔"
                  : "This action cannot be undone, so it is never remembered."}
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onDecide("deny")}
              style={({ pressed }) => [
                styles.button,
                styles.denyButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.denyText}>{isUrdu ? "انکار" : "Deny"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onDecide("once")}
              style={({ pressed }) => [
                styles.button,
                styles.onceButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.onceText}>{isUrdu ? "صرف اس بار" : "Allow once"}</Text>
            </Pressable>
            {request.rememberable ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onDecide("always")}
                style={({ pressed }) => [
                  styles.button,
                  styles.alwaysButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.alwaysText}>
                  {isUrdu ? "ہمیشہ اجازت" : "Always allow"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(24,32,30,0.42)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
    maxHeight: "86%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.line,
    marginBottom: 14,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  headIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  headTitle: { color: C.ink, fontSize: 15, fontWeight: "700" },
  headTool: { color: C.muted, fontSize: 11, marginTop: 2 },
  riskPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  riskPillText: { fontSize: 10, fontWeight: "700" },
  summary: { color: C.ink, fontSize: 13, lineHeight: 20, marginTop: 14 },
  previewWrap: {
    marginTop: 14,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    overflow: "hidden",
  },
  previewHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  previewTitle: { color: C.muted, fontSize: 11, fontWeight: "600" },
  previewScroll: { maxHeight: 168 },
  previewText: {
    color: C.ink,
    fontSize: 11,
    lineHeight: 17,
    padding: 12,
    fontFamily: "monospace",
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 14,
    backgroundColor: C.tealPale,
    borderRadius: 12,
    padding: 10,
  },
  noteText: { flex: 1, color: C.tealDark, fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: "row", gap: 8, marginTop: 18 },
  button: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.82 },
  denyButton: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  denyText: { color: C.danger, fontSize: 12, fontWeight: "700" },
  onceButton: { backgroundColor: C.tealPale },
  onceText: { color: C.tealDark, fontSize: 12, fontWeight: "700" },
  alwaysButton: { backgroundColor: C.teal },
  alwaysText: { color: C.white, fontSize: 12, fontWeight: "700" },
});
