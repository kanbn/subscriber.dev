import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

const CACHE_PATH = join(
  homedir(),
  ".config",
  "subscriber",
  "update-check.json",
);
const DAY_MS = 24 * 60 * 60 * 1000;

export const isNewer = (latest: string, current: string) =>
  latest.localeCompare(current, undefined, { numeric: true }) > 0;

export function notifyIfOutdated(current: string): void {
  if (
    current === "dev" ||
    process.env.CI ||
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
  if (Date.now() - (cache.checkedAt ?? 0) < DAY_MS) return;

  void fetch("https://registry.npmjs.org/@subscriber.dev/cli/latest", {
    signal: AbortSignal.timeout(1500),
  })
    .then((response) => response.json() as Promise<{ version?: string }>)
    .then(({ version }) => {
      mkdirSync(dirname(CACHE_PATH), { recursive: true });
      writeFileSync(
        CACHE_PATH,
        JSON.stringify({ checkedAt: Date.now(), latest: version }),
      );
    })
    .catch(() => undefined);
}
