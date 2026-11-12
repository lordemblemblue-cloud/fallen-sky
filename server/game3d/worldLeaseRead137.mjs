// Combat 13.7 — server-only read of a manually provisioned world lease.
// This cannot acquire, extend or transfer leases. A future atomic CAS writer
// and transaction-bound fencing checks are prerequisites for production.
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const who=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)&&
 !['__anon__','__default__'].includes(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const positive=x=>{
 const s=typeof x==='bigint'?String(x):
  typeof x==='string'?x:
  typeof x==='number'&&Number.isSafeInteger(x)?String(x):null;
 if(!s||!/^[1-9][0-9]*$/.test(s))return null;
 const value=Number(s);
 return Number.isSafeInteger(value)?value:null;
};
export function createGame3DWorldLeaseReader137({pool}={}){
 if(!pool?.connect)throw Error('13.7 world lease read requires private PostgreSQL');
 const verify=async scope=>{
  if(!key(scope?.instanceId)||!key(scope?.instanceEpoch)||
     !key(scope?.holderId)||!who(scope?.ownerId)||
     !who(scope?.characterId)||!hex(scope?.mapFingerprint))
   return null;
  const c=await pool.connect();
  try{
   await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
   const rows=await c.query(
    'SELECT instance_id,instance_epoch,holder_id,owner_id,character_id,'+
    'map_fingerprint,fencing_token::text AS fencing_token,'+
    '(EXTRACT(EPOCH FROM expires_at)*1000)::bigint::text AS expires_at_ms '+
    'FROM game3d_combat_world_instance_lease WHERE instance_id=$1 '+
    'AND instance_epoch=$2 AND holder_id=$3 AND owner_id=$4 '+
    'AND character_id=$5 AND map_fingerprint=$6 '+
    'AND expires_at > clock_timestamp()',
    [scope.instanceId,scope.instanceEpoch,scope.holderId,
     scope.ownerId,scope.characterId,scope.mapFingerprint]);
   let result=null;
   if(rows.rowCount===1){
    const row=rows.rows[0],token=positive(row?.fencing_token);
    const expires=positive(row?.expires_at_ms);
    if(token!==null&&expires!==null&&
       row.instance_id===scope.instanceId&&
       row.instance_epoch===scope.instanceEpoch&&
       row.holder_id===scope.holderId&&
       row.owner_id===scope.ownerId&&
       row.character_id===scope.characterId&&
       row.map_fingerprint===scope.mapFingerprint)
     result={
      ok:true,source:'trusted-world-instance-lease',
      exclusive:true,committed:true,
      ...scope,fencingToken:token,expiresAt:expires,
     };
   }
   await c.query('COMMIT');
   return result;
  }catch(error){
   try{await c.query('ROLLBACK')}catch{}
   throw error;
  }finally{c.release()}
 };
 return Object.freeze({verify,readOnly:true,
  leaseAcquisitionEnabled:false,leaseRenewalEnabled:false,
  productionReady:false});
}
