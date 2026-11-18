// Wolfveil's four sides: mountain, forest, grassland and wilds, and where
// every tree, boulder, shrub and flower drift is planned to go.
import test from 'node:test';
import assert from 'node:assert/strict';
import {WOLFVEIL_SIDE_THEMES,WOLFVEIL_SIDE_IDS,WOLFVEIL_SIDE_SCENERY,wolfveilSideThemeAt,
  planWolfveilHuntingLoop,planWolfveilSidePlanting,planWolfveilFourSides}
  from '../src/components/game3d/wolfveil/WolfveilFourSidesPlan.mjs';
import {wolfveilAreaAtLocal} from '../src/components/game3d/wolfveil/streaming/WolfveilFiveAreaPlan.mjs';
import {WOLFVEIL_AREA_PORTALS} from '../src/components/game3d/wolfveil/streaming/WolfveilAreaPortalPlan.mjs';
import {WOLFVEIL_CAVE_ENTRANCE_FRAMES} from '../src/components/game3d/wolfveil/WolfveilCaveEntrancePlan.mjs';
import {wolfveilRouteClearance,wolfveilDistanceToRiver} from '../src/components/game3d/wolfveil/WolfveilLayout.js';
import {wolfveilFightingGroundAt,wolfveilMobAreaAt,wolfveilFrontierTrailClearance}
  from '../src/components/game3d/wolfveil/WolfveilLandscapeDesign.mjs';
import {insideWolfveilImportedTown} from '../src/components/game3d/wolfveil/WolfveilImportedTownLayout.mjs';

const whole=planWolfveilFourSides();

test('each side of the town has one theme: mountain, forest, grassland, wilds',()=>{
  assert.deepEqual(WOLFVEIL_SIDE_IDS,['north','west','south','east']);
  assert.deepEqual(WOLFVEIL_SIDE_IDS.map(id=>[WOLFVEIL_SIDE_THEMES[id].side,WOLFVEIL_SIDE_THEMES[id].theme]),
    [['back','mountain'],['left','forest'],['front','grassland'],['right','wilds']]);
  assert.equal(wolfveilSideThemeAt(0,400).theme,'mountain');
  assert.equal(wolfveilSideThemeAt(-400,0).theme,'forest');
  assert.equal(wolfveilSideThemeAt(0,-400).theme,'grassland');
  assert.equal(wolfveilSideThemeAt(400,0).theme,'wilds');
  assert.equal(wolfveilSideThemeAt(0,0),null,'the town is not one of the four sides');
});

test('the monster camps make one loop that only gets harder',()=>{
  const loop=planWolfveilHuntingLoop();
  assert.equal(loop.stops.length,14);
  for(let i=1;i<loop.stops.length;i++)
    assert.ok(loop.stops[i].levels[0]>=loop.stops[i-1].levels[0],loop.stops[i].id+' is easier than the stop before it');
  // The wilds hold the start, the mountain the middle, the forest the end.
  assert.equal(loop.stops[0].side,'east');
  assert.deepEqual(loop.stops.filter(stop=>stop.levels[0]>=30&&stop.levels[0]<40).map(stop=>stop.side),['north','north']);
  assert.deepEqual(loop.stops.slice(-3).map(stop=>stop.side),['west','west','west']);
  assert.equal(loop.stops.filter(stop=>stop.side==='east').length,8);
  assert.ok(loop.stops.filter(stop=>stop.side==='east').every(stop=>stop.levels[1]<=25));
  assert.ok(loop.meters>2500&&loop.meters<5000,'a real journey: '+loop.meters+' m');
});

test('the plan is the same every time, and each side gets what its theme asks for',()=>{
  assert.deepEqual(planWolfveilSidePlanting('west'),whole.sides.west,'same seed, same forest');
  const count=(side,kind)=>whole.sides[side].counts[kind]||0;
  const trees=side=>['cedar','pine','maple'].reduce((sum,kind)=>sum+count(side,kind),0);
  // Forest: by far the most trees. Grassland: the fewest trees, the most flowers.
  assert.ok(trees('west')>=500&&trees('west')>trees('east')*1.6,'forest trees: '+trees('west'));
  assert.ok(trees('south')<=10,'the grassland stays open: '+trees('south'));
  assert.ok(count('south','flowers')>count('west','flowers')*3);
  // Mountain: the most boulders, few trees. Wilds: both, in between.
  assert.ok(count('north','boulder')>count('east','boulder')&&count('east','boulder')>count('west','boulder')*3);
  assert.ok(trees('north')<trees('east')&&trees('east')<trees('west'));
  assert.ok(count('west','bamboo')>=150&&count('north','bamboo')===0);
  for(const id of WOLFVEIL_SIDE_IDS)for(const [kind,cap] of Object.entries(WOLFVEIL_SIDE_THEMES[id].caps))
    assert.ok(count(id,kind)<=cap,id+' '+kind+' over its cap');
  assert.ok(whole.totals.trunks>=1300&&whole.totals.trunks<=1700,'trees that need a collider: '+whole.totals.trunks);
  assert.throws(()=>planWolfveilSidePlanting('town'),/Unknown Wolfveil side/);
});

test('nothing is planted where people walk, fight, cross or enter',()=>{
  const portals=WOLFVEIL_AREA_PORTALS.map(portal=>[portal.x,portal.z]);
  const mouths=WOLFVEIL_CAVE_ENTRANCE_FRAMES.map(frame=>[frame.mouth[0],frame.mouth[2]]);
  const nearest=(item,points)=>Math.min(...points.map(point=>Math.hypot(item.x-point[0],item.z-point[1])));
  for(const [side,plan] of Object.entries(whole.sides))for(const item of plan.placements){
    const rule=WOLFVEIL_SIDE_SCENERY[item.kind],big=rule.trunk||rule.bulky,where=item.kind+' at '+item.x+', '+item.z;
    assert.equal(wolfveilAreaAtLocal(item.x,item.z),side,where+' is outside '+side);
    assert.ok(!insideWolfveilImportedTown(item.x,item.z,0),where+' is inside the town');
    assert.ok(wolfveilRouteClearance(item.x,item.z)>=rule.pathClear-.01,where+' is on a road');
    assert.ok(wolfveilFrontierTrailClearance(item.x,item.z)>=rule.pathClear-.01,where+' is on a trail');
    assert.ok(wolfveilDistanceToRiver(item.x,item.z)>=22,where+' is in the river');
    assert.equal(wolfveilFightingGroundAt(item.x,item.z,big?4:-2),null,where+' is on a fighting ground');
    if(big){
      assert.equal(wolfveilMobAreaAt(item.x,item.z,-4),null,where+' is inside a monster camp');
      assert.ok(nearest(item,portals)>=16,where+' blocks a portal');
      assert.ok(nearest(item,mouths)>=18,where+' blocks a cave mouth');
    }
    assert.equal(item.trunk,Boolean(rule.trunk));
    assert.ok(item.height>=rule.height[0]&&item.height<=rule.height[1]);
  }
});

test('trees keep their distance, and the mountain has a tree line',()=>{
  for(const plan of Object.values(whole.sides)){
    const trunks=plan.placements.filter(item=>item.trunk);
    for(let i=0;i<trunks.length;i++)for(let j=i+1;j<trunks.length;j++){
      const gap=Math.hypot(trunks[i].x-trunks[j].x,trunks[i].z-trunks[j].z);
      assert.ok(gap>=6.4,plan.side+': two trees '+gap.toFixed(1)+' m apart');
    }
  }
  const line=WOLFVEIL_SIDE_THEMES.north.treeLineMeters;
  assert.ok(whole.sides.north.placements.filter(item=>item.trunk).every(item=>item.y<=line));
  assert.ok(whole.sides.north.placements.some(item=>item.kind==='boulder'&&item.y>line),'boulders go above the tree line');
});

test('every monster camp in the wilds is ringed by a grove',()=>{
  const pines=whole.sides.east.placements.filter(item=>item.kind==='pine');
  for(const stop of whole.loop.stops.filter(stop=>stop.side==='east')){
    const ring=pines.filter(tree=>{
      const distance=Math.hypot(tree.x-stop.x,tree.z-stop.z);
      return distance>stop.radius-4&&distance<stop.radius*1.4+34;
    });
    assert.ok(ring.length>=4,stop.id+' has only '+ring.length+' pines around it');
  }
});
