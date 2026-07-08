import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Agent SDK (M2+) runs server-side in route handlers and spawns a
  // subprocess; keep it external so Next doesn't try to bundle it.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],

  // Firebase App Hosting deploys Next's `standalone` output (see build log:
  // "node .next/standalone/server.js"). The SDK resolves its native CLI binary
  // — a per-platform optional dep `@anthropic-ai/claude-agent-sdk-<os>-<arch>`
  // (a single ~243MB `claude` executable) — via a *computed* require.resolve at
  // runtime, which Next's file tracer can't follow, so it gets pruned from the
  // bundle and the agent errors "Native CLI binary for linux-x64 not found".
  // Force-copy the linux binary that Cloud Build installs into the standalone
  // output. (The Dockerfile/Path-B avoids this by shipping full node_modules.)
  outputFileTracingIncludes: {
    "/api/chat": [
      "./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/**/*",
    ],
  },
};

export default nextConfig;
