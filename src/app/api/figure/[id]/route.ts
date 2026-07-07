/**
 * /api/figure/<id> — streams a manual figure crop (PNG) from kb/figures/img/,
 * keeping kb/ the source of truth (no copy into public/).
 */

import { figureFile } from "@/kb/store";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const file = figureFile(id);
  if (!file) return new Response("figure not found", { status: 404 });
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
