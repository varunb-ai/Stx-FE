/**
 * Practice OS tone tokens.
 *
 * Separate from PracticeKit so that file exports components only — mixing
 * constants in breaks React Fast Refresh for every component beside them.
 */

export type PxTone = 'accent' | 'neural' | 'positive' | 'caution' | 'critical' | 'neutral';

const TONE_VAR: Record<PxTone, string> = {
  accent: 'var(--px-accent)',
  neural: 'var(--px-neural)',
  positive: 'var(--px-positive)',
  caution: 'var(--px-caution)',
  critical: 'var(--px-critical)',
  neutral: 'var(--px-ink-3)',
};

/** HSL triplet for a tone, ready for `hsl(...)` / `hsl(... / alpha)`. */
export const toneVar = (tone: PxTone = 'accent') => TONE_VAR[tone];

/** `color: hsl(tone)` — for icons and text that must carry the tone. */
export const toneColor = (tone: PxTone = 'accent') => ({ color: `hsl(${TONE_VAR[tone]})` });

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
