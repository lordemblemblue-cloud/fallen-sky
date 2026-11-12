import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, BookOpen, Boxes, ChevronLeft, Copy, Download, FilePlus2, Hammer,
  LockKeyhole, Package, Plus, Search, ShieldCheck, Sparkles, Tag, Trash2,
  UnlockKeyhole, Upload, X,
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { isDeveloperVersion } from '@/config/developerOnly.mjs';
import {
  CHRONICLE_BOX_SIZE, CHRONICLE_STARTER_BOXES, CHRONICLE_KINDS,
  CHRONICLE_RARITIES, CHRONICLE_EQUIPMENT_SLOTS, CHRONICLE_STATS,
  initialChronicleLibrary, createChronicleBox, duplicateChronicleBox, removeChronicleBox,
  editChronicleBox, repositionChronicleBox, editChronicleSlot, moveChronicleSlot,
  searchChronicle, countChronicleBlueprints,
} from './chronicleBlueprintModel.mjs';
import {
  loadChronicleBlueprints, saveChronicleBlueprints,
  createChronicleBlueprintBackup, parseChronicleBlueprintBackup,
} from './chronicleBlueprintStorage.mjs';
import { previewChronicleBlueprintDraft } from './chronicleBlueprintPreview.mjs';
import { createChronicleReviewProposal829 } from './chronicleCatalogProposal829.mjs';
import './ChronicleBlueprintLibrary.css';

const starter = kind => ({
  kind:CHRONICLE_KINDS.includes(kind)?kind:'equipment',
  name:'',description:'',rarity:'Common',slot:'weapon',
  levelMin:1,levelMax:50,statsText:'strength: 0\nvitals: 0\ndexterity: 0\nspirit: 0',
  setId:'',skillId:'',materialType:'',tags:'',dropSource:'',dropChance:0,
  notes:'',slotLabel:'',
});
const toDraft=(blueprint,slotLabel)=>blueprint
  ? {...blueprint,statsText:Object.entries(blueprint.stats||{})
    .map(([name,value])=>name+': '+value).join('\n'),slotLabel}
  : null;
const parseStats=input=>{
  const stats={};
  for(const raw of String(input||'').split(/\r?\n/)){
    const line=raw.trim();if(!line)continue;
    const divider=line.indexOf(':');
    if(divider<1)throw Error('Use one core stat per line, e.g. strength: 25');
    const key=line.slice(0,divider).trim().toLowerCase();
    const value=Number(line.slice(divider+1).trim());
    if(!CHRONICLE_STATS.includes(key)||!Number.isFinite(value)||
      Math.abs(value)>1000000)throw Error('Invalid stat '+key);
    stats[key]=value;
  }
  return stats;
};
const nameFor=index=>String(index+1).padStart(3,'0');
const kindIcon={equipment:Hammer,material:Package,skill:Sparkles};
const catChoices=[{id:'mixed',name:'Mixed'},...CHRONICLE_KINDS.map(id=>({
  id,name:id.charAt(0).toUpperCase()+id.slice(1),
}))];
const Field=({label,children})=><label className="axe-vault-field">
  <span>{label}</span>{children}
</label>;

export default function ChronicleBlueprintLibrary({suppressed=false}){
  const {user}=useAuth();
  const ownerId=user?.id?String(user.id):'';
  const allowed=Boolean(ownerId)&&(isDeveloperVersion||user?.role==='admin');
  const [opened,setOpened]=useState(false);
  const [record,setRecord]=useState(()=>{
    const loaded=loadChronicleBlueprints(ownerId);
    return {ownerId,library:loaded.library,error:loaded.ok?'':loaded.reason};
  });
  const [message,setMessage]=useState('');
  const [search,setSearch]=useState('');
  const [selectedBoxId,setSelectedBoxId]=useState(null);
  const [view,setView]=useState('board');
  const [slot,setSlot]=useState(null);
  const [draft,setDraft]=useState(null);
  const [editingBox,setEditingBox]=useState(false);
  const fileRef=useRef(null);
  const library=record.ownerId===ownerId?record.library:null;

  useEffect(()=>{
    const loaded=loadChronicleBlueprints(ownerId);
    setRecord({ownerId,library:loaded.library,error:loaded.ok?'':loaded.reason});
    setSelectedBoxId(null);setSlot(null);setDraft(null);
    setView('board');setMessage('');
  },[ownerId]);
  useEffect(()=>{if(suppressed)setOpened(false)},[suppressed]);
  useEffect(()=>{
    if(!opened)return undefined;
    const keydown=e=>{
      if(e.key==='Escape'){
        e.stopPropagation();e.preventDefault();
        if(slot!==null){setSlot(null);setDraft(null)}
        else setOpened(false);
      }
    };
    window.addEventListener('keydown',keydown,true);
    return ()=>window.removeEventListener('keydown',keydown,true);
  },[opened,slot]);

  const selected=library?.boxes.find(box=>box.id===selectedBoxId)||library?.boxes[0]||null;
  const count=library?countChronicleBlueprints(library):0;
  const hits=useMemo(()=>library?searchChronicle(library,search):[],[library,search]);
  const blueprintPreview=useMemo(()=>previewChronicleBlueprintDraft(draft),[draft]);
  const saveChange=fn=>{
    if(!ownerId||!library){setMessage('Sign in and restore a readable library first.');return false}
    try{
      const updated=fn(library);
      if(updated===library)return true;
      const result=saveChronicleBlueprints(ownerId,updated);
      if(!result.ok){
        setMessage('Not saved: '+(result.message||result.reason)+'. Export a backup before leaving.');
        return false;
      }
      setRecord({ownerId,library:updated,error:''});
      setMessage('Saved to this browser · '+new Date().toLocaleTimeString());
      return true;
    }catch(error){setMessage(error?.message||'This change could not be saved');return false}
  };
  const chooseBox=boxId=>{
    setSelectedBoxId(boxId);setSlot(null);setDraft(null);setView('collection');
    setEditingBox(false);
  };
  const chooseSlot=index=>{
    if(!selected)return;
    setSlot(index);
    const prior=selected.slots[String(index)];
    const data=toDraft(prior,selected.slotLabels[String(index)]||'');
    setDraft(data||{...starter(selected.kind),slotLabel:selected.slotLabels[String(index)]||''});
  };
  const addBox=()=>{
    const next=createChronicleBox(library);
    if(saveChange(()=>next))chooseBox(next.boxes.at(-1).id);
  };
  const copyBox=()=>{
    if(!selected)return;
    const next=duplicateChronicleBox(library,selected.id);
    if(saveChange(()=>next))chooseBox(next.boxes.at(-1).id);
  };
  const deleteBox=()=>{
    if(!selected)return;
    if(selected.locked){setMessage('Unlock this collection before deleting it.');return}
    if(!window.confirm('Remove '+selected.name+' and its saved blueprint slots? Export a backup first if needed.'))return;
    const next=library.boxes.find(box=>box.id!==selected.id);
    if(saveChange(doc=>removeChronicleBox(doc,selected.id))){
      setSlot(null);setDraft(null);setSelectedBoxId(next?.id||null);
    }
  };
  const saveBlueprint=()=>{
    if(!selected||slot===null||!draft)return;
    try{
      const blueprint={...draft,stats:parseStats(draft.statsText)};
      if(saveChange(doc=>editChronicleSlot(doc,selected.id,slot,{
        blueprint,label:draft.slotLabel,
      })))setSlot(null);
    }catch(error){setMessage(error.message)}
  };
  const saveSlotLabel=()=>{
    if(!selected||slot===null||!draft)return;
    if(saveChange(doc=>editChronicleSlot(doc,selected.id,slot,{
      label:draft.slotLabel,
    })))setMessage('Grid label saved for slot '+nameFor(slot)+'.');
  };
  const removeBlueprint=()=>{
    if(!selected||slot===null||!selected.slots[String(slot)])return;
    if(!window.confirm('Delete this draft blueprint from slot '+nameFor(slot)+'?'))return;
    if(saveChange(doc=>editChronicleSlot(doc,selected.id,slot,{remove:true})))setSlot(null);
  };
  const toggleSlotLock=(index)=>{
    if(!selected)return;
    const wasLocked=selected.slotLocks[String(index)]===true;
    if(saveChange(doc=>editChronicleSlot(doc,selected.id,index,{locked:!wasLocked})))chooseSlot(index);
  };
  const exportBackup=()=>{
    if(!library)return;
    try{
      const blob=new Blob([createChronicleBlueprintBackup(library)],{type:'application/json'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='game3d-chronicle-blueprints-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      setMessage('Backup exported. This is an authoring draft, not a playable item drop.');
    }catch(error){setMessage('Export failed: '+error.message)}
  };
  const exportReviewProposal=()=>{
    if(!selected||slot===null)return;
    const saved=selected.slots[String(slot)];
    if(!saved){
      setMessage('Save this blueprint before exporting it for catalog review.');
      return;
    }
    try{
      // Export a saved private draft, not the unsaved form, character gear
      // or any authoritative game-server reward definition.
      const proposal=createChronicleReviewProposal829({
        boxId:selected.id,index:slot,blueprint:saved,
      });
      const blob=new Blob([JSON.stringify(proposal,null,2)],{
        type:'application/json',
      });
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;
      link.download='game3d-creator-catalog-proposal-'+
        new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      setMessage('Saved draft exported for future catalog review. No item, skill or reward was issued.');
    }catch(error){
      setMessage('Review proposal could not be exported: '+error.message);
    }
  };
  const importBackup=async event=>{
    const file=event.target.files?.[0];event.target.value='';
    if(!file)return;
    try{
      if(file.size>8000000)throw Error('Backup exceeds 8 MB');
      const incoming=parseChronicleBlueprintBackup(await file.text());
      if(!window.confirm('Replace your current local Chronicle blueprint collection with this backup?'))return;
      const result=saveChronicleBlueprints(ownerId,incoming);
      if(!result.ok)throw Error(result.message||result.reason);
      setRecord({ownerId,library:incoming,error:''});
      setSlot(null);setSelectedBoxId(null);setView('board');
      setMessage('Backup restored and saved to this browser.');
    }catch(error){setMessage('Import rejected: '+error.message)}
  };
  const resetUnreadable=()=>{
    if(!window.confirm('Your current saved library cannot be read. Start a new local library? Existing unreadable data will be overwritten.'))return;
    const fresh=initialChronicleLibrary(),result=saveChronicleBlueprints(ownerId,fresh);
    if(result.ok)setRecord({ownerId,library:fresh,error:''});
    else setMessage('Cannot create library: '+(result.message||result.reason));
  };
  const openLibrary=()=>{
    document.exitPointerLock?.();
    setOpened(true);
  };

  if(!allowed)return null;
  const activeIndex=slot===null?null:String(slot);
  const lockedSlot=activeIndex!==null&&selected?.slotLocks[activeIndex]===true;
  const maxRow=Math.max(4,...(library?.boxes||[]).map(box=>box.y+1));
  const cells=Array.from({length:(maxRow+1)*5},(_,n)=>({
    x:n%5,y:Math.floor(n/5),
  }));
  const positions=new Map((library?.boxes||[]).map(box=>[box.x+':'+box.y,box]));
  const onBoardDrop=(event,x,y)=>{
    event.preventDefault();
    const moving=event.dataTransfer.getData('application/x-axe-chronicle-box');
    if(moving&&library?.boxes.some(box=>box.id===moving))
      saveChange(doc=>repositionChronicleBox(doc,moving,x,y));
  };
  const onSlotDrop=(event,to)=>{
    event.preventDefault();
    const valid=Array.from(event.dataTransfer.types||[]).includes('application/x-axe-chronicle-slot');
    const from=Number(event.dataTransfer.getData('application/x-axe-chronicle-slot'));
    if(valid&&Number.isInteger(from)&&selected)
      saveChange(doc=>moveChronicleSlot(doc,selected.id,from,to));
  };

  return (<>
    {!suppressed&&<button type="button" onClick={openLibrary}
      className="axe-chronicle-vault-launch" aria-label="Open Chronicle creator library"
      title="Organize Game 3D equipment, materials and skill-drop drafts">
      <span className="axe-chronicle-vault-launch-icon"><Boxes size={19}/></span>
      <span><strong>Chronicle Library</strong>
        <small>Equipment · Materials · Skills</small></span>
    </button>}
    {opened&&<div className="axe-chronicle-vault-backdrop" onMouseDown={e=>{
      if(e.target===e.currentTarget)setOpened(false);
    }}>
      <section role="dialog" aria-modal="true" aria-label="Chronicle Blueprint Library"
        className="axe-chronicle-vault">
        <header className="axe-vault-header">
          <div className="axe-vault-identity">
            <Archive size={25} className="text-cyan-200"/>
            <div><p>THE CHRONICLES OF ATOM X EVE</p><h2>Creator Blueprint Library</h2>
              <small>Private authoring drafts · not player inventory or live drops</small></div>
          </div>
          <div className="axe-vault-header-actions">
            <span className="axe-vault-total">{(library?.boxes.length||0)*CHRONICLE_BOX_SIZE} slots · {count} designs</span>
            <button type="button" onClick={exportBackup} disabled={!library} title="Download a JSON backup"><Download size={15}/> Export</button>
            <button type="button" onClick={()=>fileRef.current?.click()} title="Restore a JSON backup"><Upload size={15}/> Import</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importBackup}/>
            <button type="button" onClick={()=>setOpened(false)} aria-label="Close Chronicle creator library"><X size={19}/></button>
          </div>
        </header>
        <div className="axe-vault-toolbar">
          <div className="axe-vault-search"><Search size={17}/>
            <input aria-label="Search saved collections, blueprints and stats"
              value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search equipment, materials, skill drops, stats or collection names…"/>
          </div>
          {view==='collection'&&<button type="button" onClick={()=>{
            setView('board');setSlot(null);
          }}><ChevronLeft size={15}/> Collection map</button>}
          <button type="button" onClick={addBox} disabled={!library}><Plus size={15}/> Add 500-slot Box</button>
        </div>
        {message&&<p role="status" className="axe-vault-notice">{message}</p>}
        {!library?<div className="axe-vault-restore">
          <p>Saved library could not be read. Nothing has been overwritten.</p>
          <button type="button" onClick={resetUnreadable}>Create a new local library</button>
          <button type="button" onClick={()=>fileRef.current?.click()}>Restore a backup</button>
        </div>:<div className="axe-vault-body">
          <aside className="axe-vault-sidebar">
            <strong>COLLECTIONS <span>{library.boxes.length}</span></strong>
            <p>Each named box holds 500 independent blueprint slots. Start with {CHRONICLE_STARTER_BOXES} boxes (10,000 slots), then add more whenever needed.</p>
            <div className="axe-vault-side-list">
              {library.boxes.map(box=><button key={box.id} type="button" onClick={()=>chooseBox(box.id)}
                className={selected?.id===box.id&&view==='collection'?'is-active':''}>
                {box.locked?<LockKeyhole size={12}/>:<Boxes size={12}/>}
                <span title={box.name}>{box.name}</span>
                <em>{Object.keys(box.slots).length}/{CHRONICLE_BOX_SIZE}</em>
              </button>)}
            </div>
          </aside>
          <main className="axe-vault-main">
            {search.trim()?<div className="axe-vault-results">
              <h3>Search results <small>{hits.length} found</small></h3>
              <div>{hits.map((hit,i)=><button type="button" key={hit.boxId+':'+hit.slot+':'+i}
                onClick={()=>{
                  setSearch('');chooseBox(hit.boxId);
                  if(hit.slot!==null){
                    const destination=library.boxes.find(box=>box.id===hit.boxId);
                    const item=destination?.slots[String(hit.slot)];
                    setSlot(hit.slot);
                    setDraft(toDraft(item,destination?.slotLabels[String(hit.slot)]||'')||
                      {...starter(destination?.kind),slotLabel:destination?.slotLabels[String(hit.slot)]||''});
                    setTimeout(()=>document.querySelector('[data-chronicle-slot="'+hit.slot+'"]')?.focus(),0);
                  }
                }}
              ><span>{hit.kind==='collection'?<Boxes size={16}/>:<Package size={16}/>}</span>
                <span><strong>{hit.title}</strong><small>{hit.boxName}{hit.slot!==null?' · Slot '+nameFor(hit.slot):''}</small></span>
              </button>)}</div>
              {!hits.length&&<p>No matching saved blueprints or collection labels.</p>}
            </div>:view==='board'?<div className="axe-vault-board">
              <div className="axe-vault-section-title"><h3>Collection Map</h3>
                <p>Drag unlocked boxes into a new position. Lock collections to pin your layout.</p></div>
              <div className="axe-vault-board-grid">
                {cells.map(({x,y})=>{
                  const box=positions.get(x+':'+y);
                  return <div key={x+':'+y} className="axe-vault-board-cell"
                    onDragOver={e=>e.preventDefault()} onDrop={e=>onBoardDrop(e,x,y)}>
                    {box&&<div className={'axe-vault-board-card '+(box.locked?'is-locked':'')}
                      draggable={!box.locked}
                      onDragStart={e=>e.dataTransfer.setData('application/x-axe-chronicle-box',box.id)}>
                      <button className="axe-vault-board-open" type="button" onClick={()=>chooseBox(box.id)}>
                        <Boxes size={20}/><strong title={box.name}>{box.name}</strong>
                        <small>{box.label||box.kind} · {Object.keys(box.slots).length}/500 designs</small>
                      </button>
                      <button type="button" title={box.locked?'Unlock position':'Lock position'}
                        aria-label={box.locked?'Unlock collection position':'Lock collection position'}
                        onClick={()=>saveChange(doc=>editChronicleBox(doc,box.id,{locked:!box.locked}))}>
                        {box.locked?<LockKeyhole size={15}/>:<UnlockKeyhole size={15}/>}
                      </button>
                    </div>}
                    {!box&&<span className="axe-vault-board-empty">+ Drop Box</span>}
                  </div>
                })}
              </div>
            </div>:selected&&<div className="axe-vault-collection">
              <div className="axe-vault-collection-head">
                <div><p className="axe-vault-kicker">500-SLOT BLUEPRINT COLLECTION</p>
                  <h3>{selected.name}</h3>
                  <p>{selected.label||'Add a map label to organize your gear tiers, resource regions and skill groups.'}</p>
                </div>
                <div className="axe-vault-collection-controls">
                  <button type="button" onClick={()=>setEditingBox(v=>!v)}><Tag size={14}/> Name / Label</button>
                  <button type="button" onClick={copyBox}><Copy size={14}/> Duplicate</button>
                  <button type="button" disabled={library.boxes.length<=1} onClick={deleteBox}
                    title="Remove this unlocked draft collection"><Trash2 size={14}/> Remove</button>
                  <button type="button" onClick={()=>saveChange(doc=>editChronicleBox(doc,selected.id,{locked:!selected.locked}))}>
                    {selected.locked?<LockKeyhole size={14}/>:<UnlockKeyhole size={14}/>}
                    {selected.locked?'Locked':'Lock Box'}
                  </button>
                </div>
              </div>
              {editingBox&&<form className="axe-vault-collection-form" onSubmit={event=>{
                event.preventDefault();const data=new FormData(event.currentTarget);
                if(saveChange(doc=>editChronicleBox(doc,selected.id,{
                  name:data.get('name'),label:data.get('label'),kind:data.get('kind'),
                })))setEditingBox(false);
              }}>
                <Field label="Collection name"><input name="name" defaultValue={selected.name} maxLength={100}/></Field>
                <Field label="Map / group label"><input name="label" defaultValue={selected.label} maxLength={90}
                  placeholder="Level 1–50 · Eastern Forest"/></Field>
                <Field label="Default type"><select name="kind" defaultValue={selected.kind}>
                  {catChoices.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}
                </select></Field>
                <button type="submit"><ShieldCheck size={14}/> Save Collection</button>
              </form>}
              <div className="axe-vault-grid" role="group" aria-label={selected.name+' 500 blueprint slots'}>
                {Array.from({length:CHRONICLE_BOX_SIZE},(_,index)=>{
                  const bp=selected.slots[String(index)],isLocked=Boolean(selected.slotLocks[String(index)]),
                    label=selected.slotLabels[String(index)],Icon=kindIcon[bp?.kind]||FilePlus2;
                  return <button key={index} type="button" data-chronicle-slot={index}
                    draggable={Boolean(bp)&&!selected.locked&&!isLocked}
                    onDragStart={event=>event.dataTransfer.setData('application/x-axe-chronicle-slot',String(index))}
                    onDragOver={event=>event.preventDefault()}
                    onDrop={event=>onSlotDrop(event,index)}
                    aria-label={'Slot '+nameFor(index)+(bp?' · '+bp.name:' · empty')+(isLocked?' · locked':'')}
                    className={'axe-vault-tile '+(bp?'has-item ':'')+(isLocked?'is-locked ':'')+(slot===index?'is-active':'')}
                    onClick={()=>chooseSlot(index)}>
                    <span className="axe-vault-tile-index">{nameFor(index)}</span>
                    {bp?.icon?<span className="axe-vault-tile-custom-icon" aria-hidden="true">{bp.icon}</span>
                      :<Icon size={19} className="axe-vault-tile-icon"/>}
                    <strong>{bp?.name||'+'}</strong>
                    {label&&<em title={label}>{label}</em>}
                    {isLocked&&<LockKeyhole size={11} className="axe-vault-tile-locked"/>}
                    {bp&&<span className="axe-vault-tile-tooltip" role="tooltip">
                      <b>{bp.name}</b><small>{bp.kind} · {bp.rarity} · Lv {bp.levelMin}–{bp.levelMax}</small>
                      <span>{bp.description||'No description yet'}</span>
                      {Object.keys(bp.stats||{}).length>0&&<small>Stats: {Object.entries(bp.stats).map(([k,v])=>k+' '+(v>=0?'+':'')+v).join(' · ')}</small>}
                      {bp.dropSource&&<small>Drop: {bp.dropSource}</small>}
                    </span>}
                  </button>
                })}
              </div>
            </div>}
          </main>
          {view==='collection'&&slot!==null&&selected&&draft&&<aside className="axe-vault-inspector">
            <div className="axe-vault-inspector-head"><h3>Slot {nameFor(slot)}</h3>
              <button type="button" aria-label="Close blueprint editor" onClick={()=>setSlot(null)}><X size={17}/></button></div>
            <div className="axe-vault-inspector-scroll">
              <button type="button" className="axe-vault-lock-option"
                onClick={()=>toggleSlotLock(slot)}>
                {lockedSlot?<LockKeyhole size={14}/>:<UnlockKeyhole size={14}/>}
                {lockedSlot?'Unlock this slot':'Lock this slot position'}
              </button>
              <p className="axe-vault-inspector-hint">{lockedSlot?'This slot position is locked. You can still update its item, stats and description.':'Drag saved icons to another unlocked slot to rearrange.'}</p>
              <fieldset>
                <Field label="Grid / map label"><input value={draft.slotLabel||''}
                  maxLength={65} placeholder="Boss equipment / tier 1"
                  onChange={e=>setDraft(d=>({...d,slotLabel:e.target.value}))}/></Field>
                <Field label="Blueprint type"><select value={draft.kind}
                  onChange={e=>setDraft(d=>({...d,kind:e.target.value,slot:e.target.value==='equipment'?'weapon':''}))}>
                  {CHRONICLE_KINDS.map(kind=><option key={kind} value={kind}>{kind}</option>)}
                </select></Field>
                <Field label="Name"><input value={draft.name} maxLength={100}
                  placeholder="Silver Moon Sword"
                  onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/></Field>
                <Field label="Placeholder icon or emoji"><input value={draft.icon||''}
                  maxLength={12} placeholder="⚔️  💎  ✨"
                  onChange={e=>setDraft(d=>({...d,icon:e.target.value}))}/></Field>
                <Field label="Description / hover tooltip"><textarea value={draft.description} rows={3} maxLength={1200}
                  placeholder="What does this blueprint do?"
                  onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></Field>
                <div className="axe-vault-form-pair">
                  <Field label="Minimum level"><input type="number" min="1" max="9999" value={draft.levelMin}
                    onChange={e=>setDraft(d=>({...d,levelMin:e.target.value}))}/></Field>
                  <Field label="Maximum level"><input type="number" min="1" max="9999" value={draft.levelMax}
                    onChange={e=>setDraft(d=>({...d,levelMax:e.target.value}))}/></Field>
                </div>
                <Field label="Rarity"><select value={draft.rarity} onChange={e=>setDraft(d=>({...d,rarity:e.target.value}))}>
                  {CHRONICLE_RARITIES.map(r=><option key={r} value={r}>{r}</option>)}</select></Field>
                {draft.kind==='equipment'&&<Field label="Equipment slot"><select value={draft.slot}
                  onChange={e=>setDraft(d=>({...d,slot:e.target.value}))}>
                  {CHRONICLE_EQUIPMENT_SLOTS.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                </select></Field>}
                {draft.kind==='material'&&<Field label="Material family"><input value={draft.materialType||''}
                  placeholder="ore, wood, essence…" onChange={e=>setDraft(d=>({...d,materialType:e.target.value}))}/></Field>}
                {draft.kind==='skill'&&<Field label="Skill ID / unlock reference"><input value={draft.skillId||''}
                  placeholder="single-hit-critical"
                  onChange={e=>setDraft(d=>({...d,skillId:e.target.value}))}/></Field>}
                <Field label="Core stat bonuses (one per line)"><textarea value={draft.statsText||''} rows={5}
                  placeholder="strength: 25\nhp: 100"
                  onChange={e=>setDraft(d=>({...d,statsText:e.target.value}))}/></Field>
                <p className="axe-vault-inspector-hint">Available: {CHRONICLE_STATS.join(', ')}. These are blueprint values, not applied character stats.</p>
                <Field label="Set / prefab family"><input value={draft.setId||''}
                  onChange={e=>setDraft(d=>({...d,setId:e.target.value}))}/></Field>
                <Field label="Possible drop source"><input value={draft.dropSource||''}
                  placeholder="Forest boss, cave chest, craft node"
                  onChange={e=>setDraft(d=>({...d,dropSource:e.target.value}))}/></Field>
                <Field label="Draft drop chance (%)"><input type="number" min="0" max="100" step=".1"
                  value={draft.dropChance??0}
                  onChange={e=>setDraft(d=>({...d,dropChance:e.target.value}))}/></Field>
                <Field label="Search tags"><input value={draft.tags||''}
                  placeholder="starter, rare, forest"
                  onChange={e=>setDraft(d=>({...d,tags:e.target.value}))}/></Field>
                <Field label="Creator notes"><textarea value={draft.notes||''} rows={2}
                  onChange={e=>setDraft(d=>({...d,notes:e.target.value}))}/></Field>
              </fieldset>
              <details className="axe-vault-draft-preview" key={selected.id+':'+slot}>
                <summary>Preview blueprint · draft only</summary>
                {!blueprintPreview.ok?<p role="status" className="axe-vault-inspector-hint">
                  {blueprintPreview.reason}</p>:<>
                  <div className="axe-vault-draft-preview-head">
                    <strong>{blueprintPreview.preview.icon||'◇'} {blueprintPreview.preview.name}</strong>
                    <span>{blueprintPreview.preview.rarity} · {blueprintPreview.preview.kind}</span>
                  </div>
                  <p>Levels {blueprintPreview.preview.levelMin}–{blueprintPreview.preview.levelMax}
                    {blueprintPreview.preview.slot?' · '+blueprintPreview.preview.slot.replace(/_/g,' '):''}</p>
                  {blueprintPreview.preview.description&&<p>{blueprintPreview.preview.description}</p>}
                  {blueprintPreview.preview.materialType&&<p>Material: {blueprintPreview.preview.materialType}</p>}
                  {blueprintPreview.preview.skillId&&<p>Skill reference: {blueprintPreview.preview.skillId}</p>}
                  {blueprintPreview.preview.stats.length>0&&<ul>
                    {blueprintPreview.preview.stats.map(stat=><li key={stat.key}>
                      {stat.key.replace(/_/g,' ')}: {stat.value>=0?'+':''}{stat.value}</li>)}
                  </ul>}
                  <p>Proposed source: {blueprintPreview.preview.dropSource||'Unspecified'} ·
                    Draft chance: {blueprintPreview.preview.dropChance}%</p>
                  {blueprintPreview.warnings.length>0&&<div className="axe-vault-draft-preview-warnings">
                    <strong>Design review needed</strong>
                    <ul>{blueprintPreview.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>
                  </div>}
                  <p className="axe-vault-inspector-hint">
                    Local creator preview only. Stats, skills and drop chances are not applied
                    or verified by the game server. No item or reward is issued.
                  </p>
                </>}
                <button type="button" className="axe-vault-draft-review-export"
                  onClick={exportReviewProposal}
                  disabled={!selected.slots[String(slot)]}
                  title="Save the blueprint first, then export a JSON proposal for manual catalog review">
                  <Download size={13}/> Export saved proposal for review
                </button>
              </details>
            </div>
            <div className="axe-vault-inspector-actions">
              <button type="button" onClick={saveBlueprint}><ShieldCheck size={15}/> Save Blueprint</button>
              <button type="button" onClick={saveSlotLabel} title="Save this map label without creating an item">
                <Tag size={14}/> Label
              </button>
              {selected.slots[String(slot)]&&<button type="button"
                onClick={removeBlueprint} title="Delete draft blueprint"><Trash2 size={15}/></button>}
            </div>
          </aside>}
        </div>}
        <footer className="axe-vault-footer">
          <span><BookOpen size={13}/> 500 slots per named box · add more boxes without a fixed collection limit</span>
          <span>Saved in this browser, scoped to your signed-in account · export JSON backups</span>
        </footer>
      </section>
    </div>}
  </>);
}
