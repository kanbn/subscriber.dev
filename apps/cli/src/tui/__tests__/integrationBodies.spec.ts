import { describe, expect, it } from "vitest";

import { stripeIntegrationBody } from "../integrationBodies.js";

describe("stripeIntegrationBody", () => {
  it("sends the API key, leaving a blank webhook secret for later", () => {
    expect(
      stripeIntegrationBody(
        { apiKey: " rk_live_1 ", webhookSecret: "" },
        { editing: false },
      ),
    ).toEqual({ apiKey: "rk_live_1", webhookSecret: undefined });
  });

  it("leaves blank secrets out when editing, so the stored ones are kept", () => {
    const body = stripeIntegrationBody(
      { apiKey: "", webhookSecret: "" },
      { editing: true },
    );

    expect(body.apiKey).toBeUndefined();
    expect(body.webhookSecret).toBeUndefined();
  });
});
