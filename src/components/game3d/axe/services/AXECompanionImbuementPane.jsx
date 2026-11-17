import {lazy,Suspense,useEffect,useState} from 'react';
import {Check,CircleAlert,Gem,Link2,Sparkles,UserRound} from 'lucide-react';
import {getCompanionState,setActiveCompanion,subscribeCompanion} from '../../companionStore';
import {getCompanionById,COMPANION_DEFINITIONS} from '../../companionData';
import {getAXESoulRegaliaState,subscribeAXESoulRegalia,getAXESoulRegaliaBonuses}
  from '../progression/AXESoulRegaliaStore';
import {getAXEPetState,subscribeAXEPets} from '../progression/AXEPetStore';
import {xpForAXEPetLevel} from '../progression/AXEPetSystem';
import {getAXEMountState,subscribeAXEMounts} from '../progression/AXEMountStore';
import {getAXEEquipmentInventoryState,subscribeAXEEquipmentInventory,getEquippedAXEItems}
  from '../equipment/AXEEquipmentInventoryStore';
import {isSoulCompanionMastered,soulInfusionItemBonusPct}
  from '../progression/AXESoulRegaliaSystem';
import {IMBUE_TARGETS,imbuementTargetView,IMBUE_MATERIAL_RECIPE_STATUS}
  from './AXEImbuementPresentation.mjs';
import AXECompanionFusionButton from './AXECompanionFusionButton';
import './AXECompanionImbuementPane.css';

const PlayerModel=lazy(()=>import('../../equipment/EquipmentPreview3D'));
const useLive=(subscribe,get)=>{
  const [state,setState]=useState(get);
  useEffect(()=>subscribe(setState),[subscribe]);
  return state;
};
const fmt=value=>Math.max(0,Number(value)||0).toLocaleString();
const statusLabel=passed=>passed?'Ready':'Required';

export default function AXECompanionImbuementPane({onNotice=()=>{}}) {
  const companion=useLive(subscribeCompanion,getCompanionState);
  const soul=useLive(subscribeAXESoulRegalia,getAXESoulRegaliaState);
  const pets=useLive(subscribeAXEPets,getAXEPetState);
  const mounts=useLive(subscribeAXEMounts,getAXEMountState);
  useLive(subscribeAXEEquipmentInventory,getAXEEquipmentInventoryState);
  const [target,setTarget]=useState('hands');
  const [requirementsOpen,setRequirementsOpen]=useState(true);
  const selectedModel=getCompanionById(companion.activeCompanionId);
  const registered=pets.pets?.find(pet=>pet.instanceId===pets.activeRegisteredPetId)||null;
  const activeMount=mounts.mounts?.find(mount=>mount.instanceId===mounts.activeMountId)||null;
  const bonus=getAXESoulRegaliaBonuses();
  const equipment=getEquippedAXEItems();
  const detail=imbuementTargetView(target,soul,equipment);
  const petMastered=isSoulCompanionMastered(registered);
  const bonded=bonus.fused;
  const xpNeed=registered?.level>=200?null:registered?xpForAXEPetLevel(registered.level):null;
  const ascendedChosen=bonus.set?.grade==='chosen'&&bonus.set?.complete&&
    Number(soul.ascension?.chosen||0)>=1;
  const eligibleFullSoul={...soul,infusion:{...soul.infusion,[detail.slot]:100}};
  const previewBonus=item=>soulInfusionItemBonusPct(item,eligibleFullSoul,bonus.set,registered);
  const actualBonus=item=>soulInfusionItemBonusPct(item,soul,bonus.set,registered);
  const selectCompanion=id=>{
    const response=setActiveCompanion(id);
    if(response?.ok===false)onNotice(response.reason||'Unable to select companion');
  };

  return <div className="axe-app-layout axe-comp-style-layout axe-comp-imbue-layout"
    data-companion-page="Imbuement" data-imbue-layout="unified-split">
    <aside className="axe-app-rail axe-comp-imbue-companion-rail" aria-label="Companion selector">
      <div className="axe-app-rail-glyph"><UserRound size={20}/><small>Companion</small></div>
      {COMPANION_DEFINITIONS.map(def=><button key={def.id} type="button"
        aria-label={'Select companion '+def.name}
        aria-pressed={companion.activeCompanionId===def.id}
        onClick={()=>selectCompanion(def.id)}>
        <UserRound size={22}/><span className="axe-app-rail-name">{def.name}</span>
        {companion.activeCompanionId===def.id&&<Check size={13}/>}
      </button>)}
    </aside>
    <main className="axe-comp-imbue-workspace" aria-label="Imbuement workspace">
      <section className="axe-comp-imbue-left" aria-label="Body imbuement targets and preview">
        <div className="axe-comp-imbue-left-heading">
          <span>Imbuement</span><small>Selected body points</small>
        </div>
        <div className="axe-comp-imbue-targets-and-model">
          <div className="axe-comp-imbue-model" aria-label="Player model preview">
            <Suspense fallback={<p className="axe-app-loading">Loading 3D preview…</p>}>
              <div className="axe-comp-imbue-model-host"><PlayerModel/></div>
            </Suspense>
            <div className="axe-comp-imbue-model-caption">Player Armor
              <small>{selectedModel?.name||'Select a companion'} · Soul resonance</small>
            </div>
          </div>
          <div className="axe-comp-imbue-target-stack" role="group" aria-label="Imbuement slots">
            {IMBUE_TARGETS.map(entry=>{
              const view=imbuementTargetView(entry.id,soul,equipment);
              return <button type="button" key={entry.id}
                className="axe-comp-imbue-target"
                aria-pressed={target===entry.id}
                aria-label={entry.label+' imbuement '+view.percent+' percent'}
                onClick={()=>{setTarget(entry.id);setRequirementsOpen(true);}}>
                <span className="axe-comp-imbue-target-symbol" aria-hidden="true">{entry.icon}</span>
                <span className="axe-comp-imbue-target-copy">
                  <strong>{entry.label}</strong>
                  <small>{view.sharedWith?'Shares Hands infusion':view.equipment.length+' equipped items'}</small>
                  <span className="axe-comp-imbue-progress" role="progressbar"
                    aria-label={entry.label+' infusion progress'}
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.percent}>
                    <i style={{width:view.percent+'%'}}/>
                  </span>
                </span>
                <b>{view.percent}%</b>
              </button>;
            })}
          </div>
        </div>
        <p className="axe-comp-imbue-legend">
          Weapons use the same <strong>Arms</strong> infusion progress as Hands; there is no separate weapon upgrade counter.
        </p>
      </section>
      <aside className="axe-comp-imbue-right" aria-label="Selected imbuement information">
        <header className="axe-comp-imbue-info-heading">
          <h2><Sparkles size={19}/> Imbuement Information</h2>
          <span>{detail.label}</span>
        </header>
        <div className="axe-comp-imbue-info-scroll">
          <h3>{detail.label} · {detail.percent}%</h3>
          <p>{detail.sharedWith
            ?'Weapons and Hands share the existing Arms soul-infusion progression.'
            :'Select a body slot to inspect its actual soul progress and equipped item bonuses.'}</p>
          <div className="axe-comp-imbue-summary">
            <div><small>Current infusion</small><strong>{detail.percent}% <span>/ 100%</span></strong></div>
            <div><small>Soul fusion</small><strong>{bonded?'Active':'Inactive'}</strong></div>
            <div><small>Completed chosen set</small><strong>{ascendedChosen?'Ascended':'No'}</strong></div>
          </div>

          <h4>Equipment stat increases</h4>
          {detail.equipment.length>0
            ? <div className="axe-comp-imbue-equipped-list">
              {detail.equipment.map((piece,index)=><div key={piece.instanceId||index}>
                <span>{piece.name||piece.label||piece.slot}</span>
                <b>+{actualBonus(piece)}% now · +{previewBonus(piece)}% at 100%</b>
              </div>)}
            </div>
            : <p className="axe-comp-imbue-muted">No compatible equipped item is available for this target.</p>}
          <p className="axe-comp-imbue-muted">The verified Soul Regalia modifier is +20% per eligible item at 100%
            infusion, or +50% for a completed, ascended Chosen set. The Chosen bonus replaces the 20%;
            it does not stack with it. The values shown above also respect companion mastery and fusion gates.</p>

          <button type="button" className="axe-comp-imbue-requirements-toggle"
            aria-expanded={requirementsOpen} onClick={()=>setRequirementsOpen(!requirementsOpen)}>
            <Gem size={16}/> Imbuement requirements <span>{requirementsOpen?'−':'+'}</span>
          </button>
          {requirementsOpen&&<div className="axe-comp-imbue-requirements">
            <div><span>Registered Soul Companion</span>
              <strong>{registered?'Registered':'Missing'}</strong></div>
            <div><span>Companion Level</span>
              <strong>{registered?registered.level+' / 200':'No registered companion'}
                {' · '}{statusLabel(Number(registered?.level||0)>=200)}</strong></div>
            <div><span>Over-Enchantment</span>
              <strong>{Number(registered?.overEnchantPercent||0)}% / 200%
                {' · '}{statusLabel(Number(registered?.overEnchantPercent||0)>=200)}</strong></div>
            <div><span>Companion Experience</span>
              <strong>{registered?(registered.level>=200?'Maximum level':
                fmt(registered.xp)+' / '+fmt(xpNeed)+' XP to next level'):'Unavailable'}</strong></div>
            <div><span>Active mount experience</span>
              <strong>{activeMount?fmt(activeMount.totalXp)+' total XP':'No active mount'}</strong></div>
            <div><span>Companion fusion</span><strong>{bonded?'Active':'Required'}</strong></div>
            <div><span>Infusion reward progress</span><strong>{detail.percent}% / 100%</strong></div>
          </div>}
          <div className="axe-comp-imbue-materials">
            <h4>Materials &amp; cost</h4>
            <p>Manual imbuement recipe: <strong>{IMBUE_MATERIAL_RECIPE_STATUS==='UNCONFIGURED'?'Not configured':'Available'}</strong>.
              Soul infusion currently progresses through verified quest or loot rewards,
              not a player-side material or XP purchase.</p>
            <div><span>Pet Soul owned</span><b>{fmt(pets.materials?.pet_soul)}</b></div>
            <div><span>Pet Catalyst owned</span><b>{fmt(pets.materials?.pet_catalyst)}</b></div>
            <small>These are real inventory balances, not a quoted imbuement cost; no materials are consumed here.</small>
          </div>
          <AXECompanionFusionButton onNotice={onNotice}/>
          <button type="button" className="axe-app-unified-enchant axe-comp-imbue-button"
            disabled title="Manual imbuement is unavailable until a verified server-backed recipe and cost are implemented">
            <Sparkles size={18}/> Imbue · Awaiting verified recipe
          </button>
          <p className="axe-comp-imbue-muted"><CircleAlert size={14}/>
            Imbue is locked rather than granting free stats or spending undocumented materials.
            Earn infusion from the existing verified reward path.</p>
        </div>
      </aside>
    </main>
  </div>;
}
