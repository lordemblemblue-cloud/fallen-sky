// Combat / Quest 50.3–50.7: PURE curated private constellation model.
// Star IDs are user selections of already-saved memories, never proof of
// a relationship, quest result, social consent, or public publication.
import {ECHO_ALL_MONTHS,echoChronicleMonthKey} from './echoChronicleMonthlySky.js';

export const MAX_ECHO_SKY_STARS=60;
export const MAX_ECHO_MONTH_STARS=6;
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=128&&
 !/[\u0000-\u001f\u007f]/.test(id);

export function normalizeFeaturedEchoIds(raw){
 if(!Array.isArray(raw))return Object.freeze([]);
 const seen=new Set(),list=[];
 for(const id of raw){
  if(!validId(id)||seen.has(id))continue;
  seen.add(id);list.push(id);
  if(list.length>=MAX_ECHO_SKY_STARS)break;
 }
 return Object.freeze(list);
}
const uniqueSaved=entries=>{
 const map=new Map();
 if(!Array.isArray(entries))return map;
 for(const entry of entries){
  if(!entry||!validId(entry.id)||map.has(entry.id))continue;
  map.set(entry.id,entry);
 }
 return map;
};
export function projectFeaturedEchoStars(entries,curatedIds,month=ECHO_ALL_MONTHS){
 const saved=uniqueSaved(entries),ids=normalizeFeaturedEchoIds(curatedIds);
 return Object.freeze(ids.map(id=>saved.get(id)).filter(entry=>entry&&(
  month===ECHO_ALL_MONTHS||echoChronicleMonthKey(entry.date)===month
 )));
}
export function getFeaturedEchoMonthCounts(entries,curatedIds){
 const counts={};
 for(const entry of projectFeaturedEchoStars(entries,curatedIds)){
  const month=echoChronicleMonthKey(entry.date);
  counts[month]=(counts[month]||0)+1;
 }
 return Object.freeze(counts);
}
export function nextFeaturedEchoSelection(entries,curatedIds,id){
 if(!validId(id))return Object.freeze({ok:false,reason:'invalid-id'});
 const current=normalizeFeaturedEchoIds(curatedIds);
 // Unpinning always takes precedence; never requires a stale session record.
 if(current.includes(id))return Object.freeze({
  ok:true,featured:false,ids:Object.freeze(current.filter(item=>item!==id)),
 });
 const saved=uniqueSaved(entries),entry=saved.get(id);
 if(!entry)return Object.freeze({ok:false,reason:'not-saved'});
 if(current.length>=MAX_ECHO_SKY_STARS)
  return Object.freeze({ok:false,reason:'sky-full'});
 const sameMonth=projectFeaturedEchoStars(entries,current,
  echoChronicleMonthKey(entry.date)).length;
 if(sameMonth>=MAX_ECHO_MONTH_STARS)
  return Object.freeze({ok:false,reason:'month-full'});
 return Object.freeze({
  ok:true,featured:true,ids:Object.freeze([id,...current]),
 });
}
