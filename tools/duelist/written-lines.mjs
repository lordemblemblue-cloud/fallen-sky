// The comms lines written out in a mission's source: h.say('Speaker', '...') calls and ['Speaker', '...']
// pairs in a table (crate lines, bell lines, what a ringleader says when seen or beaten). Used by
// tools/duelist/comms-lines.mjs and the tests, so a line nobody plays through is still listed for recording.

/**
 * source: a mission file's text. Returns [{ speaker, text, seconds }] in the order they are written (seconds:
 * the time on screen a say() call sets for its line itself, else null).
 */
export function writtenLines(source) {
  const found = [];
  const quoted = String.raw`'((?:[^'\\]|\\.)*)'`;
  const re = new RegExp(String.raw`(?:say\(|\[)\s*'([A-Z][A-Za-z ()]*)'\s*,\s*${quoted}(?:\s*,\s*([0-9.]+)\s*\))?`, 'g');
  for (let m = re.exec(source); m; m = re.exec(source)) {
    found.push({ speaker: m[1], text: m[2].replace(/\\(.)/g, '$1'), seconds: m[3] ? Number(m[3]) : null });
  }
  return found;
}
