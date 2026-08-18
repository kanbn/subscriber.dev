import type { BounceType } from "./bounceDetection.js";

export interface Env {
  BOUNCE_WEBHOOK_URL: string;
  BOUNCE_WEBHOOK_SECRET: string;
}

export interface BounceEventPayload {
  runStepPublicId: string;
  bounceType: BounceType;
  reason: string;
}

export async function postBounceEvent(
  env: Env,
  payload: BounceEventPayload,
): Promise<void> {
  const response = await fetch(`${env.BOUNCE_WEBHOOK_URL}/bounces/inbound`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.BOUNCE_WEBHOOK_SECRET}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Bounce webhook responded with ${response.status}: ${await response.text()}`,
    );
  }
}
