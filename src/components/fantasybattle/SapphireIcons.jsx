// Small text-free, self-contained vector illustrations for the existing item and skill catalog.
// Icons are decorative; the actual item and skill labels remain accessible HTML.
const paths={
 starterBow:<><path d="M13 6Q55 32 13 58M13 6L13 58" fill="none" stroke="#eacb8f" strokeWidth="3"/><path d="M8 32h43m-7-5 8 5-8 5" stroke="#d8f5ff" strokeWidth="2" fill="none"/></>,
 sapphireBow:<><path d="M11 5Q52 16 38 32Q52 48 11 59L18 49Q43 33 18 15Z" fill="url(#gem)" stroke="#eacb8f" strokeWidth="1.8"/><path d="M11 5v54M9 32h46m-9-6 10 6-10 6" stroke="#d8f5ff" strokeWidth="1.8" fill="none"/><path d="M38 23l5 9-5 9-5-9z" fill="#d7fbff"/></>,
 recoveryTonic:<><path d="M25 8h14v10l9 13q13 24-16 26Q3 55 16 31l9-13z" fill="#77c9f1" fillOpacity=".5" stroke="#eacb8f" strokeWidth="2"/><path d="M19 36q8-6 16 0t13 0l3 12q-6 12-19 10T13 48Z" fill="url(#gem)"/><rect x="24" y="5" width="16" height="9" rx="2" fill="#eacb8f"/><path d="M22 32q-6 10-2 15" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></>,
 sapphireOre:<><path d="M6 47l9-18 11 5L39 6 54 24l5 24-22 13-17-3Z" fill="#172b59" stroke="#dfc68e" strokeWidth="1.5"/><path d="M22 45L39 6 46 31 37 55Z" fill="url(#gem)" stroke="#b1f4ff"/><path d="M39 6l15 18-8 7ZM15 29l7 16-16 2Z" fill="#85cafa"/><path d="M22 45l15 10-17 3Z" fill="#448ce0"/></>,
 quickShot:<><path d="M7 44L51 11l-5 15 10-2-14 13" fill="none" stroke="#d4faff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 32l22-18M16 48l19-13" stroke="#448ce0" strokeWidth="3" strokeLinecap="round"/></>,
 chargedShot:<><circle cx="32" cy="32" r="23" fill="none" stroke="#78c9ed" strokeWidth="2"/><path d="M10 49L53 10l-4 16 10-3-15 16" stroke="#fff1c4" strokeWidth="3" fill="none"/><path d="M32 8l3 13 12-4-10 10 10 8-13-3-4 14-2-14-13 3 10-9-9-10 12 4Z" fill="url(#gem)"/></>,
 volley:<>{[0,1,2].map((i)=><path key={i} d={'M'+(8+i*9)+' '+(41+i*6)+' L'+(43+i*5)+' '+(10+i*9)+' l-2 11 9-3'} stroke={i===1?'#fff0c4':'#a5e7ff'} strokeWidth="2.7" fill="none" strokeLinecap="round" strokeLinejoin="round"/>)}</>,
  swordSlash:<><path d="M13 52L45 10l9-3-1 10-32 39z" fill="#a5e7ff" stroke="#eacb8f"/><path d="M12 40l14 12M10 57l8-9" stroke="#eacb8f" strokeWidth="4"/></>,
  shieldBash:<><path d="M12 12l26-5 15 12-5 25-23 13L12 40z" fill="#2859b8" stroke="#eacb8f" strokeWidth="3"/><path d="M25 22h27m-9-8 12 8-12 8" fill="none" stroke="#fff1c4" strokeWidth="3"/></>,
  swordFlurry:<><path d="M6 52L48 8l-5 18M18 57L57 17l-3 18" fill="none" stroke="#c5f2ff" strokeWidth="5"/></>,
  daggerJab:<><path d="M12 48l22-34 21-7-8 21-31 25z" fill="#d1b5ff" stroke="#fff1c4"/><path d="M10 41l14 12" stroke="#eacb8f" strokeWidth="4"/></>,
  daggerLunge:<><path d="M8 49L53 9l-8 23-26 21z" fill="#d1b5ff" stroke="#fff1c4"/><path d="M8 35l18-17M26 55l17-12" stroke="#a28de4" strokeWidth="3"/></>,
  daggerFlurry:<>{[0,1,2].map(i=><path key={i} d={'M'+(7+i*8)+' '+(43+i*5)+'l28-30 10-4-4 11-28 29z'} fill="#d1b5ff" stroke="#fff1c4"/>)}</>,
  bulwark:<><path d="M32 5L56 15v20Q53 49 32 59 11 49 8 35V15Z" fill="#2859b8" stroke="#eacb8f" strokeWidth="3"/><path d="M32 12v39M15 25h34" stroke="#fff1c4" strokeWidth="4"/></>,
 spiritBolt:<><circle cx="32" cy="32" r="22" stroke="#83e4bc" strokeDasharray="4 5" fill="none"/><path d="M8 50L47 11l11-3-4 14-36 36Z" fill="#83e4bc" stroke="#e8ffe2"/></>,
 sentinelWard:<><path d="M32 5L56 15v20L32 59 8 35V15Z" fill="#425b83" stroke="#d9bd86" strokeWidth="3"/><path d="M32 14L46 32 32 49 18 32Z M32 18V46M21 32H43" fill="none" stroke="#f2da9e" strokeWidth="2"/></>,
 mistBarrage:<>{[0,1,2].map(i=><path key={i} d={'M'+(6+i*9)+' '+(40+i*7)+'l33-33 10-3-3 11-32 34z'} fill="#8ce9fa" stroke="#e9fbff"/>)}</>,
 celestialLance:<><circle cx="32" cy="32" r="24" stroke="#a5c9ff" fill="none"/><path d="M8 52L48 8l10-3-4 15-35 40Z" fill="#a5c9ff" stroke="#fff0c4" strokeWidth="2"/></>,
 starfall:<>{[0,1,2].map(i=><path key={i} d={'M'+(7+i*9)+' '+(40+i*7)+'l31-32 10-4-3 12-32 32z'} fill="#c29aef" stroke="#fff0c4"/>)}</>,
 eclipseRay:<><circle cx="32" cy="32" r="24" fill="#352344" stroke="#e77e99" strokeWidth="3"/><path d="M7 49L48 8 58 5 53 22 17 59Z" fill="#e77e99" stroke="#ffe1aa" strokeWidth="2"/></>,
 celestialWard:<><path d="M32 5L56 15v20L32 59 8 35V15Z" fill="#352344" stroke="#ffe1aa" strokeWidth="3"/><circle cx="32" cy="30" r="13" fill="none" stroke="#ffe1aa"/><path d="M32 15L38 30 32 45 26 30Z" fill="#ffe1aa"/></>,
 guard:<><path d="M32 6l22 9v19q0 14-22 24Q10 48 10 34V15Z" fill="url(#gem)" stroke="#eacb8f" strokeWidth="2.5"/><path d="M32 14l12 7v13q0 9-12 17-12-8-12-17V21z" stroke="#cbf7ff" strokeWidth="1.5" fill="none"/><path d="M32 22l4 10-4 10-4-10z" fill="#fff1c4"/></>
};
import {useId} from 'react';
import {GEAR} from './core/equipmentCatalog.mjs';
import {WEAPONS} from './core/weaponCatalog.mjs';
function GearArt({item}){const color='#'+item.color.toString(16).padStart(6,'0'),trim='#'+item.trim.toString(16).padStart(6,'0');return item.slot==='armor'?<><path d={item.style==='plate'?'M5 17L19 6 32 13 45 6 59 17 49 35 47 57H17L15 35Z':'M10 18L22 7 32 19 42 7 54 18 46 34 47 57H17L18 34Z'} fill={color} stroke={trim} strokeWidth="2.5"/><path d="M22 12L32 29 42 12M32 29V54M18 47H46" stroke={trim} strokeWidth="2" fill="none"/></>:<><path d={item.style==='dusk'?'M21 8H43L55 49 32 59 9 49Z':'M20 8H44L58 55 32 48 6 55Z'} fill={color} stroke={trim} strokeWidth="2.5"/><path d="M22 11L32 23 42 11M32 23V47" stroke={trim} strokeWidth="2" fill="none"/><circle cx="32" cy="23" r="4" fill={trim}/></>;}
function Icon({id,className}){
 const uid=useId().replace(/[^a-zA-Z0-9_-]/g,'');
 // Repeated icons must not share an SVG gradient id; set a local CSS variable
 // instead of attempting to mutate global SVG definitions.
 const art=Object.hasOwn(GEAR,id)?<GearArt item={GEAR[id]}/>:Object.hasOwn(paths,id)?paths[id]:Object.hasOwn(WEAPONS,id)?paths.sapphireBow:null;if(!art)return null;
 return <svg className={className} viewBox="0 0 64 64" aria-hidden="true" style={{'--icon-id':uid}}><rect x="1.5" y="1.5" width="61" height="61" rx="10" fill="#0a1730" stroke="#d6b87f" strokeOpacity=".75"/><defs><linearGradient id={'gem'+uid} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#193d82"/><stop offset=".5" stopColor="#448ce0"/><stop offset="1" stopColor="#d5f9ff"/></linearGradient></defs><g fill={'url(#gem'+uid+')'}>{replaceGem(art,uid)}</g></svg>;
}
import {Children,cloneElement,isValidElement} from 'react';
function replaceGem(node,uid){if(!isValidElement(node))return node;const props={};if(node.props.fill==='url(#gem)')props.fill='url(#gem'+uid+')';if(node.props.children)props.children=Children.map(node.props.children,c=>replaceGem(c,uid));return cloneElement(node,props);}
export function ItemArt({id}){return <Icon id={id} className="fa-item-art"/>;}
export function SkillArt({id}){return <Icon id={id} className="fa-skill-art"/>;}
