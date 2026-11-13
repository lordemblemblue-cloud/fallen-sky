// The creator's full-screen 3D character. Fused creator bodies use the dedicated
// creatorStageScene.js scene (per-category camera shots, drag-to-rotate, expression
// preview); the animated v5 bodies keep their authored GenesisModelPreview scene.
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import GenesisModelPreview from './GenesisModelPreview';
import {createCreatorStage} from './creatorStageScene';
import {creatorBody,expressionMorphs} from './avatarCustomization';

const FusedStage=forwardRef(function FusedStage({config,shot,expression,livingIdle=false,onCapabilities,onCustomizationState},ref) {
 const mount=useRef(null),stage=useRef(null),latest=useRef({config,onCapabilities,onCustomizationState});
 latest.current={config,onCapabilities,onCustomizationState};
 const [status,setStatus]=useState('loading'),[error,setError]=useState('');
 const [retryCount,setRetryCount]=useState(0);
 const body=creatorBody(config);
 useEffect(()=>{
  setStatus('loading');setError('');
  let instance,active=true;
  const fail=e=>{
   if(!active)return;
   const detail=e?.message||'Original Eve/Adam model could not initialize.';
   setError(detail);setStatus('error');
   latest.current.onCustomizationState?.({loading:false,error:detail});
  };
  const timeout=window.setTimeout(()=>fail(new Error('Character preview did not finish loading. Check the original GLB asset in this deployment.')),20000);
  try {
   instance=createCreatorStage(mount.current,{url:body.url,gender:body.gender,rigId:body.rig_id,
    onReady:()=>{if(active){window.clearTimeout(timeout);setStatus('ready');setError('');}},
    onError:fail,
    onState:s=>{if(active)latest.current.onCustomizationState?.(s);},
    onCapabilities:c=>{if(active)latest.current.onCapabilities?.(c);},ambientGaze:livingIdle});
   stage.current=instance;instance.appearance(latest.current.config);
  }catch(e){fail(e);}
  return()=>{active=false;window.clearTimeout(timeout);instance?.dispose();stage.current=null;};
 },[body.url,body.gender,body.rig_id,livingIdle,retryCount]);
 useEffect(()=>{stage.current?.appearance(config);},[config]);
 useEffect(()=>{stage.current?.focus(shot);},[shot,status]);
 useEffect(()=>{
  const strength=Number.isFinite(Number(expression?.intensity))?Math.max(0,Math.min(1,Number(expression.intensity))):1;
  const scale=obj=>Object.fromEntries(Object.entries(obj||{}).map(([key,value])=>[key,Math.max(0,Math.min(1,Number(value)||0))*strength]));
  stage.current?.expression(expressionMorphs(scale(expression?.values),scale(expression?.morphs)));
 },[expression]);
 useImperativeHandle(ref,()=>({rotate:a=>stage.current?.rotate(a),resetView:()=>stage.current?.resetView()}),[]);
 return <div className="creator-canvas" data-model-url={body.url} data-model-ready={status==='ready'} data-stage="fused">
  <div ref={mount} className="creator-canvas-mount"/>
  {status==='loading'&&<span className="creator-canvas-status" role="status">Loading the original {body.label} model…</span>}
  {status==='error'&&<div className="creator-canvas-error" role="alert">
    <strong>{body.label} model unavailable</strong>
    <p>{error}</p>
    <code>{body.url}</code>
    <button type="button" onClick={()=>setRetryCount(n=>n+1)}>Retry original model</button>
  </div>}
 </div>;
});

const CreatorStage=forwardRef(function CreatorStage({config,shot='body',expression,livingIdle=false,onCapabilities,onCustomizationState,resetKey=0},ref) {
 if(creatorBody(config))return <FusedStage key={config.creator_body} ref={ref} config={config} shot={shot} expression={expression} livingIdle={livingIdle} onCapabilities={onCapabilities} onCustomizationState={onCustomizationState}/>;
 // v5 bodies: the authored scene frames the face for close shots and the full body otherwise
 return <div className="creator-canvas" data-stage="v5"><GenesisModelPreview key={config.gender+'-'+resetKey} config={config} compact idleOnly stage focus={['face','head'].includes(shot)?'face':'body'} onCapabilities={onCapabilities} onCustomizationState={onCustomizationState}/></div>;
});
export default CreatorStage;