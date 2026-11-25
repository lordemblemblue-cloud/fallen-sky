import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,stepMatch} from '../src/components/duelist/sim/match.mjs';
import {IMPORTED_CONTROL as map} from '../src/components/duelist/sim/importedControlLayout.mjs';
import {importedBotPath} from '../src/components/duelist/sim/importedControlBotNav.mjs';
test('both teams have a route from each primary spawn to each objective',()=>{
  for(const team of Object.values(map.spawns))for(const spawn of team.primarySpawns)for(const point of map.controlPoints){
    const path=importedBotPath(map,spawn,point);
    assert.ok(path.length,spawn.id+' -> '+point.id);
    assert.deepEqual(path.at(-1),{x:point.x,y:point.y,z:point.z});
  }
});
test('public eight-seat match bots capture all three objectives including elevated Alpha',()=>{
 const m=createMatch({mode:'control',seed:6});const captured=new Set();
 for(let i=0;i<9000&&captured.size<3;i++){stepMatch(m,1/60,{});for(const p of m.controlPoints)if(p.owner)captured.add(p.id);}
 assert.deepEqual([...captured].sort(),['A','B','C']);
});
