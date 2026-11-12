// Combat / Quest 56.9–57.4 — read-only memory Crossroads.
// Uses saved, explicitly selected Chronicle records ONLY. A displayed
// traveler name is a historical name label, not a verified unique identity.
// No quest, matchmaking, social graph, public sharing or game reward authority.
import {projectFeaturedEchoStars} from './echoChronicleCurationModel.js';
import {ECHO_ALL_MONTHS} from './echoChronicleMonthlySky.js';

const validId=value=>typeof value==='string'&&value.length>0&&value.length<=128&&
 !/[\u0000-\u001f\u007f]/.test(value);
const label=(value,max=80)=>typeof value==='string'
 ?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const stableDate=value=>{
 const time=typeof value==='string'?Date.parse(value):NaN;
 return Number.isFinite(time)?new Date(time).toISOString():null;
};
const savedMap=entries=>{
 const saved=new Map();
 for(const entry of Array.isArray(entries)?entries:[]){
  if(!entry||!validId(entry.id)||saved.has(entry.id))continue;
  saved.set(entry.id,entry);
 }
 return saved;
};
const recordedStep=entry=>Object.freeze({
 id:entry.id,
 title:label(entry.title||entry.partnerName,100)||'Saved moment',
 date:stableDate(entry.date),
 source:entry.source==='personal'?'personal':'shared',
});
const order=(a,b)=>b.count-a.count||a.title.localeCompare(b.title);
const grouped=(selected,keyFor)=>{
 const groups=new Map();
 for(const entry of selected){
  const title=label(keyFor(entry),80);
  if(!title)continue;
  const key=title.toLocaleLowerCase();
  if(!groups.has(key))groups.set(key,{title,records:[],personal:0,shared:0});
  const group=groups.get(key);
  group.records.push(recordedStep(entry));
  if(entry.source==='personal')group.personal++;else group.shared++;
 }
 return Object.freeze([...groups.values()].map(group=>Object.freeze({
  title:group.title,count:group.records.length,
  records:Object.freeze(group.records),
  personal:group.personal,shared:group.shared,
 })).sort(order));
};

export function buildEchoChronicleCrossroads(
 entries=[],featuredIds=[],month=ECHO_ALL_MONTHS,
){
 const saved=savedMap(entries);
 const chosen=projectFeaturedEchoStars([...saved.values()],featuredIds,month);
 const selectedIds=new Set(chosen.map(entry=>entry.id));
 const places=grouped(chosen,entry=>entry.region);
 const travelerNames=grouped(chosen.filter(entry=>entry.source!=='personal'),
  entry=>entry.partnerName);
 const continuations=chosen.flatMap(entry=>{
  if(entry.source!=='personal'||!validId(entry.parentId)||
   entry.parentId===entry.id)return [];
  const parent=saved.get(entry.parentId);
  if(!parent)return [];
  return [Object.freeze({
   child:recordedStep(entry),parent:recordedStep(parent),
   parentInSelectedSky:selectedIds.has(parent.id),
  })];
 });
 return Object.freeze({
  places,travelerNames,continuations:Object.freeze(continuations),
  selectedCount:chosen.length,
  unlocatedCount:chosen.filter(entry=>!label(entry.region)).length,
  savedSharedCount:chosen.filter(entry=>entry.source!=='personal').length,
 });
}
