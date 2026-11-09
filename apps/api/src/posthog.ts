import { posthog } from "@subscriber.dev/auth/server";

export { posthog };

export const track = (
  event: string,
  {
    via,
    userId,
    workspaceId,
  }: {
    via: "api" | "mcp" | "stripe" | "workflow";
    userId?: number | null;
    workspaceId: number;
  },
  properties: Record<string, unknown> = {},
) =>
  posthog?.capture({
    distinctId: userId ? String(userId) : `workspace_${workspaceId}`,
    event,
    properties: {
      ...properties,
      via,
      workspace_id: workspaceId,
      ...(userId ? {} : { $process_person_profile: false }),
    },
  });
