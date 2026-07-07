/**
 * Pricing table — the SINGLE home for token rates (CLAUDE.md invariant #8).
 * Nothing else in the codebase hardcodes a rate; cost.ts derives everything here.
 *
 * Rates are USD per million tokens (MTok).
 * Source: Anthropic model pricing + prompt-caching multipliers, obtained via the
 * `claude-api` skill (pricing table cached 2026-06-24), cross-checked against
 * https://platform.claude.com/docs/en/pricing on 2026-07-07.
 *
 *   Model            input $/MTok   output $/MTok
 *   Opus 4.8              5.00          25.00
 *   Sonnet 4.6            3.00          15.00
 *   Haiku 4.5             1.00           5.00
 *
 * Cache multipliers (relative to a model's base input rate):
 *   cache write, 5-minute TTL → 1.25×   (the SDK's default write)
 *   cache write, 1-hour TTL   → 2.00×
 *   cache read                → 0.10×
 */

export type ModelId = "claude-opus-4-8" | "claude-sonnet-4-6" | "claude-haiku-4-5";

/** Runtime default + extraction workhorse (CLAUDE.md §Stack). */
export const DEFAULT_MODEL: ModelId = "claude-sonnet-4-6";
/** Cheap judge for the eval battery (M3). */
export const JUDGE_MODEL: ModelId = "claude-haiku-4-5";
/** Spot-verification during extraction only (M1). */
export const VERIFY_MODEL: ModelId = "claude-opus-4-8";

export const CACHE_WRITE_5M_MULTIPLIER = 1.25;
export const CACHE_WRITE_1H_MULTIPLIER = 2.0;
export const CACHE_READ_MULTIPLIER = 0.1;

/** Base input/output rates per MTok. Cache rates are derived from `input`. */
const BASE_RATES: Record<ModelId, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
};

export interface ModelRates {
  /** $/MTok for uncached input tokens. */
  input: number;
  /** $/MTok for output tokens. */
  output: number;
  /** $/MTok for tokens written to the cache (5-minute TTL — the SDK default). */
  cacheWrite: number;
  /** $/MTok for tokens read from the cache. */
  cacheRead: number;
}

/** Resolve the full rate card for a model, deriving cache rates from the base input rate. */
export function ratesFor(model: ModelId): ModelRates {
  const base = BASE_RATES[model];
  return {
    input: base.input,
    output: base.output,
    cacheWrite: base.input * CACHE_WRITE_5M_MULTIPLIER,
    cacheRead: base.input * CACHE_READ_MULTIPLIER,
  };
}
