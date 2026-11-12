// Combat / Quest 52.5–52.9: private player-authored sky chapter metadata.
// These are local captions, not authenticated event facts or publication consent.
import {
 ECHO_ALL_MONTHS,ECHO_UNDATED_MONTH,
} from './echoChronicleMonthlySky.js';
import {projectFeaturedEchoStars} from './echoChronicleCurationModel.js';

export const MAX_ECHO_SKY_CHAPTERS=36;
export const MAX_ECHO_SKY_TITLE=72;
export const MAX_ECHO_SKY_REFLECTION=600;

const monthKey=key=>key===ECHO_ALL_MONTHS||key===ECHO_UNDATED_MONTH||
 (typeof key==='string'&&/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(key));
const titleText=value=>typeof value==='string'
 ?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,MAX_ECHO_SKY_TITLE):'';
const reflectionText=value=>typeof value==='string'
 ?value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g,' ')
  .trim().slice(0,MAX_ECHO_SKY_REFLECTION):'';
const parseTimestamp=value=>{
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return null;
 return value;
};

export function normalizeEchoSkyChapters(raw){
 const input=Array.isArray(raw)?raw:[];
 const seen=new Set(),out=[];
 for(const item of input){
  if(!item||typeof item!=='object'||!monthKey(item.month)||
     seen.has(item.month))continue;
  const title=titleText(item.title),reflection=reflectionText(item.reflection);
  if(!title&&!reflection)continue;
  seen.add(item.month);
  out.push(Object.freeze({
   month:item.month,title,reflection,
   updatedAt:parseTimestamp(item.updatedAt),
  }));
  if(out.length>=MAX_ECHO_SKY_CHAPTERS)break;
 }
 return Object.freeze(out);
}

export function findEchoSkyChapter(chapters,month){
 if(!monthKey(month))return null;
 return normalizeEchoSkyChapters(chapters).find(entry=>entry.month===month)||null;
}

/**
 * A sky chapter can only be written while the character has at least one
 * actual, user-curated and still-readable memory in that selected month.
 * It cannot create a memory, quest, party relationship or official timestamp.
 */
export function nextEchoSkyChapter(chapters,{
 month,title,reflection,entries,featuredIds,now=Date.now,
}={}){
 if(!monthKey(month))return Object.freeze({ok:false,reason:'invalid-month'});
 const existing=normalizeEchoSkyChapters(chapters);
 const available=projectFeaturedEchoStars(entries,featuredIds,month);
 if(!available.length)return Object.freeze({ok:false,reason:'no-chosen-stars'});
 const textTitle=titleText(title),textReflection=reflectionText(reflection);
 if(!textTitle&&!textReflection)
  return Object.freeze({ok:false,reason:'empty-chapter'});
 if((typeof title==='string'&&title.length>MAX_ECHO_SKY_TITLE)||
    (typeof reflection==='string'&&reflection.length>MAX_ECHO_SKY_REFLECTION))
  return Object.freeze({ok:false,reason:'too-long'});
 const timestamp=typeof now==='function'?now():NaN;
 if(!Number.isSafeInteger(timestamp)||timestamp<1||timestamp>8.64e15)
  return Object.freeze({ok:false,reason:'invalid-clock'});
 const chapter=Object.freeze({
  month,title:textTitle,reflection:textReflection,
  updatedAt:new Date(timestamp).toISOString(),
 });
 const found=existing.some(entry=>entry.month===month);
 if(!found&&existing.length>=MAX_ECHO_SKY_CHAPTERS)
  return Object.freeze({ok:false,reason:'chapter-limit'});
 const result=[chapter,...existing.filter(entry=>entry.month!==month)];
 return Object.freeze({ok:true,chapter,chapters:Object.freeze(result)});
}

export function nextDeletedEchoSkyChapter(chapters,month){
 if(!monthKey(month))return Object.freeze({ok:false,reason:'invalid-month'});
 const existing=normalizeEchoSkyChapters(chapters);
 if(!existing.some(item=>item.month===month))
  return Object.freeze({ok:false,reason:'not-found'});
 return Object.freeze({ok:true,
  chapters:Object.freeze(existing.filter(item=>item.month!==month)),
 });
}
