import { useEffect, useState } from "react";

import {
  CHECK_EVERY_MS,
  fetchLatest,
  isNewer,
  skipUpdateCheck,
} from "../updateCheck.js";

export function useUpdateAvailable(current: string): string | undefined {
  const [latest, setLatest] = useState<string>();

  useEffect(() => {
    if (skipUpdateCheck(current)) return;
    const check = () =>
      void fetchLatest().then((version) => {
        if (version) setLatest(version);
      });
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [current]);

  return latest && isNewer(latest, current) ? latest : undefined;
}
