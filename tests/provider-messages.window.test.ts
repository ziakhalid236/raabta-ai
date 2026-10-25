import { describe, expect, it, vi } from "vitest";

// provider-messages reaches lib/mobile-media, which imports these native
// modules as values. vitest cannot resolve them (and the repo has no path
// alias), so they are stubbed. The text-window logic under test is real code.
vi.mock("expo-document-picker", () => ({}));
vi.mock("expo-image-picker", () => ({}));
vi.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: vi.fn(async () => ""),
  getInfoAsync: vi.fn(async () => ({ exists: false })),
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

import { makeProviderMessages } from "../lib/provider-messages";
import type { ChatMessage } from "../lib/chat-storage";

function user(id: string, content: string): ChatMessage {
  return { id, role: "user", content, createdAt: new Date().toISOString() };
}

describe("provider message window", () => {
  it("keeps a short conversation intact and adds no notice", async () => {
    const messages = [user("1", "first"), user("2", "second")];
    const out = await makeProviderMessages(messages, new AbortController().signal);
    const text = JSON.stringify(out);
    expect(text).toContain("first");
    expect(text).toContain("second");
    expect(text).not.toContain("Earlier turns were omitted");
  });

  it("bounds a long conversation and tells the model what was dropped", async () => {
    const messages = Array.from({ length: 40 }, (_, index) =>
      user(String(index), `message number ${index}`),
    );
    const out = await makeProviderMessages(messages, new AbortController().signal);
    const text = JSON.stringify(out);

    // The oldest turns are dropped and replaced by an explicit notice.
    expect(text).not.toContain("message number 0");
    expect(text).toContain("Earlier turns were omitted");
    // The newest turn is always kept.
    expect(text).toContain("message number 39");

    // Exactly the bounded window of turns is forwarded, plus system context.
    const turns = out.filter((message) => message.role !== "system");
    expect(turns).toHaveLength(24);
    expect(turns.at(-1)).toMatchObject({ content: "message number 39" });
  });

  it("never forwards activity rows to the provider", async () => {
    const messages: ChatMessage[] = [
      user("1", "question"),
      {
        id: "a1",
        role: "activity",
        content: "internal status",
        activityStatus: "working",
        activityKind: "agent",
        activityPlatform: "Raabta",
        createdAt: new Date().toISOString(),
      },
    ];
    const text = JSON.stringify(
      await makeProviderMessages(messages, new AbortController().signal),
    );
    expect(text).toContain("question");
    expect(text).not.toContain("internal status");
  });
});
