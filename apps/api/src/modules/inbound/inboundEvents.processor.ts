import type { Job } from "bullmq";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import { createDrizzleClient } from "@subscriber.dev/db/client";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as inboundEventRepo from "@subscriber.dev/db/repository/inboundEvent.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";

import type { InboundEventJobData } from "./inbound.constants.js";
import type { InboundEvent, InboundSource } from "./inboundSource.js";
import { decrypt } from "../../common/encryption.js";
import { SubscriberService } from "../subscriber/subscriber.service.js";
import { WorkflowService } from "../workflow/workflow.service.js";
import { INBOUND_EVENTS_QUEUE_NAME } from "./inbound.constants.js";
import { INBOUND_SOURCES } from "./sources/index.js";

type Resolved =
  | { subscriber: { id: number; publicId: string } }
  | { skipReason: string };

@Processor(INBOUND_EVENTS_QUEUE_NAME, { concurrency: 5 })
@Injectable()
export class InboundEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundEventsProcessor.name);

  constructor(
    private readonly workflowService: WorkflowService,
    private readonly subscriberService: SubscriberService,
  ) {
    super();
  }

  async process(job: Job<InboundEventJobData>): Promise<void> {
    const db = createDrizzleClient();
    const row = await inboundEventRepo.getInboundEventById(
      db,
      job.data.inboundEventId,
    );
    if (!row || row.status !== "received") return;

    const complete = (
      data: Parameters<typeof inboundEventRepo.completeInboundEvent>[2],
    ) => inboundEventRepo.completeInboundEvent(db, row.id, data);

    const source = INBOUND_SOURCES[row.source];
    const integration = source
      ? await environmentIntegrationsRepo.getByEnvironmentAndType(
          db,
          row.environmentId,
          source.source,
        )
      : undefined;
    if (!source || !integration?.encryptedSecret) {
      await complete({
        status: "ignored",
        outcome: `${row.source} integration no longer configured`,
      });
      return;
    }

    const event: InboundEvent = {
      externalEventId: row.externalEventId,
      type: row.type,
      payload: row.payload,
    };
    const matchedEvents = source.match(event);
    const triggered = await workflowRepo.listWorkflowsTriggeredBy(
      db,
      row.environmentId,
      source.source,
      [...matchedEvents, event.type],
    );

    if (triggered.length === 0) {
      await complete({
        status: "ignored",
        matchedEvents,
        outcome: `No workflow is triggered by ${[...matchedEvents, event.type].join(" / ")}`,
      });
      return;
    }

    const personRef = source.personRef(event);
    if (!personRef) {
      await complete({
        status: "ignored",
        matchedEvents,
        outcome: "Event isn't about a person",
      });
      return;
    }

    const secret = JSON.parse(decrypt(integration.encryptedSecret)) as unknown;
    const resolved = await this.resolveSubscriber(db, {
      environmentId: row.environmentId,
      source,
      secret,
      personRef,
    });
    if ("skipReason" in resolved) {
      await complete({
        status: "ignored",
        matchedEvents,
        outcome: resolved.skipReason,
      });
      return;
    }

    const payload = {
      [source.source]: {
        ...source.templateData(event, matchedEvents),
        ...(await source.enrich?.(event, matchedEvents, secret)),
      },
    };
    const results: string[] = [];
    let anyTriggered = false;
    for (const workflow of triggered) {
      try {
        const result = await this.workflowService.triggerWorkflow(
          db,
          row.environmentId,
          {
            key: workflow.key,
            subscriber: { publicId: resolved.subscriber.publicId },
            payload,
            triggeredBy: null,
            idempotencyKey: `inbound:${row.id}:${workflow.id}`,
          },
        );
        if (result.triggered) {
          anyTriggered = true;
          results.push(`Triggered ${workflow.key}`);
        } else {
          results.push(`Didn't trigger ${workflow.key}: ${result.reason}`);
        }
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
        results.push(`Workflow ${workflow.key} not found`);
      }
    }

    await complete({
      status: anyTriggered ? "processed" : "ignored",
      matchedEvents,
      subscriberId: resolved.subscriber.id,
      outcome: results.join("; "),
    });
  }

  private async resolveSubscriber(
    db: dbClient,
    input: {
      environmentId: number;
      source: InboundSource<unknown>;
      secret: unknown;
      personRef: string;
    },
  ): Promise<Resolved> {
    const { environmentId, source, personRef } = input;
    const known = await inboundEventRepo.getSubscriberByIdentity(
      db,
      environmentId,
      source.source,
      personRef,
    );
    if (known) return { subscriber: known };

    const fetched = await source.fetchPerson(personRef, input.secret);
    if ("skipReason" in fetched) return fetched;
    const { email, name, subscriberExternalId } = fetched.person;

    let subscriber =
      (subscriberExternalId &&
        (await subscriberRepo.getSubscriberByExternalId(
          db,
          environmentId,
          subscriberExternalId,
        ))) ||
      (email &&
        (await subscriberRepo.getSubscriberByEmail(
          db,
          environmentId,
          email,
        ))) ||
      undefined;

    if (!subscriber) {
      if (!email) {
        return {
          skipReason: `${source.source} person ${personRef} has no email and no matching subscriber`,
        };
      }
      await this.subscriberService.createSubscriber(db, {
        environmentId,
        email,
        externalId: subscriberExternalId ?? null,
        name: name ?? null,
        createdBy: null,
        createdVia: source.source,
      });
      subscriber = await subscriberRepo.getSubscriberByEmail(
        db,
        environmentId,
        email,
      );
      if (!subscriber) throw new Error(`Subscriber ${email} vanished`);
    }

    await inboundEventRepo.linkSubscriberIdentity(db, {
      environmentId,
      subscriberId: subscriber.id,
      source: source.source,
      externalId: personRef,
    });
    return { subscriber };
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job<InboundEventJobData> | undefined, error: Error) {
    if (!job?.id) return;
    this.logger.error(
      `Inbound event job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts ?? 1}): ${error.message}`,
    );
    if ((job.attemptsMade ?? 0) < (job.opts.attempts ?? 1)) return;

    try {
      await inboundEventRepo.completeInboundEvent(
        createDrizzleClient(),
        job.data.inboundEventId,
        { status: "failed", outcome: error.message },
      );
    } catch (recordError) {
      this.logger.error(
        `Couldn't record failure of inbound event ${job.data.inboundEventId}: ${recordError instanceof Error ? recordError.message : String(recordError)}`,
      );
    }
  }
}
