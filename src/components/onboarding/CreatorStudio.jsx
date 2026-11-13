import { useEffect, useRef, useState } from 'react';
import { Shuffle, RotateCcw, Eye, EyeOff } from 'lucide-react';
import CreatorStage from '@/components/onboarding/CreatorStage';
import { CREATOR_SECTIONS } from '@/components/onboarding/creatorOptions';
export default function CreatorStudio({config,shot,expression,onCapabilities,onCustomizationState,layers={},section,onSection,onRandomize,brand,kicker,topTools,title,panel,footer}) {
 const [hidden,setHidden]=useState(false),[resetKey,setResetKey]=useState(0),stage=useRef(null);
 useEffect(()=>{const key=e=>{if(e.target.closest?.('input,textarea,select,[contenteditable="true"]')||e.metaKey||e.ctrlKey||e.altKey)return;if(e.key.toLowerCase()==='h'){e.preventDefault();setHidden(value=>!value);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const index=CREATOR_SECTIONS.findIndex(item=>item.id===section);
 return <div className="creator-studio" data-ui={hidden?'hidden':'shown'} data-rail="on">
  <div className="creator-backdrop" aria-hidden="true"/>
  <section className="creator-stage" aria-label="Live character preview"><CreatorStage ref={stage} config={config} shot={shot} expression={expression} onCapabilities={onCapabilities} onCustomizationState={onCustomizationState} resetKey={resetKey}/></section>
  <header className="creator-topline"><div className="creator-brand">{brand}</div><div className="creator-tools" role="toolbar" aria-label="Preview tools">
   <button type="button" className="creator-tool" onClick={onRandomize} aria-label="Randomize appearance" title="Randomize"><Shuffle size={16}/></button>
   <button type="button" className="creator-tool" onClick={()=>stage.current?.resetView?stage.current.resetView():setResetKey(key=>key+1)} aria-label="Reset preview camera" title="Reset view"><RotateCcw size={16}/></button>
   <button type="button" className="creator-tool" onClick={()=>setHidden(value=>!value)} aria-pressed={hidden} aria-label={hidden?'Show interface':'Hide interface'} title="Hide or show interface (H)">{hidden?<Eye size={16}/>:<EyeOff size={16}/>}</button>{topTools}
  </div></header>
  <aside className="creator-rail" aria-hidden={hidden||undefined} inert={hidden?true:undefined}><nav className="creator-navigation" aria-label="Character customization categories">{CREATOR_SECTIONS.map(({id,label,icon:Icon})=><button type="button" key={id} title={label} aria-label={label} aria-current={section===id?'page':undefined} onClick={()=>onSection(id)}><Icon size={20}/><span className="creator-rail-label">{label}</span></button>)}</nav></aside>
  <section className="creator-panel" aria-label="Appearance options" aria-hidden={hidden||undefined} inert={hidden?true:undefined}>
   <span className="creator-panel-sheen" aria-hidden="true"/><header className="creator-panel-head">{kicker&&<p>{kicker}</p>}<h2>{title||CREATOR_SECTIONS[index]?.label}</h2><span className="creator-panel-count">{String(index+1).padStart(2,'0')}<i>/</i>{String(CREATOR_SECTIONS.length).padStart(2,'0')}</span></header>
   <div className="creator-panel-scroll">{panel}</div><footer className="creator-panel-foot">{footer}</footer>
  </section>
  {layers.loading&&<p className="creator-preview-status" role="status">Fitting layers…</p>}{layers.error&&<p className="creator-preview-error" role="alert">{layers.error}</p>}
  <p className="creator-gesture-hint" aria-hidden="true">Drag to turn · Pinch or scroll to zoom</p>
 </div>;
}