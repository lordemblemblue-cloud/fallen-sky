// Combat / Quest 55.8–56.2. Factual filters over the EXISTING private
// journey projection; no search request or additional stored memory.
export const ECHO_JOURNEY_FILTERS=Object.freeze([
 Object.freeze({id:'all',label:'All moments'}),
 Object.freeze({id:'training',label:'Training'}),
 Object.freeze({id:'exploration',label:'Exploration'}),
 Object.freeze({id:'quest',label:'Quest reflections'}),
 Object.freeze({id:'shared',label:'Shared encounters'}),
 Object.freeze({id:'photos',label:'With photos'}),
 Object.freeze({id:'branches',label:'Chosen branches'}),
]);
const validFilters=new Set(ECHO_JOURNEY_FILTERS.map(item=>item.id));
const safeSearch=value=>typeof value==='string'
 ?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100).toLocaleLowerCase():'';
const matchesType=(step,filter)=>{
 if(filter==='all')return true;
 if(filter==='shared')return step.source==='shared';
 if(filter==='photos')return step.hasPhoto===true;
 if(filter==='branches')return Boolean(step.parent);
 return filter==='exploration'?step.context==='exploration':
  step.source==='personal'&&step.context===filter;
};
const textFor=(step,group)=>[
 step.title,step.context,step.location,step.parent?.title,
 group.label,step.source==='shared'?'mutually saved encounter':'personal journal',
].filter(value=>typeof value==='string').join(' ').toLocaleLowerCase();

export function projectEchoChronicleJourneyView(trail,options={}){
 const groups=Array.isArray(trail?.groups)?trail.groups:[];
 const filter=validFilters.has(options?.filter)?options.filter:'all';
 const query=safeSearch(options?.query);
 const shown=[];
 let originalTotal=0,visibleTotal=0;
 for(const group of groups){
  if(!group||!Array.isArray(group.steps))continue;
  originalTotal+=group.steps.length;
  const steps=group.steps.filter(step=>
   step&&matchesType(step,filter)&&
   (!query||textFor(step,group).includes(query)));
  if(!steps.length)continue;
  visibleTotal+=steps.length;
  shown.push(Object.freeze({
   key:group.key,label:group.label,steps:Object.freeze(steps),
  }));
 }
 return Object.freeze({
  groups:Object.freeze(shown),filter,query,
  total:originalTotal,visible:visibleTotal,
  hidden:originalTotal-visibleTotal,
  dayCount:shown.length,
  isFiltered:filter!=='all'||Boolean(query),
 });
}

export function echoJourneyContextCounts(trail){
 const count={all:0,training:0,exploration:0,quest:0,
  shared:0,photos:0,branches:0};
 for(const group of Array.isArray(trail?.groups)?trail.groups:[]){
  for(const step of Array.isArray(group?.steps)?group.steps:[]){
   if(!step)continue;
   count.all++;
   if(step.source==='shared')count.shared++;
   if(step.context==='exploration')count.exploration++;
   if(step.source==='personal'&&['training','quest'].includes(step.context))
    count[step.context]++;
   if(step.hasPhoto===true)count.photos++;
   if(step.parent)count.branches++;
  }
 }
 return Object.freeze(count);
}
