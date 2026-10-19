export const ENVIRONMENT_KEY_SCOPES = {
  "workflows:trigger": "Trigger workflows",
  "workflows:read": "List workflows, their runs and trigger sources",
  "workflows:write": "Create, update and delete workflows",
  "broadcasts:read": "List broadcasts and preview their audience",
  "broadcasts:write": "Send, pause, resume and cancel broadcasts",
  "subscribers:read": "List and get subscribers and tags",
  "subscribers:write":
    "Create, update and delete subscribers, their tags and preferences",
  "emails:test": "Preview emails and send test emails",
  "integrations:read": "List email providers and other integrations",
  "integrations:write": "Connect, change and remove integrations",
  "uploads:write": "Upload images for emails",
  "events:read": "List inbound events",
  "analytics:read": "Read analytics and the setup checklist",
  "billing:read": "Read the workspace's plan and usage",
} as const;

export type EnvironmentKeyScope = keyof typeof ENVIRONMENT_KEY_SCOPES;

export const ALL_ENVIRONMENT_KEY_SCOPES = Object.keys(
  ENVIRONMENT_KEY_SCOPES,
) as EnvironmentKeyScope[];

export const ENVIRONMENT_KEY_PRESETS = {
  limited: ["workflows:trigger", "subscribers:write"],
  full: ALL_ENVIRONMENT_KEY_SCOPES,
} as const satisfies Record<string, readonly EnvironmentKeyScope[]>;
