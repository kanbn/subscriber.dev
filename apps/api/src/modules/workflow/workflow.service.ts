import type { z } from "zod";
import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Queue } from "bullmq";

import type { dbClient } from "@subscriber.dev/db/client";
import type { WorkflowTriggerInput } from "@subscriber.dev/db/repository/workflow.repo";
import type { RunScope } from "@subscriber.dev/db/repository/workflowRun.repo";
import type {
  WorkflowBroadcastStatus,
  WorkflowChannels,
} from "@subscriber.dev/db/schema";
import * as environmentIntegrationsRepo from "@subscriber.dev/db/repository/environmentIntegrations.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";
import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import type { AudienceCondition } from "./audienceQuery.js";
import type { WorkflowStepSchema } from "./dto/create-workflow.dto.js";
import type {
  BounceEventJobData,
  BroadcastDispatchJobData,
  BroadcastResumeJobData,
} from "./workflow.constants.js";
import { isUniqueViolation } from "../../common/isUniqueViolation.js";
import { BillingService } from "../billing/billing.service.js";
import { isTriggerEvent } from "../inbound/inboundSource.js";
import { INBOUND_SOURCES } from "../inbound/sources/index.js";
import { resolveAudienceSubscriberIds } from "./audienceQuery.js";
import {
  createRunForSubscriber,
  queueRunSteps,
} from "./createRunForSubscriber.js";
import {
  BOUNCE_EVENT_JOB_NAME,
  BOUNCE_EVENTS_QUEUE_NAME,
  BROADCAST_DISPATCH_JOB_NAME,
  BROADCAST_DISPATCH_QUEUE_NAME,
  BROADCAST_RESUME_JOB_NAME,
  BROADCAST_RESUME_QUEUE_NAME,
  WORKFLOW_QUEUE_NAME,
} from "./workflow.constants.js";

type WorkflowStepInput = z.infer<typeof WorkflowStepSchema>;

const HOUR_MS = 60 * 60 * 1000;
const RESUME_SECOND_PASS_DELAY_MS = 60_000;

type WorkflowChannelsUpdate = {
  [Channel in keyof WorkflowChannels]?: WorkflowChannels[Channel] | null;
};

export function mergeChannels(
  existing: WorkflowChannels | null,
  update: WorkflowChannelsUpdate,
): WorkflowChannels {
  const merged: Record<string, unknown> = { ...existing };
  for (const [channel, settings] of Object.entries(update)) {
    if (settings === null) delete merged[channel];
    else if (settings !== undefined) merged[channel] = settings;
  }
  return merged as WorkflowChannels;
}

interface EnvironmentRef {
  id: number;
  publicId: string;
}

function editUrl(environmentPublicId: string, workflowPublicId: string) {
  const baseUrl = (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://subscriber.dev"
  ).replace(/\/$/, "");
  return `${baseUrl}/editor/${environmentPublicId}/${workflowPublicId}`;
}

interface CreateWorkflowData {
  key: string;
  name: string;
  description?: string;
  type: "automation" | "broadcast";
  channels?: WorkflowChannels;
  steps: WorkflowStepInput[];
  triggers?: WorkflowTriggerInput[];
  exitConditions?: WorkflowTriggerInput[];
  createdBy: number | null;
}

interface UpdateWorkflowData {
  key?: string;
  name?: string;
  description?: string | null;
  status?: "active" | "paused";
  channels?: WorkflowChannelsUpdate;
  steps?: WorkflowStepInput[];
  triggers?: WorkflowTriggerInput[];
  exitConditions?: WorkflowTriggerInput[];
  updatedBy: number | null;
}

interface TriggerWorkflowData {
  key: string;
  subscriber: {
    publicId?: string;
    externalId?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
  };
  payload?: Record<string, unknown>;
  triggeredBy: number | null;
  createdVia?: string;
  idempotencyKey?: string;
}

interface WorkflowTriggerRow {
  action: "start" | "exit";
  source: string;
  event: string;
}

interface WorkflowStepRow {
  publicId: string;
  stepOrder: number;
  type: string;
  delayMs: number;
  config: Record<string, unknown>;
}

const redactWebhookUrl = (url: string) => {
  try {
    return `${new URL(url).origin}/***${url.slice(-4)}`;
  } catch {
    return "***";
  }
};

@Injectable()
export class WorkflowService {
  constructor(
    @InjectQueue(WORKFLOW_QUEUE_NAME) private readonly queue: Queue,
    @InjectQueue(BROADCAST_DISPATCH_QUEUE_NAME)
    private readonly broadcastDispatchQueue: Queue,
    @InjectQueue(BOUNCE_EVENTS_QUEUE_NAME)
    private readonly bounceEventsQueue: Queue,
    @InjectQueue(BROADCAST_RESUME_QUEUE_NAME)
    private readonly broadcastResumeQueue: Queue,
    private readonly billing: BillingService,
  ) {}

  private toWorkflowDto(
    workflow: {
      publicId: string;
      key: string;
      name: string;
      description: string | null;
      status: "active" | "paused";
      type: "automation" | "broadcast";
      channels: WorkflowChannels | null;
      createdAt: Date;
      updatedAt: Date;
    },
    steps: WorkflowStepRow[],
    triggers: WorkflowTriggerRow[],
    connectedSources: Set<string>,
    environmentPublicId: string,
  ) {
    return {
      publicId: workflow.publicId,
      key: workflow.key,
      name: workflow.name,
      description: workflow.description,
      status: workflow.status,
      type: workflow.type,
      channels: workflow.channels ?? {},
      steps: steps.map((s) => ({
        ...s.config,
        ...(typeof s.config.url === "string"
          ? { url: redactWebhookUrl(s.config.url) }
          : {}),
        publicId: s.publicId,
        stepOrder: s.stepOrder,
        type: s.type,
        delayMs: s.delayMs,
      })),
      triggers: this.toTriggerDtos(triggers, "start", connectedSources),
      exitConditions: this.toTriggerDtos(triggers, "exit", connectedSources),
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
      ...(steps.some((step) => step.type === "email")
        ? { editUrl: editUrl(environmentPublicId, workflow.publicId) }
        : {}),
    };
  }

  private toBroadcastSummary(broadcast: {
    publicId: string;
    status: WorkflowBroadcastStatus;
    matchedCount: number | null;
    sendOverMs: number | null;
    createdAt: Date;
  }) {
    return {
      publicId: broadcast.publicId,
      status: broadcast.status,
      matchedCount: broadcast.matchedCount,
      sendOverHours:
        broadcast.sendOverMs === null ? null : broadcast.sendOverMs / HOUR_MS,
      createdAt: broadcast.createdAt.toISOString(),
    };
  }

  private async requireBroadcast(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    broadcastPublicId: string,
  ) {
    const workflow = await workflowRepo.getWorkflowByPublicId(
      db,
      environmentId,
      workflowPublicId,
    );
    if (!workflow) throw new NotFoundException("Workflow not found");

    const broadcast = await workflowBroadcastRepo.getBroadcastByPublicId(
      db,
      workflow.id,
      broadcastPublicId,
    );
    if (!broadcast) throw new NotFoundException("Broadcast not found");
    return broadcast;
  }

  private async isBroadcastFinished(
    db: dbClient,
    broadcast: { id: number; matchedCount: number | null },
  ) {
    if (broadcast.matchedCount === null) return false;
    const [counts, runCount] = await Promise.all([
      workflowBroadcastRepo.getBroadcastStepCounts(db, broadcast.id),
      workflowBroadcastRepo.countRunsForBroadcast(db, broadcast.id),
    ]);
    return runCount >= broadcast.matchedCount && counts.pending === 0;
  }

  private async assertBroadcastNotFinished(
    db: dbClient,
    broadcast: { id: number; matchedCount: number | null },
  ) {
    if (await this.isBroadcastFinished(db, broadcast)) {
      throw new ConflictException("Broadcast has already finished sending");
    }
  }

  private async withCompletedStatus(
    db: dbClient,
    broadcast: Parameters<WorkflowService["toBroadcastSummary"]>[0] & {
      id: number;
    },
  ) {
    const completed =
      broadcast.status === "queued" &&
      (await this.isBroadcastFinished(db, broadcast));
    return {
      ...this.toBroadcastSummary(broadcast),
      ...(completed ? { status: "completed" as const } : {}),
    };
  }

  async pauseBroadcast(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    broadcastPublicId: string,
  ) {
    const broadcast = await this.requireBroadcast(
      db,
      environmentId,
      workflowPublicId,
      broadcastPublicId,
    );
    await this.assertBroadcastNotFinished(db, broadcast);
    const updated = await workflowBroadcastRepo.pauseBroadcast(
      db,
      broadcast.id,
    );
    if (!updated) {
      throw new ConflictException(
        `Broadcast can't be paused while ${broadcast.status}`,
      );
    }
    return this.toBroadcastSummary(updated);
  }

  async resumeBroadcast(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    broadcastPublicId: string,
  ) {
    const broadcast = await this.requireBroadcast(
      db,
      environmentId,
      workflowPublicId,
      broadcastPublicId,
    );
    const updated = await workflowBroadcastRepo.resumeBroadcast(
      db,
      broadcast.id,
    );
    if (!updated) {
      throw new ConflictException(
        `Broadcast can't be resumed while ${broadcast.status}`,
      );
    }

    for (const delay of [0, RESUME_SECOND_PASS_DELAY_MS]) {
      await this.broadcastResumeQueue.add(
        BROADCAST_RESUME_JOB_NAME,
        { broadcastId: broadcast.id } satisfies BroadcastResumeJobData,
        {
          delay,
          attempts: 3,
          backoff: { type: "exponential", delay: 60_000 },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
    }

    return this.toBroadcastSummary(updated);
  }

  private async enqueueDispatch(broadcastId: number) {
    await this.broadcastDispatchQueue.add(
      BROADCAST_DISPATCH_JOB_NAME,
      { broadcastId } satisfies BroadcastDispatchJobData,
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );
  }

  async redispatchBroadcast(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    broadcastPublicId: string,
  ) {
    const broadcast = await this.requireBroadcast(
      db,
      environmentId,
      workflowPublicId,
      broadcastPublicId,
    );
    if (broadcast.status !== "queued") {
      throw new ConflictException(
        `Broadcast can't be re-dispatched while ${broadcast.status}`,
      );
    }

    await this.enqueueDispatch(broadcast.id);

    return this.toBroadcastSummary(broadcast);
  }

  async cancelBroadcast(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    broadcastPublicId: string,
  ) {
    const broadcast = await this.requireBroadcast(
      db,
      environmentId,
      workflowPublicId,
      broadcastPublicId,
    );
    await this.assertBroadcastNotFinished(db, broadcast);
    const updated = await workflowBroadcastRepo.transitionBroadcastStatus(
      db,
      broadcast.id,
      ["pending", "queued", "paused"],
      "cancelled",
    );
    if (!updated) {
      throw new ConflictException(
        `Broadcast can't be cancelled while ${broadcast.status}`,
      );
    }
    await workflowBroadcastRepo.cancelPendingStepsForBroadcast(
      db,
      broadcast.id,
      "Broadcast cancelled",
    );
    return this.toBroadcastSummary(updated);
  }

  private successRate(sent: number, failed: number): number | null {
    const totalAttempted = sent + failed;
    return totalAttempted > 0 ? sent / totalAttempted : null;
  }

  private toTriggerDtos(
    triggers: WorkflowTriggerRow[],
    action: WorkflowTriggerRow["action"],
    connectedSources: Set<string>,
  ) {
    return triggers
      .filter((t) => t.action === action)
      .map((t) => ({
        source: t.source,
        event: t.event,
        label:
          INBOUND_SOURCES[t.source]?.events.find((e) => e.name === t.event)
            ?.label ?? t.event,
        active: connectedSources.has(t.source),
      }));
  }

  private async connectedSources(db: dbClient, environmentId: number) {
    const integrations = await environmentIntegrationsRepo.listByEnvironment(
      db,
      environmentId,
    );
    return new Set(
      integrations
        .filter((i) => INBOUND_SOURCES[i.type] && i.encryptedSecret)
        .map((i) => i.type),
    );
  }

  private validateTriggers(
    type: "automation" | "broadcast",
    triggers: WorkflowTriggerInput[],
    connectedSources: Set<string>,
    current: WorkflowTriggerInput[] = [],
  ): WorkflowTriggerInput[] {
    if (triggers.length > 0 && type === "broadcast") {
      throw new BadRequestException(
        "Broadcast workflows can't have triggers or exit conditions; use an automation workflow",
      );
    }
    for (const trigger of triggers) {
      const source = INBOUND_SOURCES[trigger.source];
      if (!source) {
        throw new BadRequestException(
          `Unknown trigger source "${trigger.source}". Available: ${Object.keys(INBOUND_SOURCES).join(", ")}`,
        );
      }
      if (!isTriggerEvent(source, trigger.event)) {
        throw new BadRequestException(
          `Unknown ${source.name} event "${trigger.event}". Use one of ${source.events.map((e) => e.name).join(", ")}, or a raw event type such as checkout.session.completed`,
        );
      }
      const isNew = !current.some(
        (t) => t.source === trigger.source && t.event === trigger.event,
      );
      if (isNew && !connectedSources.has(trigger.source)) {
        throw new BadRequestException(
          `Connect the ${source.name} integration before adding its triggers or exit conditions`,
        );
      }
    }
    const seen = new Set<string>();
    return triggers.filter((t) => {
      const id = `${t.source}:${t.event}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  private toStepInputs(steps: WorkflowStepInput[]) {
    return steps.map((s) => {
      const { type, delayMs, ...config } = s;
      return { type, delayMs, config };
    });
  }

  // Replaces any webhook URL that is the redacted form of an existing step's URL
  // with the real one, so read-modify-write updates don't clobber secrets.
  private restoreRedactedWebhookUrls(
    steps: WorkflowStepInput[],
    existingSteps: WorkflowStepRow[],
  ): WorkflowStepInput[] {
    const realUrlByRedacted = new Map<string, string>();
    for (const step of existingSteps) {
      if (typeof step.config.url === "string") {
        realUrlByRedacted.set(
          redactWebhookUrl(step.config.url),
          step.config.url,
        );
      }
    }

    return steps.map((step) => {
      if (step.type !== "webhook") return step;
      const realUrl = realUrlByRedacted.get(step.url);
      return realUrl ? { ...step, url: realUrl } : step;
    });
  }

  async createWorkflow(
    db: dbClient,
    environment: EnvironmentRef,
    data: CreateWorkflowData,
  ) {
    const environmentId = environment.id;
    const connectedSources = await this.connectedSources(db, environmentId);
    const { workflow, steps, triggers } = await workflowRepo.createWorkflow(
      db,
      {
        environmentId,
        key: data.key,
        name: data.name,
        description: data.description ?? null,
        type: data.type,
        channels: data.channels ?? null,
        steps: this.toStepInputs(data.steps),
        triggers: this.validateTriggers(
          data.type,
          data.triggers ?? [],
          connectedSources,
        ),
        exitConditions: this.validateTriggers(
          data.type,
          data.exitConditions ?? [],
          connectedSources,
        ),
        createdBy: data.createdBy,
      },
    );

    return this.toWorkflowDto(
      workflow,
      steps,
      triggers,
      connectedSources,
      environment.publicId,
    );
  }

  async listWorkflows(
    db: dbClient,
    environment: EnvironmentRef,
    opts: {
      limit: number;
      offset: number;
      type?: "automation" | "broadcast";
    },
  ) {
    const environmentId = environment.id;
    const rows = await workflowRepo.listWorkflows(db, environmentId, opts);
    const connectedSources = await this.connectedSources(db, environmentId);
    const workflows = await Promise.all(
      rows.map(async (workflow) => {
        const [steps, triggers] = await Promise.all([
          workflowRepo.listStepsForWorkflow(db, workflow.id),
          workflowRepo.listTriggersForWorkflow(db, workflow.id),
        ]);
        return this.toWorkflowDto(
          workflow,
          steps,
          triggers,
          connectedSources,
          environment.publicId,
        );
      }),
    );

    return { workflows, limit: opts.limit, offset: opts.offset };
  }

  async getWorkflow(
    db: dbClient,
    environment: EnvironmentRef,
    workflowPublicId: string,
  ) {
    const environmentId = environment.id;
    const workflow = await workflowRepo.getWorkflowByPublicId(
      db,
      environmentId,
      workflowPublicId,
    );
    if (!workflow) throw new NotFoundException("Workflow not found");

    const [steps, triggers, connectedSources, counts, bounceBreakdown] =
      await Promise.all([
        workflowRepo.listStepsForWorkflow(db, workflow.id),
        workflowRepo.listTriggersForWorkflow(db, workflow.id),
        this.connectedSources(db, environmentId),
        workflowRunRepo.getWorkflowStepCounts(db, workflow.id),
        workflowRunRepo.getWorkflowBounceBreakdown(db, workflow.id),
      ]);

    return {
      ...this.toWorkflowDto(
        workflow,
        steps,
        triggers,
        connectedSources,
        environment.publicId,
      ),
      sentCount: counts.sent,
      failedCount: counts.failed,
      skippedCount: counts.skipped,
      pendingCount: counts.pending,
      bouncedCount: counts.bounced,
      hardBounceCount: bounceBreakdown.hard,
      softBounceCount: bounceBreakdown.soft,
      successRate: this.successRate(counts.sent, counts.failed),
    };
  }

  async updateWorkflow(
    db: dbClient,
    environment: EnvironmentRef,
    workflowPublicId: string,
    data: UpdateWorkflowData,
  ) {
    const environmentId = environment.id;
    const existing = await workflowRepo.getWorkflowByPublicId(
      db,
      environmentId,
      workflowPublicId,
    );
    if (!existing) throw new NotFoundException("Workflow not found");

    const connectedSources = await this.connectedSources(db, environmentId);
    const current = await workflowRepo.listTriggersForWorkflow(db, existing.id);
    const validate = (
      action: WorkflowTriggerRow["action"],
      given: WorkflowTriggerInput[] | undefined,
    ) =>
      given &&
      this.validateTriggers(
        existing.type,
        given,
        connectedSources,
        current.filter((t) => t.action === action),
      );
    const newTriggers = validate("start", data.triggers);
    const newExitConditions = validate("exit", data.exitConditions);

    const workflow = await workflowRepo.updateWorkflow(db, existing.id, {
      key: data.key,
      name: data.name,
      description: data.description,
      status: data.status,
      channels: data.channels
        ? mergeChannels(existing.channels, data.channels)
        : undefined,
      updatedBy: data.updatedBy,
    });
    if (!workflow) throw new NotFoundException("Workflow not found");

    const steps = data.steps
      ? await workflowRepo.replaceWorkflowSteps(
          db,
          existing.id,
          this.toStepInputs(
            this.restoreRedactedWebhookUrls(
              data.steps,
              await workflowRepo.listStepsForWorkflow(db, existing.id),
            ),
          ),
        )
      : await workflowRepo.listStepsForWorkflow(db, existing.id);
    if (newTriggers) {
      await workflowRepo.replaceWorkflowTriggers(
        db,
        existing,
        "start",
        newTriggers,
      );
    }
    if (newExitConditions) {
      await workflowRepo.replaceWorkflowTriggers(
        db,
        existing,
        "exit",
        newExitConditions,
      );
    }
    const triggers =
      newTriggers || newExitConditions
        ? await workflowRepo.listTriggersForWorkflow(db, existing.id)
        : current;

    return this.toWorkflowDto(
      workflow,
      steps,
      triggers,
      connectedSources,
      environment.publicId,
    );
  }

  async deleteWorkflow(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    deletedBy: number | null,
  ) {
    const existing = await workflowRepo.getWorkflowByPublicId(
      db,
      environmentId,
      workflowPublicId,
    );
    if (!existing) throw new NotFoundException("Workflow not found");

    const deleted = await workflowRepo.softDeleteWorkflow(
      db,
      existing.id,
      deletedBy,
    );
    if (!deleted) throw new NotFoundException("Workflow not found");
  }

  async triggerWorkflow(
    db: dbClient,
    environmentId: number,
    input: TriggerWorkflowData,
  ) {
    const workflow = await workflowRepo.getWorkflowByKey(
      db,
      environmentId,
      input.key,
    );
    if (!workflow) throw new NotFoundException("Workflow not found");

    if (workflow.status === "paused") {
      return { triggered: false as const, reason: "workflow_paused" };
    }

    const steps = await workflowRepo.listStepsForWorkflow(db, workflow.id);
    if (steps.length === 0) {
      return { triggered: false as const, reason: "workflow_has_no_steps" };
    }

    const subscriber =
      (await subscriberRepo.findSubscriberForUpsert(
        db,
        environmentId,
        input.subscriber,
      )) ?? (await this.createTriggeredSubscriber(db, environmentId, input));
    if (!subscriber) throw new NotFoundException("Subscriber not found");

    if (input.idempotencyKey) {
      const existing = await this.resumeExistingRun(
        db,
        environmentId,
        input.idempotencyKey,
      );
      if (existing) return existing;
    }

    try {
      const { run } = await createRunForSubscriber(db, this.queue, {
        workflowId: workflow.id,
        steps,
        environmentId,
        subscriberId: subscriber.id,
        payload: input.payload,
        createdBy: input.triggeredBy,
        idempotencyKey: input.idempotencyKey,
      });
      return { triggered: true as const, runPublicId: run.publicId };
    } catch (error) {
      if (!input.idempotencyKey || !isUniqueViolation(error)) throw error;
      const existing = await this.resumeExistingRun(
        db,
        environmentId,
        input.idempotencyKey,
      );
      if (!existing) throw error;
      return existing;
    }
  }

  private async createTriggeredSubscriber(
    db: dbClient,
    environmentId: number,
    input: TriggerWorkflowData,
  ) {
    if (!input.subscriber.email) return undefined;
    try {
      const subscriber = await subscriberRepo.createSubscriber(db, {
        environmentId,
        ...input.subscriber,
        createdBy: input.triggeredBy,
        createdVia: input.createdVia ?? "api",
      });
      if (!subscriber) return undefined;
      await subscriberRepo.createSubscriberPreferences(db, {
        subscriberId: subscriber.id,
        email: true,
      });
      return subscriber;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return subscriberRepo.findSubscriberForUpsert(
        db,
        environmentId,
        input.subscriber,
      );
    }
  }

  // Queues any steps of an earlier attempt's run that never made it onto the
  // queue, e.g. because that attempt crashed straight after creating the run.
  private async resumeExistingRun(
    db: dbClient,
    environmentId: number,
    idempotencyKey: string,
  ) {
    const run = await workflowRunRepo.getRunByIdempotencyKey(
      db,
      environmentId,
      idempotencyKey,
    );
    if (!run) return undefined;
    const unqueued = await workflowRunRepo.listUnqueuedPendingSteps(db, run.id);
    await queueRunSteps(db, this.queue, unqueued);
    return { triggered: true as const, runPublicId: run.publicId };
  }

  async listRuns(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    opts: { limit: number; offset: number },
  ) {
    const workflow = await workflowRepo.getWorkflowByPublicId(
      db,
      environmentId,
      workflowPublicId,
    );
    if (!workflow) throw new NotFoundException("Workflow not found");

    const runs = await workflowRunRepo.listRunsForWorkflow(
      db,
      workflow.id,
      opts,
    );

    return {
      runs: runs.map((run) => ({
        publicId: run.publicId,
        status: run.status,
        triggeredAt: run.triggeredAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        subscriber: {
          publicId: run.subscriber.publicId,
          email: run.subscriber.email,
          name: run.subscriber.name,
          externalId: run.subscriber.externalId,
        },
        steps: run.steps.map((s) => ({
          stepOrder: s.stepOrder,
          type: s.type,
          status: s.status,
          scheduledAt: s.scheduledAt.toISOString(),
          sentAt: s.sentAt?.toISOString() ?? null,
          errorMessage: s.errorMessage,
          bounceType: s.bounceType,
        })),
      })),
      limit: opts.limit,
      offset: opts.offset,
    };
  }

  async listRunsForEnvironment(
    db: dbClient,
    environmentId: number,
    opts: { limit: number; offset: number },
  ) {
    const runs = await workflowRunRepo.listRunsForEnvironment(
      db,
      environmentId,
      opts,
    );

    return {
      runs: runs.map((run) => ({
        publicId: run.publicId,
        status: run.status,
        triggeredAt: run.triggeredAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        workflow: {
          publicId: run.workflow.publicId,
          key: run.workflow.key,
          name: run.workflow.name,
        },
        subscriber: {
          publicId: run.subscriber.publicId,
          email: run.subscriber.email,
          name: run.subscriber.name,
          externalId: run.subscriber.externalId,
        },
        steps: run.steps.map((s) => ({
          stepOrder: s.stepOrder,
          type: s.type,
          status: s.status,
          scheduledAt: s.scheduledAt.toISOString(),
          sentAt: s.sentAt?.toISOString() ?? null,
          errorMessage: s.errorMessage,
          bounceType: s.bounceType,
        })),
      })),
      limit: opts.limit,
      offset: opts.offset,
    };
  }

  async cancelPendingRunsForSubscriber(
    db: dbClient,
    subscriberId: number,
    reason: string,
    scope?: RunScope,
  ): Promise<number> {
    const pending = await workflowRunRepo.listPendingRunStepsForSubscriber(
      db,
      subscriberId,
      scope,
    );
    if (pending.length === 0) return 0;

    await Promise.all(
      pending
        .filter((s) => s.bullJobId)
        .map((s) => this.queue.remove(s.bullJobId!).catch(() => undefined)),
    );

    return await workflowRunRepo.cancelPendingForSubscriber(
      db,
      subscriberId,
      pending.map((s) => s.id),
      reason,
      scope,
    );
  }

  private async getWorkflowReadyForBroadcast(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
  ) {
    const workflow = await workflowRepo.getWorkflowByPublicId(
      db,
      environmentId,
      workflowPublicId,
    );
    if (!workflow) throw new NotFoundException("Workflow not found");
    if (workflow.status === "paused") {
      throw new BadRequestException("Workflow is paused");
    }

    const steps = await workflowRepo.listStepsForWorkflow(db, workflow.id);
    if (steps.length === 0) {
      throw new BadRequestException("Workflow has no steps");
    }

    return workflow;
  }

  async previewBroadcast(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    audience: AudienceCondition,
  ) {
    await this.getWorkflowReadyForBroadcast(
      db,
      environmentId,
      workflowPublicId,
    );

    const subscriberIds = await resolveAudienceSubscriberIds(
      db,
      environmentId,
      audience,
    );

    return { matchedCount: subscriberIds.length };
  }

  async triggerBroadcast(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    audience: AudienceCondition,
    triggeredBy: number | null,
    opts: { sendOverHours?: number; allowOverPlan?: boolean } = {},
  ) {
    const workflow = await this.getWorkflowReadyForBroadcast(
      db,
      environmentId,
      workflowPublicId,
    );
    if (this.billing.isEnabled()) {
      const audienceSize = (
        await resolveAudienceSubscriberIds(db, environmentId, audience)
      ).length;
      await this.billing.checkBroadcast(
        db,
        environmentId,
        audienceSize,
        opts.allowOverPlan ?? false,
      );
    }

    const broadcast = await workflowBroadcastRepo.createBroadcast(db, {
      workflowId: workflow.id,
      environmentId,
      audienceQuery: audience as Record<string, unknown>,
      sendOverMs: opts.sendOverHours
        ? Math.round(opts.sendOverHours * HOUR_MS)
        : null,
      createdBy: triggeredBy,
    });

    await this.enqueueDispatch(broadcast.id);

    return { broadcastId: broadcast.publicId, status: broadcast.status };
  }

  async listBroadcasts(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    opts: { limit: number; offset: number },
  ) {
    const workflow = await workflowRepo.getWorkflowByPublicId(
      db,
      environmentId,
      workflowPublicId,
    );
    if (!workflow) throw new NotFoundException("Workflow not found");

    const rows = await workflowBroadcastRepo.listBroadcastsForWorkflow(
      db,
      workflow.id,
      opts,
    );

    return {
      broadcasts: await Promise.all(
        rows.map((b) => this.withCompletedStatus(db, b)),
      ),
      limit: opts.limit,
      offset: opts.offset,
    };
  }

  async getBroadcast(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    broadcastPublicId: string,
  ) {
    const broadcast = await this.requireBroadcast(
      db,
      environmentId,
      workflowPublicId,
      broadcastPublicId,
    );

    const [counts, bounceBreakdown] = await Promise.all([
      workflowBroadcastRepo.getBroadcastStepCounts(db, broadcast.id),
      workflowBroadcastRepo.getBroadcastBounceBreakdown(db, broadcast.id),
    ]);

    return {
      ...(await this.withCompletedStatus(db, broadcast)),
      sentCount: counts.sent,
      failedCount: counts.failed,
      skippedCount: counts.skipped,
      pendingCount: counts.pending,
      bouncedCount: counts.bounced,
      hardBounceCount: bounceBreakdown.hard,
      softBounceCount: bounceBreakdown.soft,
      successRate: this.successRate(counts.sent, counts.failed),
    };
  }

  async recordBounceEvent(
    db: dbClient,
    data: {
      runStepPublicId: string;
      bounceType: "hard" | "soft";
      reason: string;
    },
  ) {
    const runStep = await workflowRunRepo.getRunStepByPublicId(
      db,
      data.runStepPublicId,
    );
    if (!runStep) throw new NotFoundException("Run step not found");

    // Deterministic jobId: a retried/duplicate webhook delivery (any bounce
    // source retrying on a non-2xx) no-ops instead of double-recording.
    await this.bounceEventsQueue.add(
      BOUNCE_EVENT_JOB_NAME,
      {
        runStepId: runStep.id,
        bounceType: data.bounceType,
        reason: data.reason,
      } satisfies BounceEventJobData,
      {
        jobId: `bounce-${runStep.id}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );
  }
}
