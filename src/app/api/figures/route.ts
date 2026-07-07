/**
 * /api/figures — the figure index the client caches to resolve an image-ref's
 * figure id into a caption + page + source. Metadata only (no image bytes).
 */

import { allFigures } from "@/kb/store";

export const runtime = "nodejs";

export function GET() {
  const figures = allFigures().map((f) => ({
    id: f.id,
    caption: f.caption,
    page: f.page,
    source: f.source,
    kind: f.kind,
    tags: f.tags,
  }));
  return Response.json(
    { figures },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
