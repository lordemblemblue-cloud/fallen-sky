import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { DuelistRoomEngine } from '../src/components/duelist/net/actorRoomEngine.mjs';
import { DEFAULT_PUBLIC_ROOMS, PROTOCOL } from '../src/components/duelist/net/protocol.mjs';
import { CLASS_IDS, CLASSES } from '../src/components/duelist/core/classes.mjs';
import { shouldShowMatchClassPicker } from '../src/components/duelist/client/matchClassEntry.mjs';
import { hasResumableDuelistSeat } from '../src/components/duelist/net/client.mjs';

for (const room of DEFAULT_PUBLIC_ROOMS) {
  test(room.mode + ': a player chooses a class before joining an already-live room, no death required', () => {
    let now = 10, count = 0;
    const engine = new DuelistRoomEngine(room.id, { clock: () => now, idFactory: () => String(++count).padStart(24, '0') });
    function connect(id) {
      const messages = [];
      const conn = { id, identity: 'identity-' + id, send: msg => messages.push(msg), reject: () => assert.fail('connection rejected') };
      engine.connect(conn);
      engine.message(conn, { t: 'hello', v: PROTOCOL });
      return { conn, messages, send: msg => engine.message(conn, msg) };
    }
    const first = connect('first');
    first.send({ t: 'join', mode: room.mode, matchId: room.id, cls: 'duelist' });
    engine.match.phase = 'live';
    // A real late arrival selects before sending a join; existing players keep playing.
    const late = connect('late');
    assert.equal(engine.status().players, 1);
    const chosen = CLASS_IDS.find(id => id !== 'duelist');
    late.send({ t: 'join', mode: room.mode, matchId: room.id, cls: chosen });
    const joined = late.messages.find(msg => msg.t === 'joined');
    assert.equal(joined.match, room.id);
    const fighter = engine.match.world.fighters.get(joined.you);
    assert.equal(fighter.classId, chosen);
    assert.equal(fighter.weapon, CLASSES[chosen].weapon);
    assert.equal(fighter.vitals.dead, false);
    assert.equal(shouldShowMatchClassPicker({ match: engine.match, confirmed: true }), false);
    late.send({ t: 'class', id: 'healer' });
    assert.equal(late.messages.at(-1).reason, 'alive-in-match', 'no mid-life class switch');
    assert.equal(fighter.classId, chosen);
    now += 0.1;
    engine.tick();
    assert.equal(engine.match.world.fighters.get(joined.you).vitals.dead, false);
  });
}

test('resume detection is scoped to the selected room and rejects expired or blocked storage', () => {
  const saved = { mode: 'duel', room: null, match: 'm1', key: 'key', at: Date.now() };
  const storage = { getItem: () => JSON.stringify(saved) };
  assert.equal(hasResumableDuelistSeat('duel', null, 'm1', storage), true);
  assert.equal(hasResumableDuelistSeat('duel', null, 'm2', storage), false);
  assert.equal(hasResumableDuelistSeat('tdm', null, 'm1', storage), false);
  saved.at = 0;
  assert.equal(hasResumableDuelistSeat('duel', null, 'm1', storage), false);
  assert.equal(hasResumableDuelistSeat('duel', null, 'm1', { getItem() { throw Error('blocked'); } }), false);
});

test('online entry mounts the match only after selection, with confirmation carried into the HUD', () => {
  const game = readFileSync(new URL('../src/components/duelist/client/DuelistGame.jsx', import.meta.url), 'utf8');
  assert.match(game, /props\.online && props\.mode !== 'story'/);
  assert.match(game, /if \(selected\) return <DuelistMatch \{\.\.\.props\} classId=\{selected\} entryClassConfirmed/);
  assert.match(game, /setSelected\(id\)/);
  // a new match (no saved practice to resume, not the menu's demonstration) starts from the online pick
  assert.match(game, /const confirmed = !!demonstration \|\| \(resume \? resume\.confirmed : entryClassConfirmed\);/);
  assert.match(game, /initialChosenRef\.current = confirmed;/);
  assert.match(game, /setEntryClass\(\{ generation, confirmed \}\)/);
});
