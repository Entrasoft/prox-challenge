"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatStreamEvent, ResponseMeta } from "@/agent/telemetry";
import { parseSegments } from "@/artifacts/parser";
import { ArtifactRenderer, ArtifactSkeleton } from "@/components/artifacts/ArtifactRenderer";
import { useSpeechInput, speak, stopSpeaking } from "./voice";

// The challenge's own three example questions — the empty state shows these as tappable chips.
const EXAMPLES = [
  "What's the duty cycle for MIG welding at 200A on 240V?",
  "I'm getting porosity in my flux-cored welds. What should I check?",
  "What polarity setup do I need for TIG welding? Which socket does the ground clamp go in?",
];

type Turn = { role: "user" | "assistant"; text: string; meta?: ResponseMeta };

/** Strip artifact blocks + markdown to plain prose for text-to-speech. */
function toPlainSpeech(text: string): string {
  return parseSegments(text)
    .filter((s): s is { kind: "md"; text: string } => s.kind === "md")
    .map((s) => s.text)
    .join(" ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function Home() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [voiceOut, setVoiceOut] = useState(false);
  const [rateLimited, setRateLimited] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const voiceOutRef = useRef(false);
  voiceOutRef.current = voiceOut;

  const { supported: micSupported, listening, toggle: toggleMic } = useSpeechInput(setInput);

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
      setStatus("");
      setRateLimited(null);
      stopSpeaking();
      setTurns((t) => [...t, { role: "user", text }, { role: "assistant", text: "" }]);
      scrollToEnd();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, sessionId: sessionIdRef.current }),
        });
        if (res.status === 429) {
          const d = (await res.json().catch(() => ({ retryAfter: 60 }))) as { retryAfter?: number };
          setRateLimited(d.retryAfter ?? 60);
          setTurns((t) => t.slice(0, -2)); // drop the user + empty assistant turns
          return;
        }
        if (!res.body) throw new Error("No response stream.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as ChatStreamEvent;
            if (event.t === "status") {
              setStatus(event.v);
              continue;
            }
            if (event.t === "delta") setStatus("");
            if (event.t === "meta" && event.meta.sessionId) sessionIdRef.current = event.meta.sessionId;
            applyEvent(event, setTurns);
          }
          scrollToEnd();
        }
      } catch {
        setTurns((t) => {
          const last = t[t.length - 1];
          if (last?.role !== "assistant" || last.text) return t;
          return [...t.slice(0, -1), { ...last, text: "Something went wrong reaching the agent. Give it another go." }];
        });
      } finally {
        setBusy(false);
        setStatus("");
        if (voiceOutRef.current) {
          setTurns((t) => {
            const last = t[t.length - 1];
            if (last?.role === "assistant" && last.text) speak(toPlainSpeech(last.text));
            return t;
          });
        }
        scrollToEnd();
      }
    },
    [busy, scrollToEnd],
  );

  const ledger = useMemo(() => {
    const items: { q: string; cost: number; model: string }[] = [];
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      if (t.role === "assistant" && t.meta) {
        const q = turns[i - 1]?.role === "user" ? turns[i - 1].text : "…";
        items.push({ q, cost: t.meta.costUsd, model: t.meta.model });
      }
    }
    return { items, total: items.reduce((s, x) => s + x.cost, 0) };
  }, [turns]);

  const empty = turns.length === 0;

  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="mx-auto flex max-w-[720px] items-center gap-3">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-accent)" }} />
          <h1 className="text-[15px] font-semibold tracking-tight">OmniPro 220 Specialist</h1>
          <div className="ml-auto flex items-center gap-1.5">
            <IconButton
              label={voiceOut ? "Turn off spoken answers" : "Read answers aloud"}
              active={voiceOut}
              onClick={() => {
                stopSpeaking();
                setVoiceOut((v) => !v);
              }}
            >
              <SpeakerIcon muted={!voiceOut} />
            </IconButton>
            <button
              onClick={() => setLedgerOpen(true)}
              className="tabular flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-muted)] hover:border-[var(--color-accent)]"
              aria-label="open session cost ledger"
            >
              <ReceiptIcon />${ledger.total.toFixed(3)}
            </button>
          </div>
        </div>
      </header>

      {rateLimited != null && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-[14px]">
          <div className="mx-auto flex max-w-[720px] items-center gap-2">
            <span className="text-[var(--color-muted)]">
              This is a rate-limited demo — you&apos;ve hit the cap. Try again in about {Math.ceil(rateLimited / 60)} min.
            </span>
            <button onClick={() => setRateLimited(null)} className="ml-auto text-[var(--color-faint)] hover:text-[var(--color-muted)]" aria-label="dismiss">
              ✕
            </button>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-4 py-6">
          {empty ? (
            <EmptyState onPick={send} disabled={busy} />
          ) : (
            <div className="flex flex-col gap-6">
              {turns.map((turn, i) => (
                <Bubble key={i} turn={turn} streaming={busy && i === turns.length - 1} status={busy && i === turns.length - 1 ? status : ""} />
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
          {micSupported && (
            <IconButton
              label={listening ? "Stop listening" : "Speak your question"}
              active={listening}
              onClick={toggleMic}
              size="lg"
            >
              <MicIcon listening={listening} />
            </IconButton>
          )}
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
            aria-label="ask a question"
            placeholder={listening ? "Listening…" : "Ask about duty cycle, polarity, wire feed, a bad weld…"}
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

      {ledgerOpen && <LedgerDrawer ledger={ledger} onClose={() => setLedgerOpen(false)} />}
    </div>
  );
}

function EmptyState({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="pt-8">
      <h2 className="text-[22px] font-semibold tracking-tight">What are you working on?</h2>
      <p className="mt-2 max-w-[52ch] text-[15px] text-[var(--color-muted)]">
        Standing at the machine with a question. I answer from the manual — cited to the page — and draw the diagram when
        words won&apos;t do.
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

function Bubble({ turn, streaming, status }: { turn: Turn; streaming: boolean; status: string }) {
  if (turn.role === "user") {
    return (
      <div className="self-end rounded-2xl bg-[var(--color-surface-2)] px-4 py-2.5 text-[16px] leading-relaxed">{turn.text}</div>
    );
  }
  const segments = parseSegments(turn.text);
  return (
    <div className="flex flex-col gap-2">
      {streaming && status && !turn.text && (
        <div className="flex items-center gap-2 text-[14px] text-[var(--color-muted)]">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
          {status}
        </div>
      )}
      <div className="answer text-[18px] leading-relaxed">
        {segments.map((seg, i) =>
          seg.kind === "md" ? (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
              {seg.text}
            </ReactMarkdown>
          ) : seg.kind === "block" ? (
            <ArtifactRenderer key={seg.block.id || i} block={seg.block} />
          ) : (
            <ArtifactSkeleton key={i} />
          ),
        )}
        {streaming && !turn.meta && turn.text && (
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
          <span>
            {meta.turns} turn{meta.turns === 1 ? "" : "s"}
          </span>
          <span>{meta.model}</span>
        </div>
      )}
    </div>
  );
}

function LedgerDrawer({
  ledger,
  onClose,
}: {
  ledger: { items: { q: string; cost: number; model: string }[]; total: number };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose} role="dialog" aria-modal="true" aria-label="session cost ledger">
      <div
        className="flex h-full w-[min(360px,90vw)] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="text-[15px] font-semibold">Session cost</div>
          <button onClick={onClose} className="text-[var(--color-faint)] hover:text-[var(--color-muted)]" aria-label="close ledger">
            ✕
          </button>
        </div>
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <div className="tabular font-[family-name:var(--font-mono)] text-[28px] font-bold" style={{ color: "var(--color-accent)" }}>
            ${ledger.total.toFixed(4)}
          </div>
          <div className="text-[13px] text-[var(--color-muted)]">
            {ledger.items.length} answer{ledger.items.length === 1 ? "" : "s"} this session
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {ledger.items.length === 0 ? (
            <div className="p-4 text-[14px] text-[var(--color-faint)]">No answers yet.</div>
          ) : (
            ledger.items.map((it, i) => (
              <div key={i} className="border-b border-[var(--color-border)] px-4 py-2.5">
                <div className="truncate text-[14px] text-[var(--color-muted)]">{it.q}</div>
                <div className="tabular mt-0.5 font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-faint)]">
                  ${it.cost.toFixed(4)} · {it.model}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-[var(--color-border)] px-4 py-2 text-[11px] text-[var(--color-faint)]">
          Computed from token usage — see the cost chip under each answer.
        </div>
      </div>
    </div>
  );
}

// ── little icon buttons ───────────────────────────────────────────────────────
function IconButton({
  label,
  active,
  onClick,
  size = "sm",
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  size?: "sm" | "lg";
  children: React.ReactNode;
}) {
  const dim = size === "lg" ? "h-[44px] w-[44px]" : "h-9 w-9";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`flex ${dim} shrink-0 items-center justify-center rounded-xl border transition-colors`}
      style={{
        borderColor: active ? "var(--color-accent)" : "var(--color-border)",
        color: active ? "var(--color-accent)" : "var(--color-muted)",
      }}
    >
      {children}
    </button>
  );
}

function MicIcon({ listening }: { listening: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={listening ? "animate-pulse" : ""} aria-hidden>
      <rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      {muted ? (
        <path d="M17 9l4 6M21 9l-4 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M16 8a5 5 0 0 1 0 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}
function ReceiptIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function applyEvent(event: ChatStreamEvent, setTurns: React.Dispatch<React.SetStateAction<Turn[]>>) {
  // Pure updater — return new objects, never mutate (React Strict Mode double-invokes).
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
