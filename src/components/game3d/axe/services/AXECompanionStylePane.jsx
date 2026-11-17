import { lazy, Suspense, useEffect, useState } from 'react';
import { Check, Crown, Feather, Gem, Search, Shield, Shirt, Sparkles, UserRound } from 'lucide-react';
import { subscribeAXEVanity,getAXEVanityState,equipAXEVanityPiece } from '../progression/AXEVanityStore';
import { subscribeAXECostumes,getAXECostumeState,equipAXECostume } from '../progression/AXECostumeStore';
import { AXE_VANITY_PIECES,AXE_VANITY_SLOTS } from '../progression/AXEVanitySystem';
import { AXE_COSTUME_DEFINITIONS } from '../progression/AXECostumeSystem';
import { getAXESoulRegaliaState,subscribeAXESoulRegalia,getAXESoulRegaliaBonuses }
  from '../progression/AXESoulRegaliaStore';
import { getCompanionState,subscribeCompanion,setActiveCompanion } from '../../companionStore';
import { getCompanionById, COMPANION_DEFINITIONS } from '../../companionData';
import './AXEGlassLoadoutPane.css';
import './AXECompanionStylePane.css';
import AXECompanionFusionButton from './AXECompanionFusionButton';

const PlayerModel = lazy(() => import('../../equipment/EquipmentPreview3D'));
const CompanionModel = lazy(() => import('../../equipment/CompanionPreview3D'));
export const IMBUE_TARGETS = Object.freeze([
  { id:'hands', label:'Hands', slot:'arms', icon:'✧' },
  { id:'helmet', label:'Helmet', slot:'head', icon:'♕' },
  { id:'feet', label:'Feet', slot:'legs', icon:'◇' },
  { id:'armor', label:'Armor', slot:'chest', icon:'⬡' },
]);
// Existing five PLAYER wardrobe slots, not rigged companion armor.
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
  const soul=useLive(subscribeAXESoulRegalia,getAXESoulRegaliaState);
  const [selected,setSelected]=useState(null);
  const [varietySlot,setVarietySlot]=useState('');
  const [previewOwner,setPreviewOwner]=useState('wardrobe');
  const [target,setTarget]=useState('hands');
  const [typeFilter,setTypeFilter]=useState('All');
  const [rarityFilter,setRarityFilter]=useState('All');
  const [search,setSearch]=useState('');
  useEffect(()=>{
    setSelected(null);setTarget('hands');setTypeFilter('All');setRarityFilter('All');setSearch('');
    setVarietySlot('');setPreviewOwner('wardrobe');
  },[page,companion.activeCompanionId]);
  const isImbue=page==='Imbuement';
  const currentTarget=IMBUE_TARGETS.find(item=>item.id===target)||IMBUE_TARGETS[0];
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
  const fusion=getAXESoulRegaliaBonuses();
  const percent=Number(soul.infusion?.[currentTarget.slot]||0);
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
  };
  return <div className="axe-app-layout axe-comp-style-layout"
    data-companion-page={page}>
    <aside className="axe-app-rail" aria-label="Companion selector">
      <div className="axe-app-rail-glyph"><UserRound size={21}/><small>Companion</small></div>
      {COMPANION_DEFINITIONS.map(def=><button key={def.id} type="button"
        aria-label={'Select companion '+def.name}
        aria-pressed={companion.activeCompanionId===def.id} onClick={()=>selectCompanion(def.id)}>
        <UserRound size={23}/><span className="axe-app-rail-name">{def.name}</span>
        {companion.activeCompanionId===def.id&&<Check size={13}/>}
      </button>)}
    </aside>
    <section className={'axe-app-model-stage axe-comp-style-stage'+(isImbue?' axe-comp-imbue-stage':'')}
      aria-label={isImbue?'Player imbue target viewer':'Companion appearance viewer'}>
      <div className="axe-app-model-glow" aria-hidden="true"/>
      {!isImbue&&<div className="axe-app-viewer-gear axe-app-viewer-gear--left axe-comp-variety-rail"
        aria-label="Equipped player wardrobe slots, left">
        {VARIETY_VIEWER_SLOTS.slice(0,3).map(varietySlotCard)}
      </div>}
      {!isImbue&&<div className="axe-app-viewer-gear axe-app-viewer-gear--right axe-comp-variety-rail"
        aria-label="Equipped player wardrobe slots, right">
        {VARIETY_VIEWER_SLOTS.slice(3).map(varietySlotCard)}
      </div>}
      {isImbue&&IMBUE_TARGETS.map((entry,i)=><button key={entry.id} type="button"
        className={'axe-comp-imbue-corner axe-comp-imbue-corner--'+i}
        aria-pressed={target===entry.id} onClick={()=>setTarget(entry.id)}>
        <span>{entry.icon}</span><small>{entry.label}</small>
      </button>)}
      <div className="axe-app-model-center">
        <Suspense fallback={<p className="axe-app-loading">Loading 3D preview…</p>}>
          <div className="axe-app-model-host">{isImbue||previewOwner==='wardrobe'?<PlayerModel/>:
            selectedModel?<CompanionModel key={selectedModel.id} companionId={selectedModel.id}/>:
              <p className="axe-app-loading">Select an active companion</p>}</div>
        </Suspense>
      </div>
      {!isImbue&&<button type="button" className="axe-comp-variety-preview-toggle"
        onClick={()=>setPreviewOwner(value=>value==='wardrobe'?'companion':'wardrobe')}>
        {previewOwner==='wardrobe'?'View Companion':'View Player Wardrobe'}
      </button>}
      {(isImbue||previewOwner==='companion')&&<AXECompanionFusionButton onNotice={onNotice}/>}
      <div className="axe-app-model-caption"><strong>
        {isImbue?'Player Imbuement':previewOwner==='wardrobe'?'Player Wardrobe':
          selectedModel?.name||'Companion Appearance'}</strong>
        <span>{isImbue?'Choose one of the four body points':
          previewOwner==='wardrobe'?'Five equipped player appearance slots':
            'Companion preview · player cosmetics do not apply'}</span>
      </div>
    </section>
    <main className="axe-app-main-stack" aria-label={isImbue?'Imbuement targets':'Companion cosmetic inventory'}>
      {isImbue?<Pane name="Imbue Targets">
        <div className="axe-comp-imbue-list">{IMBUE_TARGETS.map(entry=><button key={entry.id}
          type="button" aria-pressed={target===entry.id} onClick={()=>setTarget(entry.id)}>
          <Sparkles size={18}/><span>{entry.label}</span>
          <b>{soul.infusion?.[entry.slot]||0}%</b></button>)}</div>
      </Pane>:<Pane name="Variety Collection" className="axe-app-inventory"
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
      </Pane>}
    </main>
    <aside className="axe-app-right-stack" aria-label={isImbue?'Selected imbue options':'Companion cosmetic details'}>
      {isImbue?<Pane name={currentTarget.label+' Imbuement'} className="axe-comp-style-detail">
        <div className="axe-app-unified-stats">
          <div className="axe-app-bonus-row"><span>Current Infusion</span><b>{percent}% / 100%</b></div>
          <div className="axe-app-bonus-row"><span>Soul Fusion</span><b>{fusion.fused?'Active':'Inactive'}</b></div>
          <div className="axe-app-bonus-row"><span>Equipment bonus</span>
            <b>{fusion.fused && percent===100?'See compatible equipment':'Not active'}</b></div>
        </div>
        <p className="axe-app-description">Infusion must be earned through the existing
          verified Soul Regalia reward system. The same player model shown in Appearance
          is used here; selecting a corner changes the active body target.</p>
        <button type="button" className="axe-app-unified-enchant axe-comp-imbue-button"
          disabled title="No manual infusion transaction is currently configured">
          <Sparkles size={18}/>Imbue</button>
      </Pane>:<Pane name={item?.name||'Vanity Details'} className="axe-comp-style-detail">
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
      </Pane>}
    </aside>
  </div>;
}
