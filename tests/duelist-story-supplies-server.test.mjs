import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createDuelistServer } from '../server/duelist/server.mjs';
import { PROTOCOL, WS_PATH } from '../src/components/duelist/net/protocol.mjs';

function inbox(socket) {
  const messages = [];
  const waiters = [];
  socket.on('message', data => {
    const message = JSON.parse(String(data));
    messages.push(message);
    for (const waiter of [...waiters]) if (waiter.predicate(message)) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    }
  });
  return {
    send: message => socket.send(JSON.stringify(message)),
    next(predicate, ms = 4000) {
      const found = messages.findIndex(predicate);
      if (found >= 0) return Promise.resolve(messages.splice(found, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve };
        waiters.push(waiter);
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) { waiters.splice(index, 1); reject(new Error('Timed out waiting for server message')); }
        }, ms);
        waiter.resolve = value => { clearTimeout(timer); resolve(value); };
      });
    },
  };
}

test('online story crews claim their own supplies through the server without match gold or seat forgery', async () => {
  const server = createDuelistServer({
    host: '127.0.0.1', port: 0,
    authenticate: async (token) => typeof token === 'string' && token ? { id: token, name: token } : null,
  });
  const sockets = [];
  try {
    const address = await server.listen();
    const url = `ws://127.0.0.1:${address.port}${WS_PATH}`;
    const join = async id => {
      const ws = new WebSocket(url);
      sockets.push(ws);
      const queue = inbox(ws);
      await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
      queue.send({ t: 'hello', v: PROTOCOL, token: id, name: id });
      await queue.next(m => m.t === 'welcome');
      return queue;
    };
    const ada = await join('ada');
    ada.send({ t: 'join', mode: 'story', mission: 'contraband', create: true });
    const hosted = await ada.next(m => m.t === 'joined');
    assert.equal(hosted.mode, 'story');
    assert.match(hosted.code, /^[A-HJ-NP-Z]{5}$/);

    const ben = await join('ben');
    ben.send({ t: 'join', mode: 'story', code: hosted.code });
    const joined = await ben.next(m => m.t === 'joined');
    assert.equal(joined.match, hosted.match, 'both players share one authoritative mission');
    const mission = server.rooms.get(hosted.match).mission;
    assert.equal(mission.seats.size, 2);
    const fighterAda = mission.world.fighters.get('ada');
    const fighterBen = mission.world.fighters.get('ben');
    fighterAda.vitals.hp -= 40;
    fighterBen.vitals.hp -= 40;

    // A forged client-selected owner is ignored: the server uses the authenticated seat.
    ada.send({ t: 'storySupply', id: 'field-medkit', playerId: 'ben' });
    const used = await ada.next(m => m.t === 'storySupply');
    assert.equal(used.ok, true);
    assert.equal(mission.seats.get('ada').supplyUsed, 'field-medkit');
    assert.equal(mission.seats.get('ben').supplyUsed, null);
    assert.equal(fighterAda.vitals.hp, fighterAda.vitals.max.hp - 5);
    assert.equal(fighterBen.vitals.hp, fighterBen.vitals.max.hp - 40);

    ada.send({ t: 'storySupply', id: 'field-medkit' });
    assert.equal((await ada.next(m => m.t === 'storySupply')).reason, 'already-claimed');
    ben.send({ t: 'storySupply', id: '__invalid__' });
    assert.equal((await ben.next(m => m.t === 'storySupply')).reason, 'unknown-supply');
    ben.send({ t: 'storySupply', id: 'field-medkit' });
    assert.equal((await ben.next(m => m.t === 'storySupply')).ok, true);

    ada.send({ t: 'shop', id: 'windblossom' });
    const battle = await ada.next(m => m.t === 'shop');
    assert.equal(battle.ok, false, 'competitive purchases cannot occur inside story');
    assert.equal(battle.reason, 'no-match');
  } finally {
    for (const ws of sockets) ws.close();
    await server.close();
  }
});
