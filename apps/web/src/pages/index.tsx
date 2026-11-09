import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { InteractiveAt } from "~/components/AsciiAt";
import {
  Comment,
  CONTACT_EMAIL,
  FitTable,
  MarketingLayout,
  MCP_ADD_COMMAND,
  Ok,
  Prompt,
  Section,
  useFitColumns,
} from "~/components/Marketing";
import { FAQS, PLANS, STRIPE_EVENTS } from "~/content";

type Interface = "mcp" | "cli" | "tui";
const INTERFACES: Interface[] = ["mcp", "cli", "tui"];

function InterfaceTabs({
  mode,
  onMode,
}: {
  mode: Interface;
  onMode: (mode: Interface) => void;
}) {
  return (
    <div className="flex gap-4 border-b border-border px-4 py-1.5 text-muted-foreground">
      {INTERFACES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onMode(option)}
          className={
            option === mode
              ? "font-semibold text-foreground"
              : "hover:text-foreground"
          }
        >
          {option}
        </button>
      ))}
    </div>
  );
}

type Script =
  | { chat: [prompt: string, tool: string, result: string] }
  | { shell: string; output?: string[] }
  | { tui: string[] };

interface Step {
  title: string;
  detail: string;
  scripts: Record<Interface, Script>;
}

const STEPS: Step[] = [
  {
    title: "sign in",
    detail:
      "From your agent or your terminal. A browser opens once to confirm, and that's the only time you'll need it.",
    scripts: {
      mcp: {
        shell: MCP_ADD_COMMAND,
        output: [
          "→ opening browser to sign in…",
          "✓ connected as you@company.com",
        ],
      },
      cli: {
        shell: "npm install -g @subscriber.dev/cli && subscriber login",
        output: [
          "→ opening browser to sign in…",
          "✓ logged in as you@company.com",
        ],
      },
      tui: {
        shell: "npm install -g @subscriber.dev/cli && subscriber",
        output: [
          "→ opening browser to sign in…",
          "✓ signed in, opening the TUI",
        ],
      },
    },
  },
  {
    title: "connect your email provider",
    detail:
      "Resend, Postmark, Amazon SES, Cloudflare or any SMTP server. You keep your sending reputation and pay them directly.",
    scripts: {
      mcp: {
        chat: ["connect Resend", "set_integration", "resend connected"],
      },
      cli: { shell: "subscriber integrations set resend --body '{…}'" },
      tui: { tui: ["Integrations", "n new", "Resend"] },
    },
  },
  {
    title: "create a workflow",
    detail:
      "Describe it to your agent, or write HTML with {{ subscriber.firstName }} personalisation. Start it from a Stripe event, and stop it the moment someone converts.",
    scripts: {
      mcp: {
        chat: [
          "send new signups 3 onboarding emails over a week",
          "create_workflow",
          "onboarding is live",
        ],
      },
      cli: { shell: "subscriber workflows create --file onboarding.json" },
      tui: { tui: ["Workflows", "n new"] },
    },
  },
  {
    title: "trigger it",
    detail:
      "Usually from your app's code with the TypeScript SDK or one API call, or let an integration like Stripe trigger it. Your agent and the CLI can too.",
    scripts: {
      mcp: {
        chat: [
          "trigger welcome for jane@acme.com",
          "trigger_workflow",
          "run started",
        ],
      },
      cli: {
        shell: "subscriber workflows trigger welcome --email jane@acme.com",
      },
      tui: { tui: ["Workflows", "welcome", "t trigger"] },
    },
  },
];

const TONES = {
  plain: undefined,
  muted: "text-muted-foreground",
  green: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
} as const;
type Tone = keyof typeof TONES;
interface TypedChar {
  char: string;
  tone: Tone;
  delay: number;
}

function typedScript(script: Script) {
  const chars: TypedChar[] = [];
  const add = (text: string, tone: Tone, perChar: number, pause = 0) =>
    [...text].forEach((char, i) =>
      chars.push({ char, tone, delay: (i === 0 ? pause : 0) + perChar }),
    );
  if ("chat" in script) {
    add("> ", "plain", 0);
    add(script.chat[0], "plain", 28);
    add(`\n● subscriber · ${script.chat[1]}`, "muted", 0, 350);
    add(`\n✓ ${script.chat[2]}`, "green", 0, 450);
  } else if ("shell" in script) {
    add("$ ", "green", 0);
    add(script.shell, "plain", script.shell.length > 60 ? 9 : 22);
    script.output?.forEach((line, i, lines) =>
      add(`\n${line}`, i === lines.length - 1 ? "green" : "muted", 0, 450),
    );
  } else {
    add("$ ", "green", 0);
    add("subscriber", "plain", 40);
    script.tui.forEach((part, i) => {
      if (i > 0) add("  ›  ", "muted", 0, 300);
      add(i === 0 ? `\n${part}` : part, "plain", 0, i === 0 ? 350 : 0);
    });
  }
  return chars;
}

const TRIAL_WORKFLOW_ID = "t5r8hm2xq9vb";

const EXIT_STEP: Step = {
  title: "stop trial onboarding when they pay",
  detail: "",
  scripts: {
    mcp: {
      chat: [
        "stop trial onboarding when they pay",
        "update_workflow",
        "trial-onboarding exits on stripe/trial_converted",
      ],
    },
    cli: {
      shell: `subscriber workflows update ${TRIAL_WORKFLOW_ID} --file exit.json`,
    },
    tui: {
      tui: [
        "Workflows",
        "Trial onboarding",
        "g triggers",
        "+ Add exit condition",
        "[x] Trial converted to paid",
      ],
    },
  },
};

function ExitConditions() {
  const [mode, setMode] = useState<Interface>("mcp");
  return (
    <StepTerminal step={EXIT_STEP} stagger={0} mode={mode} onMode={setMode} />
  );
}

const TIMELINE: [day: string, what: string, result: string, tone: Tone][] = [
  ["day 0", "● stripe/trial_started", "run started", "muted"],
  ["day 0", "→ welcome to your trial", "✓ sent", "green"],
  ["day 3", "→ get the most out of it", "✓ sent", "green"],
  [
    "day 5",
    "● stripe/trial_converted",
    "✕ exit condition · run cancelled",
    "amber",
  ],
  ["day 7", "→ your trial ends soon", "– skipped", "muted"],
];

const TIMELINE_WIDTH =
  7 + 28 + Math.max(...TIMELINE.map(([, , result]) => result.length));

function StripeTimeline() {
  const [ref, columns] = useFitColumns<HTMLPreElement>();
  const stacked = columns > 0 && columns < TIMELINE_WIDTH;
  const [shown, setShown] = useState(TIMELINE.length);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      let n = 0;
      setShown(0);
      const next = () => {
        setShown(++n);
        if (n < TIMELINE.length) timer = setTimeout(next, 900);
      };
      timer = setTimeout(next, 400);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [ref]);

  return (
    <pre
      ref={ref}
      className="overflow-x-auto border border-border bg-background-50 p-4 leading-relaxed"
    >
      <Comment>{"jane@acme.com · trial-onboarding\n\n"}</Comment>
      {TIMELINE.map(([day, what, result, tone], i) => (
        <span
          key={i}
          className={`transition-opacity duration-500 ${i < shown ? "opacity-100" : "opacity-0"}`}
        >
          <Comment>{`${day}  `}</Comment>
          {stacked ? `${what}\n       ` : what.padEnd(28)}
          <span className={TONES[tone]}>{result}</span>
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

function StepTerminal({
  step,
  stagger,
  mode,
  onMode,
}: {
  step: Step;
  stagger: number;
  mode: Interface;
  onMode: (mode: Interface) => void;
}) {
  const chars = typedScript(step.scripts[mode]);
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(Number.MAX_SAFE_INTEGER);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(chars.length);
      return;
    }
    if (!inView) return;
    setShown(0);
    let i = 0;
    const tick = () => {
      i++;
      setShown(i);
      if (i < chars.length) timer = setTimeout(tick, chars[i]?.delay ?? 0);
    };
    let timer = setTimeout(tick, stagger + (chars[0]?.delay ?? 0));
    return () => clearTimeout(timer);
    // chars is derived from mode and step, which are what should restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, step, inView, stagger]);

  const runs: { text: string; tone: Tone }[] = [];
  for (const { char, tone } of chars.slice(0, shown)) {
    const last = runs[runs.length - 1];
    if (last?.tone === tone) last.text += char;
    else runs.push({ text: char, tone });
  }

  return (
    <div ref={ref} className="border border-border bg-background-50">
      <InterfaceTabs mode={mode} onMode={onMode} />
      <pre className="min-h-[6.5em] overflow-x-auto p-4 leading-relaxed max-sm:whitespace-pre-wrap">
        {runs.map((run, i) => (
          <span key={i} className={TONES[run.tone]}>
            {run.text}
          </span>
        ))}
        {shown < chars.length && <span className="animate-pulse">▍</span>}
      </pre>
      {INTERFACES.filter((option) => option !== mode).map((option) => (
        <pre key={option} hidden className="p-4 max-sm:whitespace-pre-wrap">
          {typedScript(step.scripts[option])
            .map(({ char }) => char)
            .join("")}
        </pre>
      ))}
    </div>
  );
}

function HowItWorks() {
  const [mode, setMode] = useState<Interface>("mcp");

  return (
    <ol className="space-y-8">
      {STEPS.map((step, i) => (
        <li key={step.title} className="grid grid-cols-[3ch_1fr] gap-x-3">
          <span className="text-muted-foreground">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{step.title}</p>
            <p className="mt-1 max-w-[60ch] text-muted-foreground">
              {step.detail.split(/(\{\{[^}]+\}\})/).map((part, i) =>
                part.startsWith("{{") ? (
                  <span
                    key={i}
                    className="whitespace-nowrap text-emerald-600 dark:text-emerald-400"
                  >
                    {part}
                  </span>
                ) : (
                  part
                ),
              )}
            </p>
            <div className="mt-3">
              <StepTerminal
                step={step}
                stagger={i * 350}
                mode={mode}
                onMode={setMode}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

const RUN = {
  id: "r8k2v5n1x7qd",
  email: "henry@acme.com",
  reason: "Exited on Stripe trial_converted",
};

function RunExplained() {
  const [mode, setMode] = useState<Interface>("mcp");
  const cancelled = (
    <span className="text-amber-600 dark:text-amber-400">
      {`cancelled — ${RUN.reason}`}
    </span>
  );

  return (
    <div className="border border-border bg-background-50">
      <InterfaceTabs mode={mode} onMode={setMode} />
      <pre className="overflow-x-auto p-4 leading-relaxed max-sm:whitespace-pre-wrap">
        <span hidden={mode !== "mcp"}>
          {`> why didn't ${RUN.email} get the trial reminder?\n\n`}
          <Comment>● subscriber · list_environment_runs</Comment>
          {"\n"}
          <Comment>● subscriber · list_inbound_events</Comment>
          {"\n\n"}
          {
            'henry upgraded on day 5. stripe/trial_converted is an exit condition\non trial onboarding, so the run was cancelled before "your trial\nends soon" went out. '
          }
          <Ok>Working as intended.</Ok>
        </span>
        <span hidden={mode !== "cli"}>
          <Prompt />
          {"subscriber workflows run-history --limit 1\n"}
          <Comment>
            {`[{
  publicId: '${RUN.id}',
  status: 'cancelled',
  workflow: { key: 'trial-onboarding', … },
  subscriber: { email: '${RUN.email}', … },
  steps: [
    { stepOrder: 0, status: 'sent', … },
    { stepOrder: 1, status: 'sent', … },
    { stepOrder: 2, status: 'cancelled', errorMessage: '${RUN.reason}', … }
  ]
}]`}
          </Comment>
        </span>
        <span hidden={mode !== "tui"}>
          <Prompt />
          {"subscriber\n"}
          {"Run History"}
          <Comment>{"  ›  "}</Comment>
          {`${RUN.email}\n\n`}
          <span className="font-semibold">{`Run ${RUN.id}`}</span>
          {`\nworkflow: Trial onboarding\nsubscriber: ${RUN.email}\nstatus: cancelled\ntriggered: 6 days ago\ncompleted: 1 day ago\n`}
          <span className="font-semibold">Steps:</span>
          {"\n"}
          <Ok>{" 0. email — sent (sent 6 days ago)\n"}</Ok>
          <Ok>{" 1. email — sent (sent 3 days ago)\n"}</Ok>
          {" 2. email — "}
          {cancelled}
          {"\n\n"}
          <Comment>b back · q quit</Comment>
        </span>
      </pre>
    </div>
  );
}

const COMPETITORS = ["Customer.io", "Loops", "Mailchimp", "Brevo"];

function RotatingCompetitor() {
  const [text, setText] = useState(COMPETITORS[0] ?? "");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let index = 0;
    let shown = COMPETITORS[0]?.length ?? 0;
    let deleting = true;
    let timeout: ReturnType<typeof setTimeout>;

    const step = () => {
      const name = COMPETITORS[index] ?? "";
      let delay = deleting ? 45 : 85;
      if (deleting) {
        shown--;
        if (shown === 0) {
          deleting = false;
          index = (index + 1) % COMPETITORS.length;
          delay = 300;
        }
      } else {
        shown++;
        if (shown === (COMPETITORS[index] ?? "").length) {
          deleting = true;
          delay = 2400;
        }
      }
      setText((COMPETITORS[index] ?? name).slice(0, shown));
      timeout = setTimeout(step, delay);
    };
    timeout = setTimeout(step, 2400);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <>
      <span className="sr-only">Customer.io</span>
      <span aria-hidden className="text-foreground">
        {text}
        <span className="animate-pulse">▍</span>
      </span>
    </>
  );
}

const SUBSCRIBER_STOPS = [
  500, 1_000, 2_500, 5_000, 7_500, 10_000, 15_000, 20_000, 25_000, 35_000,
  50_000, 75_000, 100_000, 150_000,
];
const SLIDER_LABEL = "subscribers  ";
const COUNT_WIDTH = 10;

const BILLING = ["monthly", "annual"] as const;
const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function Pricing() {
  const [stop, setStop] = useState(SUBSCRIBER_STOPS.indexOf(10_000));
  const [billing, setBilling] = useState<(typeof BILLING)[number]>("monthly");
  const annual = billing === "annual";
  const subscribers = SUBSCRIBER_STOPS[stop] ?? 0;
  const planIndex = PLANS.findIndex(([limit]) => subscribers <= limit);
  const plan = PLANS[planIndex];
  const label = plan ? subscribers.toLocaleString("en-US") : "100,000+";
  const result = !plan
    ? "custom · talk to us"
    : plan[2] === 0
      ? "free · $0/mo · 10,000 sends a month"
      : annual
        ? `${plan[1]} · ${money(plan[2] * 10)}/yr (${money((plan[2] * 10) / 12)}/mo) · no send limit`
        : `${plan[1]} · ${money(plan[2])}/mo · no send limit`;
  const rows = [
    ...PLANS.map(([limit, name, price]) => [
      name,
      limit.toLocaleString("en-US"),
      money(annual ? price * 10 : price),
    ]),
    ["custom", "100,000+", "talk to us"],
  ];

  const [ref, columns] = useFitColumns<HTMLPreElement>();
  const trackWidth = Math.max(16, columns - SLIDER_LABEL.length - COUNT_WIDTH);
  const filled = Math.round(
    (stop / (SUBSCRIBER_STOPS.length - 1)) * (trackWidth - 1),
  );
  const track = `${"━".repeat(filled)}●${"─".repeat(trackWidth - 1 - filled)}`;

  return (
    <>
      <div className="border border-border bg-background-50">
        <div className="flex gap-4 border-b border-border px-4 py-1.5 text-muted-foreground">
          {BILLING.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setBilling(option)}
              aria-pressed={option === billing}
              className={
                option === billing
                  ? "font-semibold text-foreground"
                  : "hover:text-foreground"
              }
            >
              {option}
              {option === "annual" && (
                <span className="font-normal text-muted-foreground opacity-60">
                  {" "}
                  (2 months free)
                </span>
              )}
            </button>
          ))}
        </div>
        <pre ref={ref} className="overflow-x-auto p-4 leading-relaxed">
          <Comment>{SLIDER_LABEL}</Comment>
          <span className="relative inline-block">
            <span
              aria-hidden
              className="text-emerald-600 dark:text-emerald-400"
            >
              {track.slice(0, filled + 1)}
            </span>
            <span aria-hidden className="text-muted-foreground">
              {track.slice(filled + 1)}
            </span>
            <input
              type="range"
              min={0}
              max={SUBSCRIBER_STOPS.length - 1}
              value={stop}
              onChange={(e) => setStop(Number(e.target.value))}
              aria-label="Subscribers"
              aria-valuetext={`${label} subscribers`}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>
          {`${label.padStart(COUNT_WIDTH)}\n`}
          <Comment>{"plan".padEnd(SLIDER_LABEL.length)}</Comment>
          {columns > 0 && SLIDER_LABEL.length + result.length > columns && "\n"}
          <Ok>
            {plan ? (
              result
            ) : (
              <>
                {"custom · "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="underline underline-offset-4"
                >
                  talk to us
                </a>
              </>
            )}
          </Ok>
        </pre>
      </div>
      <div className="mt-4">
        <FitTable
          head={["plan", "subscribers", annual ? "per year" : "per month"]}
          rows={rows}
          highlight={planIndex === -1 ? rows.length - 1 : planIndex}
        />
      </div>
    </>
  );
}

const WHY: [title: string, detail: string][] = [
  [
    "built for agents",
    "An MCP server, API, CLI and TUI. Set up and run everything without opening a dashboard.",
  ],
  [
    "bring your own provider",
    "Send through Resend, Postmark, Amazon SES, Cloudflare or any SMTP server. You keep your sending reputation and there's no markup on every email.",
  ],
  [
    "event-driven",
    "Events from your integrations start workflows, and exit conditions stop them the moment someone converts.",
  ],
  ["open source", "AGPL-3.0 and self-hostable, so you're never locked in."],
];

const SignUp = () => (
  <Link
    href="/auth"
    className="bg-foreground px-4 py-2 font-semibold text-background hover:opacity-90"
  >
    get started free
  </Link>
);

const BROADCAST = {
  id: "k3x9vq2m7tpa",
  matched: 32_480,
  sent: 31_884,
  bounced: 486,
  hardBounced: 401,
  softBounced: 85,
  skipped: 86,
  failed: 24,
};
const n = (value: number) => value.toLocaleString("en-US");
const successRate = (
  (BROADCAST.sent / (BROADCAST.sent + BROADCAST.failed)) *
  100
).toFixed(1);

function BroadcastTerminal() {
  const [mode, setMode] = useState<Interface>("mcp");

  return (
    <div className="border border-border bg-background-50">
      <InterfaceTabs mode={mode} onMode={setMode} />
      <pre className="overflow-x-auto p-4 leading-relaxed max-sm:whitespace-pre-wrap">
        <span hidden={mode !== "mcp"}>
          {"> send the "}
          <LastMonth />
          {" changelog to everyone who's opted in,\n  spread over two days\n\n"}
          <Comment>● subscriber · preview_broadcast</Comment>
          {`\n  audience  opted-in subscribers\n  matched   ${n(BROADCAST.matched)}\n\n`}
          <Comment>● subscriber · trigger_broadcast</Comment>
          {"\n  send over 48 hours\n\n"}
          {"> how did it go?\n\n"}
          <Comment>● subscriber · get_broadcast</Comment>
          {"\n\n"}
          <Ok>{`✓ done: ${n(BROADCAST.sent)} sent`}</Ok>
          {`, ${n(BROADCAST.bounced)} bounced, ${BROADCAST.skipped} skipped, ${BROADCAST.failed} failed (${successRate}% success rate).`}
        </span>
        <span hidden={mode !== "cli"}>
          <Prompt />
          {
            "subscriber workflows broadcast p7d2nx9c4kwe \\\n  --audience opted-in.json --send-over-hours 48\n"
          }
          <Comment>
            {`{ broadcastId: '${BROADCAST.id}', status: 'queued' }\n\n`}
          </Comment>
          <Prompt />
          {"subscriber workflows broadcasts p7d2nx9c4kwe --json\n"}
          <Comment>
            {`[
  {
    "publicId": "${BROADCAST.id}",
    "status": "completed",
    "matchedCount": ${BROADCAST.matched},
    "sendOverHours": 48,
    …
  }
]`}
          </Comment>
        </span>
        <span hidden={mode !== "tui"}>
          <Prompt />
          {"subscriber\n"}
          {"Broadcasts"}
          <Comment>{"  ›  "}</Comment>
          {"changelog"}
          <Comment>{"  ›  "}</Comment>
          {"b broadcast\n"}
          <Comment>{"  audience   "}</Comment>
          {"All opted-in subscribers\n"}
          <Comment>{"  send over  "}</Comment>
          {"48 hours\n"}
          <Ok>{`Broadcast queued: ${BROADCAST.id}\n\n`}</Ok>
          {"h broadcasts"}
          <Comment>{"  ›  "}</Comment>
          {`completed — ${BROADCAST.matched} matched — triggered 2 days ago\n\n`}
          <span className="font-semibold">Broadcast</span>
          {`\nstatus: completed\nmatched: ${BROADCAST.matched}\nsend window: spread over 48h\n`}
          <span className="font-semibold">Step outcomes:</span>
          {"\n"}
          <Ok>{` sent: ${BROADCAST.sent}\n`}</Ok>
          {` failed: ${BROADCAST.failed}\n skipped: ${BROADCAST.skipped}\n`}
          <Comment>{" pending: 0\n"}</Comment>
          {` bounced: ${BROADCAST.bounced} (hard ${BROADCAST.hardBounced}, soft ${BROADCAST.softBounced})\n success rate: ${successRate}%\n\n`}
          <Comment>
            p pause · r resume · c cancel · s set up missing · b back · q quit
          </Comment>
        </span>
      </pre>
    </div>
  );
}

const lastMonthName = (now: Date) =>
  new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toLocaleString("en-US", { month: "long" })
    .toLowerCase();

function LastMonth() {
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => setMonth(lastMonthName(new Date())), []);
  return (
    <span key={month ?? "build"} suppressHydrationWarning>
      {month ?? lastMonthName(new Date())}
    </span>
  );
}

export default function Home() {
  return <Marketing />;
}

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "subscriber.dev",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, macOS, Linux, Windows",
    description:
      "Open source lifecycle email for developers and AI agents, run over MCP, a REST API, a CLI and a TUI.",
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    offers: PLANS.map(([limit, name, price]) => ({
      "@type": "Offer",
      name,
      price,
      priceCurrency: "USD",
      description: `Up to ${limit.toLocaleString("en-US")} subscribers, per month`,
    })),
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  },
];

function Marketing() {
  return (
    <MarketingLayout
      title="subscriber.dev · lifecycle email from your terminal"
      description="The open source Customer.io alternative. Run lifecycle email from your terminal, your API or your AI agent."
    >
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </Head>
      <div className="px-4 py-24 sm:px-8 sm:py-36">
        <header className="grid items-center gap-12 sm:grid-cols-2 sm:gap-16">
          <div className="order-2 text-center sm:order-1 sm:text-left">
            <h1 className="text-lg font-semibold sm:text-xl">
              Lifecycle email <br />
              from your terminal.
            </h1>
            <p className="mx-auto mt-3 max-w-[42ch] text-muted-foreground sm:mx-0">
              The open source <RotatingCompetitor /> alternative, built for
              developers and AI agents.
            </p>
            <div className="mt-8">
              <SignUp />
            </div>
          </div>
          <div className="order-1 flex justify-center sm:order-2 sm:pr-16">
            <InteractiveAt />
          </div>
        </header>
      </div>

      <div className="border-t border-border px-4 py-3 text-center text-[12px] text-muted-foreground sm:px-8">
        <span aria-hidden className="opacity-50">
          /*{" "}
        </span>
        built by the team behind{" "}
        <a
          href="https://kan.bn"
          className="text-foreground underline-offset-2 hover:underline"
        >
          Kan
        </a>
        , the open source Trello alternative (
        <a
          href="https://github.com/kanbn/kan"
          className="text-foreground underline-offset-2 hover:underline"
        >
          ★ 5.9k
        </a>
        )
        <span aria-hidden className="opacity-50">
          {" "}
          */
        </span>
      </div>

      <Section title="send your first email in minutes">
        <HowItWorks />
      </Section>

      <Section title="emails that stop when they convert">
        <p className="mb-4 max-w-[60ch] text-muted-foreground">
          Start a workflow on one event and stop it on another, so nobody gets
          &quot;your trial ends soon&quot; after they&apos;ve paid.
        </p>
        <ExitConditions />
        <div className="mt-4">
          <StripeTimeline />
        </div>
        <p className="mt-3 text-muted-foreground">
          {STRIPE_EVENTS.length} Stripe events, from trial_started to
          payment_failed. More integrations on the way.
        </p>
      </Section>

      <Section title="broadcast to anyone, pause any time">
        <p className="mb-4 max-w-[60ch] text-muted-foreground">
          One-off sends to everyone, or anyone matching a tag or attribute.
          Preview the audience first, spread sends over hours to protect your
          sending reputation, and pause or cancel while it&apos;s going out.
        </p>
        <BroadcastTerminal />
      </Section>

      <Section title="what makes it different">
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {WHY.map(([title, detail]) => (
            <div key={title}>
              <p className="font-semibold">
                <span className="text-muted-foreground">› </span>
                {title}
              </p>
              <p className="mt-1 text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="every run, explained">
        <p className="mb-4 max-w-[60ch] text-muted-foreground">
          Ask why someone did or didn&apos;t get an email. Every run keeps what
          was sent, what was skipped and why.
        </p>
        <RunExplained />
      </Section>

      <Section id="pricing" title="priced by subscribers, not sends">
        <p className="mb-4 max-w-[60ch] text-muted-foreground">
          Only subscribers who can receive email count. Free includes 10,000
          sends a month; paid plans don&apos;t limit sends.
        </p>
        <Pricing />
        <p className="mt-3 text-muted-foreground">
          self-hosting: community (free) · business ($999/yr) · enterprise (
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            talk to us
          </a>
          )
        </p>
      </Section>

      <Section title="faq">
        <div className="divide-y divide-border border-y border-border">
          {FAQS.map(([question, answer, link]) => (
            <details key={question} className="group py-3">
              <summary className="flex cursor-pointer list-none gap-3 [&::-webkit-details-marker]:hidden">
                <span className="w-3 text-muted-foreground group-open:hidden">
                  +
                </span>
                <span className="hidden w-3 text-muted-foreground group-open:inline">
                  −
                </span>
                {question}
              </summary>
              <p className="mt-2 max-w-[70ch] pl-6 text-muted-foreground">
                {answer}
                {link && (
                  <>
                    {" "}
                    <a
                      href={link[0]}
                      className="text-foreground underline underline-offset-4"
                    >
                      {link[1]}
                    </a>
                  </>
                )}
              </p>
            </details>
          ))}
        </div>
      </Section>

      <Section title="ready to send?">
        <p className="mb-6 text-muted-foreground">
          Free up to 1,000 subscribers · your provider · your agent
        </p>
        <SignUp />
      </Section>
    </MarketingLayout>
  );
}
