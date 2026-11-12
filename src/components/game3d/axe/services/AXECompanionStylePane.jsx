import { lazy, Suspense, useEffect, useState } from 'react';
import { Check, Feather, Gem, Heart, Shield, Shirt, Sparkles, UserRound } from 'lucide-react';
import { subscribeAXEVanity,getAXEVanityState } from '../progression/AXEVanityStore';
import { subscribeAXECostumes,getAXECostumeState } from '../progression/AXECostumeStore';
import { AXE_VANITY_PIECES,AXE_VANITY_SLOTS } from '../progression/AXEVanitySystem';
import { AXE_COSTUME_DEFINITIONS } from '../progression/AXECostumeSystem';
import { getAXESoulRegaliaState,subscribeAXESoulRegalia,getAXESoulRegaliaBonuses }
  from '../progression/AXESoulRegaliaStore';
import { getCompanionState,subscribeCompanion,setActiveCompanion } from '../../companionStore';
import { getCompanionById, COMPANION_DEFINITIONS, COMPANION_GEAR } from '../../companionData';
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
function useLive(subscribe,get) {
  const [value,setValue]=useState(get);
  useEffect(()=>subscribe(setValue),[subscribe]);
  return value;
}
function Pane({name,children,className=''}) {
  return <section className={'axe-app-card '+className}>
    <header className="axe-app-card-heading"><Sparkles size={20}/><h3>{name}</h3></header>
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
  const [target,setTarget]=useState('hands');
  const [filter,setFilter]=useState('All');
  useEffect(()=>{setSelected(null);setTarget('hands');setFilter('All');},[page,companion.activeCompanionId]);
  const isImbue=page==='Imbuement';
  const currentTarget=IMBUE_TARGETS.find(item=>item.id===target)||IMBUE_TARGETS[0];
  const selectedModel=getCompanionById(companion.activeCompanionId);
  // The existing costume and vanity catalogs are PLAYER cosmetics, not wolf
  // attachments. We can inspect real owned items in the matching layout, but
  // we must not apply human meshes/stat bonuses to a companion or fake equip.
  const owned=page==='Vanity'
    ? (vanity.ownedPieceIds||[]).map(id=>AXE_VANITY_PIECES[id]).filter(Boolean)
    : (costumes.owned||[]).map(id=>AXE_COSTUME_DEFINITIONS[id]).filter(Boolean);
  const shown=owned.filter(item=>filter==='All' ||
    (page==='Vanity' ? item.slot===filter : item.rarity===filter));
  const item=shown.find(row=>row.id===selected)||shown[0]||null;
  const categories=[...new Set(owned.map(row=>page==='Vanity'?row.slot:row.rarity||'common'))];
  const fusion=getAXESoulRegaliaBonuses();
  const percent=Number(soul.infusion?.[currentTarget.slot]||0);
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
      {!isImbue&&['left','right'].map(side=><div key={side}
        className={'axe-app-viewer-gear axe-app-viewer-gear--'+side}>
        {(selectedModel?.gearSlots||[]).filter((_,i)=>side==='left'?i<2:i>=2).map(slot=>{
          const itemId=companion.gear?.[selectedModel.id]?.[slot];
          const item=COMPANION_GEAR[slot]?.find(piece=>piece.id===itemId);
          return <button key={slot} type="button" className="axe-app-viewer-slot"
            title={item?.name||slot+' slot'} onClick={()=>onPageChange('Equipment')}>
            <span className="axe-app-viewer-slot-art"><Shield size={25}/></span>
            <small>{slot.replaceAll('_',' ')}</small>
            <span className="axe-app-viewer-item-name">{item?.name||'—'}</span>
          </button>;
        })}
      </div>)}
      {isImbue&&IMBUE_TARGETS.map((entry,i)=><button key={entry.id} type="button"
        className={'axe-comp-imbue-corner axe-comp-imbue-corner--'+i}
        aria-pressed={target===entry.id} onClick={()=>setTarget(entry.id)}>
        <span>{entry.icon}</span><small>{entry.label}</small>
      </button>)}
      <div className="axe-app-model-center">
        <Suspense fallback={<p className="axe-app-loading">Loading 3D preview…</p>}>
          <div className="axe-app-model-host">{isImbue?<PlayerModel/>:
            selectedModel?<CompanionModel key={selectedModel.id}/>:
              <p className="axe-app-loading">Select an active companion</p>}</div>
        </Suspense>
      </div>
      <AXECompanionFusionButton onNotice={onNotice}/>
      <div className="axe-app-model-caption"><strong>
        {isImbue?'Player Imbuement':selectedModel?.name||'Companion Appearance'}</strong>
        <span>{isImbue?'Choose one of the four body points':page+' · companion preview'}</span>
      </div>
    </section>
    <main className="axe-app-main-stack" aria-label={isImbue?'Imbuement targets':'Companion cosmetic inventory'}>
      {isImbue?<Pane name="Imbue Targets">
        <div className="axe-comp-imbue-list">{IMBUE_TARGETS.map(entry=><button key={entry.id}
          type="button" aria-pressed={target===entry.id} onClick={()=>setTarget(entry.id)}>
          <Sparkles size={18}/><span>{entry.label}</span>
          <b>{soul.infusion?.[entry.slot]||0}%</b></button>)}</div>
      </Pane>:<Pane name={page==='Vanity'?'Vanity Inventory':'Costume Inventory'}
        className="axe-app-inventory">
        <div className="axe-app-inventory-filters" aria-label="Cosmetic inventory filters">
          {['All',...categories].map(category=><button type="button" key={category}
            aria-pressed={filter===category} onClick={()=>{setFilter(category);setSelected(null);}}>
            {category==='All'?'All':category.replaceAll('_',' ')}</button>)}
        </div>
        <div className="axe-app-inventory-grid" role="list">
          {shown.map(piece=><button type="button" role="listitem"
            key={piece.id} className="axe-app-inventory-tile"
            aria-pressed={item?.id===piece.id} onClick={()=>setSelected(piece.id)}>
            <span className="axe-app-inventory-art">{icon(piece)}</span>
            <span className="axe-app-inventory-name">{piece.name}</span>
            <small>{piece.rarity||AXE_VANITY_SLOTS[piece.slot]?.label||'Vanity'}</small>
          </button>)}
          {!shown.length&&<p className="axe-app-inventory-empty">No owned {page.toLowerCase()} pieces.</p>}
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
      </Pane>:<Pane name={item?.name||page+' Details'} className="axe-comp-style-detail">
        {item?<><div className="axe-app-selected-medallion">{icon(item)}</div>
          <p className="axe-app-description">{item.rarity||'Cosmetic'} ·
            {item.slot?AXE_VANITY_SLOTS[item.slot]?.label||item.slot:' Outfit'}</p>
          <div className="axe-app-detail-heading">Item Stats</div>
          {Object.entries(item.baseBonus||{}).filter(([,v])=>Number(v)).map(([key,value])=>
            <div className="axe-app-bonus-row" key={key}><span>{key}</span><b>+{value}</b></div>)}
          <p className="axe-app-description">This is an owned player cosmetic.
            Companion-specific mesh attachments and equip rules are not yet configured.
            It cannot be equipped on the companion without an approved compatible asset.</p>
          <button type="button" className="axe-app-unified-enchant axe-comp-imbue-button" disabled>
            <Shirt size={18}/>Equip to Companion</button>
        </>:<p className="axe-app-description">Select an owned {page.toLowerCase()} item to inspect it.</p>}
      </Pane>}
    </aside>
  </div>;
}
