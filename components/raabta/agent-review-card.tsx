import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CapabilityReport } from "@/lib/agent/capabilities";
import type { AgentTask } from "@/lib/agent/task";
import type { VerificationReport } from "@/lib/agent/verifier";

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

function severityVisual(severity: VerificationReport["severity"]) {
  if (severity === "problem")
    return { icon: "close-circle" as const, color: C.danger, bg: C.dangerPale };
  if (severity === "warning")
    return { icon: "alert-circle" as const, color: C.amber, bg: C.amberPale };
  if (severity === "info")
    return { icon: "information-circle" as const, color: C.muted, bg: C.line };
  return { icon: "shield-checkmark" as const, color: C.teal, bg: C.tealPale };
}

type Props = {
  task: AgentTask | null;
  report: VerificationReport | null;
  capabilities: CapabilityReport | null;
  isUrdu: boolean;
  onRetry: () => void;
  onShowCapabilities: () => void;
};

export function AgentReviewCard({
  task,
  report,
  capabilities,
  isUrdu,
  onRetry,
  onShowCapabilities,
}: Props) {
  if (!task || !report) return null;
  const visual = severityVisual(report.severity);
  const headline: Record<VerificationReport["severity"], [string, string]> = {
    ok: ["Checked — looks correct", "جانچ مکمل — سب درست ہے"],
    info: ["Checked — minor notes", "جانچ مکمل — معمولی باتیں"],
    warning: ["Checked — needs attention", "جانچ مکمل — توجہ درکار"],
    problem: ["Checked — claims not supported", "جانچ — کچھ دعوے ثابت نہیں"],
  };
  const [headEn, headUr] = headline[report.severity];
  const failedTools = task.events.filter((event) => event.status === "failed").length;
  const blockedTools = task.events.filter((event) => event.status === "blocked").length;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.headIcon, { backgroundColor: visual.bg }]}>
          <Ionicons name={visual.icon} size={18} color={visual.color} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.headTitle}>{isUrdu ? headUr : headEn}</Text>
          <Text style={styles.headSub}>
            {isUrdu
              ? `${task.events.length} tool · ${failedTools} ناکام · ${blockedTools} اجازت نہیں`
              : `${task.events.length} tool calls · ${failedTools} failed · ${blockedTools} blocked`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isUrdu ? "دستاویز" : "Report"}
          onPress={onShowCapabilities}
          style={styles.infoButton}
        >
          <Ionicons name="information-circle-outline" size={18} color={C.muted} />
        </Pressable>
      </View>

      <View style={styles.metrics}>
        <Metric
          label={isUrdu ? "مراحل" : "Steps"}
          value={`${task.plan.steps.filter((step) => step.status === "done").length}/${task.plan.steps.length}`}
        />
        <Metric label={isUrdu ? "کویریج" : "Coverage"} value={`${Math.round(report.coverage * 100)}%`} />
        <Metric
          label={isUrdu ? "کامیاب tool" : "Tools ok"}
          value={`${report.toolCalls - report.toolFailures}`}
        />
      </View>

      <View style={styles.findings}>
        {report.findings.map((finding) => {
          const fv = severityVisual(finding.severity);
          return (
            <View key={finding.id} style={styles.finding}>
              <Ionicons name={fv.icon} size={13} color={fv.color} />
              <Text style={styles.findingText}>
                {isUrdu ? finding.urdu : finding.english}
              </Text>
            </View>
          );
        })}
      </View>

      {capabilities ? (
        <View style={styles.caps}>
          <Text style={styles.capsTitle}>
            {isUrdu ? `اس ڈیوائس پر دستیاب (${capabilities.platform})` : `Available on this device (${capabilities.platform})`}
          </Text>
          {capabilities.capabilities
            .filter((capability) => capability.state !== "unavailable")
            .slice(0, 4)
            .map((capability) => (
              <View key={capability.id} style={styles.capRow}>
                <Ionicons name="checkmark" size={12} color={C.teal} />
                <Text style={styles.capText}>
                  {isUrdu ? capability.urdu : capability.english}
                </Text>
              </View>
            ))}
        </View>
      ) : null}

      {report.severity === "problem" || report.severity === "warning" ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        >
          <Ionicons name="refresh-outline" size={15} color={C.white} />
          <Text style={styles.retryText}>
            {isUrdu ? "دوبارہ کوشش کریں" : "Fix and continue"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
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
    padding: 13,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  headIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  headTitle: { color: C.ink, fontSize: 13, fontWeight: "700" },
  headSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  infoButton: { padding: 4 },
  metrics: { flexDirection: "row", gap: 8, marginTop: 12 },
  metric: {
    flex: 1,
    backgroundColor: C.paper,
    borderRadius: 11,
    paddingVertical: 9,
    alignItems: "center",
  },
  metricValue: { color: C.ink, fontSize: 14, fontWeight: "700" },
  metricLabel: { color: C.muted, fontSize: 10, marginTop: 2 },
  findings: { marginTop: 12, gap: 7 },
  finding: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  findingText: { flex: 1, color: C.ink, fontSize: 11, lineHeight: 16 },
  caps: {
    marginTop: 12,
    backgroundColor: C.paper,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  capsTitle: { color: C.muted, fontSize: 10, fontWeight: "700" },
  capRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  capText: { flex: 1, color: C.ink, fontSize: 10.5, lineHeight: 15 },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 13,
    backgroundColor: C.teal,
    borderRadius: 12,
    paddingVertical: 12,
  },
  pressed: { opacity: 0.85 },
  retryText: { color: C.white, fontSize: 12, fontWeight: "700" },
});
