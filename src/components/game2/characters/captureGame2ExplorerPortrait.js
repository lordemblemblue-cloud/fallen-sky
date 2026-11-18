// One-time portrait of the real Explorer mesh rendered by the existing
// Game 2 WebGL gameplay engine. No dummy model, stock image or extra WebGL
// context is created; this crops the player from a rendered preview frame.
export function captureGame2ExplorerPortrait(canvas,{compact=false}={}){
  if(!canvas || !Number.isFinite(canvas.width) || !Number.isFinite(canvas.height) ||
      canvas.width<200 || canvas.height<200)return null;
  const output=document.createElement('canvas');
  output.width=200;output.height=252;
  const ctx=output.getContext('2d',{alpha:false});
  if(!ctx)return null;
  const displayAspect=output.width/output.height;
  const cropHeight=Math.min(canvas.height*.72,canvas.width*.43/displayAspect);
  const cropWidth=cropHeight*displayAspect;
  const focusX=canvas.width*(compact?.5:.255);
  const focusY=canvas.height*.51;
  const sourceX=Math.max(0,Math.min(canvas.width-cropWidth,focusX-cropWidth/2));
  const sourceY=Math.max(0,Math.min(canvas.height-cropHeight,focusY-cropHeight/2));
  try{
    // Capture synchronously right after Game.render() while the default
    // framebuffer still contains the real skinned Explorer model.
    canvas.getContext('webgl2')?.finish?.();
    ctx.drawImage(canvas,sourceX,sourceY,cropWidth,cropHeight,0,0,output.width,output.height);
    return output.toDataURL('image/webp',.84);
  }catch{
    // WebGL readback, browser privacy or GPU context failures must never
    // block deployment. The character card retains its accessible fallback.
    return null;
  }
}
