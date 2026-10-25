import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

const C = {
  white: "#FFFFFF",
  ink: "#202A28",
  muted: "#78817D",
  teal: "#0F766E",
  tealDark: "#075E58",
  tealPale: "#E7F1EE",
  line: "#E7E9E4",
};

export type StarterPrompt = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  titleUr: string;
  prompt: string;
  promptUr: string;
};

/** Real capabilities the agent can perform, surfaced so they are discoverable. */
export const STARTER_PROMPTS: StarterPrompt[] = [
  {
    id: "research",
    icon: "search-outline",
    title: "Research the web",
    titleUr: "ویب پر تحقیق",
    prompt: "Search the web for the latest news about AI on Android and cite the sources.",
    promptUr: "Android پر AI کی تازہ خبریں ویب پر تلاش کریں اور ذرائع لکھیں۔",
  },
  {
    id: "code",
    icon: "code-slash-outline",
    title: "Write and save code",
    titleUr: "کوڈ لکھیں اور محفوظ کریں",
    prompt: "Write a Python script that renames files and save it in my workspace.",
    promptUr: "فائلوں کے نام بدلنے کے لیے Python script لکھیں اور workspace میں محفوظ کریں۔",
  },
  {
    id: "github",
    icon: "logo-github",
    title: "Work on a repo",
    titleUr: "repository پر کام",
    prompt: "List my repositories and summarise the files in the README.",
    promptUr: "میری repositories دیکھیں اور README کی فائلیں خلاصہ کریں۔",
  },
  {
    id: "workspace",
    icon: "folder-open-outline",
    title: "Organise my files",
    titleUr: "فائلیں منظم کریں",
    prompt: "List my workspace files and tell me what is stored there.",
    promptUr: "میرے workspace کی فائلیں دیکھیں اور بتائیں کہ کیا محفوظ ہے۔",
  },
];

type Props = {
  isUrdu: boolean;
  onPick: (prompt: string) => void;
};

export function StarterPromptGrid({ isUrdu, onPick }: Props) {
  return (
    <View style={styles.grid}>
      {STARTER_PROMPTS.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={isUrdu ? item.titleUr : item.title}
          onPress={() => onPick(isUrdu ? item.promptUr : item.prompt)}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.iconWrap}>
            <Ionicons name={item.icon} size={16} color={C.teal} />
          </View>
          <Text style={styles.cardTitle}>{isUrdu ? item.titleUr : item.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 18,
    justifyContent: "center",
  },
  card: {
    width: "47%",
    minWidth: 140,
    flexGrow: 1,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  cardPressed: { backgroundColor: "#F2F6F4" },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: C.tealPale,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: C.ink, fontSize: 12, fontWeight: "600", lineHeight: 17 },
});
