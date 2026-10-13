import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ListWorkflowsResponseDtoWorkflowsItem,
  ListWorkflowsResponseDtoWorkflowsItemStepsItem,
  UpdateWorkflowDtoStepsItem,
} from "@subscriber.dev/api-client/hooks";
import {
  getListWorkflowsQueryKey,
  useListIntegrations,
  useListWorkflows,
  usePreviewEmail,
  useSendTestEmail,
  useUpdateWorkflow,
} from "@subscriber.dev/api-client/hooks";
import { authClient } from "@subscriber.dev/auth/client";

import { EmailEditor } from "~/components/editor/EmailEditor";
import { canEditVisually } from "~/components/editor/html";
import { Comment, monoStack, Ok, Prompt } from "~/components/Marketing";
import { PageHead } from "~/components/PageHead";

type Workflow = ListWorkflowsResponseDtoWorkflowsItem;
type Step = ListWorkflowsResponseDtoWorkflowsItemStepsItem;

const button =
  "border-border hover:bg-background-50 border px-3 py-2 disabled:opacity-50";

function emailSteps(workflow: Workflow) {
  return workflow.steps.filter((step) => step.type === "email");
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.join(", ");
  }
  return fallback;
}

export default function EditorPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const environmentId =
    typeof router.query.environmentId === "string"
      ? router.query.environmentId
      : "";
  const workflowId = Array.isArray(router.query.workflowId)
    ? router.query.workflowId[0]
    : undefined;
  const stepOrder =
    typeof router.query.step === "string" ? Number(router.query.step) : null;

  useEffect(() => {
    if (router.isReady && !isPending && !session) {
      void router.replace(`/auth?next=${encodeURIComponent(router.asPath)}`);
    }
  }, [router, isPending, session]);

  const workflows = useListWorkflows(
    environmentId,
    { limit: 100 },
    { query: { enabled: Boolean(environmentId && session) } },
  );
  const list = (
    workflows.data?.status === 200 ? workflows.data.data.workflows : []
  ).filter((workflow) => emailSteps(workflow).length > 0);
  const workflow = workflowId
    ? list.find((item) => item.publicId === workflowId)
    : list[0];
  const steps = workflow ? emailSteps(workflow) : [];
  const step =
    steps.find((item) => item.stepOrder === stepOrder) ?? steps[0] ?? null;

  return (
    <div
      style={{ fontFamily: monoStack }}
      className="light min-h-screen bg-background text-[13px] leading-relaxed text-foreground [color-scheme:light]"
    >
      <PageHead
        title={
          workflow
            ? `Edit ${workflow.name} · subscriber.dev`
            : "Edit email · subscriber.dev"
        }
      />
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <section className="mx-auto min-h-screen max-w-[880px] border-x border-border px-4 py-12 sm:px-8">
        {!session || workflows.isPending ? null : workflows.isError ? (
          <p>
            ✕ this environment doesn&apos;t exist, or you can&apos;t see it.
          </p>
        ) : !workflow || !step ? (
          <p>
            ✕ no emails here yet. ask your agent to create a workflow, then open
            the link it gives you.
          </p>
        ) : (
          <EmailPane
            key={`${workflow.publicId}:${step.stepOrder}`}
            environmentId={environmentId}
            workflow={workflow}
            steps={steps}
            step={step}
            userEmail={session.user.email}
          />
        )}
      </section>
    </div>
  );
}

function EmailPane({
  environmentId,
  workflow,
  steps,
  step,
  userEmail,
}: {
  environmentId: string;
  workflow: Workflow;
  steps: Step[];
  step: Step;
  userEmail: string;
}) {
  const queryClient = useQueryClient();
  const layout = step.layout ?? "default";
  const [saved, setSaved] = useState({
    subject: step.subject ?? "",
    body: step.body ?? "",
    previewText: step.previewText ?? "",
    fromName: workflow.channels.email?.fromName ?? "",
    replyTo: workflow.channels.email?.replyTo ?? "",
  });
  const [subject, setSubject] = useState(saved.subject);
  const [body, setBody] = useState(saved.body);
  const [previewText, setPreviewText] = useState(saved.previewText);
  const [fromName, setFromName] = useState(saved.fromName);
  const [replyTo, setReplyTo] = useState(saved.replyTo);
  const [visual, setVisual] = useState(() =>
    canEditVisually(saved.body, layout),
  );
  const [previewing, setPreviewing] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const update = useUpdateWorkflow();
  const preview = usePreviewEmail();
  const sendTest = useSendTestEmail();
  const integrations = useListIntegrations(environmentId);
  const sender = (
    integrations.data?.status === 200 ? integrations.data.data.integrations : []
  )
    .filter((integration) => typeof integration.fromEmail === "string")
    .sort((a, b) => a.priority - b.priority)[0] as
    { fromEmail: string; fromName?: string; replyTo?: string } | undefined;

  const dirty =
    subject !== saved.subject ||
    body !== saved.body ||
    previewText !== saved.previewText ||
    fromName !== saved.fromName ||
    replyTo !== saved.replyTo;
  const content = useMemo(
    () => ({
      subject,
      body,
      layout,
      previewText: previewText.trim() || undefined,
      fromName: fromName.trim() || undefined,
      replyTo: replyTo.trim() || undefined,
    }),
    [subject, body, layout, previewText, fromName, replyTo],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useCallback(async () => {
    if (!dirty || update.isPending) return;
    if (!subject.trim() || !body.trim()) {
      setNotice({ ok: false, text: "add a subject and a body first." });
      return;
    }
    const nextSteps = workflow.steps.map((item): UpdateWorkflowDtoStepsItem => {
      if (item.stepOrder === step.stepOrder) {
        return {
          type: "email",
          delayMs: item.delayMs,
          subject: content.subject,
          body: content.body,
          layout: content.layout,
          previewText: content.previewText,
        };
      }
      if (item.type === "email") {
        return {
          type: "email",
          delayMs: item.delayMs,
          subject: item.subject ?? "",
          body: item.body ?? "",
          layout: item.layout ?? "default",
          previewText: item.previewText,
        };
      }
      return {
        type: "webhook",
        delayMs: item.delayMs,
        url: item.url ?? "",
        body: item.body ?? "",
      } as unknown as UpdateWorkflowDtoStepsItem;
    });
    try {
      await update.mutateAsync({
        environmentId,
        workflowId: workflow.publicId,
        data: {
          steps: nextSteps,
          channels: {
            email: { fromName: content.fromName, replyTo: content.replyTo },
          },
        },
      });
      setSaved({ subject, body, previewText, fromName, replyTo });
      setNotice({ ok: true, text: "saved." });
      await queryClient.invalidateQueries({
        queryKey: getListWorkflowsQueryKey(environmentId),
      });
    } catch (error) {
      setNotice({
        ok: false,
        text: errorMessage(error, "couldn't save. try again."),
      });
    }
  }, [
    dirty,
    update,
    subject,
    body,
    previewText,
    fromName,
    replyTo,
    content,
    workflow,
    step.stepOrder,
    environmentId,
    queryClient,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  const togglePreview = () => {
    if (!previewing) preview.mutate({ environmentId, data: content });
    setPreviewing(!previewing);
  };

  const test = async () => {
    setNotice(null);
    try {
      await sendTest.mutateAsync({ environmentId, data: content });
      setNotice({ ok: true, text: `test sent to ${userEmail}.` });
    } catch (error) {
      setNotice({
        ok: false,
        text: errorMessage(error, "couldn't send the test email."),
      });
    }
  };

  const sharedHint = steps.length > 1 ? "# all emails" : undefined;

  const confirmLeave = (event: React.MouseEvent) => {
    if (dirty && !window.confirm("Discard your unsaved changes?")) {
      event.preventDefault();
    }
  };

  return (
    <>
      <h1 className="mb-6 font-semibold">
        <Prompt />
        edit {workflow.name}
      </h1>

      {steps.length > 1 && (
        <nav role="tablist" className="mb-2 flex gap-3 overflow-x-auto">
          {steps.map((item) => (
            <Link
              key={item.publicId}
              role="tab"
              aria-selected={item === step}
              href={`/editor/${environmentId}/${workflow.publicId}?step=${item.stepOrder}`}
              onClick={item === step ? undefined : confirmLeave}
              title={item.subject}
              className={`shrink-0 ${
                item === step
                  ? "font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {sendsAt(workflow, item)}
            </Link>
          ))}
        </nav>
      )}

      <div className="mb-4 border border-border">
        <Field label="from" hint={sharedHint}>
          {sender ? (
            <>
              <input
                value={fromName}
                onChange={(event) => setFromName(event.target.value)}
                placeholder={sender.fromName ?? "name"}
                aria-label="From name"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
              <span className="shrink-0 text-muted-foreground">
                &lt;{sender.fromEmail}&gt;
              </span>
            </>
          ) : (
            <Comment># connect an email integration to set this</Comment>
          )}
        </Field>
        <Field label="reply-to" hint={sharedHint}>
          <input
            value={replyTo}
            onChange={(event) => setReplyTo(event.target.value)}
            placeholder={sender?.replyTo ?? sender?.fromEmail ?? ""}
            aria-label="Reply-to address"
            type="email"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </Field>
        <Field label="subject">
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            aria-label="Subject"
            className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
          />
        </Field>
        {layout !== "none" && (
          <Field label="preview">
            <input
              value={previewText}
              onChange={(event) => setPreviewText(event.target.value)}
              placeholder="the line inboxes show after the subject"
              aria-label="Preview text"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60"
            />
          </Field>
        )}
        <div className="bg-white text-zinc-900">
          {previewing ? (
            preview.isError ? (
              <p className="p-6 text-red-600">
                {errorMessage(preview.error, "couldn't render the preview.")}
              </p>
            ) : preview.isPending ? (
              <p className="p-6 text-zinc-400">rendering…</p>
            ) : (
              <iframe
                title="Email preview"
                srcDoc={preview.data?.data.html ?? ""}
                sandbox=""
                className={`mx-auto block h-[70vh] w-full ${
                  mobile ? "max-w-[375px] border-x border-border" : ""
                }`}
              />
            )
          ) : visual ? (
            <div className="mx-auto max-w-[600px] px-6 pt-12 pb-16">
              <EmailEditor
                html={body}
                onChange={setBody}
                onReady={(normalized) => {
                  setBody(normalized);
                  setSaved((current) =>
                    current.body === body
                      ? { ...current, body: normalized }
                      : current,
                  );
                }}
                onUnsupported={() => setVisual(false)}
              />
            </div>
          ) : (
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              spellCheck={false}
              aria-label="Email HTML"
              className="block min-h-[420px] w-full resize-y bg-transparent p-4 font-mono text-[13px] outline-none"
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || update.isPending}
          className={`${button} font-semibold`}
        >
          {update.isPending ? "saving…" : "save"}
        </button>
        <button type="button" onClick={togglePreview} className={button}>
          {previewing ? "edit" : "preview"}
        </button>
        {previewing && (
          <button
            type="button"
            onClick={() => setMobile(!mobile)}
            className={button}
          >
            {mobile ? "desktop" : "mobile"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void test()}
          disabled={sendTest.isPending}
          className={button}
        >
          {sendTest.isPending ? "sending…" : "send test"}
        </button>
        <span role="status" className="ml-2">
          {notice ? (
            notice.ok ? (
              <Ok>✓ {notice.text}</Ok>
            ) : (
              <span className="text-red-600">✕ {notice.text}</span>
            )
          ) : (
            dirty && <Comment># unsaved changes</Comment>
          )}
        </span>
      </div>

      {!visual && (
        <p className="mt-4">
          <Comment>
            # this email uses its own HTML template, so it opens as code.
          </Comment>
        </p>
      )}
    </>
  );
}

function sendsAt(workflow: Workflow, step: Step) {
  const ms = workflow.steps
    .filter((item) => item.stepOrder <= step.stepOrder)
    .reduce((total, item) => total + item.delayMs, 0);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.round((ms % 86_400_000) / 3_600_000);
  if (days === 0 && hours > 0) return `${hours}h`;
  return `day ${days}`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-3 border-b border-border px-3 py-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      {children}
      {hint && (
        <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}
