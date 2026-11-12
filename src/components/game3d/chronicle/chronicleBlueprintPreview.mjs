/**
 * Chronicle Creator draft inspection. Read-only and deliberately disconnected
 * from authoritative equipment, skill unlock, loot or inventory write paths.
 */
import { cleanBlueprint, CHRONICLE_KINDS, CHRONICLE_RARITIES,
  CHRONICLE_STATS } from './chronicleBlueprintModel.mjs';

const hasOwn=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function parseDraftStats(draft){
  if(!hasOwn(draft,'statsText')){
    const stats=draft.stats??{};
    if(!stats||typeof stats!=='object'||Array.isArray(stats))
      throw Error('Core stats must be an object');
    return stats;
  }
  const stats=Object.create(null);
  for(const raw of String(draft.statsText??'').split(/\r?\n/)){
    const line=raw.trim();
    if(!line)continue;
    const colon=line.indexOf(':');
    if(colon<1)throw Error('Use one stat per line, e.g. strength: 25');
    const key=line.slice(0,colon).trim().toLowerCase();
    const input=line.slice(colon+1).trim();
    if(!CHRONICLE_STATS.includes(key)||!input||hasOwn(stats,key))
      throw Error('Invalid or duplicate core stat '+key);
    const value=Number(input);
    if(!Number.isFinite(value)||Math.abs(value)>1_000_000)
      throw Error('Invalid stat value for '+key);
    stats[key]=value;
  }
  return stats;
}
function level(value,label){
  if(value===null||value===undefined||String(value).trim()==='')
    throw Error(label+' is required');
  const numeric=Number(value);
  if(!Number.isSafeInteger(numeric)||numeric<1||numeric>9999)
    throw Error(label+' must be an integer from 1 to 9999');
  return numeric;
}
export function previewChronicleBlueprintDraft(draft){
  try{
    if(!draft||typeof draft!=='object'||Array.isArray(draft))
      throw Error('Select a blueprint draft to review');
    if(!CHRONICLE_KINDS.includes(draft.kind))
      throw Error('Choose equipment, material or skill');
    if(typeof draft.name!=='string'||!draft.name.trim())
      throw Error('Give this blueprint a name before previewing it');
    if(!CHRONICLE_RARITIES.includes(draft.rarity))
      throw Error('Choose a supported rarity');
    const minimum=level(draft.levelMin,'Minimum level');
    const maximum=level(draft.levelMax,'Maximum level');
    if(maximum<minimum)throw Error('Maximum level cannot be below minimum level');
    const rawChance=draft.dropChance??0;
    if(String(rawChance).trim()==='')throw Error('Enter a draft drop chance');
    const chance=Number(rawChance);
    if(!Number.isFinite(chance)||chance<0||chance>100)
      throw Error('Draft drop chance must be between 0 and 100');
    const blueprint=cleanBlueprint({
      ...draft,id:'chronicle-preview-only',levelMin:minimum,levelMax:maximum,
      dropChance:chance,stats:parseDraftStats(draft),
    });
    const warnings=[];
    if(!blueprint.description)warnings.push('Add a description for the hover card');
    if(blueprint.kind==='material'&&!blueprint.materialType)
      warnings.push('Material family is not specified');
    if(blueprint.kind==='skill'&&!blueprint.skillId)
      warnings.push('Skill unlock reference is not specified');
    if(chance>0&&!blueprint.dropSource)
      warnings.push('Drop source is not specified for this proposed chance');
    const values=Object.freeze(Object.entries(blueprint.stats)
      .map(([key,value])=>Object.freeze({key,value})));
    const preview=Object.freeze({
      name:blueprint.name,kind:blueprint.kind,rarity:blueprint.rarity,
      levelMin:blueprint.levelMin,levelMax:blueprint.levelMax,
      slot:blueprint.slot,materialType:blueprint.materialType,
      skillId:blueprint.skillId,setId:blueprint.setId,
      icon:blueprint.icon,description:blueprint.description,
      stats:values,dropSource:blueprint.dropSource,dropChance:blueprint.dropChance,
      // Explicitly not an authoritative allocation, reward or skill unlock.
      source:'creator-local-draft',draftOnly:true,
      eligibleForIssuance:false,gameplayValidated:false,
    });
    return Object.freeze({ok:true,preview,
      warnings:Object.freeze(warnings)});
  }catch(error){
    return Object.freeze({ok:false,reason:String(error?.message||error),
      warnings:Object.freeze([])});
  }
}
