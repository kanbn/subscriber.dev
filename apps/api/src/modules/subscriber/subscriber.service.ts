import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as subscriberTagRepo from "@subscriber.dev/db/repository/subscriberTag.repo";
import {
  createEmailUnsubscribeLink,
  verifyEmailUnsubscribeToken,
} from "@subscriber.dev/shared/utils";

import { WorkflowService } from "../workflow/workflow.service.js";

interface CreateSubscriberData {
  environmentId: number;
  publicId?: string | null;
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  attributes?: Record<string, unknown> | null;
  emailPreference?: boolean;
  createdBy: number | null;
  createdVia: string;
}

interface BulkUpsertSubscriberItem {
  publicId?: string;
  email?: string;
  phone?: string;
  externalId?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  attributes?: Record<string, unknown>;
  preferences?: { email?: boolean };
}

interface UpdatePreferencesData {
  subscriberId: number;
  email?: boolean;
}

interface UpdateSubscriberData {
  subscriberId: number;
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  attributes?: Record<string, unknown> | null;
  updatedBy: number | null;
}

interface SubscriberRow {
  publicId: string;
  environmentId: number;
  email: string | null;
  phone: string | null;
  externalId: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  attributes: Record<string, unknown> | null;
  createdVia: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SubscriberService {
  constructor(private readonly workflowService: WorkflowService) {}

  private toSubscriberSummaryDto(subscriber: SubscriberRow) {
    return {
      publicId: subscriber.publicId,
      email: subscriber.email,
      phone: subscriber.phone,
      externalId: subscriber.externalId,
      firstName: subscriber.firstName,
      lastName: subscriber.lastName,
      name: subscriber.name,
      attributes: subscriber.attributes,
      createdVia: subscriber.createdVia,
      createdAt: subscriber.createdAt.toISOString(),
      updatedAt: subscriber.updatedAt.toISOString(),
    };
  }

  private async toSubscriberDto(subscriber: SubscriberRow) {
    return {
      ...this.toSubscriberSummaryDto(subscriber),
      unsubscribeUrl: await createEmailUnsubscribeLink(
        subscriber.environmentId,
        subscriber.publicId,
      ),
    };
  }

  async createSubscriber(db: dbClient, data: CreateSubscriberData) {
    // Verify environment exists
    const environment = await subscriberRepo.getEnvironmentById(
      db,
      data.environmentId,
    );

    if (!environment) {
      throw new NotFoundException("Environment not found");
    }

    // Validate that at least email or externalId is provided
    if (!data.email && !data.externalId) {
      throw new BadRequestException(
        "Either email or externalId must be provided",
      );
    }

    // Check for existing subscriber with same email or externalId in this environment
    if (data.email) {
      const existingByEmail = await subscriberRepo.getSubscriberByEmail(
        db,
        data.environmentId,
        data.email,
      );

      if (existingByEmail) {
        throw new BadRequestException(
          "Subscriber with this email already exists in this environment",
        );
      }
    }

    if (data.externalId) {
      const existingByExternalId =
        await subscriberRepo.getSubscriberByExternalId(
          db,
          data.environmentId,
          data.externalId,
        );

      if (existingByExternalId) {
        throw new BadRequestException(
          "Subscriber with this externalId already exists in this environment",
        );
      }
    }

    if (data.publicId) {
      const existingByPublicId = await subscriberRepo.getSubscriberByPublicId(
        db,
        data.environmentId,
        data.publicId,
      );

      if (existingByPublicId) {
        throw new BadRequestException(
          "Subscriber with this publicId already exists in this environment",
        );
      }
    }

    // Create subscriber
    const subscriber = await subscriberRepo.createSubscriber(db, {
      environmentId: data.environmentId,
      publicId: data.publicId ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      externalId: data.externalId ?? null,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      name: data.name ?? null,
      attributes: data.attributes ?? null,
      createdBy: data.createdBy,
      createdVia: data.createdVia,
    });

    if (!subscriber) {
      throw new InternalServerErrorException("Failed to create subscriber");
    }

    // Create initial preferences
    const preferences = await subscriberRepo.createSubscriberPreferences(db, {
      subscriberId: subscriber.id,
      email: data.emailPreference ?? true,
    });

    if (!preferences) {
      throw new InternalServerErrorException(
        "Failed to create subscriber preferences",
      );
    }

    return {
      subscriber: await this.toSubscriberDto(subscriber),
      preferences: {
        publicId: preferences.publicId,
        email: preferences.email,
        version: preferences.version,
        createdAt: preferences.createdAt.toISOString(),
      },
    };
  }

  async bulkUpsertSubscribers(
    db: dbClient,
    environmentId: number,
    rows: BulkUpsertSubscriberItem[],
    actorUserId: number | null,
    createdVia: string,
  ) {
    const results: {
      index: number;
      status: "created" | "updated" | "error";
      subscriber?: Awaited<ReturnType<SubscriberService["toSubscriberDto"]>>;
      preferences?: {
        publicId: string;
        email: boolean;
        version: number;
        createdAt: string;
      };
      error?: string;
    }[] = [];

    // Processed sequentially (not Promise.all) so a later row can correctly
    // match/update a subscriber an earlier row in this same batch just created.
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (!row) continue;

      try {
        if (!row.publicId && !row.externalId && !row.email) {
          throw new BadRequestException(
            "At least one of publicId, externalId, or email must be provided",
          );
        }

        const existing = await subscriberRepo.findSubscriberForUpsert(
          db,
          environmentId,
          {
            publicId: row.publicId,
            externalId: row.externalId,
            email: row.email,
          },
        );

        if (existing) {
          await this.assertNoIdentifierConflicts(
            db,
            environmentId,
            existing.id,
            row,
          );

          const subscriber = await subscriberRepo.updateSubscriber(
            db,
            existing.id,
            {
              email: row.email,
              phone: row.phone,
              externalId: row.externalId,
              firstName: row.firstName,
              lastName: row.lastName,
              name: row.name,
              attributes: row.attributes,
              updatedBy: actorUserId,
            },
          );

          if (!subscriber) {
            throw new InternalServerErrorException(
              "Failed to update subscriber",
            );
          }

          let preferences = await subscriberRepo.getLatestPreferences(
            db,
            existing.id,
          );

          if (
            row.preferences?.email !== undefined &&
            (!preferences || preferences.email !== row.preferences.email)
          ) {
            preferences = await subscriberRepo.createSubscriberPreferences(db, {
              subscriberId: existing.id,
              email: row.preferences.email,
            });

            if (!row.preferences.email) {
              await this.workflowService.cancelPendingRunsForSubscriber(
                db,
                existing.id,
                "Subscriber opted out of email",
              );
            }
          }

          results.push({
            index,
            status: "updated",
            subscriber: await this.toSubscriberDto(subscriber),
            preferences: preferences
              ? {
                  publicId: preferences.publicId,
                  email: preferences.email,
                  version: preferences.version,
                  createdAt: preferences.createdAt.toISOString(),
                }
              : undefined,
          });
        } else {
          const subscriber = await subscriberRepo.createSubscriber(db, {
            environmentId,
            publicId: row.publicId ?? null,
            email: row.email ?? null,
            phone: row.phone ?? null,
            externalId: row.externalId ?? null,
            firstName: row.firstName ?? null,
            lastName: row.lastName ?? null,
            name: row.name ?? null,
            attributes: row.attributes ?? null,
            createdBy: actorUserId,
            createdVia,
          });

          if (!subscriber) {
            throw new InternalServerErrorException(
              "Failed to create subscriber",
            );
          }

          const preferences = await subscriberRepo.createSubscriberPreferences(
            db,
            {
              subscriberId: subscriber.id,
              email: row.preferences?.email ?? true,
            },
          );

          if (!preferences) {
            throw new InternalServerErrorException(
              "Failed to create subscriber preferences",
            );
          }

          results.push({
            index,
            status: "created",
            subscriber: await this.toSubscriberDto(subscriber),
            preferences: {
              publicId: preferences.publicId,
              email: preferences.email,
              version: preferences.version,
              createdAt: preferences.createdAt.toISOString(),
            },
          });
        }
      } catch (error) {
        results.push({
          index,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const summary = results.reduce(
      (acc, result) => {
        if (result.status === "created") acc.created++;
        else if (result.status === "updated") acc.updated++;
        else acc.errored++;
        return acc;
      },
      { created: 0, updated: 0, errored: 0 },
    );

    return { results, summary };
  }

  private async assertNoIdentifierConflicts(
    db: dbClient,
    environmentId: number,
    existingId: number,
    row: BulkUpsertSubscriberItem,
  ) {
    if (row.publicId) {
      const other = await subscriberRepo.getSubscriberByPublicId(
        db,
        environmentId,
        row.publicId,
      );
      if (other && other.id !== existingId) {
        throw new BadRequestException(
          "publicId already belongs to a different subscriber in this environment",
        );
      }
    }

    if (row.externalId) {
      const other = await subscriberRepo.getSubscriberByExternalId(
        db,
        environmentId,
        row.externalId,
      );
      if (other && other.id !== existingId) {
        throw new BadRequestException(
          "externalId already belongs to a different subscriber in this environment",
        );
      }
    }

    if (row.email) {
      const other = await subscriberRepo.getSubscriberByEmail(
        db,
        environmentId,
        row.email,
      );
      if (other && other.id !== existingId) {
        throw new BadRequestException(
          "email already belongs to a different subscriber in this environment",
        );
      }
    }
  }

  async updatePreferences(
    db: dbClient,
    data: UpdatePreferencesData,
  ): Promise<{
    preferences: {
      publicId: string;
      subscriberPublicId: string;
      email: boolean;
      version: number;
      createdAt: string;
    };
  }> {
    // Verify subscriber exists
    const subscriber = await subscriberRepo.getSubscriberById(
      db,
      data.subscriberId,
    );
    if (!subscriber) {
      throw new NotFoundException("Subscriber not found");
    }

    // Get latest preferences to merge with new values
    const latestPreferences = await subscriberRepo.getLatestPreferences(
      db,
      data.subscriberId,
    );

    if (!latestPreferences) {
      throw new NotFoundException("Subscriber preferences not found");
    }

    // Create new preference record with updated values
    const preferences = await subscriberRepo.createSubscriberPreferences(db, {
      subscriberId: data.subscriberId,
      email: data.email ?? latestPreferences.email,
    });

    if (!preferences) {
      throw new InternalServerErrorException("Failed to update preferences");
    }

    if (data.email === false && latestPreferences.email !== false) {
      await this.workflowService.cancelPendingRunsForSubscriber(
        db,
        data.subscriberId,
        "Subscriber opted out of email",
      );
    }

    return {
      preferences: {
        publicId: preferences.publicId,
        subscriberPublicId: subscriber.publicId,
        email: preferences.email,
        version: preferences.version,
        createdAt: preferences.createdAt.toISOString(),
      },
    };
  }

  async getSubscriber(
    db: dbClient,
    environmentId: number,
    subscriberPublicId: string,
  ) {
    const subscriber = await subscriberRepo.getSubscriberByPublicId(
      db,
      environmentId,
      subscriberPublicId,
    );

    if (!subscriber) {
      throw new NotFoundException("Subscriber not found");
    }

    const preferences = await subscriberRepo.getLatestPreferences(
      db,
      subscriber.id,
    );
    const tags = await subscriberTagRepo.listTagsForSubscriber(
      db,
      subscriber.id,
    );

    return {
      subscriber: {
        ...(await this.toSubscriberDto(subscriber)),
        tags: tags.map((t) => t.tag),
      },
      preferences: preferences
        ? {
            publicId: preferences.publicId,
            email: preferences.email,
            version: preferences.version,
            createdAt: preferences.createdAt.toISOString(),
          }
        : null,
    };
  }

  async addTag(
    db: dbClient,
    environmentId: number,
    subscriberPublicId: string,
    tag: string,
    createdBy: number | null,
  ) {
    const subscriber = await subscriberRepo.getSubscriberByPublicId(
      db,
      environmentId,
      subscriberPublicId,
    );
    if (!subscriber) {
      throw new NotFoundException("Subscriber not found");
    }

    await subscriberTagRepo.addTag(db, {
      subscriberId: subscriber.id,
      environmentId,
      tag,
      createdBy,
    });

    return { tag };
  }

  async removeTag(
    db: dbClient,
    environmentId: number,
    subscriberPublicId: string,
    tag: string,
  ): Promise<void> {
    const subscriber = await subscriberRepo.getSubscriberByPublicId(
      db,
      environmentId,
      subscriberPublicId,
    );
    if (!subscriber) {
      throw new NotFoundException("Subscriber not found");
    }

    await subscriberTagRepo.removeTag(db, subscriber.id, tag);
  }

  async listTags(db: dbClient, environmentId: number) {
    const tags = await subscriberTagRepo.listDistinctTagsForEnvironment(
      db,
      environmentId,
    );
    return { tags };
  }

  async listSubscribers(
    db: dbClient,
    environmentId: number,
    opts: {
      limit: number;
      offset: number;
      email?: string;
      externalId?: string;
      emailOptedIn?: boolean;
      q?: string;
    },
  ) {
    const rows = await subscriberRepo.listSubscribers(db, environmentId, opts);

    return {
      // Unsubscribe links are bearer tokens, so the bulk listing omits them;
      // fetch a single subscriber to get theirs.
      subscribers: rows.map((s) => this.toSubscriberSummaryDto(s)),
      limit: opts.limit,
      offset: opts.offset,
    };
  }

  async updateSubscriber(db: dbClient, data: UpdateSubscriberData) {
    const subscriber = await subscriberRepo.updateSubscriber(
      db,
      data.subscriberId,
      {
        email: data.email,
        phone: data.phone,
        externalId: data.externalId,
        firstName: data.firstName,
        lastName: data.lastName,
        name: data.name,
        attributes: data.attributes,
        updatedBy: data.updatedBy,
      },
    );

    if (!subscriber) {
      throw new NotFoundException("Subscriber not found");
    }

    return {
      subscriber: await this.toSubscriberDto(subscriber),
    };
  }

  async deleteSubscriber(
    db: dbClient,
    environmentId: number,
    subscriberPublicId: string,
    deletedBy: number | null,
  ) {
    const subscriber = await subscriberRepo.getSubscriberByPublicId(
      db,
      environmentId,
      subscriberPublicId,
    );

    if (!subscriber) {
      throw new NotFoundException("Subscriber not found");
    }

    const deleted = await subscriberRepo.softDeleteSubscriber(
      db,
      subscriber.id,
      deletedBy,
    );

    if (!deleted) {
      throw new NotFoundException("Subscriber not found");
    }
  }

  async unsubscribeByToken(
    db: dbClient,
    token: string,
  ): Promise<{ unsubscribed: boolean }> {
    const verified = await verifyEmailUnsubscribeToken(token);
    if (!verified) {
      throw new NotFoundException("Invalid or expired unsubscribe link");
    }

    const subscriber = await subscriberRepo.getSubscriberByPublicId(
      db,
      verified.environmentId,
      verified.subscriberPublicId,
    );
    if (!subscriber) {
      throw new NotFoundException("Invalid or expired unsubscribe link");
    }

    const latestPreferences = await subscriberRepo.getLatestPreferences(
      db,
      subscriber.id,
    );

    if (latestPreferences && !latestPreferences.email) {
      // Already unsubscribed - no-op so repeat clicks don't churn out versions.
      return { unsubscribed: true };
    }

    const preferences = await subscriberRepo.createSubscriberPreferences(db, {
      subscriberId: subscriber.id,
      email: false,
    });

    if (!preferences) {
      throw new InternalServerErrorException("Failed to unsubscribe");
    }

    await this.workflowService.cancelPendingRunsForSubscriber(
      db,
      subscriber.id,
      "Subscriber opted out of email",
    );

    return { unsubscribed: true };
  }
}
