"use client";

import { useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatStreamEvent, ResponseMeta } from "@/agent/telemetry";

// The challenge's own three example questions — design-system says the empty
// state shows these as tappable chips.
const EXAMPLES = [
  "What's the duty cycle for MIG welding at 200A on 240V?",
  "I'm getting porosity in my flux-cored welds. What should I check?",
  "What polarity setup do I need for TIG welding? Which socket does the ground clamp go in?",
];

type Turn = {
  role: "user" | "assistant";
  text: string;
  meta?: ResponseMeta;
};

export default function Home() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // SDK session id — echoed back so a clarify→answer pair is one conversation.
  const sessionIdRef = useRef<string | undefined>(undefined);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
    );
  }, []);

  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || busy) return;
      setBusy(true);
      setInput("");
      setTurns((t) => [...t, { role: "user", text }, { role: "assistant", text: "" }]);
      scrollToEnd();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, sessionId: sessionIdRef.current }),
        });
        if (!res.body) throw new Error("No response stream.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Read NDJSON: one JSON event per line, tolerant of chunk splits.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as ChatStreamEvent;
            if (event.t === "meta" && event.meta.sessionId) sessionIdRef.current = event.meta.sessionId;
            applyEvent(event, setTurns);
          }
          scrollToEnd();
        }
      } catch {
        setTurns((t) => {
          const last = t[t.length - 1];
          if (last?.role !== "assistant" || last.text) return t;
          return [
            ...t.slice(0, -1),
            { ...last, text: "Something went wrong reaching the agent. Give it another go." },
          ];
        });
      } finally {
        setBusy(false);
        scrollToEnd();
      }
    },
    [busy, scrollToEnd],
  );

  const empty = turns.length === 0;

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="mx-auto flex max-w-[720px] items-center gap-3">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--color-accent)" }}
          />
          <h1 className="text-[15px] font-semibold tracking-tight">OmniPro 220 Specialist</h1>
          <span className="ml-auto text-[12px] text-[var(--color-faint)]">Vulcan · multiprocess welder</span>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-4 py-6">
          {empty ? (
            <EmptyState onPick={send} disabled={busy} />
          ) : (
            <div className="flex flex-col gap-6">
              {turns.map((turn, i) => (
                <Bubble key={i} turn={turn} streaming={busy && i === turns.length - 1} />
              ))}
            </div>
          )}
        </div>
      </div>

      <form
        className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="mx-auto flex max-w-[720px] items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Ask about duty cycle, polarity, wire feed, a bad weld…"
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-[16px] outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)]"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="h-[44px] shrink-0 rounded-xl px-4 text-[15px] font-semibold text-black transition-colors disabled:opacity-40"
            style={{ background: "var(--color-accent)" }}
          >
            {busy ? "…" : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EmptyState({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="pt-8">
      <h2 className="text-[22px] font-semibold tracking-tight">What are you working on?</h2>
      <p className="mt-2 max-w-[52ch] text-[15px] text-[var(--color-muted)]">
        Standing at the machine with a question. I answer from the manual — cited to the page — and
        draw the diagram when words won&apos;t do.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            disabled={disabled}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left text-[15px] transition-colors hover:border-[var(--color-accent)] disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ turn, streaming }: { turn: Turn; streaming: boolean }) {
  if (turn.role === "user") {
    return (
      <div className="self-end rounded-2xl bg-[var(--color-surface-2)] px-4 py-2.5 text-[16px] leading-relaxed">
        {turn.text}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="answer text-[18px] leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.text}</ReactMarkdown>
        {streaming && !turn.meta && (
          <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-pulse bg-[var(--color-accent)] align-middle" />
        )}
      </div>
      {turn.meta && <CostChip meta={turn.meta} />}
    </div>
  );
}

function CostChip({ meta }: { meta: ResponseMeta }) {
  const [open, setOpen] = useState(false);
  const { usage } = meta;
  return (
    <div className="mt-1 text-[12px] text-[var(--color-faint)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="tabular font-[family-name:var(--font-mono)] transition-colors hover:text-[var(--color-muted)]"
        aria-expanded={open}
      >
        ${meta.costUsd.toFixed(3)} · {(meta.latencyMs / 1000).toFixed(1)}s
      </button>
      {open && (
        <div className="tabular mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-[family-name:var(--font-mono)]">
          <span>in {usage.tokensIn}</span>
          <span>out {usage.tokensOut}</span>
          <span>cache r {usage.cacheRead}</span>
          <span>cache w {usage.cacheWrite}</span>
          <span>{meta.turns} turn{meta.turns === 1 ? "" : "s"}</span>
          <span>{meta.model}</span>
        </div>
      )}
    </div>
  );
}

function applyEvent(event: ChatStreamEvent, setTurns: React.Dispatch<React.SetStateAction<Turn[]>>) {
  // Pure updater — return new objects, never mutate. React Strict Mode
  // double-invokes updaters in dev, so an impure one would append twice.
  setTurns((t) => {
    const last = t[t.length - 1];
    if (!last || last.role !== "assistant") return t;
    let updated: Turn;
    if (event.t === "delta") updated = { ...last, text: last.text + event.v };
    else if (event.t === "meta") updated = { ...last, meta: event.meta };
    else if (event.t === "error") updated = { ...last, text: last.text || event.message };
    else return t;
    return [...t.slice(0, -1), updated];
  });
}
