/** Validate screenshot PNG integrity only; never certifies visible pixels or native WebGPU. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i=0;i<8;i++) crc = (crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
export function inspectPngArtifact(input) {
  const fail = (reason) => ({ok:false,reason});
  if (!Buffer.isBuffer(input) || input.length<45 || input.length>32*1024*1024) return fail('invalid-png-size');
  if (!input.subarray(0,8).equals(SIGNATURE)) return fail('invalid-png-signature');
  let offset=8, width=0, height=0, seenIHDR=false, seenIDAT=false, seenIEND=false;
  while (offset+12<=input.length) {
    const size=input.readUInt32BE(offset);
    if (size>input.length-offset-12) return fail('truncated-png-chunk');
    const type=input.toString('ascii',offset+4,offset+8);
    if (!/^[A-Za-z]{4}$/.test(type)) return fail('invalid-png-chunk-type');
    const start=offset+8, end=start+size;
    if (crc32(input.subarray(offset+4,end))!==input.readUInt32BE(end)) return fail('png-crc-mismatch');
    if (!seenIHDR && type!=='IHDR') return fail('missing-png-header');
    if (type==='IHDR') {
      if (seenIHDR || size!==13) return fail('invalid-png-header');
      seenIHDR=true;
      width=input.readUInt32BE(start); height=input.readUInt32BE(start+4);
      if (width<64 || height<64 || width>16384 || height>16384) return fail('invalid-screenshot-dimensions');
      if (input[start+10]!==0 || input[start+11]!==0 || input[start+12]!==0) return fail('unsupported-png-header');
    }
    if (type==='IDAT') {
      if (seenIEND || size===0) return fail('invalid-png-image-data');
      seenIDAT=true;
    }
    if (type==='IEND') {
      if (size!==0 || !seenIDAT || end+4!==input.length) return fail('invalid-png-end');
      seenIEND=true; break;
    }
    offset=end+4;
  }
  if (!seenIHDR || !seenIDAT || !seenIEND) return fail('incomplete-png');
  return {ok:true,reason:'png-structure-and-crc-valid',width,height,bytes:input.length,
    warning:'PNG integrity is not proof of visible game pixels or native WebGPU; inspect manually alongside browser QA JSON.'};
}
export async function main(args=process.argv.slice(2)) {
  if (args.length!==1) throw new Error('Provide exactly one local screenshot PNG path');
  const result=inspectPngArtifact(await readFile(resolve(args[0])));
  console.log(JSON.stringify(result,null,2));
  if (!result.ok) process.exitCode=1;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error('Screenshot QA error: '+error.message);process.exitCode=1;});
}
