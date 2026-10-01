import { Injectable, NotFoundException } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";

import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

import { BulkUpsertSubscribersSchema } from "../../subscriber/dto/bulk-upsert-subscribers.dto.js";
import { CreateSubscriberSchema } from "../../subscriber/dto/create-subscriber.dto.js";
import { ListSubscribersQuerySchema } from "../../subscriber/dto/list-subscribers.dto.js";
import { AddTagSchema } from "../../subscriber/dto/tag.dto.js";
import { UpdatePreferencesSchema } from "../../subscriber/dto/update-preferences.dto.js";
import { UpdateSubscriberSchema } from "../../subscriber/dto/update-subscriber.dto.js";
import { SubscriberService } from "../../subscriber/subscriber.service.js";
import { requireEnvironment } from "../mcp-environment.util.js";
import { requireMcpDb, requireMcpUser } from "../mcp-user.util.js";

const CreateSubscriberInputSchema = CreateSubscriberSchema.extend({
  environmentId: z.string(),
});

const BulkUpsertSubscribersInputSchema = BulkUpsertSubscribersSchema.extend({
  environmentId: z.string(),
});

@Injectable()
export class SubscriberTools {
  constructor(private readonly subscriberService: SubscriberService) {}

  @Tool({
    name: "list_subscribers",
    description: "List subscribers in an environment, with optional filters.",
    parameters: ListSubscribersQuerySchema.extend({
      environmentId: z.string(),
    }),
    annotations: { readOnlyHint: true },
  })
  async listSubscribers(
    args: z.infer<typeof ListSubscribersQuerySchema> & {
      environmentId: string;
    },
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

    return this.subscriberService.listSubscribers(db, environment.id, {
      limit: args.limit,
      offset: args.offset,
      email: args.email,
      externalId: args.externalId,
      emailOptedIn: args.emailOptedIn,
      q: args.q,
    });
  }

  @Tool({
    name: "list_subscriber_tags",
    description:
      "List every distinct tag currently in use across subscribers in the environment.",
    parameters: z.object({ environmentId: z.string() }),
    annotations: { readOnlyHint: true },
  })
  async listTags(
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

    return this.subscriberService.listTags(db, environment.id);
  }

  @Tool({
    name: "get_subscriber",
    description: "Get a single subscriber with their latest preferences.",
    parameters: z.object({
      environmentId: z.string(),
      subscriberId: z.string(),
    }),
    annotations: { readOnlyHint: true },
  })
  async getSubscriber(
    args: { environmentId: string; subscriberId: string },
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

    return this.subscriberService.getSubscriber(
      db,
      environment.id,
      args.subscriberId,
    );
  }

  @Tool({
    name: "create_subscriber",
    description:
      "Create a new subscriber in the specified environment and initialise their preferences.",
    parameters: CreateSubscriberInputSchema,
  })
  async createSubscriber(
    args: z.infer<typeof CreateSubscriberInputSchema>,
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

    return this.subscriberService.createSubscriber(db, {
      environmentId: environment.id,
      publicId: args.publicId,
      email: args.email,
      phone: args.phone,
      externalId: args.externalId,
      firstName: args.firstName,
      lastName: args.lastName,
      name: args.name,
      attributes: args.attributes ?? null,
      emailPreference: args.preferences?.email ?? true,
      createdBy: user.id,
      createdVia: "mcp",
    });
  }

  @Tool({
    name: "bulk_upsert_subscribers",
    description:
      "Upsert up to 500 subscribers per call. Each row is matched to an existing subscriber by publicId, then externalId, then email (in that order); if none match, a new subscriber is created. Rows are processed independently, so one failing row does not fail the batch.",
    parameters: BulkUpsertSubscribersInputSchema,
    annotations: { destructiveHint: true },
  })
  async bulkUpsertSubscribers(
    args: z.infer<typeof BulkUpsertSubscribersInputSchema>,
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

    return this.subscriberService.bulkUpsertSubscribers(
      db,
      environment.id,
      args.subscribers,
      user.id,
      "mcp",
    );
  }

  @Tool({
    name: "update_subscriber",
    description: "Update subscriber fields. All fields are optional.",
    parameters: UpdateSubscriberSchema.extend({
      environmentId: z.string(),
      subscriberId: z.string(),
    }),
  })
  async updateSubscriber(
    args: z.infer<typeof UpdateSubscriberSchema> & {
      environmentId: string;
      subscriberId: string;
    },
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

    const subscriber = await subscriberRepo.getSubscriberByPublicId(
      db,
      environment.id,
      args.subscriberId,
    );
    if (!subscriber) {
      throw new NotFoundException("Subscriber not found");
    }

    return this.subscriberService.updateSubscriber(db, {
      subscriberId: subscriber.id,
      email: args.email,
      phone: args.phone,
      externalId: args.externalId,
      firstName: args.firstName,
      lastName: args.lastName,
      name: args.name,
      attributes: args.attributes,
      updatedBy: user.id,
    });
  }

  @Tool({
    name: "delete_subscriber",
    description:
      "Soft-delete a subscriber. The record is retained but excluded from all queries.",
    parameters: z.object({
      environmentId: z.string(),
      subscriberId: z.string(),
    }),
    annotations: { destructiveHint: true },
  })
  async deleteSubscriber(
    args: { environmentId: string; subscriberId: string },
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

    await this.subscriberService.deleteSubscriber(
      db,
      environment.id,
      args.subscriberId,
      user.id,
    );
    return { deleted: true };
  }

  @Tool({
    name: "update_subscriber_preferences",
    description:
      "Create a new preference record with updated values (immutable pattern).",
    parameters: UpdatePreferencesSchema.extend({
      environmentId: z.string(),
      subscriberId: z.string(),
    }),
  })
  async updatePreferences(
    args: z.infer<typeof UpdatePreferencesSchema> & {
      environmentId: string;
      subscriberId: string;
    },
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

    const subscriber = await subscriberRepo.getSubscriberByPublicId(
      db,
      environment.id,
      args.subscriberId,
    );
    if (!subscriber) {
      throw new NotFoundException("Subscriber not found");
    }

    return this.subscriberService.updatePreferences(db, {
      subscriberId: subscriber.id,
      email: args.email,
    });
  }

  @Tool({
    name: "add_subscriber_tag",
    description:
      "Add a tag to a subscriber. Adding a tag that's already present is a no-op.",
    parameters: AddTagSchema.extend({
      environmentId: z.string(),
      subscriberId: z.string(),
    }),
  })
  async addTag(
    args: z.infer<typeof AddTagSchema> & {
      environmentId: string;
      subscriberId: string;
    },
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

    return this.subscriberService.addTag(
      db,
      environment.id,
      args.subscriberId,
      args.tag,
      user.id,
    );
  }

  @Tool({
    name: "remove_subscriber_tag",
    description: "Remove a tag from a subscriber.",
    parameters: z.object({
      environmentId: z.string(),
      subscriberId: z.string(),
      tag: z.string(),
    }),
  })
  async removeTag(
    args: {
      environmentId: string;
      subscriberId: string;
      tag: string;
    },
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

    await this.subscriberService.removeTag(
      db,
      environment.id,
      args.subscriberId,
      args.tag,
    );
    return { removed: true };
  }
}
