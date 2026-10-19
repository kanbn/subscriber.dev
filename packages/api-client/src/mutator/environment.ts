let environmentId: string | undefined;

export function setEnvironmentId(id: string | undefined): void {
  environmentId = id;
}

export function environmentHeaders(): Record<string, string> {
  return environmentId ? { "x-environment-id": environmentId } : {};
}
