// Build-only tool. A trusted CI checkout creates the shared layout asset; the
// deployed game must never build a manifest from request data.
import {writeFile, mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createConduitArena} from '../src/components/duelist/client/maps/conduitArena.mjs';
import {buildConduitMatchManifest,createConduitMatchAdapter} from '../src/components/duelist/sim/conduitMatchAdapter.mjs';
const target=process.argv[2];
if(!target)throw new Error('Usage: node scripts/export-duelist-conduit-manifest.mjs <output.json>');
const prior=globalThis.document;
const ctx=new Proxy({}, {get:(o,k)=>k==='createRadialGradient'?()=>({addColorStop(){}}):o[k]??(()=>{})});
globalThis.document={createElement(tag){if(tag!=='canvas')throw new Error('Unexpected element');return {width:0,height:0,getContext:()=>ctx};}};
let arena;
try{
  arena=createConduitArena(new THREE.Scene(),{quality:'low',enableLights:false});
  const manifest=buildConduitMatchManifest(arena);
  const tdm=createConduitMatchAdapter(manifest,{mode:'tdm'});
  const ffa=createConduitMatchAdapter(manifest,{mode:'ffa',random:()=>0});
  if(tdm.modeSpawnCandidates.blue.length<4||tdm.modeSpawnCandidates.red.length<4||ffa.modeSpawnCandidates.length<6||!manifest.pickups.every(p=>tdm.pickupPositionClear(p.id)))throw new Error('Insufficient safe positions');
  const json=JSON.stringify(manifest);
  const sha256=createHash('sha256').update(json,'utf8').digest('hex');
  const output=resolve(target);await mkdir(dirname(output),{recursive:true});
  await writeFile(output,json,'utf8');
  await writeFile(output+'.sha256',sha256+'\n','utf8');
  console.log('CONDUIT_MANIFEST '+JSON.stringify({id:manifest.id,version:manifest.version,sha256,bytes:Buffer.byteLength(json),tdmBlue:tdm.modeSpawnCandidates.blue.length,tdmRed:tdm.modeSpawnCandidates.red.length,ffa:ffa.modeSpawnCandidates.length}));
}finally{arena?.dispose();if(prior===undefined)delete globalThis.document;else globalThis.document=prior;}
