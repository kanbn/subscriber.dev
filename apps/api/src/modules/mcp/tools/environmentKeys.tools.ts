import { Injectable } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import { ENVIRONMENT_KEY_SCOPES } from "@subscriber.dev/shared/environmentKeys";

import { CreateEnvironmentKeySchema } from "../../environmentKeys/dto/environmentKey.dto.js";
import { EnvironmentKeysService } from "../../environmentKeys/environmentKeys.service.js";
import { requireEnvironment } from "../mcp-environment.util.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

const SCOPE_LIST = Object.entries(ENVIRONMENT_KEY_SCOPES)
  .map(([scope, description]) => `${scope} (${description})`)
  .join("; ");

@Injectable()
export class EnvironmentKeysTools {
  constructor(
    private readonly environmentKeysService: EnvironmentKeysService,
  ) {}

  @Tool({
    name: "create_api_key",
    description: `Create an API key for this environment, for the user's app to call the API with (x-api-key header). Pass access "limited" (the default: trigger workflows and create or update subscribers) or "full", or pick scopes: ${SCOPE_LIST}. The key is only returned once: tell the user to store it as a secret in their app, e.g. SUBSCRIBER_API_KEY, and never commit it.`,
    parameters: CreateEnvironmentKeySchema.extend({
      environmentId: z.string(),
    }),
  })
  async createApiKey(
    args: z.infer<typeof CreateEnvironmentKeySchema> & {
      environmentId: string;
    },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const { environmentId, ...input } = args;
    const environment = await requireEnvironment(db, user.id, environmentId);
    return this.environmentKeysService.create(
      db,
      environment.id,
      input,
      user.id,
    );
  }

  @Tool({
    name: "list_api_keys",
    description:
      "List this environment's API keys: name, the first characters, scopes and when each was last used. Never the keys themselves.",
    parameters: z.object({ environmentId: z.string() }),
    annotations: { readOnlyHint: true },
  })
  async listApiKeys(
    args: { environmentId: string },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );
    return this.environmentKeysService.list(db, environment.id);
  }

  @Tool({
    name: "revoke_api_key",
    description:
      "Revoke an API key. Requests made with it fail straight away, so check with the user first.",
    parameters: z.object({ environmentId: z.string(), keyId: z.string() }),
    annotations: { destructiveHint: true },
  })
  async revokeApiKey(
    args: { environmentId: string; keyId: string },
    _context: unknown,
    rawRequest: { user?: unknown; db?: unknown } | undefined,
  ) {
    const user = requireMcpUser(rawRequest);
    const db = requireMcpDb(rawRequest);
    const environment = await requireEnvironment(
      db,
      user.id,
      args.environmentId,
    );
    await this.environmentKeysService.revoke(db, environment.id, args.keyId);
    return { revoked: true };
  }
}
