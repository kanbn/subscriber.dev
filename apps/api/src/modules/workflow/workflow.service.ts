import type { z } from "zod";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, NotFoundException } from "@nestjs/common";
import { Queue } from "bullmq";

import type { dbClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";

import type { WorkflowStepSchema } from "./dto/create-workflow.dto.js";
import type { WorkflowStepJobData } from "./workflow.constants.js";
import {
  WORKFLOW_QUEUE_NAME,
  WORKFLOW_STEP_JOB_NAME,
} from "./workflow.constants.js";

type WorkflowStepInput = z.infer<typeof WorkflowStepSchema>;

interface CreateWorkflowData {
  key: string;
  name: string;
  description?: string;
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

@Injectable()
export class WorkflowService {
  constructor(
    @InjectQueue(WORKFLOW_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  private toWorkflowDto(
    workflow: {
      publicId: string;
      key: string;
      name: string;
      description: string | null;
      status: "active" | "paused";
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
      steps: steps.map((s) => ({
        ...s.config,
        publicId: s.publicId,
        stepOrder: s.stepOrder,
        type: s.type,
        delayMs: s.delayMs,
      })),
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }

  private toStepInputs(steps: WorkflowStepInput[]) {
    return steps.map((s) => {
      const { type, delayMs, ...config } = s;
      return { type, delayMs, config };
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
      steps: this.toStepInputs(data.steps),
      createdBy: data.createdBy,
    });

    return this.toWorkflowDto(workflow, steps);
  }

  async listWorkflows(
    db: dbClient,
    environmentId: number,
    opts: { limit: number; offset: number },
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
    return this.toWorkflowDto(workflow, steps);
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
          this.toStepInputs(data.steps),
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

    let cumulativeDelayMs = 0;
    const now = new Date();
    const plannedSteps = steps.map((step) => {
      cumulativeDelayMs += step.delayMs;
      return {
        stepId: step.id,
        stepOrder: step.stepOrder,
        type: step.type,
        configSnapshot: step.config,
        scheduledAt: new Date(now.getTime() + cumulativeDelayMs),
        cumulativeDelayMs,
      };
    });

    const { run, runSteps } = await workflowRunRepo.createRunWithSteps(db, {
      workflowId: workflow.id,
      environmentId,
      subscriberId: subscriber.id,
      payload: input.payload ?? null,
      createdBy: input.triggeredBy,
      steps: plannedSteps,
    });

    for (const [i, runStep] of runSteps.entries()) {
      const job = await this.queue.add(
        WORKFLOW_STEP_JOB_NAME,
        { runStepId: runStep.id } satisfies WorkflowStepJobData,
        {
          delay: plannedSteps[i]!.cumulativeDelayMs,
          jobId: `run-step-${runStep.id}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 60_000 },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
      if (job.id) {
        await workflowRunRepo.setRunStepBullJobId(db, runStep.id, job.id);
      }
    }

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
        triggeredAt: run.triggeredAt,
        completedAt: run.completedAt,
        steps: run.steps.map((s) => ({
          stepOrder: s.stepOrder,
          type: s.type,
          status: s.status,
          scheduledAt: s.scheduledAt,
          sentAt: s.sentAt,
          errorMessage: s.errorMessage,
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
}
