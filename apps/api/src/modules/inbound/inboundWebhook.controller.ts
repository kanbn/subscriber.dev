import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Queue } from "bullmq";

import { createDrizzleClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as inboundEventRepo from "@subscriber.dev/db/repository/inboundEvent.repo";

import type { BounceEvent } from "../integrations/providers/types.js";
import type { InboundEventJobData } from "./inbound.constants.js";
import { decrypt } from "../../common/encryption.js";
import { INTEGRATION_PROVIDERS } from "../integrations/providers/index.js";
import { recordBounceEvents } from "../workflow/recordBounceEvents.js";
import {
  INBOUND_EVENT_JOB_NAME,
  INBOUND_EVENTS_QUEUE_NAME,
} from "./inbound.constants.js";
import { InvalidWebhookError } from "./inboundSource.js";
import { INBOUND_SOURCES } from "./sources/index.js";

@ApiExcludeController()
@Controller("webhooks")
export class InboundWebhookController {
  private readonly logger = new Logger(InboundWebhookController.name);

  constructor(
    @InjectQueue(INBOUND_EVENTS_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  @Post(":source/:token")
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param("source") sourceName: string,
    @Param("token") token: string,
    @Req() request: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    const source = INBOUND_SOURCES[sourceName] as
      | (typeof INBOUND_SOURCES)[string]
      | undefined;
    const provider = INTEGRATION_PROVIDERS[sourceName] as
      | (typeof INTEGRATION_PROVIDERS)[string]
      | undefined;
    if (!source && !provider?.parseWebhook) {
      throw new NotFoundException("Unknown webhook");
    }

    const db = createDrizzleClient();
    const integration = await environmentIntegrationsRepo.getByWebhookToken(
      db,
      sourceName,
      token,
    );
    if (!integration?.encryptedSecret) {
      throw new NotFoundException("Unknown webhook");
    }
    if (!request.rawBody) throw new BadRequestException("Missing body");
    const secret = JSON.parse(decrypt(integration.encryptedSecret)) as unknown;

    if (provider?.parseWebhook) {
      let events: BounceEvent[];
      try {
        events = provider.parseWebhook({
          rawBody: request.rawBody,
          headers: request.headers,
          secret: provider.secretSchema.parse(secret) as unknown,
        });
      } catch (error) {
        if (!(error instanceof InvalidWebhookError)) throw error;
        this.logger.warn(
          `Rejected ${sourceName} webhook for environment ${integration.environmentId}: ${error.message}`,
        );
        throw new BadRequestException(error.message);
      }
      await recordBounceEvents(db, events);
      return { received: true };
    }
    if (!source) throw new NotFoundException("Unknown webhook");

    let event;
    try {
      event = source.verifyWebhook({
        rawBody: request.rawBody,
        headers: request.headers,
        secret,
      });
    } catch (error) {
      if (!(error instanceof InvalidWebhookError)) throw error;
      this.logger.warn(
        `Rejected ${source.source} webhook for environment ${integration.environmentId}: ${error.message}`,
      );
      throw new BadRequestException(error.message);
    }

    const row = await inboundEventRepo.recordInboundEvent(db, {
      environmentId: integration.environmentId,
      source: source.source,
      ...event,
    });
    if (row.status === "received") {
      await this.queue.add(
        INBOUND_EVENT_JOB_NAME,
        { inboundEventId: row.id } satisfies InboundEventJobData,
        {
          jobId: `inbound-event-${row.id}`,
          attempts: 5,
          backoff: { type: "exponential", delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
    }

    return { received: true };
  }
}
