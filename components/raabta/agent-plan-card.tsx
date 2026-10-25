import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AgentTask } from "@/lib/agent/task";

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

type Props = {
  task: AgentTask | null;
  isUrdu: boolean;
  expanded: boolean;
  onToggle: () => void;
};

const INTENT_LABEL: Record<string, [string, string]> = {
  research: ["Research", "تحقیق"],
  coding: ["Code change", "کوڈ تبدیلی"],
  github: ["GitHub work", "GitHub کام"],
  workspace: ["Workspace files", "workspace فائلیں"],
  media: ["Media analysis", "میڈیا تجزیہ"],
  writing: ["Writing", "لکھائی"],
  general: ["Answer", "جواب"],
};

const STATUS_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  done: "checkmark-circle",
  active: "ellipse",
  pending: "ellipse-outline",
  failed: "close-circle",
  skipped: "remove-circle-outline",
};

function statusColor(status: string): string {
  if (status === "done") return C.teal;
  if (status === "failed") return C.danger;
  if (status === "active") return C.amber;
  return "#B6C0BB";
}

export function AgentPlanCard({ task, isUrdu, expanded, onToggle }: Props) {
  const [showEvents, setShowEvents] = useState(false);
  if (!task) return null;
  const total = task.plan.steps;
  const doneCount = total.filter((step) => step.status === "done").length;
  const ratio = total.length ? doneCount / total.length : 0;
  const [englishIntent, urduIntent] = INTENT_LABEL[task.plan.intent] ?? [
    "Task",
    "کام",
  ];
  const statusLabel: Record<string, [string, string]> = {
    planning: ["Planning", "منصوبہ"],
    running: ["Working", "کام جاری"],
    verifying: ["Verifying", "جانچ"],
    done: ["Completed", "مکمل"],
    failed: ["Failed", "ناکام"],
    stopped: ["Stopped", "روکا گیا"],
  };
  const [statusEn, statusUr] = statusLabel[task.status] ?? ["Working", "کام جاری"];

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.header}
      >
        <View style={styles.headerIcon}>
          <Ionicons name="git-network-outline" size={16} color={C.teal} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>
            {isUrdu ? `منصوبہ · ${urduIntent}` : `Agent plan · ${englishIntent}`}
          </Text>
          <Text style={styles.headerSubtitle}>
            {isUrdu
              ? `${doneCount}/${total.length} مراحل مکمل · ${statusUr}`
              : `${doneCount}/${total.length} steps complete · ${statusEn}`}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={17}
          color={C.muted}
        />
      </Pressable>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.round(ratio * 100)}%`,
              backgroundColor: task.status === "failed" ? C.danger : C.teal,
            },
          ]}
        />
      </View>

      {expanded ? (
        <View style={styles.steps}>
          {total.map((step, index) => (
            <View key={step.id} style={styles.step}>
              <Ionicons
                name={STATUS_ICON[step.status] ?? "ellipse-outline"}
                size={15}
                color={statusColor(step.status)}
              />
              <Text
                style={[
                  styles.stepText,
                  step.status === "done" && styles.stepTextDone,
                  step.status === "active" && styles.stepTextActive,
                ]}
              >
                {index + 1}. {isUrdu ? step.titleUr : step.title}
              </Text>
            </View>
          ))}
          {task.events.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowEvents((current) => !current)}
              style={styles.eventsToggle}
            >
              <Ionicons name="pulse-outline" size={14} color={C.teal} />
              <Text style={styles.eventsToggleText}>
                {isUrdu
                  ? `${task.events.length} tool actions دیکھیں`
                  : `View ${task.events.length} tool action${task.events.length === 1 ? "" : "s"}`}
              </Text>
              <Ionicons
                name={showEvents ? "chevron-up" : "chevron-down"}
                size={14}
                color={C.teal}
              />
            </Pressable>
          ) : null}
          {showEvents
            ? task.events.map((event) => (
                <View key={event.id} style={styles.event}>
                  <Ionicons
                    name={
                      event.status === "done"
                        ? "checkmark"
                        : event.status === "failed"
                          ? "close"
                          : event.status === "blocked"
                            ? "lock-closed"
                            : "sync"
                    }
                    size={12}
                    color={
                      event.status === "done"
                        ? C.teal
                        : event.status === "failed"
                          ? C.danger
                          : C.muted
                    }
                  />
                  <Text numberOfLines={2} style={styles.eventText}>
                    {event.detail}
                  </Text>
                </View>
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: C.tealPale,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  headerTitle: { color: C.ink, fontSize: 13, fontWeight: "700" },
  headerSubtitle: { color: C.muted, fontSize: 11, marginTop: 2 },
  progressTrack: { height: 3, backgroundColor: C.line, marginHorizontal: 12 },
  progressFill: { height: 3, borderRadius: 2 },
  steps: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 7 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  stepText: { flex: 1, color: C.muted, fontSize: 12, lineHeight: 17 },
  stepTextDone: { color: C.ink },
  stepTextActive: { color: C.amber, fontWeight: "600" },
  eventsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingVertical: 6,
  },
  eventsToggleText: { flex: 1, color: C.tealDark, fontSize: 11, fontWeight: "600" },
  event: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingLeft: 4 },
  eventText: { flex: 1, color: C.muted, fontSize: 11, lineHeight: 15 },
});
