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
import { setEnvironmentId } from "@subscriber.dev/api-client/environment";
import {
  getListIntegrationsQueryKey,
  getListWorkflowsQueryKey,
  uploadImage,
  uploadVideoThumbnail,
  useListIntegrations,
  useListWorkflows,
  usePreviewEmail,
  useSendTestEmail,
  useUpdateWorkflow,
} from "@subscriber.dev/api-client/hooks";
import { authClient } from "@subscriber.dev/auth/client";

import type { MediaHandlers } from "~/components/editor/EmailEditor";
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
  setEnvironmentId(environmentId || undefined);
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
    { limit: 100 },
    {
      query: {
        enabled: Boolean(environmentId && session),
        queryKey: [environmentId, ...getListWorkflowsQueryKey({ limit: 100 })],
      },
    },
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
      className="min-h-screen bg-background text-[13px] leading-relaxed text-foreground"
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
      <section className="mx-auto min-h-screen max-w-[880px] border-x border-border">
        {!session || workflows.isPending ? (
          <EditorNav />
        ) : workflows.isError ? (
          <Message>
            ✕ this environment doesn&apos;t exist, or you can&apos;t see it.
          </Message>
        ) : !workflow || !step ? (
          <Message>
            ✕ no emails here yet. ask your agent to create a workflow, then open
            the link it gives you.
          </Message>
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

function Message({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EditorNav />
      <p className="px-4 py-12 sm:px-8">{children}</p>
    </>
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
  const [showReplyTo, setShowReplyTo] = useState(Boolean(saved.replyTo));
  const [showPreviewText, setShowPreviewText] = useState(
    Boolean(saved.previewText),
  );
  const [visual, setVisual] = useState(() =>
    canEditVisually(saved.body, layout),
  );
  const [previewing, setPreviewing] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [loadedHtml, setLoadedHtml] = useState<string | null>(null);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const router = useRouter();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (!notice?.ok) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const update = useUpdateWorkflow();
  const preview = usePreviewEmail();
  const sendTest = useSendTestEmail();
  const integrations = useListIntegrations({
    query: { queryKey: [environmentId, ...getListIntegrationsQueryKey()] },
  });
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
        queryKey: [environmentId, ...getListWorkflowsQueryKey()],
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

  const showPreview = (show: boolean) => {
    if (show && !previewing) preview.mutate({ data: content });
    setPreviewing(show);
  };

  const test = async () => {
    setNotice(null);
    try {
      await sendTest.mutateAsync({ data: content });
      setNotice({ ok: true, text: `test sent to ${userEmail}.` });
    } catch (error) {
      setNotice({
        ok: false,
        text: errorMessage(error, "couldn't send the test email."),
      });
    }
  };

  const media = useMemo<MediaHandlers>(
    () => ({
      upload: async (file) => {
        try {
          const response = await uploadImage({ file });
          if (response.status !== 201) {
            throw new Error("Couldn't upload that image");
          }
          return response.data.url;
        } catch (error) {
          throw new Error(errorMessage(error, "Couldn't upload that image"));
        }
      },
      video: async (url) => {
        try {
          const response = await uploadVideoThumbnail({ url });
          if (response.status !== 201) {
            throw new Error("Couldn't add that video");
          }
          return {
            src: response.data.src,
            href: response.data.href,
            alt: response.data.title,
          };
        } catch (error) {
          throw new Error(errorMessage(error, "Couldn't add that video"));
        }
      },
      onError: (message) => setNotice({ ok: false, text: message }),
    }),
    [],
  );

  const confirmLeave = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!dirty || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    const href = event.currentTarget.getAttribute("href") ?? "/";
    setLeave(() => () => void router.push(href));
  };

  return (
    <>
      {leave && <LeaveDialog onStay={() => setLeave(null)} onLeave={leave} />}
      <EditorNav
        onLeave={confirmLeave}
        onLogOut={() => (dirty ? setLeave(() => logOut) : logOut())}
      >
        <span role="status" className="mr-auto">
          {notice ? (
            notice.ok ? (
              <Ok>✓ {notice.text}</Ok>
            ) : (
              <span className="text-red-600">✕ {notice.text}</span>
            )
          ) : (
            dirty && <Comment># unsaved</Comment>
          )}
        </span>
        <span role="tablist" className="flex gap-3">
          <Tab selected={!previewing} onClick={() => showPreview(false)}>
            edit
          </Tab>
          <Tab selected={previewing} onClick={() => showPreview(true)}>
            preview
          </Tab>
        </span>
        {previewing && (
          <span role="tablist" className="flex gap-3">
            <span className="text-muted-foreground">|</span>
            <Tab selected={!mobile} onClick={() => setMobile(false)}>
              desktop
            </Tab>
            <Tab selected={mobile} onClick={() => setMobile(true)}>
              mobile
            </Tab>
          </span>
        )}
        <button
          type="button"
          onClick={() => void test()}
          disabled={sendTest.isPending}
          className={button}
        >
          {sendTest.isPending ? "sending…" : "send test"}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || update.isPending}
          className={`${button} font-semibold`}
        >
          {update.isPending ? "saving…" : "save"}
        </button>
      </EditorNav>

      <div className="px-4 py-12 sm:px-8">
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
          <Field label="from">
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
              <span className="flex-1">
                <Comment># connect an email integration to set this</Comment>
              </span>
            )}
            {!showReplyTo && (
              <Reveal onClick={() => setShowReplyTo(true)}>reply-to</Reveal>
            )}
          </Field>
          {showReplyTo && (
            <Field
              label="reply-to"
              onClose={() => {
                setReplyTo("");
                setShowReplyTo(false);
              }}
            >
              <input
                value={replyTo}
                onChange={(event) => setReplyTo(event.target.value)}
                placeholder={sender?.replyTo ?? sender?.fromEmail ?? ""}
                aria-label="Reply-to address"
                type="email"
                autoFocus={!saved.replyTo}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </Field>
          )}
          <Field label="subject">
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              aria-label="Subject"
              className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
            />
            {layout !== "none" && !showPreviewText && (
              <Reveal onClick={() => setShowPreviewText(true)}>preview</Reveal>
            )}
          </Field>
          {layout !== "none" && showPreviewText && (
            <Field
              label="preview"
              onClose={() => {
                setPreviewText("");
                setShowPreviewText(false);
              }}
            >
              <input
                autoFocus={!saved.previewText}
                value={previewText}
                onChange={(event) => setPreviewText(event.target.value)}
                placeholder="the line inboxes show after the subject"
                aria-label="Preview text"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60"
              />
            </Field>
          )}
          <div className="light bg-white text-zinc-900 [color-scheme:light]">
            {previewing ? (
              preview.isError ? (
                <p className="p-6 text-red-600">
                  {errorMessage(preview.error, "couldn't render the preview.")}
                </p>
              ) : (
                <iframe
                  title="Email preview"
                  srcDoc={preview.data?.data.html ?? ""}
                  sandbox=""
                  onLoad={() => setLoadedHtml(preview.data?.data.html ?? null)}
                  className={`mx-auto block h-[70vh] w-full ${
                    mobile ? "max-w-[375px] border-x border-border" : ""
                  } ${loadedHtml === preview.data?.data.html ? "" : "invisible"}`}
                />
              )
            ) : visual ? (
              <div className="mx-auto max-w-[600px] px-6 pt-12 pb-16">
                <EmailEditor
                  html={body}
                  media={media}
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

        {!visual && (
          <p className="mt-4">
            <Comment>
              # this email uses its own HTML template, so it opens as code.
            </Comment>
          </p>
        )}
      </div>
    </>
  );
}

function LeaveDialog({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onStay}
      onKeyDown={(event) => {
        if (event.key === "Escape") onStay();
      }}
    >
      <div
        className="w-full max-w-sm border border-border bg-background p-5"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="leave-title" className="mb-1 font-semibold">
          discard your changes?
        </h2>
        <p className="mb-4 text-muted-foreground">
          # you have unsaved changes to this email.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" autoFocus onClick={onStay} className={button}>
            keep editing
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="px-3 py-2 text-red-600 hover:underline"
          >
            discard
          </button>
        </div>
      </div>
    </div>
  );
}

const logOut = () => void authClient.signOut();

function EditorNav({
  onLeave,
  onLogOut = logOut,
  children,
}: {
  onLeave?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onLogOut?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <nav className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-background px-4 sm:px-8">
      <Link href="/" onClick={onLeave} className="font-semibold">
        subscriber.dev
      </Link>
      <div className="flex items-baseline gap-3">
        {children}
        <button
          type="button"
          onClick={onLogOut}
          className="text-muted-foreground hover:text-foreground"
        >
          log out
        </button>
      </div>
    </nav>
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

function Tab({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={
        selected
          ? "font-semibold"
          : "text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

function Reveal({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Field({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-3 border-b border-border px-3 py-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      {children}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={`Remove ${label}`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      )}
    </label>
  );
}
