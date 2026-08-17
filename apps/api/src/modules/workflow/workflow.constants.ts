export const WORKFLOW_QUEUE_NAME = "workflows";
export const WORKFLOW_STEP_JOB_NAME = "send-step";

export interface WorkflowStepJobData {
  runStepId: number;
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
}

export const BROADCAST_STEPS_QUEUE_NAME = "broadcast-steps";
