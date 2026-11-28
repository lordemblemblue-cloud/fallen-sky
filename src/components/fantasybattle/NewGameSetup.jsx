import { useEffect, useState } from 'react';
import { previewNewGameHero } from './newGamePreview.js';

function HeroPreview({portrait}){
 const [preview,setPreview]=useState(null);
 const [status,setStatus]=useState('loading');
 useEffect(()=>{
  let active=true;
  const timer=setTimeout(()=>{if(active)setStatus('fallback');},12000);
  previewNewGameHero().then(url=>{if(active){setPreview(url);setStatus(url?'ready':'fallback');}}).catch(()=>{if(active)setStatus('fallback');}).finally(()=>clearTimeout(timer));
  return()=>{active=false;clearTimeout(timer);};
 },[]);
 return <div className="fa-new-hero">
   <div className="fa-new-hero-halo" aria-hidden="true"/>
   {preview?<img className="fa-new-hero-model" src={preview} alt="Full character preview of the playable archer"/>:
    <div className="fa-new-hero-fallback">{status==='fallback'&&portrait}<small role="status">{status==='loading'?'Loading character preview…':'Character preview unavailable · portrait shown'}</small></div>}
   <div className="fa-new-hero-caption"><span>Starting class</span><strong>Archer</strong><small>Ranged combat · Bow</small></div>
 </div>;
}
const qualityNames=['performance','balanced','high','cinematic'];
function Action({children,primary=false,...props}){return <button type="button" className={'fa-new-action'+(primary?' primary':'')} {...props}>{children}</button>;}
export default function NewGameSetup({step,name,onName,settings,onSettings,back,onNext,onStart,onSettingsPage,focusRef,portrait}){
 const character=step==='character';
 const valid=Boolean(name.trim());
 return <div className="fa-new-game">
  <header className="fa-new-brand"><span>Fantasy Battle</span><small>New Game</small></header>
  <HeroPreview portrait={portrait}/>
  <section className="fa-new-detail" aria-labelledby="fa-new-heading">
    <div className="fa-new-step"><span aria-current={character?'step':undefined}>01 · Character</span><span aria-hidden="true">◇</span><span aria-current={!character?'step':undefined}>02 · Preferences</span></div>
    <h1 id="fa-new-heading" tabIndex={-1} ref={focusRef}>{character?'Create your character':'Ready to begin?'}</h1>
    <div className="fa-new-rule" aria-hidden="true">✧</div>
    {character?<><p>Choose a name for your adventurer.</p>
      <label className="fa-new-name">Character name<input value={name} maxLength={40} onChange={e=>onName(e.target.value)} placeholder="Enter character name" autoComplete="off" onKeyDown={e=>{if(e.key==='Enter'&&valid){e.preventDefault();onNext();}}}/></label>
      <dl className="fa-new-info"><div><dt>Starting class</dt><dd>Archer</dd></div><div><dt>Weapon</dt><dd>Bow</dd></div><div><dt>Starting level</dt><dd>1</dd></div></dl>
      <p className="fa-new-note">No account required. Your adventure is saved locally on this browser.</p>
    </>:<>
      <p><strong>{name.trim()}</strong> · Level 1 Archer</p>
      <p>These preferences are optional. Keep the recommended defaults or change them now.</p>
      <div className="fa-new-preferences">
       <label><span>Graphics quality</span><select value={settings.quality} onChange={e=>{if(qualityNames.includes(e.target.value))onSettings({quality:e.target.value});}}>{qualityNames.map(q=><option key={q} value={q}>{q[0].toUpperCase()+q.slice(1)}</option>)}</select></label>
       <label><span>Mute battle audio</span><input type="checkbox" role="switch" checked={settings.muted} onChange={e=>onSettings({muted:e.target.checked})}/></label>
       <label><span>Reduce UI and clothing motion</span><input type="checkbox" role="switch" checked={settings.reducedMotion} onChange={e=>onSettings({reducedMotion:e.target.checked})}/></label>
      </div>
      <Action onClick={onSettingsPage}>More settings</Action>
      <p className="fa-new-note">You can change your preferences at any time. Existing saves will not be overwritten automatically.</p>
    </>}
    <div className="fa-new-actions"><Action onClick={back}>‹ Back</Action><Action primary disabled={!valid} onClick={character?onNext:onStart}>{character?'Next ›':'Begin Adventure ›'}</Action></div>
  </section>
 </div>;
}
