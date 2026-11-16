// Physical W/A/S/D keys must keep the same movement meaning even if a
// keyboard layout remaps event.key or a key is released after a camera lock.
const physical=Object.freeze({KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d'});
export function game3dInputKey(event){
  const code=String(event?.code||'');
  return physical[code]||String(event?.key||'').toLowerCase();
}
export function game3dMoveAxes(keys={}){
  return {
    forward:(keys.w?1:0)-(keys.s?1:0),
    sideways:(keys.d?1:0)-(keys.a?1:0),
  };
}
