// Procedural Conduit cue bank, borrowing the existing Duelist AudioContext
// and master gain. No assets, network requests, timers or extra context.
const TAU=2*Math.PI;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const AMBIENCE={reactor:[54,108,216],undercroft:[40,80,120],fan:[30,120,240]};
export function conduitCueWave(kind,sampleRate,options={}){
  const loop=Object.hasOwn(AMBIENCE,kind),duration=loop?2:kind==='pad'?.48:.16;
  const data=new Float32Array(Math.round(sampleRate*duration));
  let seed=123456789,low=0;
  const pitch=options.vertical==='above'?1.16:options.vertical==='below'?.81:1;
  for(let i=0;i<data.length;i++){
    const t=i/sampleRate;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1;low=low*.87+noise*.13;
    if(loop){
      const [a,b,c]=AMBIENCE[kind];
      data[i]=(.52*Math.sin(TAU*a*t)+.21*Math.sin(TAU*b*t)+.06*Math.sin(TAU*c*t))*(.8+.2*Math.cos(TAU*t));
    }else{
      const attack=Math.min(1,t/.004),tail=Math.max(0,1-t/duration);
      if(kind==='pad'){
        data[i]=attack*tail*tail*(.44*Math.sin(TAU*(100*t+620*t*t))+.19*Math.sin(TAU*(400*t+1200*t*t))+.14*low);
      }else{
        const metal=options.surface==='metal';
        data[i]=attack*tail*tail*(.55*low+.23*Math.sin(TAU*90*pitch*t)+
          (metal?.16:.035)*Math.sin(TAU*760*pitch*t)*Math.exp(-t*25)+.14*noise);
      }
    }
  }
  return data;
}
export function createConduitAudioBank(ctx,master){
  const buffers=new Map(),voices=new Set(),loops=new Map();
  let disposed=false;
  function buffer(kind,options={}){
    const key=[kind,options.surface,options.vertical].join(':');
    if(buffers.has(key))return buffers.get(key);
    const wave=conduitCueWave(kind,ctx.sampleRate,options);
    const b=ctx.createBuffer(1,wave.length,ctx.sampleRate);
    b.getChannelData(0).set(wave);buffers.set(key,b);return b;
  }
  function voice(kind,p,options={},loop=false){
    if(disposed||ctx.state!=='running'||!valid(p)||voices.size>=24)return null;
    const source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter(),pan=ctx.createPanner();
    source.buffer=buffer(kind,options);source.loop=loop;
    filter.type='lowpass';filter.frequency.value=clamp(Number.isFinite(options.cutoff)?options.cutoff:6500,150,10000);
    pan.panningModel='HRTF';pan.distanceModel='inverse';pan.refDistance=3;pan.rolloffFactor=.85;
    pan.positionX.value=p.x;pan.positionY.value=p.y;pan.positionZ.value=p.z;
    gain.gain.value=0;
    gain.gain.setTargetAtTime(clamp(Number.isFinite(options.gain)?options.gain:.5,0,1),ctx.currentTime,.015);
    source.connect(filter).connect(gain).connect(pan).connect(master);
    let stopped=false;
    const v={source,gain,stop(immediate=false){
      if(stopped)return;stopped=true;
      if(!immediate)gain.gain.setTargetAtTime(0,ctx.currentTime,.035);
      try{source.stop(ctx.currentTime+(immediate?0:.15));}catch{/* already ended */}
      if(immediate)cleanup();
    }};
    function cleanup(){source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();voices.delete(v);}
    source.onended=cleanup;voices.add(v);source.start();return v;
  }
  return {
    play(kind,p,options={}){
      if(kind!=='step'&&kind!=='pad')return false;
      const normalized={...options,surface:options.surface==='metal'?'metal':'concrete',vertical:options.vertical==='above'||options.vertical==='below'?options.vertical:'same'};
      return !!voice(kind,p,normalized);
    },
    setAmbience(sources){
      if(disposed)return;
      const desired=new Map(sources.filter(s=>valid(s)&&Object.hasOwn(AMBIENCE,s.kind)&&typeof s.id==='string').slice(0,2).map(s=>[s.id,s]));
      for(const [id,v] of loops)if(!desired.has(id)){v.stop();loops.delete(id);}
      for(const [id,s] of desired){
        let v=loops.get(id);
        if(!v){v=voice(s.kind,s,{gain:s.gain,cutoff:1800},true);if(v)loops.set(id,v);}
        if(v)v.gain.gain.setTargetAtTime(clamp(Number.isFinite(s.gain)?s.gain:0,0,.05),ctx.currentTime,.12);
      }
    },
    dispose(){if(disposed)return;disposed=true;for(const v of [...voices])v.stop(true);loops.clear();buffers.clear();}
  };
}
