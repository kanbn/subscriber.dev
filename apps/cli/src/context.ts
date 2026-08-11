import { readCliConfig } from "@subscriber.dev/shared";

export function requireWorkspaceId(opts: { workspace?: string }): string {
  const workspaceId = opts.workspace ?? readCliConfig().currentWorkspaceId;
  if (!workspaceId) {
    console.error(
      "No workspace specified. Pass --workspace <workspaceId>, or run `subscriber workspaces use <workspaceId>`.",
    );
    process.exit(1);
  }
  return workspaceId;
}

export function requireEnvironmentId(opts: { environment?: string }): string {
  const environmentId =
    opts.environment ?? readCliConfig().currentEnvironmentId;
  if (!environmentId) {
    console.error(
      "No environment specified. Pass --environment <environmentId>, or run `subscriber environments use <environmentId>`.",
    );
    process.exit(1);
  }
  return environmentId;
}
