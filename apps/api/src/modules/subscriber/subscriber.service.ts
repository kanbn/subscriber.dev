import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

interface CreateSubscriberData {
  environmentId: number;
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

@Injectable()
export class SubscriberService {
  async createSubscriber(
    db: dbClient,
    data: CreateSubscriberData,
  ): Promise<{
    subscriber: {
      publicId: string;
      email: string | null;
      phone: string | null;
      externalId: string | null;
      firstName: string | null;
      lastName: string | null;
      name: string | null;
      attributes: Record<string, unknown> | null;
      createdAt: Date;
      updatedAt: Date;
    };
    preferences: {
      publicId: string;
      email: boolean;
      version: number;
      createdAt: Date;
    };
  }> {
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

    // Create subscriber
    const subscriber = await subscriberRepo.createSubscriber(db, {
      environmentId: data.environmentId,
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
      subscriber: {
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
      },
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
      subscriberPublicId,
    );

    if (!subscriber || subscriber.environmentId !== environmentId) {
      throw new NotFoundException("Subscriber not found");
    }

    const preferences = await subscriberRepo.getLatestPreferences(
      db,
      subscriber.id,
    );

    return {
      subscriber: {
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
      },
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
      subscribers: rows.map((s) => ({
        publicId: s.publicId,
        email: s.email,
        phone: s.phone,
        externalId: s.externalId,
        firstName: s.firstName,
        lastName: s.lastName,
        name: s.name,
        attributes: s.attributes,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
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
      subscriber: {
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
      },
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
      subscriberPublicId,
    );

    if (!subscriber || subscriber.environmentId !== environmentId) {
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
}
