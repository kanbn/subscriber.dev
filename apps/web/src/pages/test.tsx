import { useCreateTest, useGetTest } from "@subscriber.dev/api-client/hooks";

export default function TestPage() {
  const { data, isLoading, error } = useGetTest();

  const mutation = useCreateTest({
    mutation: {
      onSuccess: () => {
        console.log("Test created successfully!");
      },
    },
  });

  return (
    <div className="container mx-auto p-8">
      <h1 className="mb-4 text-2xl font-bold">Test API Route</h1>

      <div className="space-y-4">
        <div>
          <h2 className="mb-2 text-xl font-semibold">GET /test</h2>
          {isLoading ? (
            <p>Loading...</p>
          ) : error ? (
            <p className="text-red-500">Error: {String(error)}</p>
          ) : (
            <pre className="rounded bg-gray-100 p-4">{data?.data.message}</pre>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-xl font-semibold">POST /test</h2>
          <button
            onClick={() =>
              mutation.mutate({
                data: {
                  name: "Test User",
                  message: "Hello from orval-generated hooks!",
                },
              })
            }
            disabled={mutation.isPending}
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {mutation.isPending ? "Sending..." : "Test POST Request"}
          </button>
          {mutation.data && (
            <pre className="mt-2 rounded bg-gray-100 p-4">
              {JSON.stringify(mutation.data, null, 2)}
            </pre>
          )}
          {mutation.error && (
            <p className="mt-2 text-red-500">Error: {String(mutation.error)}</p>
          )}
        </div>
      </div>
    </div>
  );
}
