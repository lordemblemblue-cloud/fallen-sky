/**
 * Game 3D 82.9 — SERVER-INTERNAL creator blueprint catalog review planning.
 *
 * This does NOT publish item definitions or grant inventory/XP/skills/currency.
 * A digest protects against accidental content drift, NOT malicious clients.
 * No HTTP route, database write, gameplay event or issuance authority exists here.
 */
import { createHash } from 'node:crypto';

export const CREATOR_PROPOSAL_SCHEMA_829='axe-game3d-creator-proposal-829-v1';
export const CREATOR_CANDIDATE_SCHEMA_829='axe-game3d-creator-candidate-829-v1';
export const CREATOR_REVIEW_SCHEMA_829='axe-game3d-creator-review-829-v1';

const KINDS=new Set(['equipment','material','skill']);
const RARITIES=new Set(['Common','Unique','Rare','Epic','Legendary',
  'Mystical','Ascendant']);
const EQUIPMENT_SLOTS=new Set(['weapon','helm','chest','gloves','legs',
  'boots','ring','necklace','cape','wings','costume','vanity_head',
  'vanity_torso','vanity_pelvis','vanity_leggings','accessory',
  'trinket','auxiliary']);
const STATS=new Set(['strength','vitals','dexterity','spirit','hp','max_hp',
  'attack','defense','critical_chance','critical_resistance','dodge',
  'attack_speed','will','cooldown_reduction','movement_speed']);
const BLUEPRINT_FIELDS=new Set(['id','kind','name','description','icon',
  'rarity','slot','levelMin','levelMax','stats','setId','skillId',
  'materialType','tags','dropSource','dropChance','notes']);
const CANDIDATE_FIELDS=new Set(['schema','creatorId','proposalDigest',
  'payload','draftOnly','eligibleForIssuance','serverPublished']);
const DISPOSITIONS=new Set(['request-changes','reject','accept-for-curation']);
const isPlain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const hasOwn=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function keysOnly(object,allowed){
  if(!isPlain(object)||Object.keys(object).some(key=>!allowed.has(key)))
    throw Error('Unexpected or invalid proposal fields');
}
function ident(value,label,max=160){
  if(typeof value!=='string'||value.length>max||
    !/^[A-Za-z0-9_.:-]{1,160}$/.test(value)||
    ['__anon__','__default__'].includes(value))
    throw Error('Invalid '+label);
  return value;
}
function text(value,label,max=200){
  if(value===undefined||value===null)return '';
  if(typeof value!=='string'||value.length>max||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value))
    throw Error('Invalid '+label);
  return value.trim();
}
function whole(value,label,min,max){
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw Error('Invalid '+label);
  return value;
}
function validateDraft(blueprint){
  keysOnly(blueprint,BLUEPRINT_FIELDS);
  if(!KINDS.has(blueprint.kind))throw Error('Invalid blueprint kind');
  if(!RARITIES.has(blueprint.rarity))throw Error('Invalid blueprint rarity');
  const name=text(blueprint.name,'blueprint name',100);
  if(!name)throw Error('Missing blueprint name');
  const levelMin=whole(blueprint.levelMin,'minimum level',1,9999);
  const levelMax=whole(blueprint.levelMax,'maximum level',levelMin,9999);
  const rawChance=blueprint.dropChance;
  if(typeof rawChance!=='number'||!Number.isFinite(rawChance)||
    rawChance<0||rawChance>100)
    throw Error('Invalid draft drop chance');
  if(!isPlain(blueprint.stats))throw Error('Invalid stats object');
  const stats=Object.create(null);
  for(const key of Object.keys(blueprint.stats).sort()){
    const amount=blueprint.stats[key];
    if(!STATS.has(key)||typeof amount!=='number'||
      !Number.isFinite(amount)||Math.abs(amount)>1_000_000)
      throw Error('Invalid stat '+key);
    stats[key]=amount;
  }
  const slot=text(blueprint.slot,'equipment slot',40);
  const kind=blueprint.kind;
  if(kind==='equipment'&&!EQUIPMENT_SLOTS.has(slot))
    throw Error('Invalid equipment slot');
  if(kind!=='equipment'&&slot)
    throw Error('Only equipment can have an equipment slot');
  const id=ident(blueprint.id,'blueprint id',100);
  const result={
    id,kind,name,description:text(blueprint.description,'description',1200),
    icon:text(blueprint.icon,'icon',80),rarity:blueprint.rarity,
    slot:kind==='equipment'?slot:'',levelMin,levelMax,
    stats:Object.freeze(stats),
    setId:text(blueprint.setId,'set id',80),
    skillId:text(blueprint.skillId,'skill id',80),
    materialType:text(blueprint.materialType,'material type',80),
    tags:text(blueprint.tags,'tags',200),
    dropSource:text(blueprint.dropSource,'drop source',180),
    dropChance:rawChance,notes:text(blueprint.notes,'notes',800),
  };
  if(kind==='material'&&!result.materialType)
    throw Error('Material family required for server review');
  if(kind==='skill'&&!result.skillId)
    throw Error('Skill reference required for server review');
  if(rawChance>0&&!result.dropSource)
    throw Error('Drop source required for positive chance');
  return Object.freeze(result);
}
function normalizeProposal(proposal){
  keysOnly(proposal,new Set(['schema','source','blueprint']));
  if(proposal.schema!==CREATOR_PROPOSAL_SCHEMA_829)
    throw Error('Unknown creator proposal schema');
  keysOnly(proposal.source,new Set(['boxId','slotIndex']));
  const source=Object.freeze({
    boxId:ident(proposal.source.boxId,'source collection',100),
    slotIndex:whole(proposal.source.slotIndex,'source slot',0,499),
  });
  return Object.freeze({source,blueprint:validateDraft(proposal.blueprint)});
}
function digest(creatorId,payload){
  // Canonical field order and sorted stat keys; hash is an untrusted
  // correspondence check, NOT a provenance signature or reward receipt.
  return createHash('sha256').update(JSON.stringify({
    schema:CREATOR_CANDIDATE_SCHEMA_829,creatorId,payload,
  })).digest('hex');
}
function blocked(code){
  return Object.freeze({ok:false,code,draftOnly:true,
    eligibleForIssuance:false,serverPublished:false});
}
export function prepareCreatorCatalogCandidate829({proposal,authenticatedCreatorId}={}){
  try{
    const creatorId=ident(authenticatedCreatorId,'authenticated creator',128);
    const payload=normalizeProposal(proposal);
    const candidate=Object.freeze({
      schema:CREATOR_CANDIDATE_SCHEMA_829,creatorId,
      proposalDigest:digest(creatorId,payload),
      payload,draftOnly:true,eligibleForIssuance:false,
      serverPublished:false,
    });
    return Object.freeze({ok:true,candidate});
  }catch(error){
    return blocked('invalid-proposal:'+String(error?.message||error));
  }
}
export function verifyCreatorCatalogCandidate829(candidate){
  try{
    keysOnly(candidate,CANDIDATE_FIELDS);
    if(candidate.schema!==CREATOR_CANDIDATE_SCHEMA_829||
      candidate.draftOnly!==true||
      candidate.eligibleForIssuance!==false||
      candidate.serverPublished!==false)
      throw Error('Candidate claims non-draft privileges');
    const creatorId=ident(candidate.creatorId,'creator',128);
    keysOnly(candidate.payload,new Set(['source','blueprint']));
    const normalized=normalizeProposal({
      schema:CREATOR_PROPOSAL_SCHEMA_829,
      source:candidate.payload?.source,
      blueprint:candidate.payload?.blueprint,
    });
    if(candidate.proposalDigest!==digest(creatorId,normalized))
      throw Error('Candidate content changed since preparation');
    return Object.freeze({ok:true,creatorId,payload:normalized,
      proposalDigest:candidate.proposalDigest});
  }catch(error){
    return blocked('invalid-candidate:'+String(error?.message||error));
  }
}
/**
 * Inject an authenticated server-side reviewer verifier at construction.
 * The callback MUST resolve its identity from a trusted authenticated
 * server session, not the submitted proposal or a client role flag.
 */
export function createCreatorCatalogReviewService829({authorizeReviewer}={}){
  if(typeof authorizeReviewer!=='function')
    throw Error('Trusted reviewer authorization is required');
  async function review({candidate,serverContext,disposition,note}={}){
    const validated=verifyCreatorCatalogCandidate829(candidate);
    if(!validated.ok)return blocked(validated.code);
    if(!DISPOSITIONS.has(disposition))return blocked('invalid-disposition');
    let explanation;
    try{ explanation=text(note,'review note',500); }
    catch{ return blocked('invalid-review-note'); }
    if(!explanation)return blocked('review-note-required');
    let reviewerId;
    try{
      const identity=await authorizeReviewer(serverContext);
      if(identity?.authorized!==true)
        return blocked('reviewer-not-authorized');
      reviewerId=ident(identity.reviewerId,'verified reviewer',128);
    }catch{
      return blocked('reviewer-not-authorized');
    }
    if(reviewerId===validated.creatorId)
      return blocked('self-review-not-allowed');
    const record=Object.freeze({
      schema:CREATOR_REVIEW_SCHEMA_829,
      proposalDigest:validated.proposalDigest,
      creatorId:validated.creatorId,reviewerId,
      disposition,reviewNote:explanation,
      status:'review-record-only',
      // Even an accepted curation proposal is NOT a published catalog
      // definition and cannot be used by the item-award bridge.
      catalogPublished:false,eligibleForIssuance:false,
      statsApplied:false,skillUnlocked:false,rewardsIssued:false,
    });
    return Object.freeze({ok:true,record});
  }
  return Object.freeze({review});
}
