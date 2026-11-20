import test from 'node:test';
import assert from 'node:assert/strict';

import { WOLFVEIL_PALACE, WOLFVEIL_PALACE_APPROACH } from '../src/components/game3d/wolfveil/WolfveilPalaceLayout.mjs';
import { palaceGroundContactY } from '../src/components/game3d/wolfveil/WolfveilPalaceGround.mjs';
import { wolfveilHeight, wolfveilNaturalHeight } from '../src/components/game3d/wolfveil/WolfveilLayout.js';

test('palace entry approach uses shallow, traversable steps instead of tall road slabs', () => {
  const approach = WOLFVEIL_PALACE_APPROACH;
  const depth = (approach.toZ - approach.fromZ) / approach.stairs;
  assert.ok(depth > 0.4 && depth <= 0.65,
    `tread length ${depth.toFixed(3)}m must stay near a natural outdoor stair`);

  // Match the real stone-geometry sampler and player collision check.
  const half = approach.width / 2;
  const tops = [];
  for (let i = 0; i < approach.stairs; i++) {
    const z0 = approach.fromZ + i * depth, z1 = z0 + depth;
    const z = (z0 + z1) / 2;
    tops.push(Math.max(
      wolfveilHeight(approach.x - half, z0), wolfveilHeight(approach.x + half, z0),
      wolfveilHeight(approach.x - half, z1), wolfveilHeight(approach.x + half, z1),
      wolfveilHeight(approach.x, z),
    ) + 0.035 + 0.004); // stone lip and walkable contact surface
  }

  for (let i = 1; i < tops.length; i++) {
    const rise = tops[i] - tops[i - 1];
    assert.ok(rise <= 0.48,
      `riser ${i} rises ${rise.toFixed(3)}m, exceeding the player step-up limit`);
  }

  // The approach remains fully connected to the original mansion: lowering
  // visual risers must never create a pit/floating stair at the real front door.
  const manorGround = palaceGroundContactY(
    wolfveilNaturalHeight(WOLFVEIL_PALACE.x, WOLFVEIL_PALACE.z));
  assert.ok(Math.abs(wolfveilHeight(approach.x, approach.toZ) - manorGround) < 0.12,
    'last exterior approach tread must meet the genuine Luna manor ground');
});
