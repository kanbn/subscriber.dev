import { PageHead } from "~/components/PageHead";

export default function Home() {
  return (
    <>
      <PageHead title="subscriber.dev" />
      <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4">
        <h1 className="text-foreground text-lg font-bold tracking-tight">
          subscriber.dev
        </h1>
      </main>
    </>
  );
}
