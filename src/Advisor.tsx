import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowUp,
  Sparkles,
  Square,
  Check,
  RotateCcw,
} from "lucide-react";
import type {
  Connection,
  Filters,
  Workload,
  Priority,
  CostMode,
  Requirements,
  Ranking,
} from "../shared/types";
import { manualRequirements } from "../shared/engine";
type Props = {
  connection: Connection | null;
  filters: Filters;
  workload: Workload;
  priority: Priority;
  costMode: CostMode;
  requirements: Requirements | null;
  onRequirements: (r: Requirements) => void;
  onRanking: (r: Ranking) => void;
  onSetup: () => void;
  onReset: () => void;
  onBusy: (busy: boolean) => void;
  demo: boolean;
};
const examples = [
  [
    "A faster support chatbot",
    "Choose a fast model for a customer support chatbot. Assume 1,000 input tokens, 200 output tokens, and 10,000 requests per month.",
  ],
  [
    "Code that needs a little more thought",
    "I need strong coding ability and can accept slower responses. Use 4,000 input tokens, 1,000 output tokens and 100 requests per day.",
  ],
  [
    "200 reports. Under $20 a day.",
    "Summarize 200 long reports every day for less than $20. Assume 12,000 input tokens and 500 output tokens per report.",
  ],
];
export default function Advisor(p: Props) {
  const [messages, setMessages] = useState<
      { role: "user" | "assistant"; content: string }[]
    >([]),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null),
    bottom = useRef<HTMLDivElement | null>(null),
    input = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    setMessages([]);
    setError("");
    setStatus("");
    return () => abort.current?.abort();
  }, [p.connection?.mode, p.connection?.selectedTool]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, status]);
  const send = async () => {
    if (!draft.trim() || busy) return;
    const next = [
      ...messages,
      { role: "user" as const, content: draft.trim() },
    ].slice(-18);
    setMessages(next);
    setDraft("");
    setBusy(true);
    p.onBusy(true);
    setError("");
    setStatus("Connecting to advisor…");
    abort.current = new AbortController();
    let gotAnswer = false;
    try {
      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          filters: p.filters,
          workload: p.workload,
          priority: p.priority,
          costMode: p.costMode,
          requirements:
            p.requirements ?? manualRequirements(p.priority, p.workload),
        }),
        signal: abort.current.signal,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error);
      }
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "status") setStatus(event.text);
          if (event.type === "requirements")
            p.onRequirements(event.requirements);
          if (event.type === "ranking") p.onRanking(event.ranking);
          if (event.type === "answer" || event.type === "question") {
            gotAnswer = true;
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: event.text },
            ]);
          }
          if (event.type === "error") throw new Error(event.text);
        }
      }
      if (!gotAnswer)
        throw new Error(
          "The advisor connection ended before an answer arrived. Try again.",
        );
    } catch (e) {
      if ((e as Error).name === "AbortError") setStatus("Request stopped.");
      else setError((e as Error).message);
    } finally {
      setBusy(false);
      p.onBusy(false);
      setStatus("");
    }
  };
  const configured = p.connection?.advisorConfigured;
  return (
    <aside className="advisor-card">
      <div className="advisor-heading">
        <div className="advisor-mark">
          <Sparkles size={19} />
        </div>
        <div>
          <h2>Your model advisor</h2>
          <span>
            {configured
              ? "AI interpretation · grounded recommendations"
              : "A little context goes a long way"}
          </span>
        </div>
        {messages.length > 0 && (
          <button
            className="icon-button"
            disabled={busy}
            aria-label="Start new conversation"
            onClick={() => {
              setMessages([]);
              setError("");
              p.onReset();
            }}
          >
            <RotateCcw size={15} />
          </button>
        )}
      </div>
      <div className="advisor-scroll">
        {!messages.length ? (
          <>
            <div className="advisor-intro">
              <span className="small-eyebrow">LET’S FIND YOUR FIT</span>
              <h3>
                What are you
                <br />
                building next?
              </h3>
              <p>
                Tell me about your task. We’ll find the right balance of
                intelligence, speed, and cost.
              </p>
            </div>
            <div className="example-prompts">
              {examples.map(([label, prompt]) => (
                <button
                  key={label}
                  onClick={() => {
                    setDraft(prompt);
                    input.current?.focus();
                  }}
                >
                  <span>{label}</span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="messages" aria-live="polite">
            {messages.map((m, i) => (
              <div className={`message ${m.role}`} key={i}>
                <span>{m.role === "user" ? "You" : "Model advisor"}</span>
                <p>{m.content}</p>
                {m.role === "assistant" && (
                  <p className="advisor-disclaimer">
                    AI can make mistakes. Experiment with different models for
                    your business use case and validate the results before
                    deciding.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {!configured && (
          <div className="advisor-setup">
            <span>
              <span className="status-dot amber" /> AI advisor needs a
              connection
            </span>
            <p>
              Explore and rank models now. Add a chat provider to interpret
              tasks conversationally.
            </p>
            <button className="text-button" onClick={p.onSetup}>
              Set up advisor <ArrowUpRight size={13} />
            </button>
          </div>
        )}
        {p.requirements && (
          <details className="assumptions" open>
            <summary>
              <Check size={13} /> Task requirements & assumptions
            </summary>
            <p>
              {p.requirements.task} · {p.requirements.difficulty} ·{" "}
              {p.requirements.priority} priority
            </p>
            <p>
              {p.requirements.budget
                ? `Budget: $${p.requirements.budget.amount} / ${p.requirements.budget.period}`
                : "No hard budget set"}
              {p.requirements.minSpeed !== null
                ? ` · ≥ ${p.requirements.minSpeed} tok/s`
                : ""}
              {p.requirements.minIntelligence !== null
                ? ` · intelligence ≥ ${p.requirements.minIntelligence}`
                : ""}
              {p.requirements.maxResponseSeconds !== null
                ? ` · ≤ ${p.requirements.maxResponseSeconds}s estimated response`
                : ""}
            </p>
            {p.requirements.requiredCapabilities.length > 0 && (
              <p>Required: {p.requirements.requiredCapabilities.join(", ")}</p>
            )}
            {p.requirements.assumptions.map((a, i) => (
              <p key={i}>• {a}</p>
            ))}
            <p>
              Token lengths and volume are editable in Workload.{" "}
              <button className="text-button" onClick={p.onReset}>
                Clear task constraints
              </button>
            </p>
          </details>
        )}
        {status && (
          <p className="advisor-status" role="status">
            <span className="loading-dot" />
            {status}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div ref={bottom} />
      </div>
      <div className="advisor-compose">
        <label className="sr-only" htmlFor="task">
          Describe your task
        </label>
        <textarea
          ref={input}
          id="task"
          rows={3}
          value={draft}
          maxLength={6000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (configured) void send();
            }
          }}
          placeholder="I need a model that can…"
        />
        <div className="compose-actions">
          <span>
            {p.demo ? "Synthetic demo data" : "Connected model data"} ·{" "}
            {configured ? "AI advisor" : "Manual ranking"}
          </span>
          {busy ? (
            <button
              className="send-button"
              aria-label="Stop advisor"
              onClick={() => abort.current?.abort()}
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              className="send-button"
              disabled={!draft.trim() || !configured}
              aria-label="Send task to advisor"
              onClick={() => void send()}
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
