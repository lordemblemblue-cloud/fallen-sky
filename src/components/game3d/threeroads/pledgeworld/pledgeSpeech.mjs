// One voice at a time. Lines the interpreter and the watchers ask for are
// spoken in the order they were asked, each for as long as it takes to read.
// Pure: how a line is shown is handed in.
//   present(line, seconds, mode)  mode 'cast' = over the speaker's head (the
//                                 cast subsystem shows it), 'caption' = at the
//                                 bottom of the screen with the speaker's name
//   present(null)                 nothing is being said any more
//   isNear(speakerId)             is this person standing in the scene, close by?

// Reading time. The script's own pauses run at about this pace (a 67-letter
// line is given 3 seconds, a 150-letter one 7).
export function lineSeconds(text) {
  const length = String(text || '').length;
  return Math.min(12, Math.max(2.8, 0.5 + 0.045 * length));
}

export function createSpeechQueue({ present = () => {}, isNear = () => false } = {}) {
  const queue = [];
  let showing = null;
  let until = 0;
  return {
    say(line) { if (line) queue.push(line); },
    update(now) {
      if (showing && now < until) return;
      if (!queue.length) {
        if (showing) { showing = null; present(null, 0, null); }
        return;
      }
      const line = queue.shift();
      const seconds = line.seconds ?? lineSeconds(line.text);
      showing = line;
      until = now + seconds;
      present(line, seconds, line.speaker && isNear(line.speaker) ? 'cast' : 'caption');
    },
    busy: () => !!showing || queue.length > 0,
    waiting: () => queue.length,
    clear() {
      queue.length = 0;
      if (showing) { showing = null; present(null, 0, null); }
    },
  };
}
