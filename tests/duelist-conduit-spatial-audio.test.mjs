import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createConduitSpatialAudio,conduitAcousticCue,conduitAmbienceSources} from '../src/components/duelist/client/maps/conduitSpatialAudio.mjs';
import {createConduitAudioBank,conduitCueWave} from '../src/components/duelist/client/maps/conduitAudioBank.mjs';
const cfg={yT0:-5,yT1Bldg:.65,buildings:[-3*Math.PI/4,3*Math.PI/4,-Math.PI/4,Math.PI/4].map((angle,i)=>({id:String(i),angle}))};
const listener={x:0,y:0,z:0};
test('different elevation cues, wall attenuation and bounded ambience source plan',()=>{
  const above=conduitAcousticCue({x:2,y:5,z:0},listener),below=conduitAcousticCue({x:2,y:-5,z:0},listener);
  assert.equal(above.vertical,'above');assert.equal(below.vertical,'below');assert.equal(above.surface,'metal');
  const clear=conduitAcousticCue({x:2,y:0,z:0},listener);
  const blocked=conduitAcousticCue({x:2,y:0,z:0},listener,true);
  assert.equal(clear.surface,'concrete');assert.ok(blocked.cutoff<clear.cutoff&&blocked.gain<clear.gain);
  assert.equal(conduitAmbienceSources(cfg).length,10);
});
test('footstep scheduling excludes hidden, airborne and idle actors; pads deduplicate',()=>{
  const calls=[],ambience=[];
  const audio={state:'running',muted:false,playConduitCue(...a){calls.push(a);},setConduitAmbience(a){ambience.push(a);}};
  const fx=createConduitSpatialAudio(audio,cfg,{quality:'low'});
  const actor={id:'a',audible:true,grounded:true,moving:true,alive:true,y:0,z:0};
  const update=(elapsed,x,changes={})=>fx.update({elapsed,listener,actors:[{...actor,x,...changes}]});
  assert.equal(update(0,0),0);assert.equal(update(.2,1.2),1);
  assert.equal(update(.3,2.4,{audible:false}),0);
  assert.equal(update(.4,3.6,{grounded:false}),0);
  assert.equal(update(.5,4.8,{moving:false}),0);
  assert.equal(update(.6,6),0);assert.equal(update(.7,9),0);
  const pad={id:'p',x:0,y:5,z:2},event={eventId:'p1',padId:'p',elapsed:.7,listener};
  assert.equal(fx.padActivated(event,[pad]),true);assert.equal(fx.padActivated(event,[pad]),false);
  assert.equal(calls.length,2);assert.ok(ambience.every(s=>s.length<=1));
  audio.muted=true;assert.equal(update(.8,10),0);
  assert.deepEqual(ambience.at(-1),[]);
  fx.dispose();assert.equal(update(1,11),0);
});
test('procedural waveforms are deterministic, bounded, distinct and asset-free',()=>{
  const a=conduitCueWave('step',8000,{surface:'metal',vertical:'above'});
  const b=conduitCueWave('step',8000,{surface:'metal',vertical:'below'});
  assert.equal(a.length,1280);assert.notDeepEqual(a,b);
  assert.deepEqual(a,conduitCueWave('step',8000,{surface:'metal',vertical:'above'}));
  for(const kind of ['step','pad','reactor','undercroft','fan']){
    const wave=conduitCueWave(kind,8000);
    assert.ok(wave.every(v=>Number.isFinite(v)&&Math.abs(v)<=1));
    assert.ok(wave.some(v=>v!==0));
  }
});
test('audio bank shares provided context and disconnects voices and loops on disposal',()=>{
  const nodes=[],param=()=>({value:0,setTargetAtTime(v){this.value=v;}});
  function node(){const n={gain:param(),frequency:param(),positionX:param(),positionY:param(),positionZ:param(),connect(dest){return dest;},disconnect(){this.disconnected=true;},start(){this.started=true;},stop(){this.stopped=true;}};nodes.push(n);return n;}
  const ctx={state:'running',sampleRate:8000,currentTime:0,createBuffer(c,n){const d=new Float32Array(n);return {getChannelData(){return d;}};},createBufferSource:node,createGain:node,createBiquadFilter:node,createPanner:node};
  const master=node(),bank=createConduitAudioBank(ctx,master);
  for(let i=0;i<24;i++)assert.equal(bank.play('step',listener),true);
  assert.equal(bank.play('step',listener),false);
  const first=nodes[1];first.onended();assert.equal(first.disconnected,true);
  assert.equal(bank.play('pad',listener),true);bank.dispose();
  assert.ok(nodes.slice(1).every(n=>n.disconnected));assert.ok(!master.disconnected);
  assert.equal(bank.play('step',listener),false);
});
