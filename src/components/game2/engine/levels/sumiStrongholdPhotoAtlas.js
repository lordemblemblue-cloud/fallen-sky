// Picture-on-panel experiment: a fully painted metal atlas is projected
// onto ONE Stronghold wall plate and ONE neighboring floor tile, not the
// surrounding map. Physical fixtures and screw heads remain 3D geometry.
// 8K source atlas is opt-in and bounded by detected GPU/host memory.
export const STRONGHOLD_PHOTO_ATLAS_LAYOUT=Object.freeze({
 wall:[0,0,.5,1],floor:[.5,0,1,1],
 wallWorld:[61.40,5.10,63.82,7.55],
 floorWorld:[18.32,61.49,20.47,63.64],
});
export function strongholdPhotoAtlasSize(quality,maxTextureSize,deviceMemoryGb=0){
 const max=Number(maxTextureSize)||0,mem=Number(deviceMemoryGb)||0;
 if(max<1024)return 0;
 if(quality==='8k'&&max>=8192&&mem>=8)return 8192;
 if((quality==='4k'||quality==='8k')&&max>=4096)return 4096;
 if(quality==='very_low')return 1024;
 return max>=2048?2048:1024;
}
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const hash=(x,y)=>{const n=Math.sin((x+1)*127.1+(y+1)*311.7)*43758.5453;return n-Math.floor(n);};
function line(c,x0,y0,x1,y1,width,color){
 c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke();
}
function platedRegion(c,X,Y,W,H,seed){
 c.save();c.beginPath();c.rect(X,Y,W,H);c.clip();
 const g=c.createLinearGradient(X,Y,X+W,Y+H);
 g.addColorStop(0,'#121921');g.addColorStop(.17,'#323b44');
 g.addColorStop(.36,'#252d36');g.addColorStop(.57,'#45515c');
 g.addColorStop(.81,'#202a35');g.addColorStop(1,'#111923');
 c.fillStyle=g;c.fillRect(X,Y,W,H);
 const reflected=c.createRadialGradient(X+W*.68,Y+H*.37,W*.02,X+W*.68,Y+H*.37,W*.62);
 reflected.addColorStop(0,'rgba(154,186,203,.13)');
 reflected.addColorStop(.48,'rgba(93,115,137,.07)');
 reflected.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=reflected;c.fillRect(X,Y,W,H);
 const scale=W/1024;
 // Film grain, machining scratches, hand-swirls, light oxide scatter.
 // Vary seeds deterministically: same image after restart/release.
 const count=Math.floor(3300*Math.min(4,Math.max(.75,scale)));
 for(let i=0;i<count;i++){
   const u=hash(i+seed,13),v=hash(i+seed,17),length=(.002+.047*hash(i+seed,19))*W;
   const sx=X+u*W,sy=Y+v*H;
   const dir=(hash(i+seed,23)-.5)*.25;
   const bright=hash(i+seed,31)>.56;
   line(c,sx,sy,sx+(bright?1:-1)*length,sy+dir*length,
     Math.max(.4,Math.min(1.8,scale*.32)),
     bright?'rgba(195,213,216,.12)':'rgba(0,0,0,.18)');
 }
 // Bent-metal marks and irregular wear scratches; not tiled wallpaper.
 for(let i=0;i<190;i++){
   const x=X+hash(seed+i,37)*W,y=Y+hash(seed+i,41)*H;
   const w=(.006+.078*hash(i,47))*W,h=(.002+.023*hash(i,49))*H;
   c.strokeStyle=hash(i,53)>.62?'rgba(197,209,220,.13)':'rgba(0,0,0,.20)';
   c.lineWidth=Math.max(.6,scale*.52);c.beginPath();
   c.moveTo(x,y);c.quadraticCurveTo(x+w*.3,y-h,x+w,y+h*.5);c.stroke();
 }
 // Physically motivated recessed edge with narrow bright polished lip.
 c.lineJoin='round';
 c.strokeStyle='rgba(4,9,14,.95)';c.lineWidth=Math.max(5,scale*20);
 c.strokeRect(X+W*.027,Y+H*.025,W*.946,H*.95);
 c.strokeStyle='#677681';c.lineWidth=Math.max(2,scale*8);
 c.strokeRect(X+W*.032,Y+H*.029,W*.935,H*.942);
 c.strokeStyle='rgba(198,216,222,.47)';c.lineWidth=Math.max(1,scale*2.2);
 c.strokeRect(X+W*.043,Y+H*.042,W*.914,H*.914);
 // Steel catches cool overhead light. The shader adds moving real highlights.
 line(c,X+W*.05,Y+H*.057,X+W*.96,Y+H*.057,Math.max(1,scale*2),'rgba(173,209,224,.35)');
 c.restore();
}
function fastener(c,x,y,r){
 c.save();
 c.fillStyle='#090e15';c.beginPath();c.arc(x,y,r*1.40,0,Math.PI*2);c.fill();
 const g=c.createRadialGradient(x-r*.35,y-r*.40,r*.08,x,y,r);
 g.addColorStop(0,'#b4bfc2');g.addColorStop(.4,'#5b6874');g.addColorStop(.83,'#28323c');g.addColorStop(1,'#9ea9af');
 c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
 line(c,x-r*.55,y,x+r*.55,y,r*.18,'#111820');
 line(c,x,y-r*.55,x,y+r*.55,r*.18,'#111820');
 c.restore();
}
function vent(c,x,y,w,h){
 c.fillStyle='#070b0f';c.fillRect(x,y,w,h);
 c.strokeStyle='#75828d';c.lineWidth=Math.max(1,w*.07);c.strokeRect(x,y,w,h);
 for(let i=0;i<29;i++){
   const v=y+h*(.045+i*.0318);
   line(c,x+w*.09,v,x+w*.91,v,w*.028,
     i%5===0?'rgba(162,178,188,.75)':'rgba(81,96,109,.68)');
 }
}
function panelArt(c,x,y,w,h,seed){
 platedRegion(c,x,y,w,h,seed);
 vent(c,x+w*.074,y+h*.22,w*.122,h*.57);
 // Raised inset service door, dark outline and machined perimeter.
 const dx=x+w*.255,dy=y+h*.18,dw=w*.62,dh=h*.66;
 c.fillStyle='rgba(4,7,12,.66)';c.fillRect(dx,dy,dw,dh);
 platedRegion(c,dx+w*.013,dy+h*.012,dw-w*.026,dh-h*.024,seed+67);
 for(const sx of [.095,.905])for(const sy of [.092,.906])
   fastener(c,x+w*sx,y+h*sy,w*.014);
 for(const sx of [.28,.86])for(const sy of [.21,.81])
   fastener(c,x+w*sx,y+h*sy,w*.011);
 // Lower ventilation grille and steel end cap, like reference.
 vent(c,x+w*.19,y+h*.855,w*.67,h*.054);
}
function floorArt(c,x,y,w,h,seed){
 platedRegion(c,x,y,w,h,seed);
 // Floor edging is broad enough to read from a grazing third-person camera.
 for(const q of [.06,.087]){
   c.strokeStyle=q<.07?'#080d15':'#8796a2';
   c.lineWidth=Math.max(2,w*(q<.07?.024:.007));
   c.strokeRect(x+w*q,y+h*q,w*(1-2*q),h*(1-2*q));
 }
 const shine=c.createLinearGradient(x+w*.15,y+h*.13,x+w*.9,y+h*.88);
 shine.addColorStop(0,'rgba(151,178,194,.03)');
 shine.addColorStop(.51,'rgba(176,209,228,.20)');
 shine.addColorStop(.58,'rgba(205,227,233,.055)');
 shine.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=shine;c.fillRect(x+w*.09,y+h*.09,w*.82,h*.82);
 for(const sx of [.12,.88])for(const sy of [.12,.88])
   fastener(c,x+w*sx,y+h*sy,w*.020);
}
export function createStrongholdPhotoAtlas({quality='medium',maxTextureSize=4096,deviceMemoryGb=0,doc=globalThis.document}={}){
 const size=strongholdPhotoAtlasSize(quality,maxTextureSize,deviceMemoryGb);
 if(!doc?.createElement || !size)return null;
 const canvas=doc.createElement('canvas');
 canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)return null;
 ctx.fillStyle='#171f2a';ctx.fillRect(0,0,size,size);
 // Left half = wall photograph-like painted albedo, right half = floor.
 // World-position projection in gl.js maps each onto exactly ONE original
 // panel/one floor tile, with embossed live 3D trim on top.
 panelArt(ctx,0,0,size*.5,size,127);
 floorArt(ctx,size*.5,0,size*.5,size,431);
 return canvas;
}
