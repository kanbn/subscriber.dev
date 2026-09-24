import type { z } from "zod";
import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Queue } from "bullmq";

import type { dbClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";
import * as workflowBroadcastRepo from "@subscriber.dev/db/repository/workflowBroadcast.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import type { AudienceCondition } from "./audienceQuery.js";
import type { WorkflowStepSchema } from "./dto/create-workflow.dto.js";
import type {
  BounceEventJobData,
  BroadcastDispatchJobData,
} from "./workflow.constants.js";
import { resolveAudienceSubscriberIds } from "./audienceQuery.js";
import { createRunForSubscriber } from "./createRunForSubscriber.js";
import {
  BOUNCE_EVENT_JOB_NAME,
  BOUNCE_EVENTS_QUEUE_NAME,
  BROADCAST_DISPATCH_JOB_NAME,
  BROADCAST_DISPATCH_QUEUE_NAME,
  WORKFLOW_QUEUE_NAME,
} from "./workflow.constants.js";

type WorkflowStepInput = z.infer<typeof WorkflowStepSchema>;

interface CreateWorkflowData {
  key: string;
  name: string;
  description?: string;
  type: "automation" | "broadcast";
  steps: WorkflowStepInput[];
  createdBy: number;
}

interface UpdateWorkflowData {
  key?: string;
  name?: string;
  description?: string | null;
  status?: "active" | "paused";
  steps?: WorkflowStepInput[];
  updatedBy: number;
}

interface TriggerWorkflowData {
  key: string;
  subscriber: { publicId?: string; externalId?: string; email?: string };
  payload?: Record<string, unknown>;
  triggeredBy: number;
}

interface WorkflowStepRow {
  publicId: string;
  stepOrder: number;
  type: string;
  delayMs: number;
  config: Record<string, unknown>;
}

export const redactWebhookUrl = (url: string) => {
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
  ) {}

  private toWorkflowDto(
    workflow: {
      publicId: string;
      key: string;
      name: string;
      description: string | null;
      status: "active" | "paused";
      type: "automation" | "broadcast";
      createdAt: Date;
      updatedAt: Date;
    },
    steps: WorkflowStepRow[],
  ) {
    return {
      publicId: workflow.publicId,
      key: workflow.key,
      name: workflow.name,
      description: workflow.description,
      status: workflow.status,
      type: workflow.type,
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
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
    };
  }

  private successRate(sent: number, failed: number): number | null {
    const totalAttempted = sent + failed;
    return totalAttempted > 0 ? sent / totalAttempted : null;
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
    environmentId: number,
    data: CreateWorkflowData,
  ) {
    const { workflow, steps } = await workflowRepo.createWorkflow(db, {
      environmentId,
      key: data.key,
      name: data.name,
      description: data.description ?? null,
      type: data.type,
      steps: this.toStepInputs(data.steps),
      createdBy: data.createdBy,
    });

    return this.toWorkflowDto(workflow, steps);
  }

  async listWorkflows(
    db: dbClient,
    environmentId: number,
    opts: {
      limit: number;
      offset: number;
      type?: "automation" | "broadcast";
    },
  ) {
    const rows = await workflowRepo.listWorkflows(db, environmentId, opts);
    const workflows = await Promise.all(
      rows.map(async (workflow) => {
        const steps = await workflowRepo.listStepsForWorkflow(db, workflow.id);
        return this.toWorkflowDto(workflow, steps);
      }),
    );

    return { workflows, limit: opts.limit, offset: opts.offset };
  }

  async getWorkflow(
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

    const steps = await workflowRepo.listStepsForWorkflow(db, workflow.id);
    const [counts, bounceBreakdown] = await Promise.all([
      workflowRunRepo.getWorkflowStepCounts(db, workflow.id),
      workflowRunRepo.getWorkflowBounceBreakdown(db, workflow.id),
    ]);

    return {
      ...this.toWorkflowDto(workflow, steps),
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
    environmentId: number,
    workflowPublicId: string,
    data: UpdateWorkflowData,
  ) {
    const existing = await workflowRepo.getWorkflowByPublicId(
      db,
      environmentId,
      workflowPublicId,
    );
    if (!existing) throw new NotFoundException("Workflow not found");

    const workflow = await workflowRepo.updateWorkflow(db, existing.id, {
      key: data.key,
      name: data.name,
      description: data.description,
      status: data.status,
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

    return this.toWorkflowDto(workflow, steps);
  }

  async deleteWorkflow(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    deletedBy: number,
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

    const subscriber = await subscriberRepo.findSubscriberForUpsert(
      db,
      environmentId,
      {
        publicId: input.subscriber.publicId,
        externalId: input.subscriber.externalId,
        email: input.subscriber.email,
      },
    );
    if (!subscriber) throw new NotFoundException("Subscriber not found");

    const { run } = await createRunForSubscriber(db, this.queue, {
      workflowId: workflow.id,
      steps,
      environmentId,
      subscriberId: subscriber.id,
      payload: input.payload,
      createdBy: input.triggeredBy,
    });

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
  ) {
    const pending = await workflowRunRepo.listPendingRunStepsForSubscriber(
      db,
      subscriberId,
    );
    if (pending.length === 0) return;

    await Promise.all(
      pending
        .filter((s) => s.bullJobId)
        .map((s) => this.queue.remove(s.bullJobId!).catch(() => undefined)),
    );

    await workflowRunRepo.cancelPendingForSubscriber(
      db,
      subscriberId,
      pending.map((s) => s.id),
      reason,
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
    triggeredBy: number,
  ) {
    const workflow = await this.getWorkflowReadyForBroadcast(
      db,
      environmentId,
      workflowPublicId,
    );

    const broadcast = await workflowBroadcastRepo.createBroadcast(db, {
      workflowId: workflow.id,
      environmentId,
      audienceQuery: audience as Record<string, unknown>,
      createdBy: triggeredBy,
    });

    await this.broadcastDispatchQueue.add(
      BROADCAST_DISPATCH_JOB_NAME,
      { broadcastId: broadcast.id } satisfies BroadcastDispatchJobData,
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );

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
      broadcasts: rows.map((b) => ({
        publicId: b.publicId,
        status: b.status,
        matchedCount: b.matchedCount,
        createdAt: b.createdAt.toISOString(),
      })),
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

    const [counts, bounceBreakdown] = await Promise.all([
      workflowBroadcastRepo.getBroadcastStepCounts(db, broadcast.id),
      workflowBroadcastRepo.getBroadcastBounceBreakdown(db, broadcast.id),
    ]);

    return {
      publicId: broadcast.publicId,
      status: broadcast.status,
      matchedCount: broadcast.matchedCount,
      createdAt: broadcast.createdAt.toISOString(),
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
