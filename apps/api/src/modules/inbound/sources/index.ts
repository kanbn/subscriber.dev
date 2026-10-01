import type { InboundSource } from "../inboundSource.js";
import { stripeSource } from "./stripe/stripe.source.js";

export const INBOUND_SOURCES: Record<string, InboundSource<any>> = {
  stripe: stripeSource,
};
