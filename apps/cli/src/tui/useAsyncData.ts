import { useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  { pollMs }: { pollMs?: number } = {},
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    const load = () =>
      fetcher()
        .then((data) => {
          if (!cancelled) setState({ status: "ready", data });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // A failed refresh keeps the data already on screen.
          setState((prev) =>
            prev.status === "ready"
              ? prev
              : {
                  status: "error",
                  message: err instanceof Error ? err.message : String(err),
                },
          );
        });
    void load();
    const timer = pollMs ? setInterval(() => void load(), pollMs) : undefined;

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
