import test from 'node:test';
import assert from 'node:assert/strict';
import {
 GAME3D_BINDING_DEFINITIONS,GAME3D_DEFAULT_KEYBINDS,
 GAME3D_KEYBINDS_STORAGE_KEY,normalizeGame3DKeybinds,
 rebindGame3DAction,saveGame3DKeybinds,readGame3DKeybinds,
 game3dActionForCode,game3dBindingLabel,
} from '../src/components/game3d/player/Game3DKeybinds.mjs';
import {game3dInputKey} from '../src/components/game3d/player/Game3DMovementInput.mjs';
import {getGame3DMenuShortcut} from '../src/components/game3d/axe/services/game3dMenuHotkeys.mjs';

const makeStorage=()=>{const values=new Map();return {
 getItem:key=>values.get(key)??null,
 setItem:(key,value)=>values.set(key,value),
};};
const event=(code,key='')=>({
 code,key,repeat:false,defaultPrevented:false,ctrlKey:false,altKey:false,
 metaKey:false,shiftKey:false,isComposing:false,
 target:{isContentEditable:false,closest:()=>null},
});

test('all service and core movement keys start with a unique valid mapping',()=>{
 assert.equal(GAME3D_BINDING_DEFINITIONS.length,16);
 assert.equal(new Set(Object.values(GAME3D_DEFAULT_KEYBINDS)).size,16);
 assert.deepEqual(normalizeGame3DKeybinds({}),GAME3D_DEFAULT_KEYBINDS);
});
test('duplicate, reserved and unrecognized bindings are refused',()=>{
 assert.deepEqual(rebindGame3DAction(GAME3D_DEFAULT_KEYBINDS,'moveForward','KeyC'),
   {ok:false,reason:'in-use',occupied:'character'});
 assert.equal(rebindGame3DAction(GAME3D_DEFAULT_KEYBINDS,'moveForward','Escape').reason,'reserved-key');
 assert.equal(rebindGame3DAction(GAME3D_DEFAULT_KEYBINDS,'moveForward','KeyF').reason,'reserved-key');
 assert.equal(rebindGame3DAction(GAME3D_DEFAULT_KEYBINDS,'unknown','KeyT').reason,'unknown-action');
});
test('a remapped movement key controls the real movement input instead of the old physical key',()=>{
 const result=rebindGame3DAction(GAME3D_DEFAULT_KEYBINDS,'moveForward','KeyT');
 assert.equal(result.ok,true);
 const storage=makeStorage();saveGame3DKeybinds(result.bindings,storage);
 const previous=globalThis.localStorage;globalThis.localStorage=storage;
 try{
  assert.equal(game3dInputKey(event('KeyT','t')),'w');
  assert.equal(game3dInputKey(event('KeyW','w')),'');
  assert.equal(game3dInputKey({...event('KeyT','t'),shiftKey:true}),'t');
 }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
test('a saved service rebind changes the actual menu shortcut',()=>{
 const result=rebindGame3DAction(GAME3D_DEFAULT_KEYBINDS,'character','KeyU');
 assert.equal(result.ok,true);
 const storage=makeStorage();saveGame3DKeybinds(result.bindings,storage);
 const previous=globalThis.localStorage;globalThis.localStorage=storage;
 try{
  assert.equal(getGame3DMenuShortcut(event('KeyU','u')),'character');
  assert.equal(getGame3DMenuShortcut(event('KeyC','c')),null);
  assert.equal(game3dActionForCode('KeyU').id,'character');
 }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
test('saved layouts survive reloading and invalid partial data resets safely',()=>{
 const storage=makeStorage();
 const next={...GAME3D_DEFAULT_KEYBINDS,map:'KeyT'};
 assert.deepEqual(saveGame3DKeybinds(next,storage),next);
 assert.deepEqual(readGame3DKeybinds(storage),next);
 storage.setItem(GAME3D_KEYBINDS_STORAGE_KEY,'{invalid');
 assert.deepEqual(readGame3DKeybinds(storage),GAME3D_DEFAULT_KEYBINDS);
 storage.setItem(GAME3D_KEYBINDS_STORAGE_KEY,JSON.stringify({...next,map:'KeyC'}));
 assert.deepEqual(readGame3DKeybinds(storage),GAME3D_DEFAULT_KEYBINDS);
});
test('keyboard labels are readable on the menu tiles',()=>{
 assert.equal(game3dBindingLabel('KeyC'),'C');
 assert.equal(game3dBindingLabel('Space'),'SPACE');
 assert.equal(game3dBindingLabel('Equal'),'=');
});
