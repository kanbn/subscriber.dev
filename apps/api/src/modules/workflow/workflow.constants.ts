export const WORKFLOW_QUEUE_NAME = "workflows";
export const WORKFLOW_STEP_JOB_NAME = "send-step";

export interface WorkflowStepJobData {
  runStepId: number;
  parked?: boolean;
}

export const BROADCAST_DISPATCH_QUEUE_NAME = "broadcast-dispatch";
export const BROADCAST_DISPATCH_JOB_NAME = "dispatch";

export interface BroadcastDispatchJobData {
  broadcastId: number;
}

export const BROADCAST_SETUP_QUEUE_NAME = "broadcast-setup";
export const BROADCAST_SETUP_JOB_NAME = "setup-subscriber";

export interface BroadcastSetupJobData {
  broadcastId: number;
  subscriberId: number;
  startDelayMs?: number;
}

export const BROADCAST_STEPS_QUEUE_NAME = "broadcast-steps";

export const BROADCAST_RESUME_QUEUE_NAME = "broadcast-resume";
export const BROADCAST_RESUME_JOB_NAME = "reschedule";

export interface BroadcastResumeJobData {
  broadcastId: number;
}

export const BOUNCE_EVENTS_QUEUE_NAME = "bounce-events";
export const BOUNCE_EVENT_JOB_NAME = "record-bounce";

export interface BounceEventJobData {
  runStepId: number;
  bounceType: "hard" | "soft";
  reason: string;
}

export const BOUNCE_POLL_QUEUE_NAME = "bounce-poll";
export const BOUNCE_POLL_JOB_NAME = "poll";
export const BOUNCE_POLL_INTERVAL_MS = 15 * 60 * 1000;
