import type { Job } from "bullmq";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";

import { createDrizzleClient } from "@subscriber.dev/db/client";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";
import * as workflowRunRepo from "@subscriber.dev/db/repository/workflowRun.repo";
import { sendRawEmail } from "@subscriber.dev/email";
import { createEmailUnsubscribeLink } from "@subscriber.dev/shared/utils";

import type { WorkflowStepJobData } from "./workflow.constants.js";
import { WORKFLOW_QUEUE_NAME } from "./workflow.constants.js";
import { renderTemplate } from "./workflow.template.js";

@Processor(WORKFLOW_QUEUE_NAME)
@Injectable()
export class WorkflowProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowProcessor.name);

  async process(job: Job<WorkflowStepJobData>): Promise<void> {
    const db = createDrizzleClient();
    const runStep = await workflowRunRepo.getRunStepById(
      db,
      job.data.runStepId,
    );
    if (!runStep || runStep.status !== "pending") return;

    const run = await workflowRunRepo.getRunById(db, runStep.runId);
    if (!run) {
      await workflowRunRepo.updateRunStepStatus(
        db,
        runStep.id,
        "failed",
        "Parent run not found",
      );
      return;
    }

    const subscriber = await subscriberRepo.getSubscriberById(
      db,
      run.subscriberId,
    );
    if (!subscriber) {
      await workflowRunRepo.updateRunStepStatus(
        db,
        runStep.id,
        "skipped",
        "Subscriber not found",
      );
      return;
    }

    const baseContext = {
      subscriber: {
        firstName: subscriber.firstName,
        lastName: subscriber.lastName,
        name: subscriber.name,
        email: subscriber.email,
        ...(subscriber.attributes ?? {}),
      },
      ...(run.payload ?? {}),
    };

    if (runStep.type === "email") {
      const preferences = await subscriberRepo.getLatestPreferences(
        db,
        subscriber.id,
      );
      if (preferences && !preferences.email) {
        await workflowRunRepo.updateRunStepStatus(
          db,
          runStep.id,
          "skipped",
          "Subscriber opted out of email",
        );
      } else if (!subscriber.email) {
        await workflowRunRepo.updateRunStepStatus(
          db,
          runStep.id,
          "skipped",
          "Subscriber has no email address",
        );
      } else {
        const config = runStep.configSnapshot as {
          subject: string;
          body: string;
        };
        const unsubscribeUrl = await createEmailUnsubscribeLink(
          subscriber.environmentId,
          subscriber.publicId,
        );
        const context = { ...baseContext, unsubscribeUrl };
        const subject = await renderTemplate(config.subject, context);
        const interpolatedBody = await renderTemplate(config.body, context);
        const bodyHasUnsubscribeToken =
          config.body.includes("{{unsubscribeUrl}}");
        const html =
          unsubscribeUrl && !bodyHasUnsubscribeToken
            ? `${interpolatedBody}<p style="font-size:12px;color:#666;">Don't want these emails? <a href="${unsubscribeUrl}">Unsubscribe</a></p>`
            : interpolatedBody;

        try {
          await sendRawEmail(subscriber.email, subject, html);
          await workflowRunRepo.updateRunStepStatus(db, runStep.id, "sent");
        } catch (error) {
          await workflowRunRepo.updateRunStepStatus(
            db,
            runStep.id,
            "failed",
            error instanceof Error ? error.message : "Unknown error",
          );
          throw error;
        }
      }
    } else if (runStep.type === "webhook") {
      const config = runStep.configSnapshot as { url: string; body: string };
      const payload = await renderTemplate(config.body, baseContext);

      try {
        JSON.parse(payload);
        const response = await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        if (!response.ok) {
          throw new Error(`Webhook responded with ${response.status}`);
        }
        await workflowRunRepo.updateRunStepStatus(db, runStep.id, "sent");
      } catch (error) {
        await workflowRunRepo.updateRunStepStatus(
          db,
          runStep.id,
          "failed",
          error instanceof Error ? error.message : "Unknown error",
        );
        throw error;
      }
    } else {
      await workflowRunRepo.updateRunStepStatus(
        db,
        runStep.id,
        "failed",
        `Unsupported step type: ${runStep.type}`,
      );
    }

    await workflowRunRepo.completeRunIfAllStepsTerminal(db, run.id);
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job<WorkflowStepJobData> | undefined, error: Error) {
    if (!job?.id) return;
    this.logger.error(`Workflow step job ${job.id} failed: ${error.message}`);

    if ((job.attemptsMade ?? 0) >= (job.opts.attempts ?? 1)) {
      const db = createDrizzleClient();
      const runStep = await workflowRunRepo.getRunStepByBullJobId(db, job.id);
      if (runStep?.status === "pending") {
        await workflowRunRepo.updateRunStepStatus(
          db,
          runStep.id,
          "failed",
          error.message,
        );
      }
    }
  }
}
