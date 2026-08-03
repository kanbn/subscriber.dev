import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import {
  createEmailUnsubscribeLink,
  verifyEmailUnsubscribeToken,
} from "@subscriber.dev/shared/utils";

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
  createdBy: number;
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
  updatedBy: number;
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
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SubscriberService {
  private async toSubscriberDto(subscriber: SubscriberRow) {
    return {
      publicId: subscriber.publicId,
      email: subscriber.email,
      phone: subscriber.phone,
      externalId: subscriber.externalId,
      firstName: subscriber.firstName,
      lastName: subscriber.lastName,
      name: subscriber.name,
      attributes: subscriber.attributes,
      createdAt: subscriber.createdAt,
      updatedAt: subscriber.updatedAt,
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
        createdAt: preferences.createdAt,
      },
    };
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
      createdAt: Date;
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

    return {
      preferences: {
        publicId: preferences.publicId,
        subscriberPublicId: subscriber.publicId,
        email: preferences.email,
        version: preferences.version,
        createdAt: preferences.createdAt,
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

    return {
      subscriber: await this.toSubscriberDto(subscriber),
      preferences: preferences
        ? {
            publicId: preferences.publicId,
            email: preferences.email,
            version: preferences.version,
            createdAt: preferences.createdAt,
          }
        : null,
    };
  }

  async listSubscribers(
    db: dbClient,
    environmentId: number,
    opts: { limit: number; offset: number },
  ) {
    const rows = await subscriberRepo.listSubscribers(db, environmentId, opts);

    return {
      subscribers: await Promise.all(rows.map((s) => this.toSubscriberDto(s))),
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
    deletedBy: number,
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

    return { unsubscribed: true };
  }
}
