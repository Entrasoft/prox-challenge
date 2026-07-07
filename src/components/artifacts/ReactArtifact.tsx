"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactBlock } from "@/artifacts/protocol";

// Vendored React 18 UMD (React 19 ships no UMD) — fetched once, inlined into the
// sandbox iframe so it needs no network. The app itself stays on React 19.
let umd: Promise<{ react: string; reactDom: string }> | null = null;
function loadUmd() {
  if (!umd)
    umd = Promise.all([
      fetch("/vendor/react.production.min.js").then((r) => r.text()),
      fetch("/vendor/react-dom.production.min.js").then((r) => r.text()),
    ]).then(([react, reactDom]) => ({ react, reactDom }));
  return umd;
}

// A dark base stylesheet for the sandbox (Tailwind isn't available inside it).
const BASE_CSS = `
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  html,body{margin:0}
  body{background:#141a22;color:#eef2f6;font:16px/1.5 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:12px}
  button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid #2a3542;background:#1b232d;color:#eef2f6;padding:6px 12px}
  input[type=range]{accent-color:#ff6a1a;width:100%}
  a{color:#ff6a1a}
`;

/** Turn agent TSX into a runnable script: strip imports, capture the default export. */
function prepare(code: string): string {
  return code
    .replace(/^\s*import\b.*$/gm, "")
    .replace(/export\s+default\s+/, "const __ART__ = ");
}

function buildSrcDoc(compiled: string, react: string, reactDom: string, id: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>
<div id="root"></div>
<script>${react}</script>
<script>${reactDom}</script>
<script>
(function(){
  try{
    var React = window.React, ReactDOM = window.ReactDOM;
    var useState=React.useState,useEffect=React.useEffect,useRef=React.useRef,useMemo=React.useMemo,useCallback=React.useCallback,useReducer=React.useReducer,Fragment=React.Fragment;
    ${compiled}
    if (typeof __ART__ === "undefined") throw new Error("no default export found");
    ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(__ART__));
    var report=function(){parent.postMessage({__art:"height",id:${JSON.stringify(id)},h:document.documentElement.scrollHeight},"*")};
    new ResizeObserver(report).observe(document.documentElement); report();
  }catch(e){ parent.postMessage({__art:"error",id:${JSON.stringify(id)},msg:String((e&&e.message)||e)},"*"); }
})();
</script></body></html>`;
}

export function ReactArtifact({ block }: { block: ReactBlock }) {
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [height, setHeight] = useState(160);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const Babel = await import("@babel/standalone");
        const { react, reactDom } = await loadUmd();
        const compiled =
          Babel.transform(prepare(block.code), {
            presets: [["react", { runtime: "classic" }], "typescript"],
            filename: "artifact.tsx",
          }).code ?? "";
        if (live) setSrcDoc(buildSrcDoc(compiled, react, reactDom, block.id));
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [block.code, block.id]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.id !== block.id) return;
      if (d.__art === "height" && typeof d.h === "number") setHeight(Math.min(900, Math.max(80, d.h + 4)));
      else if (d.__art === "error") setError(String(d.msg));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [block.id]);

  if (error) {
    return (
      <div>
        <div className="mb-2 text-[13px] text-[var(--color-muted)]">
          This interactive couldn&apos;t run ({error}). Here&apos;s the source:
        </div>
        <pre className="max-h-80 overflow-auto rounded-lg bg-[var(--color-surface-2)] p-3 text-[12px] text-[var(--color-faint)]">
          {block.code}
        </pre>
      </div>
    );
  }

  return (
    <div>
      {srcDoc ? (
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]"
          style={{ height }}
          title={block.title ?? "interactive artifact"}
        />
      ) : (
        <div className="h-24 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
      )}
      <button
        onClick={() => setShowSource((v) => !v)}
        className="mt-2 text-[12px] text-[var(--color-faint)] hover:text-[var(--color-muted)]"
      >
        {showSource ? "hide source" : "view source"}
      </button>
      {showSource && (
        <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-[var(--color-surface-2)] p-3 text-[12px] text-[var(--color-faint)]">
          {block.code}
        </pre>
      )}
    </div>
  );
}
