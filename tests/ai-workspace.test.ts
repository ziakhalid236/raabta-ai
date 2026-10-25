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
}));

import {
  AI_WORKSPACE_MAX_BYTES,
  deleteAIWorkspaceFile,
  listAIWorkspaceFiles,
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
});
