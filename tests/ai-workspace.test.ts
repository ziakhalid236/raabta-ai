import { beforeEach, describe, expect, it, vi } from "vitest";

const { files } = vi.hoisted(() => ({ files: new Map<string, string>() }));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///private/",
  makeDirectoryAsync: vi.fn(async () => undefined),
  getInfoAsync: vi.fn(async (path: string) => {
    const isDirectory =
      path === "file:///private/raabta/ai-workspace/" ||
      path.endsWith("/") ||
      [...files.keys()].some((file) => file.startsWith(`${path}/`));
    return {
      exists: isDirectory || files.has(path),
      isDirectory,
      size: files.has(path) ? new TextEncoder().encode(files.get(path) ?? "").byteLength : 0,
    };
  }),
  readDirectoryAsync: vi.fn(async (path: string) => {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    return [...new Set(
      [...files.keys()]
        .filter((file) => file.startsWith(prefix))
        .map((file) => file.slice(prefix.length).split("/")[0])
        .filter(Boolean),
    )];
  }),
  readAsStringAsync: vi.fn(async (path: string) => files.get(path) ?? ""),
  writeAsStringAsync: vi.fn(async (path: string, content: string) => {
    files.set(path, content);
  }),
  deleteAsync: vi.fn(async (path: string) => {
    files.delete(path);
  }),
  moveAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
    const content = files.get(from);
    if (content === undefined) throw new Error("missing");
    files.delete(from);
    files.set(to, content);
  }),
}));

import {
  AI_WORKSPACE_MAX_BYTES,
  createAIWorkspaceDirectory,
  deleteAIWorkspaceFile,
  getAIWorkspaceFileInfo,
  listAIWorkspaceFiles,
  moveAIWorkspaceFile,
  readAIWorkspaceFile,
  writeAIWorkspaceFile,
} from "../lib/ai-workspace";

beforeEach(() => files.clear());

describe("private AI workspace", () => {
  it("rejects absolute paths and parent traversal", async () => {
    await expect(writeAIWorkspaceFile("../outside.txt", "no")).rejects.toThrow(/Parent-directory/);
    await expect(readAIWorkspaceFile("/outside.txt")).rejects.toThrow(/relative file path/);
  });

  it("writes and reads only a confined app-private text file", async () => {
    await writeAIWorkspaceFile("notes/todo.txt", "hello");
    await expect(readAIWorkspaceFile("notes/todo.txt")).resolves.toBe("hello");
    await expect(listAIWorkspaceFiles("notes")).resolves.toEqual(["notes/todo.txt"]);
  });

  it("exposes a fixed storage ceiling", () => {
    expect(AI_WORKSPACE_MAX_BYTES).toBe(100 * 1024 * 1024);
  });

  it("deletes only a named file inside the private workspace", async () => {
    await writeAIWorkspaceFile("notes/todo.txt", "hello");
    await expect(deleteAIWorkspaceFile("notes/todo.txt")).resolves.toMatchObject({
      path: "notes/todo.txt",
    });
    await expect(readAIWorkspaceFile("notes/todo.txt")).rejects.toThrow(/not found/);
    await expect(deleteAIWorkspaceFile("../outside.txt")).rejects.toThrow(/Parent-directory/);
  });

  it("refuses writes that would exceed the total 100 MB quota", async () => {
    const fullFile = "x".repeat(10 * 1024 * 1024);
    for (let index = 0; index < 10; index += 1) {
      files.set(`file:///private/raabta/ai-workspace/${index}.txt`, fullFile);
    }
    await expect(writeAIWorkspaceFile("extra.txt", "x")).rejects.toThrow(/100 MB/);
    expect(files.has("file:///private/raabta/ai-workspace/extra.txt")).toBe(false);
  });

  it("creates nested directories without writing a file", async () => {
    await expect(createAIWorkspaceDirectory("reports/2026")).resolves.toMatchObject({
      path: "reports/2026",
    });
    expect(files.size).toBe(0);
    await expect(createAIWorkspaceDirectory("../escape")).rejects.toThrow(/Parent-directory/);
  });

  it("moves a file and refuses to overwrite an existing one", async () => {
    await writeAIWorkspaceFile("draft.txt", "v1");
    await expect(moveAIWorkspaceFile("draft.txt", "final/notes.txt")).resolves.toMatchObject({
      from: "draft.txt",
      to: "final/notes.txt",
    });
    await expect(readAIWorkspaceFile("draft.txt")).rejects.toThrow(/not found/);
    await expect(readAIWorkspaceFile("final/notes.txt")).resolves.toBe("v1");

    await writeAIWorkspaceFile("other.txt", "v2");
    await expect(moveAIWorkspaceFile("other.txt", "final/notes.txt")).rejects.toThrow(
      /already exists/,
    );
  });

  it("reports file info and treats missing paths as absent", async () => {
    await writeAIWorkspaceFile("notes/todo.txt", "hello world");
    const info = await getAIWorkspaceFileInfo("notes/todo.txt");
    expect(info).toMatchObject({ path: "notes/todo.txt", exists: true, isDirectory: false });
    expect(info.bytes).toBe(11);
    expect(info.lines).toBe(1);
    await expect(getAIWorkspaceFileInfo("missing.txt")).resolves.toMatchObject({
      path: "missing.txt",
      exists: false,
      bytes: 0,
    });
    await expect(getAIWorkspaceFileInfo("../escape.txt")).rejects.toThrow(/Parent-directory/);
  });
});
