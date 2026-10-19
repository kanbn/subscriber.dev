import { env } from "next-runtime-env";

import { environmentHeaders } from "./environment.js";

export const customFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  const baseUrl = env("NEXT_PUBLIC_API_BASE_URL") ?? "";
  const headers = new Headers(options.headers);
  for (const [name, value] of Object.entries(environmentHeaders())) {
    headers.set(name, value);
  }
  const response = await fetch(`${baseUrl}${url}`, { ...options, headers });
  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw data ?? new Error(`Request failed with status ${response.status}`);
  }

  return { status: response.status, data, headers: response.headers } as T;
};
