import { authClient } from "@subscriber.dev/auth/client";

export default function Home() {
  const handleCreateApiKey = async () => {
    const { data, error } = await authClient.apiKey.create({
      name: "Subscriber.dev API Key",
      prefix: "sub_",
    });

    console.log(data, error);
  };

  return (
    <div>
      <button onClick={handleCreateApiKey}>Create API Key</button>
    </div>
  );
}
