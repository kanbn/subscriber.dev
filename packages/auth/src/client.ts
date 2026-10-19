import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import {
  deviceAuthorizationClient,
  magicLinkClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    deviceAuthorizationClient(),
    oauthProviderClient(),
  ],
});
