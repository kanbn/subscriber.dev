import { readCliConfig } from "@subscriber.dev/shared";

import { environmentHeaders } from "./environment.js";

const MAX_RETRIES = 3;

function retryDelayMs(response: Response): number {
  let seconds = 1;
  response.headers.forEach((value, name) => {
    if (name.startsWith("retry-after")) {
      seconds = Math.max(seconds, Number(value) || 0);
    }
  });
  return seconds * 1000;
}

export const cliFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  const config = readCliConfig();
  const baseUrl = config.apiBaseUrl ?? "https://api.subscriber.dev";
  const headers = new Headers(options.headers);
  for (const [name, value] of Object.entries(environmentHeaders())) {
    headers.set(name, value);
  }
  if (config.token) {
    headers.set("authorization", `Bearer ${config.token}`);
  }

  let response = await fetch(`${baseUrl}${url}`, { ...options, headers });
  for (let retry = 0; response.status === 429 && retry < MAX_RETRIES; retry++) {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response)));
    response = await fetch(`${baseUrl}${url}`, { ...options, headers });
  }
  const data = await response.json().catch(() => undefined);

  return { status: response.status, data, headers: response.headers } as T;
};
