let environmentId: string | undefined;
let cliVersion: string | undefined;

export function setEnvironmentId(id: string | undefined): void {
  environmentId = id;
}

export function setCliVersion(version: string): void {
  cliVersion = version;
}

export function environmentHeaders(): Record<string, string> {
  return {
    ...(environmentId && { "x-environment-id": environmentId }),
    ...(cliVersion && { "x-subscriber-cli-version": cliVersion }),
  };
}
