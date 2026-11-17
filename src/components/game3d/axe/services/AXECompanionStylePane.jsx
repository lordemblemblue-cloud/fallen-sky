import { lazy, Suspense, useEffect, useState } from 'react';
import { Check, Crown, Feather, Gem, Search, Shield, Shirt, Sparkles, UserRound } from 'lucide-react';
import { subscribeAXEVanity,getAXEVanityState,equipAXEVanityPiece } from '../progression/AXEVanityStore';
import { subscribeAXECostumes,getAXECostumeState,equipAXECostume } from '../progression/AXECostumeStore';
import { AXE_VANITY_PIECES,AXE_VANITY_SLOTS } from '../progression/AXEVanitySystem';
import { AXE_COSTUME_DEFINITIONS } from '../progression/AXECostumeSystem';
import { getCompanionState,subscribeCompanion,setActiveCompanion } from '../../companionStore';
import { getCompanionById, COMPANION_DEFINITIONS } from '../../companionData';
import './AXEGlassLoadoutPane.css';
import './AXECompanionStylePane.css';
import AXECompanionFusionButton from './AXECompanionFusionButton';
import AXECompanionImbuementPane from './AXECompanionImbuementPane';
import AXECompanionModelViewControl from './AXECompanionModelViewControl';

const PlayerModel = lazy(() => import('../../equipment/EquipmentPreview3D'));
const CompanionModel = lazy(() => import('../../equipment/CompanionPreview3D'));
export {IMBUE_TARGETS} from './AXEImbuementPresentation.mjs';
export const VARIETY_VIEWER_SLOTS=Object.freeze([
  {id:'head',label:'Head',Icon:Crown},{id:'torso',label:'Torso',Icon:Shirt},
  {id:'pelvis',label:'Waist',Icon:Gem},{id:'leggings',label:'Legs',Icon:Shield},
  {id:'costume',label:'Outfit',Icon:Shirt},
]);
function useLive(subscribe,get) {
  const [value,setValue]=useState(get);
  useEffect(()=>subscribe(setValue),[subscribe]);
  return value;
}
function Pane({name,children,className='',controls=null}) {
  return <section className={'axe-app-card '+className}>
    <header className="axe-app-card-heading"><Sparkles size={20}/><h3>{name}</h3>{controls}</header>
    <div className="axe-app-card-content">{children}</div>
  </section>;
}
const icon= item => {
  const image=item?.appearanceImage||item?.iconUrl;
  return typeof image==='string' && (image.startsWith('/') || image.startsWith('https://'))
    ? <img alt="" src={image} loading="lazy"/> : <Gem size={27}/>;
}
export default function AXECompanionStylePane({ page='Vanity', onNotice=()=>{}, onPageChange=()=>{} }) {
  const companion=useLive(subscribeCompanion,getCompanionState);
  const vanity=useLive(subscribeAXEVanity,getAXEVanityState);
  const costumes=useLive(subscribeAXECostumes,getAXECostumeState);
  const [selected,setSelected]=useState(null);
  const [varietySlot,setVarietySlot]=useState('');
  const [previewOwner,setPreviewOwner]=useState('wardrobe');
  const [typeFilter,setTypeFilter]=useState('All');
  const [rarityFilter,setRarityFilter]=useState('All');
  const [search,setSearch]=useState('');
  useEffect(()=>{
    setSelected(null);setTypeFilter('All');setRarityFilter('All');setSearch('');
    setVarietySlot('');setPreviewOwner('wardrobe');
  },[page]); // Keep direct companion selections in the live viewer until a wardrobe slot is clicked.
  const isImbue=page==='Imbuement';
  const selectedModel=getCompanionById(companion.activeCompanionId);
  // One read-only collection combines both owned player Vanity sets and
  // Costume outfits. They are NOT eligible companion attachments.
  // Use typed keys even when two catalogs contain matching item IDs.
  const owned=[
    ...(vanity.ownedPieceIds||[]).map(id=>AXE_VANITY_PIECES[id]).filter(Boolean)
      .map(piece=>({...piece, kind:'vanity', itemKey:'vanity:'+piece.id,
        equipped:vanity.equippedBySlot?.[piece.slot]===piece.id})),
    ...(costumes.owned||[]).map(id=>AXE_COSTUME_DEFINITIONS[id]).filter(Boolean)
      .map(piece=>({...piece, kind:'costume', itemKey:'costume:'+piece.id,
        equipped:costumes.equippedCostumeId===piece.id})),
  ];
  const rarityOptions=[...new Set(owned.map(piece=>piece.rarity||'common'))].sort();
  const term=search.trim().toLowerCase();
  const shown=owned.filter(piece=>
    (typeFilter==='All'||piece.kind===typeFilter)
    &&(!varietySlot||(varietySlot==='costume'?piece.kind==='costume':
      piece.kind==='vanity'&&piece.slot===varietySlot))
    &&(rarityFilter==='All'||(piece.rarity||'common')===rarityFilter)
    &&(!term||[
      piece.name,piece.rarity,piece.slot,piece.setId,piece.kind,
    ].filter(Boolean).join(' ').toLowerCase().includes(term))
  );
  const item=shown.find(row=>row.itemKey===selected)||shown[0]||null;
  const itemStats=item?.kind==='costume'?item.statPackage:item?.baseBonus;
  const equipOwnedWardrobe=piece=>{
    if(!piece)return;
    setSelected(piece.itemKey);
    // Canonical PLAYER equip path only, never invent companion wearable assets.
    const result=piece.kind==='vanity'?equipAXEVanityPiece(piece.id):
      piece.kind==='costume'?equipAXECostume(piece.id):
        {ok:false,reason:'UNSUPPORTED_APPEARANCE'};
    onNotice(result?.ok?(result.message||piece.name+' equipped on player.'):
      (result?.message||result?.reason||'Unable to equip item.'));
    if(result?.ok)setPreviewOwner('wardrobe');
  };
  const chooseVarietySlot=id=>{
    setVarietySlot(current=>current===id?'':id);
    setTypeFilter('All');setRarityFilter('All');setSearch('');setSelected(null);
    setPreviewOwner('wardrobe');
  };
  const varietySlotCard=({id,label,Icon})=>{
    const worn=id==='costume'?AXE_COSTUME_DEFINITIONS[costumes.equippedCostumeId]:
      AXE_VANITY_PIECES[vanity.equippedBySlot?.[id]];
    return <button key={id} type="button"
      className="axe-app-viewer-slot axe-comp-variety-slot"
      aria-pressed={varietySlot===id}
      aria-label={label+' player wardrobe slot: '+(worn?.name||'Empty')}
      title={'Player '+label+': '+(worn?.name||'Empty')+' · Filter owned items'}
      onClick={()=>chooseVarietySlot(id)}>
      <span className="axe-app-viewer-slot-art"><Icon size={23}/></span>
      <small>{label}</small><span className="axe-app-viewer-item-name">{worn?.name||'Empty'}</span>
    </button>;
  };
  const selectCompanion=id=>{
    const res=setActiveCompanion(id);
    if(!res.ok)onNotice(res.reason||'Unable to select companion');
    else setPreviewOwner('companion');
  };
  if(isImbue)return <AXECompanionImbuementPane onNotice={onNotice}/>;
  return <div className="axe-app-layout axe-comp-style-layout" data-companion-page={page}>
    <aside className="axe-app-rail" aria-label="Companion selector">
      <div className="axe-app-rail-glyph"><UserRound size={21}/><small>Companion</small></div>
      {COMPANION_DEFINITIONS.map(def=><button key={def.id} type="button"
        aria-label={'Select companion '+def.name}
        aria-pressed={companion.activeCompanionId===def.id} onClick={()=>selectCompanion(def.id)}>
        <UserRound size={23}/><span className="axe-app-rail-name">{def.name}</span>
        {companion.activeCompanionId===def.id&&<Check size={13}/>}
      </button>)}
    </aside>
    <section className="axe-app-model-stage axe-comp-style-stage"
      aria-label={previewOwner==='companion'?'Companion appearance viewer':'Player wardrobe viewer'}>
      <div className="axe-app-model-glow" aria-hidden="true"/>
      <AXECompanionModelViewControl owner={previewOwner} onChange={setPreviewOwner}/>
      <div className="axe-app-viewer-gear axe-app-viewer-gear--left axe-comp-variety-rail"
        aria-label="Equipped player wardrobe slots, left">
        {VARIETY_VIEWER_SLOTS.slice(0,3).map(varietySlotCard)}
      </div>
      <div className="axe-app-viewer-gear axe-app-viewer-gear--right axe-comp-variety-rail"
        aria-label="Equipped player wardrobe slots, right">
        {VARIETY_VIEWER_SLOTS.slice(3).map(varietySlotCard)}
      </div>
      <div className="axe-app-model-center">
        <Suspense fallback={<p className="axe-app-loading">Loading 3D preview…</p>}>
          <div className="axe-app-model-host">{previewOwner==='wardrobe'?<PlayerModel/>:
            selectedModel?<CompanionModel key={selectedModel.id} companionId={selectedModel.id}/>:
              <p className="axe-app-loading">Select an active companion</p>}</div>
        </Suspense>
      </div>
      {previewOwner==='companion'&&<AXECompanionFusionButton onNotice={onNotice}/>}
      <div className="axe-app-model-caption"><strong>
        {previewOwner==='wardrobe'?'Player Wardrobe':selectedModel?.name||'Companion Appearance'}</strong>
        <span>{previewOwner==='wardrobe'
          ?'Click a wardrobe slot to inspect player gear, or select a companion at left.'
          :'Companion preview · select a wardrobe slot to return to the player.'}</span>
      </div>
    </section>
    <main className="axe-app-main-stack" aria-label="Companion cosmetic inventory">
      <Pane name="Variety Collection" className="axe-app-inventory"
        controls={<div className="axe-comp-collection-controls">
          <select aria-label="Filter cosmetic type" value={typeFilter}
            onChange={event=>{setTypeFilter(event.target.value);setSelected(null);}}>
            <option value="All">All Items</option>
            <option value="vanity">Vanity Sets</option>
            <option value="costume">Costumes</option>
          </select>
          <select aria-label="Filter cosmetic rarity" value={rarityFilter}
            onChange={event=>{setRarityFilter(event.target.value);setSelected(null);}}>
            <option value="All">All Rarities</option>
            {rarityOptions.map(value=><option key={value} value={value}>
              {value.charAt(0).toUpperCase()+value.slice(1)}
            </option>)}
          </select>
          <label className="axe-comp-collection-search">
            <Search size={15} aria-hidden="true"/>
            <input type="search" aria-label="Search vanity and costumes"
              placeholder="Search" value={search}
              onChange={event=>setSearch(event.target.value)}/>
          </label>
        </div>}>
        <div className="axe-comp-variety-slot-heading">
          <span>{varietySlot?'Filtering '+(VARIETY_VIEWER_SLOTS.find(slot=>slot.id===varietySlot)?.label||'slot'):'All owned appearance'}</span>
          {varietySlot&&<button type="button" onClick={()=>setVarietySlot('')}>Show all</button>}
        </div>
        <div className="axe-app-inventory-grid" role="list">
          {shown.map(piece=><button type="button" role="listitem"
            key={piece.itemKey} className="axe-app-inventory-tile"
            aria-pressed={item?.itemKey===piece.itemKey}
            onClick={()=>setSelected(piece.itemKey)}
            onDoubleClick={()=>equipOwnedWardrobe(piece)}
            title={'Double-click to equip '+piece.name+' on player'}>
            <span className="axe-app-inventory-art">{icon(piece)}</span>
            <span className="axe-app-inventory-name">{piece.name}</span>
            <small>{piece.kind==='costume'?'Costume':'Vanity Set'} · {piece.rarity||'common'}</small>
            {piece.equipped&&<span className="axe-comp-equipped-label">Player equipped</span>}
          </button>)}
          {!shown.length&&<p className="axe-app-inventory-empty">
            No matching owned vanity pieces or costumes.
          </p>}
        </div>
        <div className="axe-comp-collection-count" aria-live="polite">
          {shown.length} shown · {owned.length} owned
        </div>
      </Pane>
    </main>
    <aside className="axe-app-right-stack" aria-label="Companion cosmetic details">
      <Pane name={item?.name||'Vanity Details'} className="axe-comp-style-detail">
        {item?<><div className="axe-app-selected-medallion">{icon(item)}</div>
          <p className="axe-app-description">{item.kind==='costume'?'Costume':'Vanity Set Piece'} ·
            {' '}{item.rarity||'common'}</p>
          <div className="axe-app-bonus-row"><span>Owned by</span><b>Player wardrobe</b></div>
          <div className="axe-app-bonus-row"><span>Player equipped</span>
            <b>{item.equipped?'Yes':'No'}</b></div>
          {item.slot&&<div className="axe-app-bonus-row"><span>Slot</span>
            <b>{AXE_VANITY_SLOTS[item.slot]?.label||item.slot}</b></div>}
          {item.setId&&<div className="axe-app-bonus-row"><span>Set</span>
            <b>{item.setId.replaceAll('axe_vanity_','').replaceAll('_',' ')}</b></div>}
          <div className="axe-app-detail-heading">Item Stats</div>
          {Object.entries(itemStats||{}).filter(([,value])=>Number(value)).map(([key,value])=>
            <div className="axe-app-bonus-row" key={key}><span>{key}</span>
              <b>{Number(value)>0?'+':''}{value}</b></div>)}
          {!Object.entries(itemStats||{}).some(([,value])=>Number(value))&&
            <p className="axe-app-description">Cosmetic appearance only; no stat modifiers.</p>}
          <p className="axe-app-description">These cosmetics are player-owned.
            Equipping them updates the player's wardrobe and its live 3D viewer.
            Companion armor still needs compatible fitted meshes; these player
            outfits never attach to the companion.</p>
          <button type="button" className="axe-app-unified-enchant axe-comp-imbue-button"
            disabled={!!item.equipped} onClick={()=>equipOwnedWardrobe(item)}>
            {item.equipped?<Check size={18}/>:<Shirt size={18}/>}
            {item.equipped?'Equipped on Player':'Equip on Player'}</button>
        </>:<p className="axe-app-description">Select an owned vanity piece or costume to inspect it.</p>}
      </Pane>
    </aside>
  </div>;
}
