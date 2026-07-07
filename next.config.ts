import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Agent SDK (M2+) runs server-side in route handlers and spawns a
  // subprocess; keep it external so Next doesn't try to bundle it.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
