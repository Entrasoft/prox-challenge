# Deploy

The app is **not** static or edge-serverless: the Claude Agent SDK spawns a subprocess (the
bundled Claude Code CLI) per request, reads `kb/` from the filesystem, and streams long
responses. So it needs a **persistent Node container** — Cloud Run — that can `spawn`, egress to
`api.anthropic.com`, write to `/tmp`, and stream without an aggressive timeout.

Two paths, both landing on Cloud Run, fronted by Cloudflare for `omnipro.relightlabs.ai`. Config
for both is committed: **`apphosting.yaml`** (Firebase App Hosting) and **`Dockerfile`** (direct
Cloud Run). The app is already made container-safe: `HOME`, `CLAUDE_CONFIG_DIR`, and
`USAGE_LOG_DIR` are pointed at the writable `/tmp` in both configs.

## 0. The one secret

```bash
printf '%s' "$ANTHROPIC_API_KEY" | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
# rotate later: ... | gcloud secrets versions add ANTHROPIC_API_KEY --data-file=-
```

## Path A — Firebase App Hosting (recommended; native to your stack)

App Hosting builds the Next.js app and runs it on Cloud Run, reading `apphosting.yaml`.

1. **Firebase console → App Hosting → Create backend**, connect this GitHub repo + branch
   (`main`). It auto-detects Next.js and picks up `apphosting.yaml`.
2. Grant the backend access to the secret (console prompts, or):
   `firebase apphosting:secrets:grantaccess ANTHROPIC_API_KEY --backend <backend-id>`.
3. Push to `main` → App Hosting builds and rolls out. Note the default domain
   (`<backend>--<project>.<region>.hosted.app`).

CLI alternative: `firebase init apphosting` then `firebase deploy`.

## Path B — Cloud Run + Dockerfile (more control)

```bash
gcloud run deploy omnipro \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --cpu 1 --memory 1Gi --concurrency 8 --min-instances 0 --max-instances 3 --timeout 300 \
  --set-secrets ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest \
  --set-env-vars HOME=/tmp,CLAUDE_CONFIG_DIR=/tmp/.claude,USAGE_LOG_DIR=/tmp
```

`--source .` uses the committed `Dockerfile`. Note the `*.run.app` URL it prints.

## Cloudflare DNS → `omnipro.relightlabs.ai`

Point a subdomain at the App Hosting / Cloud Run URL:

- **CNAME** `omnipro` → the backend's default hostname, **Proxied** (orange cloud). Cloudflare
  streams chunked NDJSON responses fine by default.
- If you see the answer arrive all-at-once instead of streaming, disable buffering for the route
  (a Configuration Rule) or set the record to **DNS-only** (grey cloud) as a fallback.
- For Path B you can alternatively add the custom domain via Cloud Run domain mappings; for Path A,
  via the Firebase console (it provisions a managed cert) — then still CNAME through Cloudflare.

## Verify after deploy (the one thing to confirm)

The subprocess spawn is the only piece that can't be tested without a container. After the first
deploy:

1. Open the URL, ask **"duty cycle for MIG at 200A on 240V"** → expect the streamed answer +
   the duty-cycle calculator. If the request hangs or 500s, check the logs for a
   subprocess/`spawn` or filesystem-write error (that's the `/tmp` env vars not taking — confirm
   `HOME`, `CLAUDE_CONFIG_DIR`, `USAGE_LOG_DIR`).
2. Ask the **TIG polarity** question → expect the diagram to render (confirms the full artifact
   path over the network).
3. Confirm streaming is token-by-token (not buffered) through Cloudflare.

## Notes

- **Cold start**: `min-instances: 0` is cost-free when idle but the first request pays container
  start + subprocess spawn (~10–20s). Bump to `1` for a snappy demo (small continuous cost).
- **Rate limiting** is per-instance in-memory (`src/lib/rateLimit.ts`); fine for a small demo. For
  strict multi-instance limits, back it with a shared store (Redis/Firestore).
- **Cost**: usage logs to `/tmp/usage.jsonl` (ephemeral per instance). For durable analytics, send
  the record in `logUsage` to BigQuery or Cloud Logging instead.
