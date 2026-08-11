import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { readJsonFile } from "../json-input.js";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

describe("readJsonFile", () => {
  it("reads and parses a file by path", () => {
    vi.mocked(readFileSync).mockReturnValue('{"a":1}');

    const result = readJsonFile("data.json");

    expect(readFileSync).toHaveBeenCalledWith("data.json", "utf-8");
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });

  it("reads from stdin (fd 0) when path is -", () => {
    vi.mocked(readFileSync).mockReturnValue("[]");

    readJsonFile("-");

    expect(readFileSync).toHaveBeenCalledWith(0, "utf-8");
  });

  it("returns a friendly error when the file can't be read", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    const result = readJsonFile("missing.json");

    expect(result).toEqual({
      ok: false,
      message: "Failed to read missing.json: ENOENT: no such file or directory",
    });
  });

  it("labels the source as stdin when reading fails via -", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("boom");
    });

    const result = readJsonFile("-");

    expect(result).toEqual({
      ok: false,
      message: "Failed to read stdin: boom",
    });
  });

  it("returns a friendly error when the content isn't valid JSON", () => {
    vi.mocked(readFileSync).mockReturnValue("not json");

    const result = readJsonFile("data.json");

    expect(result).toEqual({
      ok: false,
      message: "File must contain valid JSON.",
    });
  });
});
