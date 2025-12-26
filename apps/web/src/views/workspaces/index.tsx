import Link from "next/link";
import { useRouter } from "next/navigation";
import { t } from "@lingui/core/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  useCreateWorkspace,
  useGetWorkspaces,
} from "@subscriber.dev/api-client/hooks";
import { authClient } from "@subscriber.dev/auth/client";

import { PageHead } from "~/components/PageHead";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";

export default function WorkspacesView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [workspaceName, setWorkspaceName] = useState("");

  const { data: workspaces } = useGetWorkspaces();

  // Create workspace mutation
  const createWorkspaceMutation = useCreateWorkspace({
    mutation: {
      onSuccess: (response) => {
        void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        setWorkspaceName("");
        router.push(
          `/workspaces/${response.data.workspace.publicId}/env/${response.data.environment.publicId}`,
        );
      },
    },
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!sessionPending && !session?.user) {
      router.push("/login");
    }
  }, [sessionPending, session?.user, router]);

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) return;

    createWorkspaceMutation.mutate({
      data: { name: workspaceName.trim() },
    });
  };

  if (!sessionPending && !session?.user) {
    return null;
  }

  if (sessionPending) {
    return (
      <>
        <PageHead title={t`Workspaces | subscriber.dev`} />
        <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4">
          <p className="text-muted-foreground">{t`Loading...`}</p>
        </main>
      </>
    );
  }

  // Show create workspace card if no workspaces
  if (workspaces?.data.length === 0) {
    return (
      <>
        <PageHead title={t`Workspaces | subscriber.dev`} />
        <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4">
          <div className="w-full max-w-sm">
            <Link href="/" className="mb-8 block text-center">
              <h1 className="text-foreground mb-6 text-lg font-bold tracking-tight">
                subscriber.dev
              </h1>
            </Link>
            <Card>
              <CardHeader className="text-center">
                <CardTitle>{t`Create your first workspace`}</CardTitle>
                <CardDescription>
                  {t`Get started by creating a workspace to manage your customer communication.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateWorkspace} className="space-y-4">
                  <div className="space-y-2">
                    <Input
                      id="workspace-name"
                      placeholder={t`Acme Inc.`}
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      disabled={createWorkspaceMutation.isPending}
                      required
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      createWorkspaceMutation.isPending || !workspaceName.trim()
                    }
                  >
                    {createWorkspaceMutation.isPending
                      ? t`Creating...`
                      : t`Create Workspace`}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  // If workspaces exist, show loading while redirecting
  return (
    <>
      <PageHead title={t`Workspaces | subscriber.dev`} />
      <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4">
        <p className="text-muted-foreground">{t`Redirecting...`}</p>
      </main>
    </>
  );
}
