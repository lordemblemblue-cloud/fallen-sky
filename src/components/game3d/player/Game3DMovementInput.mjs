import {GAME3D_BINDING_DEFINITIONS,game3dActionForCode} from './Game3DKeybinds.mjs';
// Physical W/A/S/D keys must keep the same movement meaning even if a
// keyboard layout remaps event.key or a key is released after a camera lock.
const physical=Object.freeze({KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d'});
export function game3dInputKey(event){
  const code=String(event?.code||'');
  // Modifier combos (Shift+C weapon switch, shortcuts, system keys) always
  // retain native input semantics, independent of personal bindings.
  if(!event?.ctrlKey&&!event?.altKey&&!event?.metaKey&&!event?.shiftKey){
    const binding=game3dActionForCode(code);
    if(binding?.kind==='gameplay')return binding.value;
    // Freed default gameplay keys must no longer trigger their old action.
    if(!binding&&GAME3D_BINDING_DEFINITIONS.some(def=>
      def.kind==='gameplay'&&def.code===code))return '';
  }
  return physical[code]||String(event?.key||'').toLowerCase();
}
export function game3dMoveAxes(keys={}){
  return {
    forward:(keys.w?1:0)-(keys.s?1:0),
    sideways:(keys.d?1:0)-(keys.a?1:0),
  };
}
