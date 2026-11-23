// Duelist Adventure's announcer: says what the judge (client/announcerJudge.mjs) picks, in the voice the player chose
// (Settings, Audio, Announcer), from lines recorded with ElevenLabs (public/audio/duelist/announcer/<voice>/, listed
// in lines.json: tools/duelist/record-announcer.mjs). The lines load once the game's sound is running; a line that has
// not loaded is let go, never synthesized. It speaks over the other sounds, which dip while it does.
/* global fetch */
import { createJudge, ANNOUNCER_VOICES } from './announcerJudge.mjs';

const BASE = '/audio/duelist/announcer/';

/** voice: an ANNOUNCER_VOICES key, or anything else for none. me(): the player's fighter id. */
export function createAnnouncer({ audio, voice, me }) {
  const on = !!ANNOUNCER_VOICES[voice];
  const judge = createJudge({ me });
  let lines = null; // line -> [AudioBuffer]
  let loading = null;
  let current = null;

  function load() {
    if (loading || audio.state !== 'running' || typeof fetch !== 'function') return;
    const folder = `${BASE}${voice}/`;
    loading = fetch(folder + 'lines.json').then((r) => (r.ok ? r.json() : { lines: {} })).then(async ({ lines: list = {} }) => {
      const out = {};
      await Promise.all(Object.entries(list).map(async ([id, files]) => {
        const buffers = await Promise.all(files.map((f) => fetch(folder + f).then((r) => r.arrayBuffer()).then((b) => audio.decode(b)).catch(() => null)));
        if (buffers.some(Boolean)) out[id] = buffers.filter(Boolean);
      }));
      lines = out;
    }).catch(() => { lines = {}; });
  }

  return {
    get voice() { return on ? voice : 'off'; },
    /** A match event (defeat, fight, round, roundOver, over), with the match view of the moment. */
    event(e, view, now) { if (on) judge.event(e, view, now); },
    /** A world effect (an execution). */
    effect(e, now) { if (on) judge.effect(e, now); },
    /** Each frame: obs = { view, fighters: [{ id, team, hp, max, dead, x, z }] }. Says a line when there is one. */
    frame(now, obs) {
      if (!on) return;
      load();
      judge.frame(now, obs);
      const pick = judge.next(now);
      if (!pick) return;
      const takes = lines?.[pick.line];
      if (!takes?.length || audio.state !== 'running') { judge.said(pick.line, now, 0); return; }
      if (pick.cut) current?.stop();
      const buffer = takes[(Math.random() * takes.length) | 0];
      current = audio.voiceOver(buffer, { duck: 0.55 });
      judge.said(pick.line, now, buffer.duration);
    },
    reset() { judge.reset(); current?.stop(); current = null; },
    dispose() { current?.stop(); current = null; },
  };
}
