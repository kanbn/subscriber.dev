export const INBOUND_EVENTS_QUEUE_NAME = "inbound-events";
export const INBOUND_EVENT_JOB_NAME = "process-event";

export interface InboundEventJobData {
  inboundEventId: number;
}
