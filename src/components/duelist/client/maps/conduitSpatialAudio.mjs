// Conduit-only scheduling. Inputs must come from the host's permitted audio
// presentation state, not raw hidden opponents or guessed jump-pad events.
export const CONDUIT_AUDIO_BUDGETS=Object.freeze({
  low:Object.freeze({steps:8,range:19,ambience:1}),
  medium:Object.freeze({steps:12,range:23,ambience:2}),
  high:Object.freeze({steps:16,range:26,ambience:2})
});
const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const copy=p=>({x:p.x,y:p.y,z:p.z});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const tier=y=>y<-2.5?'T0':y>=3.2?'T2':'T1';
export function conduitAcousticCue(source,listener,occluded=false){
  if(!valid(source)||!valid(listener))return null;
  const level=tier(source.y),relative=source.y-listener.y;
  const vertical=relative>2.1?'above':relative< -2.1?'below':'same';
  const throughFloor=level!==tier(listener.y)&&vertical!=='same';
  return {surface:level==='T1'?'concrete':'metal',vertical,cutoff:occluded?650:throughFloor?1100:6500,gain:occluded?.28:throughFloor?.55:1};
}
export function conduitAmbienceSources(cfg){
  const sources=[{id:'reactor',kind:'reactor',x:0,y:15.8,z:0},{id:'undercroft',kind:'undercroft',x:0,y:-2.5,z:0}];
  for(const b of cfg.buildings){
    const s=Math.sin(b.angle),c=Math.cos(b.angle);
    sources.push({id:b.id+'-fan',kind:'fan',x:38*s+6.8*c+6.43*s,y:cfg.yT0+3.7,z:38*c-6.8*s+6.43*c});
    sources.push({id:b.id+'-upper-fan',kind:'fan',x:38*s+6.6*c+5.23*s,y:cfg.yT1Bldg+7.85,z:38*c-6.6*s+5.23*c});
  }
  return sources;
}
// audio = existing Duelist audio object; no own AudioContext or timer.
// occluded callback is optional until the shared collision/LOS adapter exists.
export function createConduitSpatialAudio(audio,cfg,{quality='medium',occluded=null}={}){
  const budget=Object.hasOwn(CONDUIT_AUDIO_BUDGETS,quality)?CONDUIT_AUDIO_BUDGETS[quality]:CONDUIT_AUDIO_BUDGETS.medium;
  const sources=conduitAmbienceSources(cfg),tracks=new Map(),events=new Map();
  let enabled=true,disposed=false,lastTime=null,lastAmbience=-Infinity,credits=budget.steps;
  const running=()=>enabled&&!disposed&&audio.state==='running'&&!audio.muted;
  const clear=()=>{tracks.clear();events.clear();audio.setConduitAmbience([]);lastTime=null;lastAmbience=-Infinity;credits=budget.steps;};
  function update({elapsed,listener,actors=[]}){
    if(!running()){if(lastTime!==null)clear();return 0;}
    if(!valid(listener)||!Number.isFinite(elapsed)||elapsed<0||!Array.isArray(actors))return 0;
    const dt=lastTime===null?0:elapsed-lastTime;
    if(dt<0||dt>.5)clear();
    else credits=Math.min(budget.steps,credits+dt*budget.steps);
    lastTime=elapsed;
    const nearby=actors.filter(a=>a&&a.audible===true&&typeof a.id==='string'&&valid(a)&&distance(a,listener)<=budget.range)
      .sort((a,b)=>distance(a,listener)-distance(b,listener)||a.id.localeCompare(b.id)).slice(0,64);
    const seen=new Set();let played=0;
    for(const a of nearby){
      if(seen.has(a.id))continue;seen.add(a.id);
      const old=tracks.get(a.id);
      const eligible=a.grounded===true&&a.moving===true&&a.alive===true;
      if(!old||!eligible||!old.eligible){tracks.set(a.id,{...copy(a),eligible,travel:0});continue;}
      const d=Math.hypot(a.x-old.x,a.z-old.z),dy=Math.abs(a.y-old.y);
      const travel=d>2.5||dy>1.1?0:old.travel+d;
      const stride=a.sprinting===true?1.45:1.10;
      const step=travel>=stride;
      tracks.set(a.id,{...copy(a),eligible,travel:step?travel%stride:travel});
      if(step&&credits>=1&&played<4){
        const cue=conduitAcousticCue(a,listener,occluded?.(listener,a)===true);
        audio.playConduitCue('step',copy(a),{...cue,gain:cue.gain*(a.local===true?.32:.7)});
        credits--;played++;
      }
    }
    for(const id of tracks.keys())if(!seen.has(id))tracks.delete(id);
    if(elapsed-lastAmbience>=.25){
      lastAmbience=elapsed;
      const nearest=sources.map(s=>({...s,d:distance(s,listener)})).filter(s=>s.d<24).sort((a,b)=>a.d-b.d||a.id.localeCompare(b.id)).slice(0,budget.ambience);
      audio.setConduitAmbience(nearest.map(s=>({...s,gain:.035*(1-s.d/24)*(occluded?.(listener,s)===true?.35:1)})));
    }
    return played;
  }
  function padActivated({eventId,padId,elapsed,listener},pads){
    if(!running()||!valid(listener)||typeof eventId!=='string'||eventId.length>128||!Number.isFinite(elapsed)||elapsed<0)return false;
    const pad=pads.find(p=>p.id===padId);
    if(!valid(pad)||distance(pad,listener)>budget.range||events.has(eventId))return false;
    if(events.size>=128)events.delete(events.keys().next().value);
    events.set(eventId,elapsed);
    audio.playConduitCue('pad',copy(pad),{...conduitAcousticCue(pad,listener,occluded?.(listener,pad)===true),gain:.65});
    return true;
  }
  return {budget,update,padActivated,setEnabled(value){if(disposed)return;enabled=!!value;if(!enabled)clear();},
    dispose(){if(disposed)return;clear();disposed=true;}};
}
