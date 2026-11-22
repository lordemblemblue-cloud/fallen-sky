// Pledge voice playback. Voice files are recorded ahead of time by
// scripts/pledge-voices.mjs and shipped under /game3d/voice/pledges/, listed in
// voiceIndex.json. Nothing here runs until a pledge line is asked for: the index is
// fetched once, on the first request.
//
// Playback follows the quest dialogue's path (QuestDialogueBox): a plain
// HTMLAudioElement at its default volume, play() errors swallowed (the E key or
// click that opened the dialogue is the user gesture). The caption is always
// returned and shown, whether or not a recording exists.
//
// Usage from a dialogue component (later):
//   const handle = await playPledgeLine('akitsu-01-hayasaka-03', { caption: line.text, onCaption: setCaption });
//   ...on close: handle.stop();

export const PLEDGE_VOICE_BASE = '/game3d/voice/pledges';
export const PLEDGE_VOICE_INDEX_URL = `${PLEDGE_VOICE_BASE}/voiceIndex.json`;
export const PLEDGE_VOICE_VOLUME = 1; // QuestDialogueBox leaves its Audio at the default volume

let indexPromise = null;
let current = null;

const defaultDeps = () => ({
  fetch: globalThis.fetch?.bind(globalThis),
  createAudio: (url) => new globalThis.Audio(url),
});

/** Loads the voice index once. A missing or broken index means "no recordings". */
export function loadPledgeVoiceIndex(deps = defaultDeps()) {
  if (!indexPromise) {
    indexPromise = Promise.resolve()
      .then(() => deps.fetch(PLEDGE_VOICE_INDEX_URL, { cache: 'no-cache' }))
      .then((res) => (res && res.ok ? res.json() : null))
      .then((idx) => (idx && typeof idx === 'object' && idx.lines ? idx : { lines: {} }))
      .catch(() => ({ lines: {} }));
  }
  return indexPromise;
}

/** The recording's URL for a line id, or null when there is none. */
export async function getPledgeLineUrl(lineId, deps = defaultDeps()) {
  if (!lineId) return null;
  const idx = await loadPledgeVoiceIndex(deps);
  const entry = idx.lines?.[lineId];
  if (!entry?.file) return null;
  const base = idx.publicBase || PLEDGE_VOICE_BASE;
  return `${base}/${entry.file}`;
}

/** Stops the pledge line that is playing, if any. */
export function stopPledgeLine() {
  if (current) {
    try { current.pause(); } catch { /* already gone */ }
    current = null;
  }
}

/**
 * Shows the caption and plays the line's recording if there is one. One pledge line
 * plays at a time. Returns { caption, url, audio, stop }.
 */
export async function playPledgeLine(lineId, { caption = '', onCaption, onEnd, volume = PLEDGE_VOICE_VOLUME } = {}, deps = defaultDeps()) {
  const text = String(caption ?? '');
  if (onCaption) onCaption(text);
  stopPledgeLine();
  const url = await getPledgeLineUrl(lineId, deps);
  if (!url) {
    return { caption: text, url: null, audio: null, stop: () => {} };
  }
  const audio = deps.createAudio(url);
  audio.volume = volume;
  if (onEnd) audio.onended = () => onEnd();
  current = audio;
  const played = audio.play?.();
  if (played && typeof played.catch === 'function') played.catch(() => {});
  return {
    caption: text,
    url,
    audio,
    stop: () => { if (current === audio) stopPledgeLine(); else { try { audio.pause(); } catch { /* gone */ } } },
  };
}

/** Tests only: forget the cached index and the playing line. */
export function resetPledgeVoiceForTests() {
  indexPromise = null;
  current = null;
}
