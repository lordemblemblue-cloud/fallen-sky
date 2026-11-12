import { projectEchoConstellation } from './echoConstellation.mjs';

// Models may choose among eligible authored lines. They may not supply prose,
// names, commands, rewards, objectives or state. No AI service is called here.
const templates = Object.freeze([
  {id:'first_steps',requires:[],text:'Your journey is waiting to be remembered. Follow the road beyond the capital and let each completed quest become a point of light.'},
  {id:'first_echo',requires:['echo_ch_14_first_echo'],text:'You answered Lyra’s call and cleared the patrol. The first echo of your journey now has a place in the sky.'},
  {id:'crystal_discovered',requires:['echo_ch_15_world_signs'],text:'You followed the strange light to the Spirit Crystal Vein. That discovery is part of your story now.'},
  {id:'crossroads',requires:['echo_ch_16_crossroads'],text:'You defeated the elite at the crossroads. The hidden echo and the broken road are independent paths; your choice of one never closes the other.'},
  {id:'aftershocks',requires:['echo_ch_17_aftershocks'],text:'You contained the disturbance along the road. The memory of those aftershocks joins the light you found at the crystal vein.'},
  {id:'traces_remain',requires:['echo_ch_18_traces_remain'],text:'You confronted the champion on the road. What you endured remains recorded even as your journey continues.'},
  {id:'hidden_echo',requires:['echo_branch_hidden_echo'],text:'You discovered the Weathered Stone Tablet. The hidden echo is no longer only a rumor in your Chronicle.'},
  {id:'broken_road',requires:['echo_branch_broken_road'],text:'You cleared the dangers from the broken road. That path through the crossroads now carries a memory of your own.'},
  {id:'crystal_whole',requires:['echo_ch_14_first_echo','echo_ch_15_world_signs','echo_ch_16_crossroads',
    'echo_ch_17_aftershocks','echo_ch_18_traces_remain','echo_branch_hidden_echo','echo_branch_broken_road'],
    text:'The spirit crystal is whole: patrol, discovery, confrontation and both paths beyond the crossroads. These seven memories remain yours.'},
].map(template=>Object.freeze({...template,requires:Object.freeze(template.requires)})));

function context(entries) {
  const view=projectEchoConstellation(entries);
  const completed=new Set(view.stars.filter(star=>star.memory!==null).map(star=>star.questId));
  const eligible=view.availability==='available'
    ?templates.filter(template=>template.requires.every(id=>completed.has(id))):[];
  return {view,eligible};
}

/** Minimal future provider input: no player identifiers, names, chat or prose. */
export function createChronicleNarrativeRequest(verifiedEntries) {
  const {view,eligible}=context(verifiedEntries);
  if(view.availability!=='available')return null;
  return Object.freeze({schemaVersion:1,
    availableTemplateIds:Object.freeze(eligible.map(template=>template.id)),
    completedQuestIds:Object.freeze(view.stars.filter(star=>star.memory).map(star=>star.questId)),
  });
}

// Parse a small JSON selector, not an object with executable getters/proxies.
// Exact keys forbid injection of actions or unauthorized generated prose.
function selectedTemplate(raw,eligible) {
  if(typeof raw!=='string'||raw.length>256)return null;
  try{
    const value=JSON.parse(raw);
    if(!value||Array.isArray(value)||typeof value!=='object'||
      Object.keys(value).sort().join(',')!=='schemaVersion,templateId'||
      value.schemaVersion!==1||typeof value.templateId!=='string')return null;
    return eligible.find(template=>template.id===value.templateId)??null;
  }catch{return null;}
}

/** Approved-template variation with deterministic, read-only fallback. */
export function projectChronicleNarrative(verifiedEntries,modelResponse=null) {
  const {view,eligible}=context(verifiedEntries);
  if(view.availability!=='available')return Object.freeze({
    templateId:'history_unavailable',text:'Your Chronicle connection is unavailable. Your recorded memories have not been changed.',
    memoryIds:Object.freeze([]),nextStars:Object.freeze([]),usedFallback:true,readOnly:true,
  });
  const selected=selectedTemplate(modelResponse,eligible);
  const template=selected??eligible.at(-1);
  return Object.freeze({
    templateId:template.id,text:template.text,
    memoryIds:Object.freeze(template.requires.map(id=>'echo165:'+id)),
    nextStars:Object.freeze(view.stars.filter(star=>['available','active','turn_in'].includes(star.status))
      .map(star=>Object.freeze({starId:star.id,title:star.title,status:star.status}))),
    usedFallback:selected===null,readOnly:true,
  });
}
