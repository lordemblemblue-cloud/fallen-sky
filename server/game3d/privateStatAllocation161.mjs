// Game 3D Combat / Quest 16.1 — trusted, private stat point allocation.
// Reuses canonical 5.0 character XP/revision and 10.4 level policy. This is
// NOT a second browser Character store and NOT connected to live combat stats.
// Pending 15.9 quest bonus point proposals NEVER enter this spending budget.
import {deriveCharacterLevel,CHARACTER_LEVEL_POLICY_VERSION}
 from './progressionLevelPolicy.mjs';
import {LEVEL_STAT_POINTS_POLICY_160} from './privateProgressionPolicy160.mjs';

export const PRIVATE_STAT_ALLOCATION_POLICY_161=
 'game3d-private-stat-allocation-161-v1';
export const PRIVATE_ALLOCATABLE_STATS_161=Object.freeze([
 'strength','dexterity','constitution','focus'
]);
const statSet=new Set(PRIVATE_ALLOCATABLE_STATS_161);
const validOwner=s=>typeof s==='string'&&
 /^[A-Za-z0-9_-]{1,128}$/.test(s)&&
 s!=='__anon__'&&s!=='__default__';
const validId=s=>typeof s==='string'&&
 /^[A-Za-z0-9_.:-]{8,128}$/.test(s);
const rejected=reason=>Object.freeze({ok:false,version:'16.1',reason,
 allocated:false,privateServerOnly:true,publicGameViewMounted:false,
 questBonusPointsSpendable:false,productionReady:false});
const characterSQL=`
 SELECT owner_id,character_id,xp_total::text AS xp_total,
  revision::text AS revision
 FROM game3d_trusted_character
 WHERE owner_id=$1 AND character_id=$2 FOR UPDATE
`;
const readCharacterSQL=characterSQL.replace(' FOR UPDATE','');
const allocationsSQL=`
 SELECT allocation_id,stat_key,points,policy_version,source_kind
 FROM game3d_private_stat_allocation_161
 WHERE owner_id=$1 AND character_id=$2
 ORDER BY allocated_at,allocation_id
`;
const insertSQL=`
 INSERT INTO game3d_private_stat_allocation_161
 (owner_id,character_id,allocation_id,stat_key,points,
  character_revision_before,character_revision_after,source_kind,policy_version)
 VALUES ($1,$2,$3,$4,$5,$6::bigint,$7::bigint,
 'trusted-private-level-stat-allocation',
 'game3d-private-stat-allocation-161-v1')
 RETURNING allocation_id
`;
const revisionSQL=`
 UPDATE game3d_trusted_character
 SET revision=revision+1
 WHERE owner_id=$1 AND character_id=$2 AND revision=$3::bigint
 RETURNING revision::text AS revision
`;
function deriveBudget(character,rows){
 const xp=character?.xp_total,revision=character?.revision;
 if(typeof xp!=='string'||typeof revision!=='string'||
  !/^(0|[1-9][0-9]*)$/.test(xp)||
  !/^(0|[1-9][0-9]*)$/.test(revision))
  throw Error('Invalid canonical character XP or revision');
 const level=deriveCharacterLevel(xp);
 const earned=(level.level-1)*LEVEL_STAT_POINTS_POLICY_160;
 if(!Number.isSafeInteger(earned)||earned<0)throw Error('Invalid point budget');
 const byStat=Object.fromEntries(PRIVATE_ALLOCATABLE_STATS_161.map(k=>[k,0]));
 const requests=new Map();let spent=0;
 for(const row of rows){
  const count=Number(row.points);
  if(!validId(row.allocation_id)||!statSet.has(row.stat_key)||
     row.policy_version!==PRIVATE_STAT_ALLOCATION_POLICY_161||
     row.source_kind!=='trusted-private-level-stat-allocation'||
     !Number.isSafeInteger(count)||count<1||count>99||
     requests.has(row.allocation_id))
   throw Error('Corrupt canonical allocation journal');
  requests.set(row.allocation_id,{statKey:row.stat_key,points:count});
  spent+=count;byStat[row.stat_key]+=count;
 }
 if(spent>earned)throw Error('Stat journal exceeds verified level budget');
 return {level:level.level,earned,spent,available:earned-spent,
  byStat,requests,revision};
}
function report(b,extra={}){
 return Object.freeze({ok:true,version:'16.1',
  level:b.level,levelPolicyVersion:CHARACTER_LEVEL_POLICY_VERSION,
  policyVersion:PRIVATE_STAT_ALLOCATION_POLICY_161,
  levelEarnedPoints:b.earned,spentPoints:b.spent,
  availablePoints:b.available,
  allocationsByStat:Object.freeze({...b.byStat}),
  characterRevision:b.revision,
  questBonusPointsSpendable:false,
  browserStatMutation:false,combatStatsCertified:false,
  privateServerOnly:true,productionReady:false,...extra});
}
export function createGame3DPrivateStatAllocation161({
 pool,authorizeServerOperation
}={}){
 if(typeof pool?.connect!=='function'||
    typeof authorizeServerOperation!=='function')
  throw Error('16.1 requires private PostgreSQL and trusted operator authorization');
 const allowed=async(operation,ownerId,characterId)=>{
  if(!validOwner(ownerId)||!validOwner(characterId))return false;
  try{return await authorizeServerOperation({
   operation,ownerId,characterId
  })===true}catch{return false}
 };
 const allocate=async({
  ownerId,characterId,allocationId,statKey,points
 }={})=>{
  if(!statSet.has(statKey)||!validId(allocationId)||
     !Number.isSafeInteger(points)||points<1||points>99)
   return rejected('invalid_private_stat_allocation_intent');
  if(!await allowed('allocate_private_level_stat_points',ownerId,characterId))
   return rejected('private_stat_allocation_unauthorized');

  const db=await pool.connect();let begun=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');begun=true;
   // Lock the canonical character first, matching 15.8 XP writes so
   // multiple scheduler instances cannot double-spend or lose revisions.
   const ch=await db.query(characterSQL,[ownerId,characterId]);
   if(ch.rowCount!==1||ch.rows[0].owner_id!==ownerId||
      ch.rows[0].character_id!==characterId){
    await db.query('ROLLBACK');begun=false;
    return rejected('trusted_stat_character_missing');
   }
   const allocations=await db.query(allocationsSQL,[ownerId,characterId]);
   const current=deriveBudget(ch.rows[0],allocations.rows);
   const old=current.requests.get(allocationId);
   if(old){
    if(old.statKey!==statKey||old.points!==points){
     await db.query('ROLLBACK');begun=false;
     return rejected('conflicting_private_stat_allocation_replay');
    }
    await db.query('COMMIT');begun=false;
    return report(current,{allocated:false,alreadyAllocated:true,
     allocationId,statKey,points});
   }
   if(current.available<points){
    await db.query('ROLLBACK');begun=false;
    return rejected('insufficient_verified_level_stat_points');
   }
   const before=BigInt(current.revision);
   if(before>=BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('Canonical character revision at safe limit');
   const added=await db.query(insertSQL,[
    ownerId,characterId,allocationId,statKey,points,
    before.toString(),(before+1n).toString()
   ]);
   if(added.rowCount!==1||added.rows[0].allocation_id!==allocationId)
    throw Error('Missing private allocation journal');
   const updated=await db.query(revisionSQL,[
    ownerId,characterId,before.toString()
   ]);
   if(updated.rowCount!==1||
      updated.rows[0].revision!==(before+1n).toString())
    throw Error('Canonical revision race');
   await db.query('COMMIT');begun=false;
   return report({
    ...current,spent:current.spent+points,
    available:current.available-points,
    byStat:{...current.byStat,[statKey]:current.byStat[statKey]+points},
    revision:(before+1n).toString(),
   },{allocated:true,alreadyAllocated:false,
    allocationId,statKey,points});
  }catch{
   if(begun)try{await db.query('ROLLBACK')}catch{}
   return rejected('private_stat_allocation_transaction_failed');
  }finally{db.release()}
 };
 const readAllocations=async({ownerId,characterId}={})=>{
  if(!await allowed('read_private_level_stat_allocations',ownerId,characterId))
   return rejected('private_stat_allocation_read_unauthorized');
  const db=await pool.connect();let begun=false;
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   begun=true;
   const ch=await db.query(readCharacterSQL,[ownerId,characterId]);
   if(ch.rowCount!==1){
    await db.query('ROLLBACK');begun=false;
    return rejected('trusted_stat_character_missing');
   }
   const allocations=await db.query(allocationsSQL,[ownerId,characterId]);
   const snapshot=deriveBudget(ch.rows[0],allocations.rows);
   await db.query('COMMIT');begun=false;
   return report(snapshot,{readOnly:true,allocated:false,
    allocationCount:allocations.rowCount});
  }catch{
   if(begun)try{await db.query('ROLLBACK')}catch{}
   return rejected('private_stat_read_failed');
  }finally{db.release()}
 };
 return Object.freeze({version:'16.1',allocate,readAllocations,
  privateServerOnly:true,serverAllocationWriterEnabled:true,
  browserStoreConnected:false,publicEndpointInstalled:false,
  clientAttributeMigrationComplete:false,combatStatsCertified:false,
  questBonusPointWriterEnabled:false,contributionWalletWriterEnabled:false,
  factionReputationWriterEnabled:false,productionReady:false});
}
