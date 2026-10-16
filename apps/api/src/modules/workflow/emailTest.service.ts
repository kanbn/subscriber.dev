import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import * as workflowRepo from "@subscriber.dev/db/repository/workflow.repo";
import * as workspaceRepo from "@subscriber.dev/db/repository/workspace.repo";

import type { User } from "../../common/interfaces/user.interface.js";
import type { EmailContent } from "./sendEmailStep.js";
import { BillingService } from "../billing/billing.service.js";
import {
  NoEmailIntegrationError,
  renderEmail,
  sendWithIntegrations,
} from "./sendEmailStep.js";

export interface TestEmailContent extends EmailContent {
  fromName?: string;
  replyTo?: string;
}

function sampleContext(user: User, data: Record<string, unknown> = {}) {
  const name: string | null = user.name;
  const [firstName, ...rest] = (name ?? "").trim().split(/\s+/);
  const { subscriber, ...payload } = data;
  return {
    ...payload,
    subscriber: {
      email: user.email,
      firstName: firstName || null,
      lastName: rest.join(" ") || null,
      name: name ?? null,
      ...(subscriber && typeof subscriber === "object" ? subscriber : {}),
    },
  };
}

@Injectable()
export class EmailTestService {
  constructor(private readonly billing: BillingService) {}

  private async footer(db: dbClient, environmentId: number) {
    const [poweredBy, postalAddress] = await Promise.all([
      this.billing.showsPoweredBy(db, environmentId),
      workspaceRepo.getPostalAddressForEnvironment(db, environmentId),
    ]);
    return { poweredBy, postalAddress };
  }

  async preview(
    db: dbClient,
    user: User,
    environmentId: number,
    content: EmailContent,
  ) {
    const { subject, html } = await renderEmail(
      content,
      sampleContext(user),
      "#",
      await this.footer(db, environmentId),
    ).catch((error: unknown) => {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Couldn't render the email",
      );
    });
    return { subject, html };
  }

  async send(
    db: dbClient,
    user: User,
    environmentId: number,
    content: TestEmailContent,
    options: { to?: string; data?: Record<string, unknown> } = {},
  ) {
    const to = options.to ?? user.email;
    try {
      const email = await renderEmail(
        content,
        sampleContext(user, options.data),
        "#",
        await this.footer(db, environmentId),
      );
      const subject = `[Test] ${email.subject}`;
      await sendWithIntegrations(db, environmentId, {
        to,
        ...email,
        subject,
        fromName: content.fromName,
        replyTo: content.replyTo,
      });
      return { to, subject };
    } catch (error) {
      throw new BadRequestException(
        error instanceof NoEmailIntegrationError
          ? "Connect an email integration to this environment first"
          : error instanceof Error
            ? error.message
            : "Couldn't send the test email",
      );
    }
  }

  async content(
    db: dbClient,
    environmentId: number,
    input: Partial<TestEmailContent> & { workflowId?: string; step?: number },
  ): Promise<TestEmailContent> {
    const { workflowId, step, ...raw } = input;
    if (workflowId) {
      return this.workflowStep(db, environmentId, workflowId, step);
    }
    if (raw.subject === undefined || raw.body === undefined) {
      throw new BadRequestException("Pass a workflowId, or a subject and body");
    }
    return { ...raw, subject: raw.subject, body: raw.body };
  }

  async workflowStep(
    db: dbClient,
    environmentId: number,
    workflowPublicId: string,
    step?: number,
  ): Promise<TestEmailContent> {
    const workflow = await workflowRepo.getWorkflowByPublicId(
      db,
      environmentId,
      workflowPublicId,
    );
    if (!workflow) throw new NotFoundException("Workflow not found");
    const steps = await workflowRepo.listStepsForWorkflow(db, workflow.id);
    const chosen =
      step === undefined
        ? steps.find((candidate) => candidate.type === "email")
        : steps[step - 1];
    if (!chosen) {
      throw new BadRequestException(
        step === undefined
          ? "This workflow has no email steps"
          : `This workflow has ${steps.length} step${steps.length === 1 ? "" : "s"}`,
      );
    }
    if (chosen.type !== "email") {
      throw new BadRequestException(
        `Step ${step} is a ${chosen.type} step, not an email`,
      );
    }
    return {
      ...(chosen.config as unknown as EmailContent),
      fromName: workflow.channels?.email?.fromName,
      replyTo: workflow.channels?.email?.replyTo,
    };
  }
}
