// Game 3D multi-layer audio mixer.
// Independent spatial ambience beds fade smoothly and preserve currentTime
// when paused; foreground cues fire sample groups in the same game tick.
// No combat/music transport is replaced, and no sounds are loaded if absent.
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,Number.isFinite(Number(v))?Number(v):min));
export const SOUND_BED_POLICIES=Object.freeze(['continue','duck','pause']);

export function proximityVolume(distance,{near=4,far=85,power=1.6}={}){
  const d=Number(distance),lo=Math.max(0,Number(near)||0),hi=Math.max(lo+.001,Number(far)||85);
  if(!Number.isFinite(d))return 0;
  const closeness=clamp((hi-Math.max(0,d))/(hi-lo));
  return Math.pow(closeness,Math.max(.5,Number(power)||1.6));
}

/**
 * @param {Object} args
 * @param {(key:string)=>string|null} args.getSound - the existing uploaded audio map
 * @param {(key:string,options:Object)=>void} args.playSound - existing pooled one-shots
 * @param {(url:string)=>HTMLAudioElement} args.createAudio - injected for tests
 */
export function createLayeredWorldSoundscape({
  getSound=()=>null,
  playSound=()=>{},
  createAudio=(url)=>new Audio(url),
  maxCueVolume=.86,
}={}){
  const beds=new Map();
  let disposed=false,combat=false,unlocked=false;

  function ensureBed(key,config){
    const url=getSound(key);
    let bed=beds.get(key);
    if(bed&&bed.url!==url){
      try{bed.audio?.pause();}catch{}
      beds.delete(key);
      bed=null;
    }
    if(!bed){
      let audio=null;
      if(url){
        try{audio=createAudio(url);audio.loop=true;audio.volume=0;}catch{}
      }
      bed={key,url,audio,current:0,desired:0,policy:'continue',
        duckVolume:.5,fadeSeconds:.7,playRequested:false};
      beds.set(key,bed);
    }
    bed.policy=SOUND_BED_POLICIES.includes(config.policy)?config.policy:'continue';
    bed.duckVolume=clamp(config.duckVolume??.5);
    bed.fadeSeconds=Math.max(.1,Number(config.fadeSeconds)||.7);
    return bed;
  }

  // Each caller owns a lane: river, waterfalls, room tone, wind, rain, etc.
  // Missing uploads safely create silent lanes; map assignment is hot-swappable.
  function setBed(key,{
    distance=0,near=0,far=80,power=1.6,volume=.5,enabled=true,
    policy='continue',duckVolume=.5,fadeSeconds=.7,
  }={}){
    if(disposed||typeof key!=='string'||!key)return;
    const bed=ensureBed(key,{policy,duckVolume,fadeSeconds});
    bed.desired=bed.audio && enabled ?
      clamp(volume)*proximityVolume(distance,{near,far,power}) : 0;
  }

  function update(dt,{inCombat=false,muted=false}={}){
    if(disposed)return;
    combat=!!inCombat;
    const step=clamp(dt,0,.25);
    for(const bed of beds.values()){
      if(muted){
        // Character-login screen, character selection and gameplay exit
        // must have *zero* lingering outdoor audio, not a slow fade that
        // is audible over the title theme.
        bed.current=0;
        if(bed.audio){
          bed.audio.volume=0;
          if(!bed.audio.paused)try{bed.audio.pause();}catch{}
        }
        continue;
      }
      let target=bed.desired;
      if(combat){
        if(bed.policy==='pause')target=0;
        else if(bed.policy==='duck')target*=bed.duckVolume;
      }
      const blend=1-Math.exp(-step/bed.fadeSeconds);
      bed.current+= (target-bed.current)*blend;
      if(!bed.audio)continue;
      bed.audio.volume=clamp(bed.current);
      if(bed.current>.008){
        if(bed.audio.paused&&!bed.playRequested&&unlocked){
          bed.playRequested=true;
          try{
            const started=bed.audio.play();
            Promise.resolve(started).catch(()=>{}).finally(()=>{bed.playRequested=false;});
          }catch{bed.playRequested=false;}
        }
      }else if(bed.audio.paused===false){
        // pause preserves currentTime; the next approach/exit-combat resumes.
        try{bed.audio.pause();}catch{}
      }
    }
  }

  // Browser playback may be blocked until input. Invoke on a real
  // pointer/keyboard gesture; never force audio on silent page load.
  function unlock(){
    if(disposed)return;
    unlocked=true;
    for(const bed of beds.values()){
      if(bed.audio?.paused && bed.current>.008){
        try{const p=bed.audio.play();Promise.resolve(p).catch(()=>{});}catch{}
      }
    }
  }

  // Synchronous cue mixing keeps sword, moving air and the optional cut
  // transient together. A headroom budget prevents hard digital clipping.
  function playLayers(layers, {gain=1,limit=maxCueVolume}={}){
    if(disposed||!Array.isArray(layers))return [];
    const ready=layers
      .filter(layer=>typeof layer?.key==='string'&&!!getSound(layer.key))
      .map(layer=>({key:layer.key,volume:clamp(layer.volume??.5)*clamp(gain)}))
      .filter(layer=>layer.volume>0);
    if(!ready.length)return [];
    const sum=ready.reduce((n,layer)=>n+layer.volume,0);
    const scalar=Math.min(1,Math.max(0,Number(limit)||0)/sum);
    for(const layer of ready)playSound(layer.key,{volume:clamp(layer.volume*scalar)});
    return ready.map(layer=>layer.key);
  }

  function playSwing({baseKey=null,melee=true}={}){
    const layers=baseKey?[{key:baseKey,volume:.66}]:[];
    if(melee)layers.push({key:'player_blade_wind',volume:.42});
    if(melee)layers.push({key:'player_blade_resonance',volume:.19});
    return playLayers(layers,{limit:.85});
  }
  function playImpact({melee=true,critical=false}={}){
    if(!melee)return [];
    // The existing CombatSystem owns the impact hit and critical/lethal
    // sound; this is only the additional blade-contact transient.
    return playLayers([
      {key:'player_blade_cut',volume:critical?.56:.43},
    ],{limit:.55});
  }
  function getBeds(){
    return [...beds.values()].map(({key,desired,current,policy,audio})=>({
      key,desired,current,policy,playing:!!audio&&!audio.paused,
      position:audio?.currentTime??0,
    }));
  }
  function dispose(){
    if(disposed)return;
    disposed=true;
    for(const bed of beds.values()){
      try{bed.audio?.pause();bed.audio?.removeAttribute?.('src');
        bed.audio?.load?.();}catch{}
    }
    beds.clear();
  }
  return {setBed,update,unlock,playLayers,playSwing,playImpact,getBeds,dispose};
}
