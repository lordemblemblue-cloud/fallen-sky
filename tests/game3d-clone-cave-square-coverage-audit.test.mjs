import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAY_BOUNDS,squareAtPlay,collectWolfveilCaveSquareCandidates,
  CELL_SIZE_METRES,BLOCK_SIZE_CELLS,
} from '../scripts/audit-wolfveil-cave-squares.mjs';
import {WOLFVEIL_CAVE_APPROACHES} from '../src/components/game3d/wolfveil/WolfveilCaveAccessPlan.mjs';
import {WOLFVEIL_EXPLORABLE_CAVES} from '../src/components/game3d/wolfveil/WolfveilCaveLayout.mjs';
import {WOLFVEIL_LANDSCAPE_PLAY_OFFSET_Z}
  from '../src/components/game3d/wolfveil/WolfveilLandscapeDesign.mjs';

const audit=collectWolfveilCaveSquareCandidates();
test('exact-square coordinates use 5m Play world grid, with 100m review groups',()=>{
  assert.equal(CELL_SIZE_METRES,5);
  assert.equal(BLOCK_SIZE_CELLS,20);
  assert.equal(PLAY_BOUNDS.minX,-550);
  assert.equal(PLAY_BOUNDS.minZ,-550+WOLFVEIL_LANDSCAPE_PLAY_OFFSET_Z);
  assert.deepEqual(squareAtPlay(17.5,-2.5),{
    col:113,row:95,id:'X113-Z95',block:'B5-4',
  });
  assert.equal(squareAtPlay(PLAY_BOUNDS.maxX,0),null);
  assert.equal(squareAtPlay(0,PLAY_BOUNDS.maxZ),null);
});
test('four current clone cave paths produce independently reviewable candidate cells',()=>{
  assert.equal(audit.repositoryScope,'CLONE_ONLY');
  assert.equal(audit.acceptance,'NONE_INFERRED');
  assert.equal(audit.approaches.length,4);
  assert.equal(audit.totalUniqueCandidateCells,
    new Set(audit.approaches.flatMap(a=>a.candidateCells)).size);
  for(const approach of WOLFVEIL_CAVE_APPROACHES){
    const record=audit.approaches.find(a=>a.caveId===approach.caveId);
    assert.ok(record,'missing audit entry for '+approach.caveId);
    assert.equal(record.owner,null);
    assert.equal(record.ownerAcceptance,false);
    assert.equal(record.reviewStatus,'UNVERIFIED');
    assert.ok(record.candidateCells.length>0);
    assert.equal(new Set(record.candidateCells).size,record.candidateCells.length);
    const points=approach.points;
    for(const p of points){
      const cell=squareAtPlay(p.x,p.z+WOLFVEIL_LANDSCAPE_PLAY_OFFSET_Z);
      assert.ok(cell,'authored trail point outside playable bounds');
      assert.ok(record.candidateCells.includes(cell.id),
        'candidate coverage must include the authored trail vertex '+cell.id);
    }
  }
});
test('all four exact cave thresholds and outside arches are covered',()=>{
  for(const cave of WOLFVEIL_EXPLORABLE_CAVES){
    const record=audit.approaches.find(a=>a.caveId===cave.id);
    for(const [x,z] of [cave.mouth,[cave.threshold[0],cave.threshold[2]]]){
      const cell=squareAtPlay(x,z+WOLFVEIL_LANDSCAPE_PLAY_OFFSET_Z);
      assert.ok(cell);
      assert.ok(record.candidateCells.includes(cell.id),
        'cave entrance missing candidate square '+cave.id+' '+cell.id);
    }
  }
});
test('all emitted square IDs fit grid bounds and 100m review groups',()=>{
  const width=(PLAY_BOUNDS.maxX-PLAY_BOUNDS.minX)/CELL_SIZE_METRES;
  const height=(PLAY_BOUNDS.maxZ-PLAY_BOUNDS.minZ)/CELL_SIZE_METRES;
  for(const approach of audit.approaches){
    for(const id of approach.candidateCells){
      const match=/^X(\d+)-Z(\d+)$/.exec(id);
      assert.ok(match,'bad square ID '+id);
      const col=Number(match[1]),row=Number(match[2]);
      assert.ok(col>=0&&col<width&&row>=0&&row<height);
      assert.ok(approach.candidateBlocks.includes(
        'B'+Math.floor(col/BLOCK_SIZE_CELLS)+'-'+Math.floor(row/BLOCK_SIZE_CELLS)));
    }
  }
  assert.ok(audit.sharedCells.every(entry=>
    entry.approaches.length>1&&entry.approaches.every(caveId=>
      audit.approaches.some(a=>a.caveId===caveId&&a.candidateCells.includes(entry.cell)))));
});
