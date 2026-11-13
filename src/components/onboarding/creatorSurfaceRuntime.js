import * as THREE from 'three';
const bases=new WeakMap(),tattooImages=new Map();
const color=value=>/^#[a-f0-9]{6}$/i.test(value||'');
function materialBase(material){let base=bases.get(material);if(!base){base={color:material.color?.clone(),map:material.map,roughness:material.roughness,emissive:material.emissive?.clone()};bases.set(material,base);}return base;}
export function applyCreatorSurfaces(model,appearance={}){
 model.traverse(node=>{if(!node.isMesh)return;(Array.isArray(node.material)?node.material:[node.material]).filter(Boolean).forEach(material=>{
  const base=materialBase(material),name=material.name||'',skin=/^Skin_(Body|Head)/i.test(name),hair=/^Hair_/i.test(name),iris=/iris/i.test(name);
  if(!skin&&!hair&&!iris)return;
  if(base.color&&material.color)material.color.copy(base.color);
  const tint=skin&&appearance.skin_tint_enabled?appearance.skin_tone:hair&&appearance.hair_tint_enabled?appearance.hair_color:iris&&appearance.eye_tint_enabled?appearance.eye_color:null;
  if(color(tint))material.color?.lerp(new THREE.Color(tint),skin?(appearance.skin_tint_strength??1):1);
  if(skin){material.roughness=appearance.skin_finish_enabled?THREE.MathUtils.lerp(.95,.12,appearance.skin_finish??.35):base.roughness;if(material.emissive&&base.emissive){material.emissive.copy(base.emissive);if(appearance.skin_highlight_enabled&&color(appearance.skin_highlight_color)){material.emissive.set(appearance.skin_highlight_color);material.emissiveIntensity=.045;}}}
 });});
}
async function readTattoo(url){if(!tattooImages.has(url))tattooImages.set(url,new Promise((resolve,reject)=>{const image=new window.Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Tattoo texture could not load.'));image.src=url;}));return tattooImages.get(url);}
export async function applyTattooLayer(model,asset,appearance={}){
 const image=asset?await readTattoo(asset.file_url):null;
 const opacity=appearance.layer_opacity?.tattoo??.75;
 model.traverse(node=>{if(!node.isMesh)return;(Array.isArray(node.material)?node.material:[node.material]).filter(Boolean).forEach(material=>{
  if(!/^Skin_(Body|Head)/i.test(material.name||''))return;
  const base=materialBase(material),skinImage=base.map?.image;
  if(!skinImage)return;
  const isHead=/^Skin_Head/i.test(material.name),makeup=isHead&&appearance.makeup_enabled;
  if((!image||isHead)&&!makeup){if(material.map!==base.map){material.map?.dispose();material.map=base.map;material.needsUpdate=true;}return;}
  const canvas=document.createElement('canvas');canvas.width=skinImage.width;canvas.height=skinImage.height;const ctx=canvas.getContext('2d');ctx.drawImage(skinImage,0,0);
  if(image&&!isHead){const ink=document.createElement('canvas');ink.width=canvas.width;ink.height=canvas.height;const paint=ink.getContext('2d');paint.drawImage(image,0,0,ink.width,ink.height);if(color(appearance.layer_colors?.tattoo)){paint.globalCompositeOperation='source-in';paint.fillStyle=appearance.layer_colors.tattoo;paint.fillRect(0,0,ink.width,ink.height);}ctx.globalAlpha=opacity;ctx.drawImage(ink,0,0);ctx.globalAlpha=1;}
  if(makeup){const strength=appearance.makeup_strength??.55;for(const zone of [{x:.5,y:.73,rx:.09,ry:.025,c:appearance.makeup_lip_color},{x:.38,y:.59,rx:.075,ry:.055,c:appearance.makeup_blush_color},{x:.62,y:.59,rx:.075,ry:.055,c:appearance.makeup_blush_color},{x:.39,y:.47,rx:.055,ry:.02,c:appearance.makeup_eye_color},{x:.61,y:.47,rx:.055,ry:.02,c:appearance.makeup_eye_color}]){ctx.save();ctx.translate(zone.x*canvas.width,zone.y*canvas.height);ctx.scale(zone.rx*canvas.width,zone.ry*canvas.height);const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,zone.c||'#a4495c');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.globalAlpha=strength*.6;ctx.fillRect(-1,-1,2,2);ctx.restore();}}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=base.map.colorSpace;texture.flipY=base.map.flipY;if(material.map!==base.map)material.map?.dispose();material.map=texture;material.needsUpdate=true;
 });});
}