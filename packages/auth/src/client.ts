import { stripeClient } from "@better-auth/stripe/client";
import {
  apiKeyClient,
  deviceAuthorizationClient,
  magicLinkClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    stripeClient({
      subscription: true,
    }),
    magicLinkClient(),
    apiKeyClient(),
    deviceAuthorizationClient(),
  ],
});
