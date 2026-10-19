import { describe, expect, it, vi } from "vitest";

import { Subscriber, SubscriberError } from "./index.js";

function mockFetch(status: number, body: unknown) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

describe("Subscriber", () => {
  it("sends the key in x-api-key only, with flat parameters as the body", async () => {
    const fetch = mockFetch(201, { publicId: "sub_1" });
    const client = new Subscriber("sk_env_test", { fetch });

    const { data } = await client.subscribers.create({
      email: "jane@acme.com",
      firstName: "Jane",
    });

    expect(data).toEqual({ publicId: "sub_1" });
    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe("https://api.subscriber.dev/subscribers");
    expect(request.method).toBe("POST");
    expect(request.headers.get("x-api-key")).toBe("sk_env_test");
    expect(request.headers.get("authorization")).toBeNull();
    expect(await request.json()).toEqual({
      email: "jane@acme.com",
      firstName: "Jane",
    });
  });

  it("fills path parameters", async () => {
    const fetch = mockFetch(200, {});
    const client = new Subscriber("sk_env_test", {
      fetch,
      baseUrl: "http://localhost:4000",
    });

    await client.subscribers.update({ subscriberId: "sub_1", firstName: "J" });

    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe("http://localhost:4000/subscribers/sub_1");
    expect(await request.json()).toEqual({ firstName: "J" });
  });

  it("throws a SubscriberError with the API's message", async () => {
    const fetch = mockFetch(403, {
      statusCode: 403,
      message: "This API key doesn't have the subscribers:read scope.",
      error: "Forbidden",
    });
    const client = new Subscriber("sk_env_test", { fetch });

    const error = await client.subscribers.list().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SubscriberError);
    expect(error).toMatchObject({
      status: 403,
      message: "This API key doesn't have the subscribers:read scope.",
    });
  });

  it("needs an API key", () => {
    vi.stubEnv("SUBSCRIBER_API_KEY", "");
    expect(() => new Subscriber()).toThrow("SUBSCRIBER_API_KEY");
    vi.stubEnv("SUBSCRIBER_API_KEY", "sk_env_from_env");
    expect(() => new Subscriber()).not.toThrow();
    vi.unstubAllEnvs();
  });
});
