// The comms lines, spoken. Every speaker has a voice of their own: one of the browser's built-in speech voices
// (no recordings needed; which ones there are depends on the system and the browser), cast once and kept, with
// their own pitch and pace. A recorded line plays instead whenever there is one: public/audio/duelist/voices/
// voices.json lists them by line id (lineId: from the speaker and the words), so lines made later with a
// text-to-speech service drop in without touching the game. Speech follows the game's sound (silent when it is
// muted, quieter with it); the subtitles stay on screen either way.
/* global window, fetch, Audio, SpeechSynthesisUtterance, performance */

// who sounds like what: gender is a preference for the voice ('any' takes whatever is left), pitch and rate
// shape it; `as` speaks with someone else's voice (a recording of them). The pitches are spread so that
// speakers who end up sharing a voice (a system with only a few) are still told apart.
export const CAST = Object.freeze({
  Ione: { gender: 'female', pitch: 1.05, rate: 1.04 },
  Arden: { gender: 'any', pitch: 0.75, rate: 0.94 },
  'Arden (recording)': { as: 'Arden', pitch: 0.72, rate: 0.92, volume: 0.75 },
  Hask: { gender: 'male', pitch: 0.88, rate: 0.95 },
  Crane: { gender: 'female', pitch: 0.9, rate: 1.0 },
  Dask: { gender: 'male', pitch: 1.0, rate: 1.06 },
  Perrin: { gender: 'female', pitch: 1.22, rate: 1.08 },
  Rooke: { gender: 'male', pitch: 0.72, rate: 1.0 },
  Defender: { gender: 'male', pitch: 1.15, rate: 1.15 },
});
const ALIKE = 0.1; // two parts sharing a voice this close in pitch sound like one person
const ANYONE = Object.freeze({ gender: 'any', pitch: 1, rate: 1.02 });

// what a voice's name says about it (voices do not say their gender; their names usually do)
const FEMALE = /\b(female|woman|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|aria|jenny|sonia|libby|natasha|clara|emma|ava|allison|serena|salli|joanna|kendra|kimberly|ivy|michelle|catherine|eva|linda|heather|amy|jane|kate|sara|nancy|elizabeth|ruth|olivia|isla|maisie|abbi|bella|hollie|niamh|emily|molly|leah|luna|nova|veena|tracy|anna|alice|ellie)\b/i;
const MALE = /\b(male|man|david|mark|george|daniel|alex|fred|guy|ryan|thomas|christopher|eric|brian|matthew|justin|joey|liam|william|james|richard|sean|andrew|brandon|davis|tony|jason|roger|steffan|ethan|oliver|noah|elliot|alfie|ollie|connor|aaron|arthur|gordon|rishi)\b/i;
export const genderOf = (voice) => (FEMALE.test(voice.name) ? 'female' : MALE.test(voice.name) ? 'male' : 'unknown');
// better voices first: the natural (neural) ones, then English as written here, then whatever works offline
const quality = (voice) => (/natural|neural|online|premium|enhanced/i.test(voice.name) ? 3 : 0) + (/^en[-_](US|GB)/i.test(voice.lang || '') ? 1 : 0)
  + (voice.localService ? 0.5 : 0);

/**
 * Give each speaker a voice from those available ([{ name, lang, localService }]): English voices first; a
 * woman's part a woman's voice and a man's a man's (one of the other kind only when the system has nothing
 * else), nobody sharing while there are voices enough, the better voices to the parts listed first; when
 * voices must be shared, not with a part of about the same pitch if another will do. The parts written as a
 * woman or a man choose before the 'any' ones, which take what is left. Returns { speaker: { voice, pitch,
 * rate, volume } } (voice: a voice's name; null when there are no voices at all).
 */
export function castVoices(voices, speakers = Object.keys(CAST)) {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang || ''));
  const pool = (english.length ? english : voices).map((v) => ({ name: v.name, gender: genderOf(v), quality: quality(v) }));
  const used = new Map(); // voice name -> the pitches it already speaks at
  const cast = {};
  const pick = (part) => {
    const pitch = part.pitch ?? 1;
    let best = null;
    for (const p of pool) {
      const fit = part.gender === 'any' || p.gender === part.gender ? 4 : p.gender === 'unknown' ? 1 : -100;
      const others = used.get(p.name) || [];
      const alike = others.some((o) => Math.abs(o - pitch) < ALIKE) ? 3 : 0;
      const score = fit + p.quality - 5 * others.length - alike;
      if (!best || score > best.score) best = { p, score };
    }
    if (best) used.set(best.p.name, [...(used.get(best.p.name) || []), pitch]);
    return best ? best.p.name : null;
  };
  const playing = (part, voice) => ({ voice, pitch: part.pitch ?? 1, rate: part.rate ?? 1, volume: part.volume ?? 1 });
  const parts = speakers.map((speaker) => [speaker, CAST[speaker] || ANYONE]);
  const own = parts.filter(([, part]) => !part.as).sort(([, a], [, b]) => (a.gender === 'any') - (b.gender === 'any'));
  for (const [speaker, part] of own) cast[speaker] = playing(part, pick(part));
  for (const [speaker, part] of parts) {
    if (part.as) cast[speaker] = playing(part, (cast[part.as] || playing(CAST[part.as] || ANYONE, pick(CAST[part.as] || ANYONE))).voice);
  }
  return Object.fromEntries(speakers.map((speaker) => [speaker, cast[speaker]]));
}

/** A line's id: the same words from the same speaker are the same line (the name of its recording). */
export function lineId(speaker, text) {
  let h = 0x811c9dc5;
  const s = `${speaker}\n${text}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const REPLAY_MS = 8000; // a line the browser held back is still worth saying this long after

/**
 * The game's voices. audio: the game's sound (client/audio.mjs: muted, volume). enabled: the player's
 * choice (Settings). say(speaker, text) speaks a line, cutting off whatever was being said. Browsers speak
 * only once the player has clicked or pressed a key on the page (arriving from the menu counts; a reload
 * does not): a line held back for that is said at the player's first click or key, if it is still fresh.
 */
export function createVoices({ audio = null, enabled = true, base = '/audio/duelist/voices/' } = {}) {
  const synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
  let cast = null;
  let recorded = {}; // line id -> file name
  let clip = null; // a recorded line playing
  let on = !!enabled;
  let heldBack = null; // { speaker, text, at }: the browser would not say it yet
  const holdBack = (speaker, text) => { heldBack = { speaker, text, at: now() }; };
  const voices = () => (synth ? synth.getVoices() : []);
  const recast = () => { const list = voices(); cast = list.length ? castVoices(list) : null; };
  recast();
  synth?.addEventListener?.('voiceschanged', recast);
  if (typeof fetch === 'function') {
    fetch(`${base}voices.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.lines) recorded = j.lines; }).catch(() => {});
  }
  const loudness = () => (audio ? (audio.muted ? 0 : audio.volume ?? 1) : 1);
  const partFor = (speaker) => {
    if (!cast) recast();
    if (cast && !cast[speaker]) cast[speaker] = castVoices(voices(), [...Object.keys(CAST), speaker])[speaker];
    return cast?.[speaker] || null;
  };
  const stop = () => {
    heldBack = null;
    if (clip) { clip.pause(); clip = null; }
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
  };
  const say = (speaker, text) => {
    stop();
    const level = loudness();
    if (!on || level <= 0 || !text) return;
    const file = recorded[lineId(speaker, text)];
    if (file && typeof Audio !== 'undefined') {
      const playing = new Audio(base + file);
      clip = playing;
      playing.volume = Math.min(1, level);
      playing.play()?.catch?.((e) => { if (e?.name === 'NotAllowedError' && clip === playing) holdBack(speaker, text); });
      return;
    }
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    const part = partFor(speaker);
    const line = new SpeechSynthesisUtterance(text);
    const voice = part?.voice ? voices().find((v) => v.name === part.voice) : null;
    if (voice) { line.voice = voice; line.lang = voice.lang; }
    line.pitch = part?.pitch ?? 1;
    line.rate = part?.rate ?? 1;
    line.volume = Math.min(1, level * (part?.volume ?? 1));
    line.onerror = (e) => { if (e?.error === 'not-allowed') holdBack(speaker, text); };
    synth.speak(line);
  };
  // the player's first click or key: say the line the browser held back, if it is still fresh
  const touched = () => {
    const line = heldBack;
    heldBack = null;
    if (line && now() - line.at < REPLAY_MS) say(line.speaker, line.text);
  };
  const page = typeof window !== 'undefined' && window.addEventListener ? window : null;
  page?.addEventListener('pointerdown', touched, true);
  page?.addEventListener('keydown', touched, true);
  return {
    get supported() { return !!synth; },
    get enabled() { return on; },
    say,
    stop,
    setEnabled(v) { on = !!v; if (!on) stop(); },
    /** who speaks with which voice (for the Settings page and tests) */
    cast: () => (cast ? { ...cast } : null),
    dispose() {
      stop();
      synth?.removeEventListener?.('voiceschanged', recast);
      page?.removeEventListener('pointerdown', touched, true);
      page?.removeEventListener('keydown', touched, true);
    },
  };
}
