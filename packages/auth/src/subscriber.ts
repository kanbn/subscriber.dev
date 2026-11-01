import { Subscriber } from "@subscriber.dev/sdk";

const client = process.env.SUBSCRIBER_API_KEY
  ? new Subscriber(process.env.SUBSCRIBER_API_KEY)
  : undefined;

export async function startSignupWorkflow(user: {
  id: string | number;
  email: string;
  name?: string | null;
}) {
  const name = user.name?.trim() ? user.name.trim() : undefined;
  await client?.workflows.trigger({
    key: "user-signup",
    subscriber: {
      externalId: String(user.id),
      email: user.email,
      name,
      firstName: name?.split(/\s+/)[0],
    },
  });
}
