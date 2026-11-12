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
 const [status,setStatus]=useState('loading');
 const body=creatorBody(config);
 useEffect(()=>{
  setStatus('loading');
  let instance;
  try {
   instance=createCreatorStage(mount.current,{url:body.url,gender:body.gender,rigId:body.rig_id,
    onReady:()=>setStatus('ready'),onError:()=>setStatus('error'),
    onState:s=>latest.current.onCustomizationState?.(s),
    onCapabilities:c=>latest.current.onCapabilities?.(c),ambientGaze:livingIdle});
   stage.current=instance;instance.appearance(latest.current.config);
  }catch{setStatus('error');}
  return()=>{instance?.dispose();stage.current=null;};
 },[body.url,body.gender,body.rig_id,livingIdle]);
 useEffect(()=>{stage.current?.appearance(config);},[config]);
 useEffect(()=>{stage.current?.focus(shot);},[shot,status]);
 useEffect(()=>{stage.current?.expression(expressionMorphs(expression?.values,expression?.morphs));},[expression]);
 useImperativeHandle(ref,()=>({rotate:a=>stage.current?.rotate(a),resetView:()=>stage.current?.resetView()}),[]);
 return <div className="creator-canvas" data-model-url={body.url} data-model-ready={status==='ready'} data-stage="fused"><div ref={mount} className="creator-canvas-mount"/>{status!=='ready'&&<span className="creator-canvas-status" role="status">{status==='error'?'3D preview unavailable on this device':'Loading character…'}</span>}</div>;
});

const CreatorStage=forwardRef(function CreatorStage({config,shot='body',expression,livingIdle=false,onCapabilities,onCustomizationState,resetKey=0},ref) {
 if(creatorBody(config))return <FusedStage key={config.creator_body} ref={ref} config={config} shot={shot} expression={expression} livingIdle={livingIdle} onCapabilities={onCapabilities} onCustomizationState={onCustomizationState}/>;
 // v5 bodies: the authored scene frames the face for close shots and the full body otherwise
 return <div className="creator-canvas" data-stage="v5"><GenesisModelPreview key={config.gender+'-'+resetKey} config={config} compact idleOnly stage focus={['face','head'].includes(shot)?'face':'body'} onCapabilities={onCapabilities} onCustomizationState={onCustomizationState}/></div>;
});
export default CreatorStage;
