// The three army kits of band 2 and the plans of the three camps
// (docs/game3d/three-empires/CAMPS_BAND2.md). The plans are checked against the
// game's own ground: nothing in the river that should stand, nothing on a cliff,
// the road left open, and no tent on a spot the story sends the player to.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AKITSU_KIT_PIECES, TAMERI_KIT_PIECES, REMORIA_KIT_PIECES, EMPIRE_KITS, EMPIRE_KIT_LIMITS, empireKitPiece,
} from '../src/components/game3d/threeroads/kits/empireKitPieces.mjs';
import { valleyKitPiece } from '../src/components/game3d/threeroads/kits/valleyKitPieces.mjs';
import { CAMP_PLANS, campPlan, campPlanBatches } from '../src/components/game3d/threeroads/land/campPlans.mjs';
import { pledgePlace } from '../src/components/game3d/pledges/pledgePlaces.mjs';
import { THREE_ROADS_CAST } from '../src/components/game3d/threeroads/script/cast.mjs';
import { BAND2_POINTS } from '../src/components/game3d/threeroads/script/band2.mjs';
import {
  wolfveilHeight, wolfveilDistanceToRiver, wolfveilAnyTrailClearance, WOLFVEIL_RIVER,
} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import { wolfveilAreaAtLocal } from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
// The game's ground is wolfveilHeight plus the terraces the cave entrances install into it at
// run time. Without this import a check would pass on ground that is a cliff in the game.
import '../src/components/game3d/wolfveil/WolfveilCaveAccessPlan.mjs';

const pieceOf = entry => (entry.kit === 'valley' ? valleyKitPiece(entry.piece) : empireKitPiece(entry.kit, entry.piece));
const slopeAt = (x, z, reach = 2) => Math.atan(Math.hypot(
  (wolfveilHeight(x + reach, z) - wolfveilHeight(x - reach, z)) / (2 * reach),
  (wolfveilHeight(x, z + reach) - wolfveilHeight(x, z - reach)) / (2 * reach))) * 180 / Math.PI;

// How far a point is from an item's solid: below zero means inside it.
function clearOfSolid(entry, x, z) {
  const solid = pieceOf(entry)?.solid;
  if (!solid) return Infinity;
  const dx = x - entry.x, dz = z - entry.z;
  if (solid.circle) return Math.hypot(dx, dz) - solid.circle;
  const sin = Math.sin(entry.yaw), cos = Math.cos(entry.yaw);
  const localX = dx * cos - dz * sin, localZ = dx * sin + dz * cos;
  const outX = Math.abs(localX) - solid.box[0], outZ = Math.abs(localZ) - solid.box[1];
  return outX > 0 || outZ > 0 ? Math.hypot(Math.max(outX, 0), Math.max(outZ, 0)) : Math.max(outX, outZ);
}
const reachOfSolid = entry => {
  const solid = pieceOf(entry)?.solid;
  return !solid ? 0 : solid.circle || Math.hypot(solid.box[0], solid.box[1]);
};

test('the three kits: unique pieces, sane sizes, inside the limits', () => {
  assert.deepEqual(Object.keys(EMPIRE_KITS), ['akitsu', 'tameri', 'remoria']);
  for (const [kit, pieces] of [['akitsu', AKITSU_KIT_PIECES], ['tameri', TAMERI_KIT_PIECES], ['remoria', REMORIA_KIT_PIECES]]) {
    assert.equal(EMPIRE_KITS[kit].pieces, pieces);
    assert.equal(EMPIRE_KITS[kit].url, `/game3d/threeroads/kits/${kit}.glb`);
    assert.ok(pieces.length >= 12 && pieces.length <= EMPIRE_KIT_LIMITS.maxPieces, kit + ': ' + pieces.length + ' pieces');
    assert.equal(new Set(pieces.map(entry => entry.id)).size, pieces.length, kit + ': piece ids repeat');
    for (const entry of pieces) {
      assert.match(entry.id, /^[a-z][a-z0-9_]*$/, entry.id);
      assert.equal(entry.size.length, 3);
      assert.ok(entry.size.every(value => value > 0 && value <= 16), entry.id + ' size');
      assert.ok(entry.skirt >= 0 && entry.skirt <= 7, entry.id + ' skirt');
      assert.ok(entry.material === 'lit' || entry.material === 'glow', entry.id);
      if (entry.solid) assert.ok(entry.solid.circle > 0 || entry.solid.box.every(value => value > 0), entry.id + ' solid');
      if (entry.material === 'glow') assert.notEqual(entry.pivot, 'base', entry.id + ': a glowing piece hangs from or sits on another');
      assert.equal(empireKitPiece(kit, entry.id), entry);
    }
    assert.ok(pieces.some(entry => entry.material === 'glow'), kit + ' has a light of its own');
    assert.ok(pieces.some(entry => entry.size[2] >= 9), kit + ' has one tall piece to be seen from the road');
  }
  assert.equal(empireKitPiece('akitsu', 'gate_tower'), null);
  assert.equal(empireKitPiece('nobody', 'tent_bell'), null);
});

test('each camp: its place, its kit, its area, and every piece a known one', () => {
  assert.deepEqual(CAMP_PLANS.map(plan => plan.id), ['western_road_camp', 'the_landing', 'castra_lupa']);
  for (const plan of CAMP_PLANS) {
    assert.equal(campPlan(plan.id), plan);
    const place = pledgePlace(plan.place);
    assert.ok(place, plan.id + ': place ' + plan.place);
    assert.equal(place.area, plan.area);
    assert.equal(EMPIRE_KITS[plan.kit].area, plan.area);
    assert.ok(Math.hypot(place.x - plan.centre.x, place.z - plan.centre.z) <= 10, plan.id + ': the plan and the places table agree on the centre');
    for (const entry of plan.items) {
      assert.ok(pieceOf(entry), `${plan.id}: unknown piece ${entry.kit}:${entry.piece}`);
      assert.equal(wolfveilAreaAtLocal(entry.x, entry.z), plan.area, `${plan.id}: ${entry.piece} at (${entry.x}, ${entry.z})`);
      if (!entry.outlying) {
        const away = Math.hypot(entry.x - plan.centre.x, entry.z - plan.centre.z);
        assert.ok(away <= place.radius + 22, `${plan.id}: ${entry.piece} is ${away.toFixed(0)} m from the centre`);
      }
    }
    assert.ok(plan.items.some(entry => entry.piece === plan.tallMark), plan.id + ' has its tall mark');
  }
});

test('each camp stays inside what one place may draw', () => {
  for (const plan of CAMP_PLANS) {
    const batches = campPlanBatches(plan);
    // Kinds of piece, not draw calls: the places subsystem draws the town's 18 kinds in 9 calls.
    assert.ok(batches.size <= 18, `${plan.id}: ${batches.size} kinds of piece`);
    for (const [key, count] of batches) assert.ok(count <= 45, `${plan.id}: ${count} of ${key}`);
    assert.ok(plan.items.length <= 110, `${plan.id}: ${plan.items.length} pieces`);
  }
});

test('every piece stands on ground it can stand on; what floats is on the river', () => {
  const problems = [];
  for (const plan of CAMP_PLANS) {
    for (const entry of plan.items) {
      const label = `${plan.id}: ${entry.piece} at (${entry.x}, ${entry.z})`;
      const toRiver = wolfveilDistanceToRiver(entry.x, entry.z);
      if (entry.afloat) {
        if (toRiver > WOLFVEIL_RIVER.width / 2 + 4) problems.push(label + ' floats ' + toRiver.toFixed(0) + ' m from the river');
        continue;
      }
      if (toRiver < WOLFVEIL_RIVER.width / 2 + 2) problems.push(label + ' stands in the river');
      // A piece may stand on a slope as steep as its skirt can hide over its own depth.
      const piece = pieceOf(entry);
      const span = Math.max(piece.size[0], piece.size[1]) / 2;
      const drop = Math.tan(slopeAt(entry.x, entry.z) * Math.PI / 180) * span;
      const hides = (piece.skirt ?? 0) + 0.25;
      if (entry.y === undefined && piece.pivot === 'base' && drop > hides) {
        problems.push(label + ': the ground falls ' + drop.toFixed(1) + ' m across it, its skirt hides ' + hides.toFixed(1));
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('the road through a camp stays open, and no piece blocks a spot the story uses', () => {
  const problems = [];
  for (const plan of CAMP_PLANS) {
    const solids = plan.items.filter(entry => pieceOf(entry).solid);
    if (plan.road) {
      for (const entry of solids) {
        const clear = wolfveilAnyTrailClearance(entry.x, entry.z) - reachOfSolid(entry);
        if (clear < 0.3 && clearOfTrailByShape(entry) < 0.3) problems.push(`${plan.id}: ${entry.piece} at (${entry.x}, ${entry.z}) closes the trail`);
      }
    }
    for (const [name, point] of Object.entries(BAND2_POINTS)) {
      for (const entry of solids) {
        if (entry.marks === name) continue;
        if (clearOfSolid(entry, point.x, point.z) < 0.7) problems.push(`${plan.id}: ${entry.piece} at (${entry.x}, ${entry.z}) stands on ${name}`);
      }
    }
    for (const spot of plan.sentries) {
      assert.ok(slopeAt(spot.x, spot.z) <= 22, `${plan.id}: a sentry on a slope at (${spot.x}, ${spot.z})`);
      for (const entry of solids) {
        if (clearOfSolid(entry, spot.x, spot.z) < 0.5) problems.push(`${plan.id}: a sentry stands inside ${entry.piece}`);
      }
    }
    for (const person of THREE_ROADS_CAST) {
      for (const spot of [person.home, person.homeAfter?.home, ...(person.alsoAt || [])].filter(Boolean)) {
        if (spot.area !== plan.area) continue;
        for (const entry of solids) {
          if (clearOfSolid(entry, spot.x, spot.z) < 0.5) problems.push(`${plan.id}: ${person.id} stands inside ${entry.piece} at (${entry.x}, ${entry.z})`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});

// The trail's own clearance is measured to a solid's centre. A long thin piece
// set end-on to the road (a bale wall beside a gate) comes closer than its
// bounding circle says, so walk its outline instead.
function clearOfTrailByShape(entry) {
  const solid = pieceOf(entry).solid;
  if (solid.circle) return wolfveilAnyTrailClearance(entry.x, entry.z) - solid.circle;
  const sin = Math.sin(entry.yaw), cos = Math.cos(entry.yaw);
  let least = Infinity;
  for (let i = -4; i <= 4; i++) {
    for (let j = -2; j <= 2; j++) {
      const localX = solid.box[0] * i / 4, localZ = solid.box[1] * j / 2;
      least = Math.min(least, wolfveilAnyTrailClearance(entry.x + localX * cos + localZ * sin, entry.z - localX * sin + localZ * cos));
    }
  }
  return least;
}

test('the camps answer what the second walkthrough taught', () => {
  const fort = campPlan('castra_lupa');
  // The fort is across the road: its two gates are on the trail, a through-road with a second way out.
  for (const span of fort.items.filter(entry => entry.piece === 'gate_span')) {
    assert.ok(wolfveilAnyTrailClearance(span.x, span.z) < 1, 'a gate stands on the ridge path');
  }
  assert.equal(fort.items.filter(entry => entry.piece === 'gate_span').length, 2);
  // Small counts: a handful of tents round an open middle.
  for (const plan of CAMP_PLANS) {
    const tents = plan.items.filter(entry => /^(tent_|pavilion_)/.test(entry.piece)).length;
    assert.ok(tents >= 1 && tents <= 9, `${plan.id}: ${tents} tents`);
    assert.ok(plan.sentries.length >= 2, plan.id + ': someone stands in the way and speaks first');
  }
  // Camps on levels: the highest piece of each stands well above its lowest.
  for (const plan of CAMP_PLANS) {
    const grounds = plan.items.filter(entry => !entry.afloat && !entry.outlying).map(entry => wolfveilHeight(entry.x, entry.z));
    assert.ok(Math.max(...grounds) - Math.min(...grounds) >= 4, `${plan.id}: the camp spans ${(Math.max(...grounds) - Math.min(...grounds)).toFixed(1)} m of height`);
  }
});

test('the fort\'s wall closes: each corner meets a run on both walls, and each gate\'s walk fills the gap between its towers', () => {
  const fort = campPlan('castra_lupa');
  const runs = fort.items.filter(entry => entry.piece === 'palisade_run');
  const runLength = empireKitPiece('remoria', 'palisade_run').size[0];
  // A run's two ends: half its length to either side of its centre, at right angles to its front.
  const ends = runs.flatMap(run => [-1, 1].map(sign => ({
    x: run.x + sign * (runLength / 2) * Math.cos(run.yaw),
    z: run.z - sign * (runLength / 2) * Math.sin(run.yaw),
  })));
  const corners = fort.items.filter(entry => entry.piece === 'palisade_corner');
  assert.equal(corners.length, 4);
  for (const corner of corners) {
    // The kit table: the walls' centrelines cross 0.93 m in front of the corner piece's origin,
    // and the bank turns on a 2 m radius, so a run must end 2 m from that crossing on each wall.
    const crossing = { x: corner.x + 0.93 * Math.sin(corner.yaw), z: corner.z + 0.93 * Math.cos(corner.yaw) };
    const meeting = ends.filter(end => Math.abs(Math.hypot(end.x - crossing.x, end.z - crossing.z) - 2) < 0.06);
    assert.equal(meeting.length, 2, `corner at (${corner.x}, ${corner.z}) meets ${meeting.length} run ends`);
  }
  const towerWidth = empireKitPiece('remoria', 'gate_tower').size[0];
  const spanWidth = empireKitPiece('remoria', 'gate_span').size[0];
  const towers = fort.items.filter(entry => entry.piece === 'gate_tower');
  for (const span of fort.items.filter(entry => entry.piece === 'gate_span')) {
    const pair = towers.filter(tower => Math.hypot(tower.x - span.x, tower.z - span.z) < 6);
    assert.equal(pair.length, 2);
    const gap = Math.hypot(pair[0].x - pair[1].x, pair[0].z - pair[1].z) - towerWidth;
    assert.ok(Math.abs(gap - spanWidth) < 0.05, `the gap between the towers is ${gap.toFixed(2)} m, the walk ${spanWidth} m`);
  }
});
