import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/fantasybattle/SapphireAdventure.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/components/fantasybattle/sapphireExplorationHud.css',import.meta.url),'utf8');
const hud=source.slice(source.indexOf('function OriginalExplorationHud'),source.indexOf('// Victory is a read-only presentation'));
const combat=source.slice(source.indexOf('function OriginalCombatHud'),source.indexOf('// Crop the approved original HUD'));
test('screen 10 uses the same cleaned HUD regardless of artwork load',()=>{
 assert.match(source,/case '10':content=<OriginalExplorationHud[^\n]+original=\{original\}/);
 assert.match(source,/id!=='10'&&<div aria-hidden="true" className="fa-template"/);
 assert.match(source,/const template=id==='10'\?null:/);
});
test('original HUD art is cropped into the four retained panels',()=>{
 assert.match(source,/status:\[1\.3,74,22\.6,12\]/);
 assert.match(source,/quest:\[1\.3,10\.3,24,17\.9\]/);
 assert.match(source,/map:\[82\.7,1\.3,16\.8,27\.4\]/);
 assert.match(source,/actions:\[86\.3,69,12\.9,16\.7\]/);
 assert.match(hud,/original\.url/);
 assert.match(source,/wide\|\|id==='10'/);
});
test('actual health and XP precede the quest journal',()=>{
 assert.match(hud,/heroStats\(profile\)\.maxHp/);
 assert.match(hud,/aria-label="Character health" max=\{maxHp\} value=\{profile\?\.hp\|\|0\}/);
 assert.match(hud,/aria-label="Progress to next level" value=\{xp%100\} max=\{100\}/);
 assert.ok(hud.indexOf('className="fa-clean-status"')<hud.indexOf('className="fa-clean-quest"'));
 assert.match(css,/\.fa-clean-left\{[^}]*flex-direction:column/);
});
test('no exploration party placeholders or bottom navigation',()=>{
 assert.doesNotMatch(hud,/Empty slot|activeRoster\(|fa-explore-party|fa-explore-nav|fa-explore-region|No nearby interaction/);
 assert.match(combat,/Party health and Focus/);
});
test('minimap, menu, journal, jump, skills and recovery controls preserved',()=>{
 for(const label of ['Open live world map','Open menu','Open quest journal','Zoom in on minimap','Zoom out on minimap','Jump','Skillbook','Recovery tonic'])assert.ok(hud.includes(label),label);
 assert.match(hud,/post\('jump'\)/);
 assert.match(hud,/onClick=\{\(\)=>go\('46'\)\}/);
});
test('touch controls preserve release and interaction without persistent banner',()=>{
 for(const event of ['onPointerUp','onPointerCancel','onLostPointerCapture'])assert.ok(hud.includes(event));
 assert.match(hud,/\{world\?\.nearby&&<Btn className="fa-clean-touch-interact"/);
 assert.match(css,/\.fa-clean-touch-move,\.fa-clean-touch-interact\{display:none\}/);
 assert.match(css,/@media\(pointer:coarse\)/);
 assert.match(css,/\.fa-clean-touch-move\{[^}]*display:grid/);
});
test('plain functional fallback is available without original media',()=>{
 assert.match(css,/\.fa-clean-explore:not\(\.has-plate\)/);
 assert.match(source,/original\?' has-plate':''/);
});
