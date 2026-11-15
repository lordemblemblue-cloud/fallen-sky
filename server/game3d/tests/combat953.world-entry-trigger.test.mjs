// Combat/Quest clone 95.3 candidate: fail closed if Suigen/Classic world-entry
// changes stop requesting the existing offline source gate. This does NOT
// establish database, live admission, or gameplay readiness.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

const repoFile = path => new URL('../../../'+path, import.meta.url);
const workflowPath='.github/workflows/game3d-combat-950.yml';
const source=readFileSync(repoFile(workflowPath),'utf8');
export const CLIENT_WORLD_ENTRY_PATHS_953=Object.freeze([
  'src/components/game3d/GameWorld3D.jsx',
  'src/components/game3d/PauseMenu.jsx',
  'src/components/game3d/worlds/WolfveilWorldVariants.mjs',
  'src/components/game3d/worlds/loadSuigenWorld.mjs',
  'tests/game3d-suigen-map-variant.test.mjs',
]);

export function eventPaths953(workflow,event){
  if(typeof workflow!=='string'||!['pull_request','push'].includes(event))
    return [];
  const header = new RegExp('^  '+event+':\\s*$','m');
  const hit=header.exec(workflow);
  if(!hit)return [];
  const rest=workflow.slice(hit.index+hit[0].length);
  const next=rest.search(/^  [a-z_-]+:/m);
  const segment=next<0?rest:rest.slice(0,next);
  if(!/^    paths:\\s*$/m.test(segment))return [];
  return [...segment.matchAll(/^      - '([^']+)'\\s*$/gm)].map(x=>x[1]);
}
export function hasCompleteWorldTrigger953(workflow){
  const pull=eventPaths953(workflow,'pull_request');
  const push=eventPaths953(workflow,'push');
  return CLIENT_WORLD_ENTRY_PATHS_953.every(p=>pull.includes(p)&&push.includes(p))&&
    pull.length===new Set(pull).size&&push.length===new Set(push).size&&
    pull.length===push.length&&pull.every(p=>push.includes(p));
}
test('95.3 clone CI responds to both world variants, selector and GameWorld3D',()=>{
  assert.equal(hasCompleteWorldTrigger953(source),true);
  for(const path of CLIENT_WORLD_ENTRY_PATHS_953)
    assert.equal(existsSync(repoFile(path)),true,path+' must exist on clone main');
});
test('95.3 regression fails closed when any world-entry trigger is omitted',()=>{
  for(const path of CLIENT_WORLD_ENTRY_PATHS_953){
    const line="      - '"+path+"'\\n";
    assert.equal(source.split(line).length,3,path+' must appear in PR and push');
    assert.equal(hasCompleteWorldTrigger953(source.replace(line,'')),false,
      'omission from pull_request: '+path);
    assert.equal(hasCompleteWorldTrigger953(source.replaceAll(line,'')),false,
      'omission from both: '+path);
  }
});
test('95.3 refuses asymmetric path triggers and missing source coverage',()=>{
  assert.equal(hasCompleteWorldTrigger953(source.replace(
    "      - 'server/game3d/**'\\n",'')),false);
  const original="      - 'src/components/game3d/PauseMenu.jsx'\\n";
  assert.equal(hasCompleteWorldTrigger953(source.replace(original,
    "      - 'src/components/game3d/UnrelatedPauseMenu.jsx'\\n")),false);
});
test('95.3 leaves native source gate and security defaults unchanged',()=>{
  assert.match(source,/node-version:\\s*'22'/);
  assert.match(source,/^\\s+node --test server\\/game3d\\/tests\\/combat953\\.world-entry-trigger\\.test\\.mjs\\s*$/m);
  assert.match(source,/^\\s+node server\\/game3d\\/tools\\/verifyCombatQuest851\\.mjs\\s*$/m);
  assert.match(source,/^permissions:\\n  contents: read$/m);
  assert.match(source,/^  workflow_dispatch:$/m);
  assert.doesNotMatch(source,/continue-on-error:\\s*true|\\|\\|\\s*true/);
});
