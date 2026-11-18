import test from 'node:test';
import assert from 'node:assert/strict';
import { createFleetMatch } from '../fleet/match.mjs';
import { MATCH, CRUISER } from '../fleet/rules.mjs';
import { capitalPosition, createAsteroidField, asteroidHitFraction } from '../fleet/battlefield.mjs';

test('default Fleet Assault is 50 versus 50, with seven capital ships per faction', () => {
  assert.equal(MATCH.minPlayers, 100);
  assert.equal(MATCH.maxPlayers, 100);
  assert.equal(MATCH.cruisersPerSide, 7);
  const m = createFleetMatch({ config: { forfeit: false }, now: () => 1000 });
  m.addHuman({ id: 'human-1', name: 'Jedi', role: 'pilot', side: 'republic', conn: { send() {} } });
  m.debug.startBattle();
  assert.equal(m.state.cruisers.length, 14);
  assert.equal(m.state.crafts.size, 100);
  const numbers = { republic: 0, separatist: 0 };
  for (const c of m.state.crafts.values()) numbers[c.side]++;
  assert.deepEqual(numbers, { republic: 50, separatist: 50 });
  assert.equal([...m.state.players.values()].filter(p => p.role === 'commander').length, 14);
  assert.equal(m.snapshotFor('human-1').s.length, 100);
  assert.equal(m.state.asteroids.length, 92);
  assert.equal(m.state.cruisers.filter(c => c.side === 'republic').length, 7);
  assert.equal(m.state.cruisers.filter(c => c.side === 'separatist').length, 7);
});

test('capital ships surround the battlefield across full 3D compass and vertical sectors', () => {
  const m = createFleetMatch({ now: () => 1000 });
  const fleet = m.state.cruisers;
  const altitudes = fleet.map(c => c.p[1]);
  assert.ok(Math.max(...altitudes) > 1000);
  assert.ok(Math.min(...altitudes) < -1000);
  assert.ok(fleet.some(c => c.p[0] > 1000) && fleet.some(c => c.p[0] < -1000));
  assert.ok(fleet.some(c => c.p[2] > 1000) && fleet.some(c => c.p[2] < -1000));
  let closest = 1e9;
  for (let i = 0; i < fleet.length; i++)
    for (let j = i + 1; j < fleet.length; j++)
      closest = Math.min(closest, Math.hypot(...fleet[i].p.map((v, k) => v - fleet[j].p[k])));
  assert.ok(closest > 1400, 'capital ships should be well separated: ' + closest);
  for (const faction of ['republic', 'separatist']) {
    const ships = fleet.filter(c => c.side === faction);
    assert.equal(ships.length, 7);
    assert.ok(new Set(ships.map(c => Math.floor((Math.atan2(c.p[2], c.p[0]) + Math.PI) / (Math.PI / 3)))).size >= 4);
  }
});

test('rocks are deterministic, away from hangars, and actually intercept laser and missile paths', () => {
  const m = createFleetMatch({ now: () => 1000 });
  const rocks = m.state.asteroids, again = createAsteroidField(m.state.cruisers);
  assert.deepEqual(rocks, again);
  for (const rock of rocks) {
    for (const capital of m.state.cruisers) {
      const d = Math.hypot(...rock.p.map((v, i) => v - capital.p[i]));
      assert.ok(d > rock.r + 580, 'clear hangar and capital hull');
    }
    const rayStart = [rock.p[0] - rock.r - 400, rock.p[1], rock.p[2]];
    const rayEnd = [rock.p[0] + rock.r + 400, rock.p[1], rock.p[2]];
    assert.ok(asteroidHitFraction(rayStart, rayEnd, [rock]) >= 0, 'rock shields a hidden fighter');
    assert.equal(asteroidHitFraction([rock.p[0], rock.p[1] + rock.r * 4, rock.p[2] - 300],
      [rock.p[0], rock.p[1] + rock.r * 4, rock.p[2] + 300], [rock]), -1,
      'flanking above cover has a clear route');
  }
});
