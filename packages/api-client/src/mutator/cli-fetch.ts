import { readCliConfig } from "@subscriber.dev/shared";

export const cliFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  const config = readCliConfig();
  const baseUrl = config.apiBaseUrl ?? "https://api.subscriber.dev";
  const headers = new Headers(options.headers);
  if (config.apiKey) {
    headers.set("x-api-key", config.apiKey);
  }

  const response = await fetch(`${baseUrl}${url}`, { ...options, headers });
  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw data ?? new Error(`Request failed with status ${response.status}`);
  }

  return { status: response.status, data, headers: response.headers } as T;
};
