import {useEffect,useRef,useState} from 'react';
import {Check, ChevronRight, Layers3, Moon, X} from 'lucide-react';
import {useCompanionIdentity} from './CompanionIdentityContext';
import {playerAppearance} from './playerAppearance';
import CharacterAppearanceEditor,{CREATOR_SECTIONS,creatorShot,randomizeAppearance} from './CharacterAppearanceEditor';
import CreatorStudio from './CreatorStudio';
import CustomizationAssetManager from './CustomizationAssetManager';
import {useCustomizationCatalog} from './useCustomizationCatalog';
import {useBuiltinLayers} from './creatorBuiltinLayers';
import {saveAppearance} from './saveAppearance';
import {creatorBody} from './avatarCustomization';
import {validateAXECharacterName} from '@/components/game3d/axe/characters/AXECharacterEntry';
import './genesis.css';
import './character-creator.css';

// localOnly: the Game 3D "Create character" overlay. It saves an additional Game 3D
// character through onSaved (the local roster) and never touches the account's
// main avatar, which only the account creator and first-login setup change.
export default function AvatarAppearanceDialog({onClose,onSaved,create=false,localOnly=false,initialAvatar,embedded=false,title}) {
 const saved=useCompanionIdentity(),catalog=useCustomizationCatalog();
 const [config,setConfig]=useState(()=>playerAppearance(initialAvatar||saved)),[caps,setCaps]=useState({});
 const [section,setSection]=useState('body'),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [layers,setLayers]=useState({loading:false,error:''}),[workshop,setWorkshop]=useState(false);
 const [expression,setExpression]=useState({preset:'neutral',values:{},morphs:{}});
 const builtin=useBuiltinLayers(config);
 const dialog=useRef(null),close=useRef(onClose),busyRef=useRef(busy),loadedBody=useRef('');
 close.current=onClose;busyRef.current=busy;
 const bodyKey=c=>c.gender+'|'+(c.creator_body||'');
 useEffect(()=>{
  const previous=document.activeElement;dialog.current?.focus();
  const oldOverflow=document.body.style.overflow;if(!embedded)document.body.style.overflow='hidden';
  const keys=e=>{
   if(e.key==='Escape'&&!busyRef.current){e.preventDefault();close.current?.();}
   if(e.key==='Tab'&&!embedded){
    const list=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled):not([hidden]),select:not(:disabled),a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden],[aria-hidden="true"]'));
    if(!list.length)return;
    if(e.shiftKey&&(document.activeElement===list[0]||document.activeElement===dialog.current)){e.preventDefault();list.at(-1).focus();}
    else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0].focus();}
   }
  };
  const element=dialog.current;element?.addEventListener('keydown',keys);
  return()=>{element?.removeEventListener('keydown',keys);if(!embedded)document.body.style.overflow=oldOverflow;previous?.focus?.();};
 },[embedded]);
 const onCapabilities=value=>{loadedBody.current=bodyKey(config);setCaps(value);};
 const save=async()=>{
  if(busy||layers.loading||layers.error)return;
  if(create){const check=validateAXECharacterName(name);if(!check.ok){setError(check.reason==='invalid-characters'?"Use letters, numbers, spaces, apostrophes or hyphens.":'Choose a name between 2 and 24 characters.');return;}}
  setBusy(true);setError('');
  try{
   const appearance={...config,...(create?{name:name.trim()}:{})};
   const avatar=localOnly?appearance:await saveAppearance(appearance,{broadcast:!create});
   await onSaved?.(avatar,name.trim());
   if(create&&!localOnly)window.dispatchEvent(new CustomEvent('avatarAppearanceSaved',{detail:{avatar}}));
   onClose?.();
  }catch(e){setError(e.response?.data?.error||e.message||'Could not save your character. Please try again.');}
  finally{setBusy(false);}
 };
 const changeConfig=value=>setConfig(current=>{const next=typeof value==='function'?value(current):value;if(bodyKey(current)!==bodyKey(next)){loadedBody.current='';setCaps({});setLayers({loading:false,error:''});}return next;});
 const randomize=()=>changeConfig(c=>randomizeAppearance(c,{shapes:caps.customization?.shapes||[],hair:builtin.hair,tattoo:builtin.tattoo}));
 const index=CREATOR_SECTIONS.findIndex(s=>s.id===section);
 const ready=loadedBody.current===bodyKey(config);
 const fusedAccountNote=!localOnly&&creatorBody(config);
 const label=create?(localOnly?'Create a Game 3D character':'Create your AI avatar'):'Customize your AI avatar';
 return <div className={'creator-shell'+(embedded?' creator-embedded':'')} ref={dialog} tabIndex={-1} role={embedded?undefined:'dialog'} aria-modal={embedded?undefined:true} aria-label={label}>
  <CreatorStudio config={config} shot={creatorShot(section)} expression={section==='expression'?expression:undefined}
   onCapabilities={onCapabilities} onCustomizationState={setLayers} layers={layers}
   section={section} onSection={id=>{setSection(id);setWorkshop(false);}} onRandomize={randomize}
   brand={<><Moon size={16} strokeWidth={1.4}/><span>Atom X Eve<small>{localOnly?'GAME 3D · NEW CHARACTER':'CHARACTER STUDIO'}</small></span></>}
   kicker={title||(create?(localOnly?'New Game 3D character':'Create your AI counterpart'):'Make it yours')}
   topTools={<>{catalog.data?.canManage&&<button type="button" className="creator-tool" disabled={busy||!ready} onClick={()=>setWorkshop(true)} title="Import layers" aria-label="Import layers"><Layers3 size={16} strokeWidth={1.4}/></button>}<button type="button" className="creator-tool creator-close" disabled={busy} onClick={onClose} aria-label="Close character creator"><X size={17} strokeWidth={1.4}/></button></>}
   title={workshop?'Layers':undefined}
   panel={workshop?<CustomizationAssetManager gender={config.gender} capabilities={caps} onClose={()=>setWorkshop(false)}/>:<fieldset disabled={busy}><CharacterAppearanceEditor config={config} setConfig={changeConfig} capabilities={ready?caps:{}} section={section} expression={expression} onExpressionChange={setExpression}/></fieldset>}
   footer={<>
    {create&&<label className="creator-name" htmlFor="creator-name"><span>Name</span><input id="creator-name" maxLength={24} value={name} disabled={busy} onChange={e=>{setName(e.target.value);setError('');}} placeholder={localOnly?'Character name':'Give your companion a name'}/></label>}
    {fusedAccountNote&&<p className="creator-microcopy">Eve and Adam are preview bodies for now. Saving keeps your colors and shape values; your account shows the animated body until their animations ship.</p>}
    {localOnly&&<p className="creator-microcopy">Saved to your Game 3D roster only. Your main character stays as it is.</p>}
    {error&&<p className="creator-error" role="alert">{error}</p>}
    <div className="creator-actions">{index<CREATOR_SECTIONS.length-1&&<button type="button" className="creator-next" disabled={busy} onClick={()=>{setSection(CREATOR_SECTIONS[index+1].id);setWorkshop(false);}} aria-label="Next category">Next<ChevronRight size={14} strokeWidth={1.5}/></button>}<button type="button" className="creator-save" disabled={busy||layers.loading||Boolean(layers.error)||(create&&!name.trim())||!ready} onClick={save}>{busy?'Preparing…':create?(localOnly?'Create character':'Create avatar'):'Save appearance'}<Check size={15} strokeWidth={1.6}/></button></div>
   </>}/>
  {embedded&&create&&localOnly&&<div className="axe-game3d-name-preview" aria-live="polite">
    {name.trim()||'New Character'}
  </div>}
 </div>;
}
