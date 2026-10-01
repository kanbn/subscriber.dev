export interface InboundEvent {
  externalEventId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface InboundPerson {
  email?: string;
  name?: string;
  subscriberExternalId?: string;
}

export type FetchedPerson = { person: InboundPerson } | { skipReason: string };

export class InvalidWebhookError extends Error {}

export interface InboundSourceEvent {
  name: string;
  label: string;
}

export interface InboundSource<TSecret = unknown> {
  source: string;
  name: string;
  events: readonly InboundSourceEvent[];
  eventsToEnable: readonly string[];
  verifyWebhook(input: {
    rawBody: Buffer;
    headers: Record<string, string | string[] | undefined>;
    secret: TSecret;
  }): InboundEvent;
  match(event: InboundEvent): string[];
  personRef(event: InboundEvent): string | undefined;
  fetchPerson(externalId: string, secret: TSecret): Promise<FetchedPerson>;
  templateData(event: InboundEvent, matched: string[]): Record<string, unknown>;
}

const RAW_EVENT_TYPE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

export function isTriggerEvent(
  source: Pick<InboundSource, "events">,
  event: string,
): boolean {
  return (
    source.events.some((e) => e.name === event) || RAW_EVENT_TYPE.test(event)
  );
}
