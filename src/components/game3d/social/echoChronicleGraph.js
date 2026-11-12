// Combat / Quest 48.1–48.4: bounded factual constellation with
// selected-star paging and honest off-page parent references.
// Chronological edges never imply a relationship, quest, or game reward.
const moment=date=>{
 const value=Date.parse(date||'');
 return Number.isFinite(value)?value:0;
};
const lane=entry=>entry.context==='boss'?27:
 entry.context==='training'?38:
 entry.context==='exploration'?61:
 entry.context==='quest'?47:
 entry.context==='reflection'?74:68;
const boundedSize=pageSize=>Number.isInteger(pageSize)?
 Math.max(2,Math.min(9,pageSize)):7;
const ordered=entries=>{
 const safe=(Array.isArray(entries)?entries:[])
  .filter(e=>e&&typeof e.id==='string'&&e.id.length>0&&e.id.length<=128);
 return [...new Map(safe.map(e=>[e.id,e])).values()]
  .sort((a,b)=>moment(a.date)-moment(b.date)||a.id.localeCompare(b.id));
};
export function echoChroniclePageForSelected(entries=[],selectedId,pageSize=7){
 const records=ordered(entries),index=records.findIndex(e=>e.id===selectedId);
 if(index<0)return 0;
 return Math.floor((records.length-1-index)/boundedSize(pageSize));
}
export function echoChronicleRelatedPages(entries=[],selectedId){
 const records=ordered(entries),byId=new Map(records.map(e=>[e.id,e]));
 const selected=byId.get(selectedId);
 if(!selected)return Object.freeze({parent:null,children:Object.freeze([])});
 // Only saved, explicitly chosen references count as a branch.
 const parent=selected.parentId&&byId.get(selected.parentId)||null;
 const children=records.filter(e=>e.parentId===selectedId&&e.id!==selectedId);
 return Object.freeze({parent:parent&&parent.id!==selectedId?parent:null,
  children:Object.freeze(children)});
}
export function buildEchoChronicleGraph(entries=[],{
 page=0,pageSize=7,
}={}){
 const distinct=ordered(entries),limit=boundedSize(pageSize);
 const pageCount=Math.max(1,Math.ceil(distinct.length/limit));
 const pageIndex=Number.isInteger(page)?Math.max(0,Math.min(pageCount-1,page)):0;
 const end=Math.max(0,distinct.length-pageIndex*limit),start=Math.max(0,end-limit);
 const visible=distinct.slice(start,end);
 const nodes=visible.map((entry,index)=>{
  const x=visible.length===1?50:12+(76*index/(visible.length-1));
  const y=lane(entry)+(index%2===0?-6:6);
  return Object.freeze({id:entry.id,entry,x,y});
 });
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const allById=new Map(distinct.map(e=>[e.id,e]));
 const edges=nodes.slice(1).map((node,index)=>{
  const parent=byId.get(node.entry.parentId);
  const from=parent&&parent.id!==node.id?parent:nodes[index];
  return Object.freeze({
   id:node.id,fromId:from.id,toId:node.id,
   x1:from.x,y1:from.y,x2:node.x,y2:node.y,
   kind:parent&&parent.id!==node.id?'chosen-branch':'time-order',
  });
 });
 const offPageBranches=nodes.filter(node=>
  node.entry.parentId&&node.entry.parentId!==node.id&&
  !byId.has(node.entry.parentId)&&allById.has(node.entry.parentId)
 ).map(node=>Object.freeze({
  childId:node.id,parentId:node.entry.parentId,
  parentTitle:String(allById.get(node.entry.parentId).title||
   allById.get(node.entry.parentId).partnerName||'Saved memory').slice(0,80),
 }));
 return Object.freeze({
  nodes:Object.freeze(nodes),edges:Object.freeze(edges),
  offPageBranches:Object.freeze(offPageBranches),
  page:pageIndex,pageCount,total:distinct.length,
 });
}
