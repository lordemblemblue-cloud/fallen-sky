import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { inspectPngArtifact } from '../scripts/webgpu-screenshot-artifact-check.mjs';
function crc32(bytes) {
  let crc=0xffffffff;
  for (const byte of bytes) { crc^=byte; for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc^0xffffffff)>>>0;
}
function chunk(type,data) {
  const tag=Buffer.from(type), len=Buffer.alloc(4), check=Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  check.writeUInt32BE(crc32(Buffer.concat([tag,data])));
  return Buffer.concat([len,tag,data,check]);
}
function png(width=64,height=64) {
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height,4);
  ihdr[8]=8; ihdr[9]=6;
  const pixels=Buffer.alloc(height*(1+width*4));
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
test('valid screenshot-shaped PNG reports dimensions without certifying pixels',()=>{
  const result=inspectPngArtifact(png(128,72));
  assert.equal(result.ok,true); assert.equal(result.width,128); assert.equal(result.height,72);
  assert.match(result.warning,/not proof/);
});
test('missing, truncated, corrupt and trailing PNG evidence fails closed',()=>{
  const good=png();
  assert.equal(inspectPngArtifact(null).ok,false);
  assert.equal(inspectPngArtifact(Buffer.from('not an image')).ok,false);
  assert.equal(inspectPngArtifact(good.subarray(0,-3)).ok,false);
  const corrupt=Buffer.from(good); corrupt[24]^=1;
  assert.equal(inspectPngArtifact(corrupt).reason,'png-crc-mismatch');
  assert.equal(inspectPngArtifact(Buffer.concat([good,Buffer.from('junk')])).reason,'invalid-png-end');
});
test('tiny and oversized screenshot dimensions are rejected',()=>{
  assert.equal(inspectPngArtifact(png(1,64)).reason,'invalid-screenshot-dimensions');
  assert.equal(inspectPngArtifact(png(64,1)).reason,'invalid-screenshot-dimensions');
  assert.equal(inspectPngArtifact(png(16385,64)).reason,'invalid-screenshot-dimensions');
});
test('PNG structure requires image data before terminal IEND',()=>{
  const good=png(), start=good.indexOf(Buffer.from('IDAT'))-4;
  const missing=Buffer.concat([good.subarray(0,start),good.subarray(good.length-12)]);
  assert.equal(inspectPngArtifact(missing).reason,'invalid-png-end');
});
