// Sapphire Sumi art policy: only the registered scene IDs use cinematic backdrops.
// All labels, values, icons and controls remain independent from the art.
import { UI_SCREENS } from './uiCatalog.mjs';
export const ART_ROOT='/fantasybattle/sapphire';
const full={ '01':'title-original','02':'sanctuary','03':'sanctuary','14':'celestial','15':'moonlit','19':'celestial','20':'sanctuary','31':'ruins','32':'celestial','35':'wilds','36':'ruins','38':'celestial','42':'wilds','44':'celestial','45':'celestial','48':'title-original' };
const ambient={'05':'sanctuary','06':'moonlit','07':'wilds','08':'wilds','11':'sanctuary','12':'celestial','16':'wilds','17':'ruins','18':'sanctuary','21':'moonlit','22':'ruins','23':'ruins','24':'moonlit','25':'wilds','26':'sanctuary','27':'celestial','28':'celestial','29':'wilds','30':'sanctuary','33':'sanctuary','34':'wilds','43':'wilds','46':'sanctuary'};
export function artFor(id,running=false){
 const s=UI_SCREENS[id]; if(!s)return {mode:'transparent',asset:null};
 if(full[id])return {mode:'cinematic',asset:full[id]};
 if(ambient[id]&&!running)return {mode:'cinematic',asset:ambient[id]};
 if(s.mode==='hud'||s.mode==='toast')return {mode:'transparent',asset:null};
 return {mode:'overlay',asset:null};
}
export function artUrl(asset){return asset?ART_ROOT+'/backgrounds/'+asset+'.webp':null;}
const petal='<path d="M0 0 C-11 -5 -12 -18 0 -21 C12 -18 11 -5 0 0Z" fill="url(#petal)" stroke="#f7dce8" stroke-opacity=".5" stroke-width=".65"/>';
const blossom=(x,y,scale)=>'<g transform="translate('+x+' '+y+') scale('+scale+')">'+[0,72,144,216,288].map(a=>'<g transform="rotate('+a+')">'+petal+'</g>').join('')+'<circle r="3.7" fill="#e9c98c"/><circle r="1.6" fill="#fff4cd"/></g>';
const corner=(x,y,sx,sy,ornate)=>'<g transform="translate('+x+' '+y+') scale('+sx+' '+sy+')"><path d="M2 64 C4 43 8 27 29 15 C42 8 54 8 68 3 M2 45 C14 22 33 11 51 9 M9 33 Q20 18 34 22 Q23 29 9 33 M23 16 Q33 4 46 8 Q36 17 23 16" fill="none" stroke="url(#gold)" stroke-width="1.8" stroke-linecap="round"/><path d="M2 4 L14 2 L2 14Z" fill="#e9cb93"/>'+(ornate?blossom(19,20,.56)+blossom(41,9,.35):'')+'</g>';
// Text-free vector layouts. The authored path washes are static, with no per-frame
// SVG turbulence, backdrop-filter or GPU shader overhead.
const frameCache=new Map();
export function makeSapphireTemplate(id){
 if(frameCache.has(id))return frameCache.get(id);
 const s=UI_SCREENS[id];if(!s)return '';
 const ornate=!['hud','toast','modal','loading'].includes(s.mode);
 const hud=['hud','toast'].includes(s.mode);
 const minimal=s.mode==='loading'||s.mode==='modal';
 const defs='<defs><linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#080e20" stop-opacity=".95"/><stop offset=".48" stop-color="#152849" stop-opacity=".91"/><stop offset=".83" stop-color="#214b83" stop-opacity=".79"/><stop offset="1" stop-color="#3976a7" stop-opacity=".62"/></linearGradient><linearGradient id="gold"><stop stop-color="#98744b" stop-opacity=".45"/><stop offset=".48" stop-color="#fff0c4"/><stop offset=".64" stop-color="#d8b779"/><stop offset="1" stop-color="#9f8055" stop-opacity=".55"/></linearGradient><linearGradient id="wash" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#2755a0" stop-opacity=".12"/><stop offset=".65" stop-color="#78c9ed" stop-opacity=".39"/><stop offset="1" stop-color="#e4eafc" stop-opacity=".06"/></linearGradient><radialGradient id="petal"><stop stop-color="#fff5ed"/><stop offset=".7" stop-color="#edc8e2"/><stop offset="1" stop-color="#9b96c9"/></radialGradient><linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f6dfab" stop-opacity=".7"/><stop offset=".36" stop-color="#c0a477" stop-opacity=".12"/><stop offset=".72" stop-color="#75bddc" stop-opacity=".14"/><stop offset="1" stop-color="#ebd6a6" stop-opacity=".58"/></linearGradient><linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#cdeaff" stop-opacity=".12"/><stop offset=".16" stop-color="#cdeaff" stop-opacity="0"/></linearGradient></defs>';
 const panels=s.layout.map(([x,y,w,h],i)=>{
  x=Math.round(x*1600);y=Math.round(y*900);w=Math.round(w*1600);h=Math.round(h*900);
  const r=Math.min(22,Math.floor(h/6),Math.floor(w/6));const clip='panel'+i;
  const wash=ornate?'<g clip-path="url(#'+clip+')"><path d="M'+x+' '+(y+h*.74)+' Q'+(x+w*.25)+' '+(y+h*.53)+' '+(x+w*.48)+' '+(y+h*.83)+' T'+(x+w)+' '+(y+h*.56)+' V'+(y+h)+' H'+x+'Z" fill="url(#wash)"/><path d="M'+x+' '+(y+h*.92)+' C'+(x+w*.22)+' '+(y+h*.66)+' '+(x+w*.48)+' '+(y+h*.97)+' '+(x+w*.73)+' '+(y+h*.83)+' S'+(x+w*.97)+' '+(y+h*.61)+' '+(x+w)+' '+(y+h*.67)+'" stroke="#a8d6f7" stroke-opacity=".15" stroke-width="2" fill="none"/></g>':'';
  const c= hud||minimal?'':[[x+6,y+6,1,1],[x+w-6,y+6,-1,1],[x+6,y+h-6,1,-1],[x+w-6,y+h-6,-1,-1]].map(a=>corner(...a,ornate&&w>250&&h>160)).join('');
  return '<g><clipPath id="'+clip+'"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'"/></clipPath><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="url(#ink)" stroke="url(#edge)" stroke-width="'+(hud?1:1.5)+'"/>'+wash+'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="url(#sheen)"/><rect x="'+(x+5)+'" y="'+(y+5)+'" width="'+(w-10)+'" height="'+(h-10)+'" rx="'+Math.max(3,r-5)+'" fill="none" stroke="#ebd6a6" stroke-opacity=".10"/>'+c+'</g>';
 }).join('');
 const rule=ornate?'<path d="M48 114 Q405 106 766 114 M834 114 Q1195 106 1552 114" fill="none" stroke="url(#gold)" stroke-width="1.8"/><path d="M800 102 l12 12 -12 12 -12 -12Z" fill="#d8b779" stroke="#fff2cb"/>'+blossom(772,114,.32)+blossom(828,114,.32):'';
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">'+defs+panels+rule+'</svg>';frameCache.set(id,svg);return svg;
}

const urlCache=new Map();
export function templateUrl(id){if(!Object.hasOwn(UI_SCREENS,id))return '';if(!urlCache.has(id))urlCache.set(id,'data:image/svg+xml,'+encodeURIComponent(makeSapphireTemplate(id)));return urlCache.get(id);}


// Original modular art hosted in the owner's Base44 media library, staged for
// in-game preview. Only these explicitly uploaded URLs are accepted. The
// original local-asset registry is reserved for final, approved repository art.
export const STAGED_ORIGINAL_ART=Object.freeze({
 '16':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/eb6574a6b3bccee31e814d8b0f2bfb0f_fantasy-battle-16-runtime.webp',source:'Original Fantasy Adventure 48 UI Template Kit — 16-merchant-shop.jpg',mode:'full',wideOnly:true}),
 '38':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/615d231c91a58e20b59cf627ef6f6f5f_fantasy-battle-38-runtime.webp',source:'Original Fantasy Battle template batch 09 — 38.webp',mode:'full',wideOnly:true}),
 '31':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/32997036482513c5bdeb66ec6afe47a7_fantasy-battle-31-runtime.webp',source:'Original Fantasy Battle template batch 09 — 31.webp',mode:'full',wideOnly:true}),
 '15':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/d46fb7d39e5a2b4cf2214092a7026269_fantasy-battle-15-runtime.webp',source:'Original Fantasy Adventure 48 UI Template Kit — 15-battle-defeat.jpg',mode:'full',wideOnly:true}),
 '14':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/5674616bb5c40b4ef551180cd911c591_fantasy-battle-14-runtime.webp',source:'Original Fantasy Adventure 48 UI Template Kit — 14-battle-victory.jpg',mode:'full',wideOnly:true}),
 '10':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/572b4a4c7d43c1651f8f347ba1fd962a_fantasy-battle-10-runtime.webp',source:'Original Fantasy Battle modular template batch 16 — 10.webp (transparent HUD)',mode:'full',wideOnly:true,transparent:true}),
 '09':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/d75b4237b6f59126ada8f220e01aed09_fantasy-battle-09-runtime.webp',source:'Original Fantasy Battle modular template batch 17 — 09.webp (transparent HUD)',mode:'full',wideOnly:true,transparent:true}),
 '36':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/80f9da3c1b678508c6935a5a5d362610_fantasy-battle-36-runtime.webp',source:'Original Fantasy Battle modular template batch 15 — 36.webp',mode:'full',wideOnly:true}),
 '23':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/c3b60ab190dfe7324c2acaee32faa98f_fantasy-battle-23-runtime.webp',source:'Warden of Tides: Dungeon Entrance.png — original modular template batch 12',mode:'full',wideOnly:true}),
 '44':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/b78e16460dbfea412253294657f58f57_fantasy-battle-44-runtime.webp',source:'Original Fantasy Battle template batch 05 — 44.webp',mode:'full',wideOnly:true}),
 '43':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/e4461c750f548815ef2205f8a72c9cc7_fantasy-battle-43-runtime.webp',source:'Sapphire Sumi Quest Acceptance.png — original template batch 05',mode:'full',wideOnly:true}),
 '13':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/3453551f902f4b0a8a1071f521df280e_fantasy-battle-13-runtime.webp',source:'Original Fantasy Battle modular template batch 18 — 13.webp',mode:'full',wideOnly:true}),
 '42':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/84bbeeb0f9ebe8454b323d0df80ba339_fantasy-battle-42-runtime.webp',source:'Original Fantasy Battle template batch 06 — 42.webp',mode:'full',wideOnly:true}),
 '25':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/1aa3ce330b2183cc03f419793aa64ccf_fantasy-battle-25-runtime.webp',source:'Sapphire Sumi Fast Travel Map.png — original template batch 03',mode:'full',wideOnly:true}),
 '08':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/c7143e784bf8fb40de82d21e287d3abd_fantasy-battle-08-runtime.webp',source:'Original Fantasy Battle template batch 04 — 08.webp',mode:'full',wideOnly:true}),
 '07':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/4a2c142bb20f29bead0b620fa6903214_fantasy-battle-07-runtime.webp',source:'Original Fantasy Adventure 48 UI Template Kit — 07-world-map.jpg',mode:'full',wideOnly:true}),
 '30':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/1bc94f4f4c30f8fde38b9ac3d52fd283_fantasy-battle-30-runtime.webp',source:'Fantasy RPG Relationships & Bonds UI.png — original modular template batch 15',mode:'full',wideOnly:true}),
 '26':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/4869206b950ade4be0dc82c5fe237c6e_fantasy-battle-26-runtime.webp',source:'Lyria’s Temple Cleric Recruitment.png — original template batch 11',mode:'full',wideOnly:true}),
 '11':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/54a46941731d8e937e7d0d707c625275_fantasy-battle-11-runtime.webp',source:'Fantasy Battle original modular template batch 17 — Party Formation',mode:'full',wideOnly:true}),
 '45':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/0f182968be4f244f18522e6a0c5f7e5e_fantasy-battle-45-runtime.webp',source:'Moonlit Crescent Skill Unlocked.png — original template batch 07',mode:'full',wideOnly:true}),
 '32':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/06144fad8ee3f92ba85ebab077dd28ea_fantasy-battle-32-runtime.webp',source:'Aoi’s Sapphire Level-Up Ceremony.png — original template batch 08',mode:'full',wideOnly:true}),
 '12':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/2d8c26651d4dbb6d379744abbf28b5fa_fantasy-battle-12-runtime.webp',source:'Fantasy Battle original modular templates batch 18 — Skillbook',mode:'full',wideOnly:true}),
 '27':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/9e862ab4de9ba85fc9a2cc24bbcff4f9_fantasy-battle-27-runtime.webp',source:'Sapphire Blossom Appearance Screen.png — original modular template batch 13',mode:'full',wideOnly:true}),
 '01':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/5f168663ac580c456e81ad1f56f83326_main-menu.webp',source:'Fantasy Adventure UI Design Atlas — main menu',mode:'full',wideOnly:true}),
 '02':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/99ac60466316703a6a3aceaa6923d4d1_load-menu.webp',source:'Fantasy Adventure UI Design Atlas — load game',mode:'full',wideOnly:true}),
 '03':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/797d648534099880a99be0c2e86f9287_03-runtime.webp',source:'Fantasy Adventure UI Design Atlas — settings',mode:'full',wideOnly:true}),
 '19':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/f264a69d9494c6168f6e5543f25b3644_19-runtime.webp',source:'Sapphire Sumi Character Creation UI.png',mode:'full',wideOnly:true}),
 '20':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/18f26741d8c78b1f1dafab73fa4d2028_20-runtime.webp',source:'Sapphire Sanctuary Character Selection.png',mode:'full',wideOnly:true}),
 '18':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/3280023d9439c8d1dbe6b4c80b2d5160_18-runtime.webp',source:'Fantasy Adventure UI Design Atlas — save game',mode:'full',wideOnly:true}),
 '06':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/c98396f7d6948b83742e57964147448d_fantasy-battle-06-runtime.webp',source:'Fantasy Adventure UI Design Atlas — equipment and inventory',mode:'full',wideOnly:true}),
 '05':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/9c77ffda749ae7f007813d6cc119933f_05-runtime.webp',source:'Fantasy Adventure UI Design Atlas — character statistics',mode:'full',wideOnly:true}),
 '04':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/9595828de0c456dab253aa81e63630d4_04-runtime.webp',source:'Fantasy Adventure UI Design Atlas — pause menu',mode:'full',wideOnly:true}),
 '47':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/5e35cd592d154009cefdc9437e92dbc1_47.webp',source:'Sapphire Sumi Fantasy Connection Error.png',mode:'full',wideOnly:true}),
 '35':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/4a7082e7b9748187d986dca421c14dbd_35.webp',source:'Fallen Sky: Floating Citadel Loading Screen.png',mode:'full'}),
 '40':Object.freeze({url:'https://media.base44.com/images/public/6af625cd654fa5b8954442ce/ffe161b8307edf0760f05a357f4b0713_40.webp',source:'Fantasy Adventure Confirmation Screen.png',mode:'full'}),
});
export const ORIGINAL_SAVE_PLAQUE='https://media.base44.com/images/public/6af625cd654fa5b8954442ce/1ee119108cb7a71bec9a7253562db5fa_fantasy-battle-autosave-plaque.webp';
export function stagedOriginalFor(id){return Object.hasOwn(STAGED_ORIGINAL_ART,id)?STAGED_ORIGINAL_ART[id]:null;}
