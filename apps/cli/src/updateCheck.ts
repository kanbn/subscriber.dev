import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

const CACHE_PATH = join(
  homedir(),
  ".config",
  "subscriber",
  "update-check.json",
);
export const CHECK_EVERY_MS = 60 * 60 * 1000;

export const isNewer = (latest: string, current: string) =>
  latest.localeCompare(current, undefined, { numeric: true }) > 0;

export const skipUpdateCheck = (current: string) =>
  current === "dev" || !!process.env.CI;

export async function fetchLatest(): Promise<string | undefined> {
  try {
    const response = await fetch(
      "https://registry.npmjs.org/@subscriber.dev/cli/latest",
      { signal: AbortSignal.timeout(1500) },
    );
    const { version } = (await response.json()) as { version?: string };
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(
      CACHE_PATH,
      JSON.stringify({ checkedAt: Date.now(), latest: version }),
    );
    return version;
  } catch {
    return undefined;
  }
}

export function notifyIfOutdated(current: string): void {
  if (
    skipUpdateCheck(current) ||
    !process.stderr.isTTY ||
    process.argv.includes("--json")
  )
    return;

  let cache: { checkedAt?: number; latest?: string } = {};
  try {
    cache = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as typeof cache;
  } catch {
    // first run, or an unreadable cache: check again below
  }
  if (cache.latest && isNewer(cache.latest, current)) {
    console.error(
      `update available ${current} → ${cache.latest}: npm i -g @subscriber.dev/cli`,
    );
  }
  if (Date.now() - (cache.checkedAt ?? 0) >= CHECK_EVERY_MS) {
    void fetchLatest();
  }
}
