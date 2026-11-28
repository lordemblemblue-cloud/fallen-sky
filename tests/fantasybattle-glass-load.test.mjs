import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadingMilestones} from '../src/components/fantasybattle/core/loadingMilestones.mjs';
const src=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/components/fantasybattle/sapphireLoadGlass.css',import.meta.url),'utf8');
const menu=src.slice(src.indexOf("    case '02':content="),src.indexOf("    case '03':content="));
const loading=src.slice(src.indexOf("    case '35':"),src.indexOf("    case '36':content="));
test('world milestones describe actual startup and saved-position restoration',()=>{
 assert.equal(loadingMilestones(false,1).completed,1);
 assert.match(loadingMilestones(false,1).message,/Initializing the 3D world/);
 assert.match(loadingMilestones(false,2).message,/Restoring your saved position/);
 assert.equal(loadingMilestones(false,3).completed,3);
 assert.equal(loadingMilestones(false,3).message,'Ready to enter');
});
test('combat milestones distinguish arena and renderer readiness',()=>{
 assert.match(loadingMilestones(true,1).message,/Preparing battleground/);
 assert.match(loadingMilestones(true,2).message,/Loading fighters and combat renderer/);
 assert.equal(loadingMilestones(true,3).completed,3);
});
test('progress is bounded and invalid data does not appear complete',()=>{
 for(const stage of [-1,NaN,undefined,1.5,'3'])assert.equal(loadingMilestones(false,stage).completed,0);
 assert.equal(loadingMilestones(true,9).completed,3);
});
test('save menu uses only the right glass panel and actual valid saves',()=>{
 assert.match(menu,/fa-glass-load-panel/);
 assert.match(menu,/SLOT_IDS\.map/);
 assert.match(menu,/record\?\.status==='valid'/);
 assert.match(menu,/disabled=\{!selectedSave\}/);
 assert.match(menu,/begin\(selectedSave\.profile,selectedSave\.id,selectedSave\.stamp\)/);
 assert.match(menu,/newHero/);
 assert.match(css,/\.fa-glass-load-layout\{[^}]*justify-content:flex-end/);
});
test('old full UI plates and generic header do not cover either new panel',()=>{
 assert.match(src,/const customLoad=id==='02'\|\|id==='35'/);
 assert.match(src,/useStagedOriginal\(customLoad\?null:id\)/);
 assert.match(src,/!customLoad&&id!=='10'&&<div/);
 assert.match(src,/!customLoad&&!isWorldScreen\(id\)/);
});
test('visible progress uses a real native value and accessible status',()=>{
 assert.match(loading,/value=\{loading.completed\} max=\{loading.total\}/);
 assert.match(loading,/aria-live="polite"/);
 assert.match(css,/\.fa-glass-progress\{[^}]*height:15px/);
 assert.match(css,/\.fa-glass-progress::-webkit-progress-value\{[^}]*background:linear-gradient/);
});
test('world starts loading and advances only on readiness events',()=>{
 assert.match(src,/setRunning\(false\);setLoadStage\(1\);root\('35'\)/);
 assert.match(src,/restorePending.current=true;setLoadStage\(2\)/);
 assert.match(src,/clearTimeout\(timeoutRef.current\);setLoadStage\(3\);post\('pause',false\);root\('10'\)/);
});
test('battle loading waits for first initialized HUD instead of only arena readiness',()=>{
 assert.match(src,/e.type==='battleReady'[^\n]*setArenaReady\(true\);if\(s.id==='35'\)setLoadStage/);
 assert.match(src,/state.phase!=='loading'[^\n]*current.current.id==='35'[^\n]*root\('09'\)/);
});
test('cancel, local backup, mobile and reduced motion remain supported',()=>{
 assert.match(loading,/onClick=\{leaveTitle\}/);
 assert.match(menu,/downloadBackup\(selectedSave.profile,true\)/);
 assert.match(menu,/downloadBackup\(selectedSave.profile\)/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
