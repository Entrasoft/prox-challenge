/**
 * Turn a rendered page PNG into an Anthropic image content block, downscaled to
 * Sonnet 4.6's max useful resolution (1568px long edge) to keep image-token
 * cost down without losing legibility.
 */

import { readFileSync } from "node:fs";
import sharp from "sharp";
import type Anthropic from "@anthropic-ai/sdk";

const MAX_EDGE = 1568;

export async function pageImageBlock(pngPath: string): Promise<Anthropic.ImageBlockParam> {
  const buf = await sharp(readFileSync(pngPath))
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: buf.toString("base64") },
  };
}

/** Crop a normalized [0..1] bounding box out of a page PNG and save it. */
export async function cropBBox(
  pngPath: string,
  bbox: { x: number; y: number; w: number; h: number },
  outPath: string,
  padPct = 0.015,
): Promise<void> {
  const img = sharp(readFileSync(pngPath));
  const meta = await img.metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const left = clamp(Math.round((bbox.x - padPct) * W), 0, W - 1);
  const top = clamp(Math.round((bbox.y - padPct) * H), 0, H - 1);
  const width = clamp(Math.round((bbox.w + padPct * 2) * W), 1, W - left);
  const height = clamp(Math.round((bbox.h + padPct * 2) * H), 1, H - top);
  await img.extract({ left, top, width, height }).png().toFile(outPath);
}
