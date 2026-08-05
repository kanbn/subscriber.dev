import { env } from "next-runtime-env";

export const customFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  const baseUrl = env("NEXT_PUBLIC_API_BASE_URL") ?? "";
  const response = await fetch(`${baseUrl}${url}`, options);
  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw data ?? new Error(`Request failed with status ${response.status}`);
  }

  return data as T;
};
