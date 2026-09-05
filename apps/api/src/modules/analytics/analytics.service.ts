import { Injectable } from "@nestjs/common";

import type { dbClient } from "@subscriber.dev/db/client";
import * as analyticsRepo from "@subscriber.dev/db/repository/analytics.repo";
import * as subscriberRepo from "@subscriber.dev/db/repository/subscriber.repo";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  async getAnalytics(db: dbClient, environmentId: number, days: number) {
    const sinceDate = new Date(Date.now() - days * MS_PER_DAY);

    const [subscriberCounts, optedOutCounts, stepCounts, bounceBreakdown] =
      await Promise.all([
        subscriberRepo.getSubscriberCounts(db, environmentId, sinceDate),
        subscriberRepo.getOptedOutCounts(db, environmentId, sinceDate),
        analyticsRepo.getEnvironmentStepCounts(db, environmentId),
        analyticsRepo.getEnvironmentBounceBreakdown(db, environmentId),
      ]);

    const totalAttempted = stepCounts.sent + stepCounts.failed;

    return {
      days,
      subscribers: {
        total: subscriberCounts.total,
        newInPeriod: subscriberCounts.newInPeriod,
        optedOut: optedOutCounts.total,
        optedOutInPeriod: optedOutCounts.recent,
      },
      sends: {
        sent: stepCounts.sent,
        failed: stepCounts.failed,
        skipped: stepCounts.skipped,
        pending: stepCounts.pending,
        bounced: stepCounts.bounced,
        successRate:
          totalAttempted > 0 ? stepCounts.sent / totalAttempted : null,
      },
      bounces: bounceBreakdown,
    };
  }
}
