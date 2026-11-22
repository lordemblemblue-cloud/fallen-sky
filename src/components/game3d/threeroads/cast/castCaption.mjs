// Timing and wording of the lines the cast says over their heads. Pure, so node can
// test it; the drawing is in castCaptionView.mjs.

export const CAPTION_MAX_DISTANCE = 25;
export const CAPTION_FADE_DISTANCE = 3; // fades out over the last 3 m before 25
export const CAPTION_FADE_IN = 0.2;
export const CAPTION_FADE_OUT = 0.4;
export const CAPTION_MIN_SECONDS = 1;
export const CAPTION_MAX_SECONDS = 30;
// The script's longest line is 218 characters: 7 lines of 36 over a head, or 4 of 64
// as a subtitle, so no line is ever cut.
export const CAPTION_LINE_CHARS = 36;
export const CAPTION_MAX_LINES = 7;
export const SUBTITLE_LINE_CHARS = 64;
export const SUBTITLE_MAX_LINES = 4;

/** How long a line stays up: the seconds asked for, or a reading time from its length. */
export function captionSeconds(text, seconds) {
  if (Number.isFinite(seconds) && seconds > 0)
    return Math.min(CAPTION_MAX_SECONDS, Math.max(CAPTION_MIN_SECONDS, seconds));
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.min(12, Math.max(2.5, 1.5 + words * 0.35));
}

/** Opacity over the line's life: fade in, hold, fade out, gone at `seconds`. */
export function captionOpacity(elapsed, seconds) {
  if (!(elapsed >= 0) || !(seconds > 0) || elapsed >= seconds) return 0;
  const fadeIn = Math.min(CAPTION_FADE_IN, seconds / 4);
  const fadeOut = Math.min(CAPTION_FADE_OUT, seconds / 4);
  if (elapsed < fadeIn) return elapsed / fadeIn;
  if (elapsed > seconds - fadeOut) return (seconds - elapsed) / fadeOut;
  return 1;
}

/** 1 near, fading over the last metres, 0 beyond CAPTION_MAX_DISTANCE. */
export function captionDistanceFade(distance, max = CAPTION_MAX_DISTANCE) {
  if (!Number.isFinite(distance) || distance >= max) return 0;
  const start = max - CAPTION_FADE_DISTANCE;
  if (distance <= start) return 1;
  return (max - distance) / CAPTION_FADE_DISTANCE;
}

/** Breaks a line into at most maxLines lines of about maxChars (an ellipsis if it still does not fit). */
export function wrapCaptionText(text, maxChars = CAPTION_LINE_CHARS, maxLines = CAPTION_MAX_LINES) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (next.length > maxChars && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, '') + '…';
    return kept;
  }
  return lines;
}
