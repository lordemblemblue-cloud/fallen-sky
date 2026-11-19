// Two noncombat guards at the accessible Jade Lantern Grotto tunnel:
// one quest-giving watch captain on the outside approach, one quiet sentry
// just past the landing. Positions use the canonical cave geometry, not
// guessed world offsets or an extra collision floor.
import { WOLFVEIL_EXPLORABLE_CAVES, sampleWolfveilCaveSpace } from './WolfveilCaveLayout.mjs';
import { wolfveilHeight } from './WolfveilLayout.js';

export const WOLFVEIL_WATCH_QUEST_NPC_ID = 'wolfveil_jade_watch_captain';
export const WOLFVEIL_WATCH_QUEST_ID = 'q_wolfveil_jade_watch_side';

export function planWolfveilCaveWatch() {
  const cave = WOLFVEIL_EXPLORABLE_CAVES.find(item => item.id === 'jade_lantern_grotto');
  if (!cave) return [];
  const [mx,mz] = cave.mouth, [dx,dz] = cave.dir;
  const sideX = -dz, sideZ = dx;
  // The captain stands outside the arch interaction radius, along the
  // already-graded trail and to one side of its center line.
  const outAlong = -14.0, outSide = 1.15;
  const outX = mx + dx*outAlong + sideX*outSide;
  const outZ = mz + dz*outAlong + sideZ*outSide;
  // Landing immediately beyond the first interior stairs: the silent
  // sentry stands against the tunnel side, never in the player center line.
  const innerAlong = cave.levelOneAlong + 2.5, innerSide = -1.6;
  const inX = mx + dx*innerAlong + sideX*innerSide;
  const inZ = mz + dz*innerAlong + sideZ*innerSide;
  const space = sampleWolfveilCaveSpace(inX,inZ,0.35);
  return Object.freeze([
    Object.freeze({
      id: 'jade_watch_captain',name:'Captain Arlen',variant:'warden',
      role:'guard',inside:false,questNpcId:WOLFVEIL_WATCH_QUEST_NPC_ID,
      x:outX,y:wolfveilHeight(outX,outZ),z:outZ,
      facing:Math.atan2(dx,dz),
      line:'The lower passage has grown dangerous. I need a hand clearing the approach.',
    }),
    Object.freeze({
      id:'jade_inner_sentry',name:'Tunnel Sentry',variant:'blue',
      role:'guard',inside:true,questNpcId:null,
      x:inX,y:space?.floorY ?? cave.chamber.y,z:inZ,
      facing:Math.atan2(-dx,-dz),
      line:'The lamps still burn. Keep moving, and mind the lower steps.',
    }),
  ]);
}
