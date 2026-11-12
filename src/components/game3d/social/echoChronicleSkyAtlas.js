// Combat / Quest 53.6–54.1 — read-only private Sky Chapter atlas.
// A chapter is a player's private text, NOT a server-verified quest. Every
// displayed encounter/storyboard card is backed by a saved Chronicle record.
import {
 ECHO_ALL_MONTHS, ECHO_UNDATED_MONTH,echoChronicleMonthKey,
 echoChronicleMonthLabel,getEchoChronicleMonthBuckets,
} from './echoChronicleMonthlySky.js';
import {normalizeEchoSkyChapters} from './echoChronicleSkyChapters.js';
import {projectFeaturedEchoStars} from './echoChronicleCurationModel.js';
import {isChroniclePhoto} from './echoChroniclePhoto.js';

const legitimateMonth=month=>month===ECHO_ALL_MONTHS||
 month===ECHO_UNDATED_MONTH||
 (typeof month==='string'&&/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month));
const uniqueRecords=records=>{
 const result=[],seen=new Set();
 for(const entry of Array.isArray(records)?records:[]){
  if(!entry||typeof entry.id!=='string'||!entry.id||
    entry.id.length>128||seen.has(entry.id))continue;
  seen.add(entry.id);result.push(entry);
 }
 return result;
};
const dateNumber=value=>{
 const n=typeof value==='string'?Date.parse(value):NaN;
 return Number.isFinite(n)?n:null;
};
const cappedSize=size=>Number.isInteger(size)?
 Math.max(2,Math.min(12,size)):6;

// Returns a small, honest month index. Saved months are visible even if the
// user has no private caption. Authored chapters with temporarily missing
// memories remain labelled as unavailable rather than being deleted.
export function buildEchoSkyChapterAtlas({
 entries=[],featuredIds=[],chapters=[],
}={}){
 const records=uniqueRecords(entries);
 const buckets=getEchoChronicleMonthBuckets(records);
 const savedByMonth=new Map(buckets.map(bucket=>[bucket.key,bucket]));
 const chapterByMonth=new Map(normalizeEchoSkyChapters(chapters)
  .map(chapter=>[chapter.month,chapter]));
 const chosen=projectFeaturedEchoStars(records,featuredIds);
 const chosenByMonth=new Map();
 for(const entry of chosen){
  const month=echoChronicleMonthKey(entry.date);
  if(!chosenByMonth.has(month))chosenByMonth.set(month,[]);
  chosenByMonth.get(month).push(entry);
 }
 const months=new Set([
  ...savedByMonth.keys(),
  ...chapterByMonth.keys(),
 ]);
 // All Months represents a standalone personal note, not an invented month.
 if(!chapterByMonth.has(ECHO_ALL_MONTHS))months.delete(ECHO_ALL_MONTHS);
 const sorted=[...months].sort((a,b)=>{
  if(a===ECHO_ALL_MONTHS)return -1;
  if(b===ECHO_ALL_MONTHS)return 1;
  if(a===ECHO_UNDATED_MONTH)return 1;
  if(b===ECHO_UNDATED_MONTH)return -1;
  return b.localeCompare(a);
 });
 return Object.freeze(sorted.filter(legitimateMonth).map(month=>{
  const bucket=savedByMonth.get(month);
  const authored=chapterByMonth.get(month)||null;
  const monthChosen=month===ECHO_ALL_MONTHS?chosen:
   (chosenByMonth.get(month)||[]);
  const count=month===ECHO_ALL_MONTHS?records.length:(bucket?.count||0);
  const photos=monthChosen.filter(e=>isChroniclePhoto(e.photoDataUri)).length;
  return Object.freeze({
   month,label:echoChronicleMonthLabel(month),
   savedCount:count,chosenCount:monthChosen.length,
   photoCount:photos,hasChapter:!!authored,
   chapterTitle:authored?.title||'',
   excerpt:authored?.reflection?.slice(0,135)||'',
   lastEditedAt:authored?.updatedAt||null,
   available:monthChosen.length>0,
   source:'private-character-archive',
  });
 }));
}

// A real page-by-page scrapbook of the player's EXPLICIT chosen memories.
// Unlike a mock timeline, it cannot invent timestamps, photography, friends,
// rivalries, quest victories, or event descriptions.
export function buildEchoSkyStoryboard(entries,featuredIds,month=ECHO_ALL_MONTHS,{
 page=0,pageSize=6,
}={}){
 if(!legitimateMonth(month))
  return Object.freeze({cards:Object.freeze([]),page:0,pageCount:1,total:0});
 const chosen=projectFeaturedEchoStars(uniqueRecords(entries),featuredIds,month);
 const size=cappedSize(pageSize);
 const pageCount=Math.max(1,Math.ceil(chosen.length/size));
 const index=Number.isInteger(page)?Math.max(0,Math.min(pageCount-1,page)):0;
 const cards=chosen.slice(index*size,(index+1)*size).map(entry=>{
  const title=String(entry.title||entry.partnerName||'Saved memory').slice(0,100);
  const date=dateNumber(entry.date);
  return Object.freeze({
   id:entry.id,title,source:entry.source==='personal'?'personal':'shared',
   context:typeof entry.context==='string'?entry.context.slice(0,28):'',
   date:date===null?null:new Date(date).toISOString(),
   photoDataUri:isChroniclePhoto(entry.photoDataUri)?entry.photoDataUri:null,
   parentId:typeof entry.parentId==='string'&&entry.parentId!==entry.id?
    entry.parentId:null,
  });
 });
 return Object.freeze({cards:Object.freeze(cards),
  page:index,pageCount,total:chosen.length});
}
