// Combat / Quest 54.7–55.2: the private journey behind a saved sky.
// Read-only projection of actual selected Chronicle records. Links are shown
// only for explicit player-authored personal continuations with a real parent.
import {ECHO_ALL_MONTHS} from './echoChronicleMonthlySky.js';
import {projectFeaturedEchoStars} from './echoChronicleCurationModel.js';
import {isChroniclePhoto} from './echoChroniclePhoto.js';

const validId=id=>typeof id==='string'&&id.length>0&&id.length<=128&&
 !/[\u0000-\u001f\u007f]/.test(id);
const readable=(text,max)=>typeof text==='string'
 ?text.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const timestamp=date=>{
 if(typeof date!=='string')return null;
 const n=Date.parse(date);
 return Number.isFinite(n)?n:null;
};
const dayKey=time=>{
 if(time===null)return 'undated';
 const d=new Date(time);
 return [String(d.getFullYear()).padStart(4,'0'),
  String(d.getMonth()+1).padStart(2,'0'),
  String(d.getDate()).padStart(2,'0')].join('-');
};
const dayLabel=time=>time===null?'Date not recorded':
 new Date(time).toLocaleDateString(undefined,{
  weekday:'short',year:'numeric',month:'short',day:'numeric',
 });
const sortedSaved=entries=>{
 const byId=new Map();
 for(const entry of Array.isArray(entries)?entries:[]){
  if(!entry||!validId(entry.id)||byId.has(entry.id))continue;
  byId.set(entry.id,entry);
 }
 return byId;
};
const frozenEmpty=()=>Object.freeze({
 groups:Object.freeze([]),total:0,dayCount:0,photoCount:0,
 chosenBranchCount:0,month:ECHO_ALL_MONTHS,
});

export function buildEchoChronicleJourneyTrail(
 entries=[],featuredIds=[],month=ECHO_ALL_MONTHS,
){
 const byId=sortedSaved(entries);
 const chosen=projectFeaturedEchoStars([...byId.values()],featuredIds,month);
 if(!chosen.length)return Object.freeze({...frozenEmpty(),month});
 const chosenSet=new Set(chosen.map(entry=>entry.id));
 const ordered=[...chosen].sort((a,b)=>{
  const ta=timestamp(a.date),tb=timestamp(b.date);
  if(ta===null&&tb!==null)return 1;
  if(tb===null&&ta!==null)return -1;
  return (ta??0)-(tb??0)||a.id.localeCompare(b.id);
 });
 const groups=[],groupMap=new Map();
 let photoCount=0,branchCount=0;
 for(const entry of ordered){
  const when=timestamp(entry.date),key=dayKey(when);
  const parent=entry.source==='personal'&&validId(entry.parentId)&&
   entry.parentId!==entry.id?byId.get(entry.parentId):null;
  const hasParent=!!parent;
  if(hasParent)branchCount++;
  const hasPhoto=isChroniclePhoto(entry.photoDataUri);
  if(hasPhoto)photoCount++;
  const step=Object.freeze({
   id:entry.id,title:readable(entry.title||entry.partnerName,100)||'Saved memory',
   source:entry.source==='personal'?'personal':'shared',
   context:readable(entry.context,40)||'recorded moment',
   location:readable(entry.region,90)||'Location not recorded',
   at:when===null?null:new Date(when).toISOString(),
   hasPhoto,
   parent:hasParent?Object.freeze({
    id:parent.id,
    title:readable(parent.title||parent.partnerName,100)||'Saved memory',
    inSky:chosenSet.has(parent.id),
    otherDay:dayKey(timestamp(parent.date))!==key,
   }):null,
  });
  if(!groupMap.has(key)){
   const group={key,label:dayLabel(when),steps:[]};
   groupMap.set(key,group);groups.push(group);
  }
  groupMap.get(key).steps.push(step);
 }
 return Object.freeze({
  groups:Object.freeze(groups.map(group=>Object.freeze({
   key:group.key,label:group.label,
   steps:Object.freeze(group.steps),
  }))),
  total:ordered.length,dayCount:groups.length,
  photoCount,chosenBranchCount:branchCount,month,
 });
}
