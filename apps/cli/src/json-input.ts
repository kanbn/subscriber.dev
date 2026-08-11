import { readFileSync } from "node:fs";

export type JsonFileResult =
  | { ok: true; data: unknown }
  | { ok: false; message: string };

/**
 * Reads and parses a JSON file, or stdin when path is "-".
 */
export function readJsonFile(path: string): JsonFileResult {
  let raw: string;
  try {
    raw = readFileSync(path === "-" ? 0 : path, "utf-8");
  } catch (err) {
    const source = path === "-" ? "stdin" : path;
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Failed to read ${source}: ${message}` };
  }

  try {
    return { ok: true, data: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, message: "File must contain valid JSON." };
  }
}
