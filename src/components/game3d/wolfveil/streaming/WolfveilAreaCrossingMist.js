// Screen-space spirit mist for walking through a Wolfveil area gate. It
// thickens as the player steps into a gate (setMist, driven by
// WolfveilAreaGates.mist) and flashes when the area changes, then clears.
// The arrival title stays with Game3DAreaNotice (one notice, not two).
// Pure DOM over the game canvas: pointer-events none, no layout impact.
export function createWolfveilAreaCrossingMist(container,{doc=globalThis.document}={}){
  if(!container||!doc?.createElement)return null;
  if(globalThis.getComputedStyle?.(container)?.position==='static')container.style.position='relative';
  const root=doc.createElement('div');
  root.setAttribute('aria-hidden','true');
  root.dataset.wolfveilAreaMist='true';
  Object.assign(root.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'30',opacity:'0',
    background:'radial-gradient(ellipse at 50% 55%, rgba(236,242,255,.92) 0%, rgba(214,224,246,.86) 45%, rgba(170,186,222,.78) 100%)',
    transition:'opacity 120ms linear'});
  container.append(root);
  let approach=0,flash=0,last=-1;
  function paint(){
    const value=Math.max(approach,flash);
    if(Math.abs(value-last)<.01)return;
    last=value;
    root.style.opacity=value.toFixed(3);
  }
  return {
    element:root,
    /** Mist from walking into a gate (0..1), called every frame. */
    setMist(value){approach=Math.max(0,Math.min(1,Number(value)||0));paint();},
    /** Area changed: hold the mist while the new area appears, then clear. */
    flash(strength=.9){flash=Math.max(flash,strength);paint();},
    /** Call every frame with the frame time so the flash clears. */
    update(dt){
      if(flash<=0)return;
      flash=Math.max(0,flash-Math.max(0,Number(dt)||0)*1.4);
      paint();
    },
    dispose(){root.remove();},
  };
}
