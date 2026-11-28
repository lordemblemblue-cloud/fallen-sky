import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
const read=p=>readFileSync(new URL('../src/components/fantasybattle/'+p,import.meta.url),'utf8');
test('New Game preview has three selectable captured views and does not create a game loop',()=>{
 const view=read('NewGameSetup.jsx'),capture=read('newGamePreview.js');
 for(const marker of ['CELESTIAL_ASSETS.character.url','applyAxisAngle(up,angle)','Object.freeze(frames)','request=undefined','destroySceneRenderer(renderer)'])assert.ok(capture.includes(marker),marker);
 assert.equal((capture.match(/new GLTFLoader\(\)/g)||[]).length,1);
 assert.doesNotMatch(capture,/requestAnimationFrame|setInterval/);
 for(const marker of ["['front','Front']","['left','Left']","['right','Right']",'aria-pressed={view===id}','Retry preview','You can still play.'])assert.ok(view.includes(marker),marker);
});
test('New Game warns when no automatic save is possible and rechecks available slots at entry',()=>{
 const view=read('NewGameSetup.jsx'),page=read('SapphireAdventure.jsx');
 for(const marker of ["storageState==='full'","storageState==='unavailable'","will not autosave","No account required"])assert.ok(view.includes(marker),marker);
 assert.ok(page.includes("const newGameStorage=slots.error?'unavailable'"));
 assert.ok(page.includes('const fresh=reloadSlots();const empty=!fresh.error?SLOT_IDS.find'));
 assert.ok(page.includes('begin(p,empty||null,null)'));
 assert.ok(page.includes('storageState={newGameStorage}'));
});
