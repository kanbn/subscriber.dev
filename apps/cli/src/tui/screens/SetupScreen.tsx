import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { useEffect, useState } from "react";

import {
  bulkUpsertSubscribers,
  createWorkflow,
  createWorkspace,
  getCurrentUser,
  getSetup,
  listWorkflowRuns,
  listWorkflows,
  sendTestEmail,
  triggerWorkflow,
} from "@subscriber.dev/api-client/cli";
import { setEnvironmentId } from "@subscriber.dev/api-client/environment";
import { readCliConfig } from "@subscriber.dev/shared";

import type { EnvironmentSummary, WorkspaceSummary } from "../navigation.js";
import { Hints } from "../components/Hints.js";
import TextInput from "../components/TextInput.js";
import { IntegrationsScreen } from "./IntegrationsScreen.js";

type Step =
  | { kind: "loading" }
  | { kind: "workspace" }
  | { kind: "provider" }
  | { kind: "providerForm"; type: string }
  | { kind: "test" }
  | { kind: "product" }
  | { kind: "trigger"; workflow: WelcomeWorkflow }
  | { kind: "done"; workflow?: WelcomeWorkflow };

interface WelcomeWorkflow {
  publicId: string;
  key: string;
  editUrl?: string;
}

const PROVIDERS = [
  { label: "Resend", value: "resend" },
  { label: "Postmark", value: "postmark" },
  { label: "Amazon SES", value: "ses" },
  { label: "Cloudflare Email", value: "cloudflare" },
  { label: "Another provider, over SMTP", value: "smtp" },
];

const WELCOME_KEY = "welcome";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function welcomeEmail(product: string) {
  const name = escapeHtml(product);
  return {
    subject: `Welcome to ${product}`,
    body: [
      "<p>{% if subscriber.firstName %}Hey {{ subscriber.firstName }}{% else %}Hey there{% endif %},</p>",
      `<p>Thanks for signing up to ${name}. We're glad you're here.</p>`,
      "<p>If you have any questions, just reply to this email. It comes straight to us.</p>",
    ].join("\n"),
  };
}

export function mcpServerUrl(apiBaseUrl: string | undefined): string {
  const base = (apiBaseUrl ?? "https://api.subscriber.dev").replace(/\/$/, "");
  return base === "https://api.subscriber.dev"
    ? "https://mcp.subscriber.dev"
    : `${base}/mcp`;
}

async function nextStep(): Promise<Step> {
  const response = await getSetup();
  const { next } = response.data;
  if (next === "email_provider") return { kind: "provider" };
  if (next === "first_workflow") return { kind: "product" };
  const workflows = await listWorkflows({ limit: 1 });
  const workflow =
    workflows.status === 200 ? workflows.data.workflows[0] : undefined;
  if (!workflow) return { kind: "done" };
  return next === "first_email_sent"
    ? { kind: "trigger", workflow }
    : { kind: "done", workflow };
}

export function SetupScreen({
  workspace,
  environment,
  onDone,
}: {
  workspace?: WorkspaceSummary;
  environment?: EnvironmentSummary;
  onDone: (
    workspace: WorkspaceSummary,
    environment: EnvironmentSummary,
  ) => void;
}) {
  const [current, setCurrent] = useState<{
    workspace: WorkspaceSummary;
    environment: EnvironmentSummary;
  } | null>(workspace && environment ? { workspace, environment } : null);
  const [step, setStep] = useState<Step>(
    current ? { kind: "loading" } : { kind: "workspace" },
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const environmentId = current?.environment.publicId;
  if (environmentId) setEnvironmentId(environmentId);

  const initialEnvironmentId = environment?.publicId;
  useEffect(() => {
    if (!initialEnvironmentId) return;
    nextStep()
      .then(setStep)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [initialEnvironmentId]);

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  };

  const handleWorkspace = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    void run("Creating your workspace…", async () => {
      const response = await createWorkspace({ name: trimmed });
      const created = {
        workspace: {
          publicId: response.data.workspace.publicId,
          name: response.data.workspace.name,
        },
        environment: {
          publicId: response.data.environment.publicId,
          name: response.data.environment.name,
        },
      };
      setCurrent(created);
      setName("");
      setStep({ kind: "provider" });
    });
  };

  const handleTest = () => {
    if (!environmentId) return;
    void run("Sending a test email…", async () => {
      const response = await sendTestEmail({
        subject: "Your first email from subscriber.dev",
        body: "<p>It works. Your email provider is connected and sending.</p>",
      });
      if (response.status !== 200) {
        const message = (response.data as { message?: unknown } | undefined)
          ?.message;
        throw new Error(
          typeof message === "string" ? message : "The test email didn't send.",
        );
      }
      setResult(`Sent a test email to ${response.data.to}. Check your inbox.`);
    });
  };

  const handleProduct = (value: string) => {
    const product = value.trim();
    if (!product || !environmentId) return;
    void run("Creating your welcome email…", async () => {
      const response = await createWorkflow({
        key: WELCOME_KEY,
        name: "Welcome",
        description: "Sent when someone signs up.",
        steps: [{ type: "email", delayMs: 0, ...welcomeEmail(product) }],
      });
      if (response.status === 201) {
        setStep({ kind: "trigger", workflow: response.data });
        return;
      }
      const existing = await listWorkflows({ limit: 100 });
      const workflow =
        existing.status === 200
          ? existing.data.workflows.find((w) => w.key === WELCOME_KEY)
          : undefined;
      if (!workflow) throw new Error("Couldn't create the welcome workflow.");
      setStep({ kind: "trigger", workflow });
    });
  };

  const handleTrigger = (workflow: WelcomeWorkflow) => {
    if (!environmentId) return;
    void run("Sending your welcome email…", async () => {
      const me = await getCurrentUser();
      const email = me.data.email;
      const [firstName] = (me.data.name ?? "").trim().split(/\s+/);
      await bulkUpsertSubscribers({
        subscribers: [{ email, ...(firstName ? { firstName } : {}) }],
      });
      const triggered = await triggerWorkflow({
        key: workflow.key,
        subscriber: { email },
      });
      if (triggered.status !== 200 || !triggered.data.triggered) {
        throw new Error("Couldn't trigger the workflow.");
      }
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const runs = await listWorkflowRuns(workflow.publicId, {
          limit: 1,
        });
        const sent =
          runs.status === 200 ? runs.data.runs[0]?.steps[0] : undefined;
        if (sent?.status === "sent") {
          setResult(`Sent to ${email}. Check your inbox.`);
          setStep({ kind: "done", workflow });
          return;
        }
        if (sent && sent.status !== "pending") {
          throw new Error(
            `The email ${sent.status}${sent.errorMessage ? `: ${sent.errorMessage}` : "."}`,
          );
        }
      }
      throw new Error(
        "It's still queued. Check the workflow's runs in a minute.",
      );
    });
  };

  useInput((input, key) => {
    if (busy) return;
    if (step.kind === "test") {
      if (key.return) {
        if (result) setStep({ kind: "product" });
        else handleTest();
      } else if (input === "s") {
        setStep({ kind: "product" });
      }
    } else if (step.kind === "trigger" && key.return) {
      handleTrigger(step.workflow);
    } else if (step.kind === "done" && key.return && current) {
      onDone(current.workspace, current.environment);
    }
  });

  const header = (
    <Text bold>Get started{current ? ` · ${current.workspace.name}` : ""}</Text>
  );
  const status = (
    <>
      {busy && <Text color="gray">{busy}</Text>}
      {error && <Text color="red">{error}</Text>}
      {result && <Text color="green">{result}</Text>}
    </>
  );

  if (step.kind === "providerForm" && environmentId) {
    return (
      <IntegrationsScreen
        environmentId={environmentId}
        createType={step.type}
        onCancelCreate={() => setStep({ kind: "provider" })}
        onSelect={() => setStep({ kind: "test" })}
      />
    );
  }

  return (
    <Box flexDirection="column">
      {header}
      {step.kind === "loading" && !error && (
        <Text color="gray">Checking your setup…</Text>
      )}

      {step.kind === "workspace" && (
        <Box flexDirection="column">
          <Text>1. Name your workspace, usually your company or product.</Text>
          {!busy && (
            <Box>
              <Text>Name: </Text>
              <TextInput
                value={name}
                onChange={setName}
                onSubmit={handleWorkspace}
              />
            </Box>
          )}
        </Box>
      )}

      {step.kind === "provider" && (
        <Box flexDirection="column">
          <Text>2. Which email provider do you send with?</Text>
          <SelectInput
            items={PROVIDERS}
            onSelect={(item) =>
              setStep({ kind: "providerForm", type: item.value })
            }
          />
        </Box>
      )}

      {step.kind === "test" && (
        <Text>
          3.{" "}
          {result
            ? "Press Enter to continue."
            : "Press Enter to send yourself a test email, or s to skip."}
        </Text>
      )}

      {step.kind === "product" && (
        <Box flexDirection="column">
          <Text>
            4. Create a welcome email for new signups. What&apos;s your product
            called?
          </Text>
          {!busy && (
            <Box>
              <Text>Product: </Text>
              <TextInput
                value={name}
                onChange={setName}
                onSubmit={handleProduct}
              />
            </Box>
          )}
        </Box>
      )}

      {step.kind === "trigger" && (
        <Text>
          5. Press Enter to trigger the {step.workflow.key} workflow and send it
          to yourself.
        </Text>
      )}

      {step.kind === "done" && (
        <Box flexDirection="column">
          <Text color="green">You&apos;re set up.</Text>
          {step.workflow?.editUrl && (
            <Text>Edit the email: {step.workflow.editUrl}</Text>
          )}
          <Text>
            Trigger it from your app: subscriber keys create &quot;production&quot;,
            then POST /workflows/trigger with the key in x-api-key
          </Text>
          <Text>
            Add your AI agent: claude mcp add --transport http subscriber{" "}
            {mcpServerUrl(readCliConfig().apiBaseUrl)}
          </Text>
          <Text dimColor>Press Enter to open your environment.</Text>
        </Box>
      )}

      {status}
      <Hints text="Esc back · q quit" />
    </Box>
  );
}
