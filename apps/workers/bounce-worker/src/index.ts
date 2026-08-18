import PostalMime from "postal-mime";

import type { Env } from "./postBounceEvent.js";
import {
  classifyBounce,
  extractReason,
  extractRunStepToken,
  isBounceNotification,
} from "./bounceDetection.js";
import { postBounceEvent } from "./postBounceEvent.js";

export default {
  async email(
    message: ForwardableEmailMessage,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const runStepPublicId = extractRunStepToken(message.to);
    if (!runStepPublicId) return;

    const email = await PostalMime.parse(message.raw);
    const from = email.from?.address ?? "";
    const subject = email.subject ?? "";
    const text = email.text ?? email.html ?? "";

    if (!isBounceNotification({ from, subject, text })) return;

    const bounceType = classifyBounce(`${subject} ${text}`);
    const reason = extractReason(text || subject);

    await postBounceEvent(env, { runStepPublicId, bounceType, reason });
  },
};
