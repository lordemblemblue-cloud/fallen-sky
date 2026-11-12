// Combat 13.8 — private PostgreSQL CAS world-instance ownership.
// No public route, player input, runtime worker hookup, rewards or deployment.
// A DB clock and single-statement conflict resolution arbitrate ownership.
const key = x => typeof x === 'string' && /^[A-Za-z0-9_.:-]{8,128}$/.test(x);
const who = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x) &&
  x !== '__anon__' && x !== '__default__';
const hex = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const positive = x => {
  const value = typeof x === 'bigint' ? String(x) :
    typeof x === 'string' ? x : Number.isSafeInteger(x) ? String(x) : '';
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
};
const scopeOK = s => key(s?.instanceId) && key(s?.instanceEpoch) &&
  key(s?.holderId) && who(s?.ownerId) && who(s?.characterId) &&
  hex(s?.mapFingerprint);
const ttlOK = n => Number.isInteger(n) && n >= 1000 && n <= 30000;
const scopeParams = s => [s.instanceId, s.instanceEpoch, s.holderId,
  s.ownerId, s.characterId, s.mapFingerprint];
const fields = 'instance_id, instance_epoch, holder_id, owner_id, character_id, ' +
  'map_fingerprint, fencing_token::text AS fencing_token, ' +
  '(EXTRACT(EPOCH FROM expires_at)*1000)::bigint::text AS expires_at_ms';
const view = (row, s) => {
  const token = positive(row?.fencing_token);
  const expiry = positive(row?.expires_at_ms);
  if (!token || !expiry || row.instance_id !== s.instanceId ||
    row.instance_epoch !== s.instanceEpoch || row.holder_id !== s.holderId ||
    row.owner_id !== s.ownerId || row.character_id !== s.characterId ||
    row.map_fingerprint !== s.mapFingerprint) return null;
  return Object.freeze({ok:true, source:'trusted-world-instance-lease',
    exclusive:true,committed:true,...s,fencingToken:token,expiresAt:expiry});
};
const acquireSQL = `
 INSERT INTO game3d_combat_world_instance_lease AS lease
 (instance_id, instance_epoch, holder_id, owner_id, character_id,
  map_fingerprint, fencing_token, expires_at)
 VALUES ($1,$2,$3,$4,$5,$6,1,
         clock_timestamp() + ($7::int * interval '1 millisecond'))
 ON CONFLICT (instance_id) DO UPDATE SET
   instance_epoch=EXCLUDED.instance_epoch,
   holder_id=EXCLUDED.holder_id,
   fencing_token=lease.fencing_token+1,
   expires_at=clock_timestamp() + ($7::int * interval '1 millisecond'),
   updated_at=clock_timestamp()
 WHERE lease.expires_at <= clock_timestamp()
   AND lease.instance_epoch <> EXCLUDED.instance_epoch
   AND lease.owner_id=EXCLUDED.owner_id
   AND lease.character_id=EXCLUDED.character_id
   AND lease.map_fingerprint=EXCLUDED.map_fingerprint
   AND lease.fencing_token < 9007199254740991
 RETURNING ${fields}`;
const renewSQL = `
 UPDATE game3d_combat_world_instance_lease SET
  expires_at=clock_timestamp() + ($8::int * interval '1 millisecond'),
  updated_at=clock_timestamp()
 WHERE instance_id=$1 AND instance_epoch=$2 AND holder_id=$3
  AND owner_id=$4 AND character_id=$5 AND map_fingerprint=$6
  AND fencing_token=$7::bigint AND expires_at>clock_timestamp()
 RETURNING ${fields}`;
const releaseSQL = `
 UPDATE game3d_combat_world_instance_lease SET
  expires_at=clock_timestamp(), updated_at=clock_timestamp()
 WHERE instance_id=$1 AND instance_epoch=$2 AND holder_id=$3
  AND owner_id=$4 AND character_id=$5 AND map_fingerprint=$6
  AND fencing_token=$7::bigint AND expires_at>clock_timestamp()
 RETURNING instance_id, fencing_token::text AS fencing_token`;
const checkpointSQL = `
 WITH locked AS MATERIALIZED (
  SELECT instance_id FROM game3d_combat_world_instance_lease
  WHERE instance_id=$1 AND instance_epoch=$2 AND holder_id=$3
    AND owner_id=$4 AND character_id=$5 AND map_fingerprint=$6
    AND fencing_token=$7::bigint AND expires_at>clock_timestamp()
  FOR UPDATE
 )
 INSERT INTO game3d_combat_world_checkpoint_138 AS old
  (instance_id,instance_epoch,fencing_token,event_seq,snapshot_sha256)
 SELECT instance_id,$2,$7::bigint,$8::bigint,$9 FROM locked WHERE true
 ON CONFLICT (instance_id) DO UPDATE SET
  instance_epoch=EXCLUDED.instance_epoch,
  fencing_token=EXCLUDED.fencing_token,
  event_seq=EXCLUDED.event_seq,
  snapshot_sha256=EXCLUDED.snapshot_sha256,
  recorded_at=clock_timestamp()
 WHERE old.fencing_token < EXCLUDED.fencing_token OR
       (old.fencing_token=EXCLUDED.fencing_token AND
        old.instance_epoch=EXCLUDED.instance_epoch AND
        old.event_seq<=EXCLUDED.event_seq)
 RETURNING instance_id,instance_epoch,fencing_token::text AS fencing_token,
  event_seq::text AS event_seq,snapshot_sha256`;

export function createGame3DWorldLeaseWriter138({pool,authorizeServerOperation}={}) {
  if (typeof pool?.connect !== 'function' ||
      typeof authorizeServerOperation !== 'function')
    throw Error('13.8 requires private PostgreSQL and server authorization');
  const authorized = async (operation,scope) => {
    if (!scopeOK(scope)) return false;
    try {
      // Only the trusted worker may inject this callback; this source does not
      // provide a network handler or accept an unverified browser identity.
      return await authorizeServerOperation({operation,scope}) === true;
    } catch { return false; }
  };
  const query = async (sql,params) => {
    const client=await pool.connect();
    try { return await client.query(sql,params); }
    finally { client.release(); }
  };
  const acquire = async ({scope,ttlMs=10000}={}) => {
    if (!ttlOK(ttlMs) || !await authorized('acquire',scope)) return null;
    const response=await query(acquireSQL,[...scopeParams(scope),ttlMs]);
    return response.rowCount===1 ? view(response.rows[0],scope) : null;
  };
  const renew = async ({scope,fencingToken,ttlMs=10000}={}) => {
    if (!ttlOK(ttlMs) || !positive(fencingToken) ||
        !await authorized('renew',scope)) return null;
    const response=await query(renewSQL,[...scopeParams(scope),fencingToken,ttlMs]);
    const result=response.rowCount===1 ? view(response.rows[0],scope) : null;
    return result?.fencingToken===fencingToken ? result : null;
  };
  const release = async ({scope,fencingToken}={}) => {
    if (!positive(fencingToken) || !await authorized('release',scope)) return false;
    const response=await query(releaseSQL,[...scopeParams(scope),fencingToken]);
    return response.rowCount===1 &&
      positive(response.rows[0]?.fencing_token)===fencingToken &&
      response.rows[0]?.instance_id===scope.instanceId;
  };
  // Stores digest/sequence only. This is not a restorable encounter snapshot,
  // not a victory record, and never a reward or world-outcome authority.
  const recordCheckpointDigest = async ({
    scope,fencingToken,eventSeq,snapshotSha256
  }={}) => {
    if (!positive(fencingToken) || !Number.isSafeInteger(eventSeq) ||
        eventSeq<0 || !hex(snapshotSha256) ||
        !await authorized('checkpoint',scope)) return false;
    const response=await query(checkpointSQL,
      [...scopeParams(scope),fencingToken,eventSeq,snapshotSha256]);
    const row=response.rows[0];
    return response.rowCount===1 && row?.instance_id===scope.instanceId &&
      row?.instance_epoch===scope.instanceEpoch &&
      positive(row?.fencing_token)===fencingToken &&
      Number(row?.event_seq)===eventSeq &&
      row?.snapshot_sha256===snapshotSha256;
  };
  return Object.freeze({
    version:'13.8',acquire,renew,release,recordCheckpointDigest,
    privateServerOnly:true,durableLeaseWriterAvailable:true,
    checkpointRestorationAvailable:false,publicTransportInstalled:false,
    rewardWriterEnabled:false,productionReady:false,
  });
}
