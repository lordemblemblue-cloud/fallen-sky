import { useEffect, useState } from 'react';
import { ArrowRight, Coins, Gem, Shield, Swords } from 'lucide-react';
import { getAllAXEEquipmentItems, subscribeAXEEquipmentInventory } from '../equipment/AXEEquipmentInventoryStore';
import { getLootInventory, getLootItemCount, subscribeLootInventory } from '../../lootStore';
import { getShopState, subscribeShop } from '../../shop/shopStore';
import { getAXESocketState, subscribeAXESockets } from '../equipment/AXESocketGemStore';
import { AXE_GEM_DEFINITIONS, canInsertAXEGem, getAXEGemUpgradePreview } from '../equipment/AXESocketGemSystem';
import { executeAXEServiceTransaction } from './AXEServiceTransactionGateway';
import { getAXEServiceOperationPreview } from './AXEServiceWorkspaceModel';
import './AXEGemForgePane.css';

const labelStat = key => ({
  attack:'Attack', defense:'Defense', maxHP:'Max HP', spirit:'Spirit', critChance:'Critical Chance',
})[key] || String(key || '').replace(/([A-Z])/g,' $1');
const nice = value => Number(value || 0).toLocaleString();
const itemIcon = item => item?.imageUrl || item?.iconUrl || item?.image || null;
const readable = reason => String(reason || '').replaceAll('_',' ').toLowerCase();
// Sockets & Gems deliberately mounts NO inventory grid of its own. The parent
// Blacksmith's canonical 200-slot inventory is the only item picker.
export default function AXEGemForgePane({
  selectedItemId, selectedGemId = '', selectedDonorGemId = '', mode = 'insert',
  activeSelectionTarget = 'primary', onChangeMode, onSelectDonorGem,
  onFocusInventory, onTransaction,
}) {
  const [items,setItems] = useState(getAllAXEEquipmentItems);
  const [,setLoot] = useState(getLootInventory);
  const [wallet,setWallet] = useState(getShopState);
  const [socketVersion,setSocketVersion] = useState(0);
  const [socketIndex,setSocketIndex] = useState(0);
  const [resultStatus,setResultStatus] = useState('idle');
  const [pending,setPending] = useState(null);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  useEffect(()=>subscribeAXEEquipmentInventory(snapshot => setItems(snapshot?.items || getAllAXEEquipmentItems())),[]);
  useEffect(()=>subscribeLootInventory(setLoot),[]);
  useEffect(()=>subscribeShop(setWallet),[]);
  useEffect(()=>subscribeAXESockets(()=>setSocketVersion(value=>value+1)),[]);
  useEffect(()=>{ setResultStatus('idle'); setNotice(''); },[selectedGemId,mode]);
  useEffect(()=>setSocketIndex(0),[selectedItemId]);
  const selectedGem = AXE_GEM_DEFINITIONS[selectedGemId] || null;
  const selectedGemCount = selectedGemId ? getLootItemCount(selectedGemId,'gem') : 0;
  const donorGem = AXE_GEM_DEFINITIONS[selectedDonorGemId] || null;
  const matchingPair = !!selectedGem && selectedDonorGemId === selectedGemId
    && selectedGemCount >= 2;
  const gear = items.find(item=>item.instanceId===selectedItemId) || null;
  void socketVersion;
  const socketState = gear ? getAXESocketState(gear.instanceId) : null;
  const sockets = socketState?.sockets || [];
  const openIndexes = sockets.map((slot,index)=>slot.open && !slot.gemId ? index : -1)
    .filter(index=>index>=0);
  const activeSocket = openIndexes.includes(socketIndex) ? socketIndex : openIndexes[0] ?? null;
  const compatibility = gear && selectedGemId && activeSocket !== null
    ? canInsertAXEGem({...gear,...socketState},activeSocket,selectedGemId)
    : {ok:false,reason:!gear?'CHOOSE_EQUIPMENT':!selectedGemId?'CHOOSE_GEM':'NO_EMPTY_SOCKET'};
  const preview = getAXEGemUpgradePreview(selectedGemId);
  const drill = gear ? getAXEServiceOperationPreview('sockets',{item:gear,sockets:socketState}) : null;
  const canAdd = !!gear && !!selectedGem && selectedGemCount>0 && compatibility.ok && !busy;
  const canOpen = !!gear && !!drill?.canAdvance && !busy;
  const canUpgrade = matchingPair && !!preview.eligible
    && Number(wallet.gold||0)>=Number(preview.silver||0) && !busy;
  const focus = (next, target='primary') => {
    setNotice(''); setResultStatus('idle');
    onFocusInventory?.(next,target);
  };
  const beginInsertion = () => {
    if (!canAdd) { setNotice(readable(compatibility.reason) || 'Choose compatible gear and an owned gem.'); return; }
    setPending({type:'insert_gem',gemId:selectedGemId,itemId:gear.instanceId,socketIndex:activeSocket});
  };
  const beginUpgrade = () => {
    if (!canUpgrade) { setNotice('Select a matching second gem and have enough Gold.'); return; }
    setPending({type:'upgrade_gem',gemId:selectedGemId});
  };
  const beginDrilling = () => {
    if (!canOpen) return;
    setPending({type:'sockets',itemId:gear.instanceId});
  };
  const confirm = async () => {
    if (!pending || busy) return;
    const operation = pending; setPending(null); setBusy(true);
    try {
      const result = await executeAXEServiceTransaction(operation.type, {
        ...(operation.itemId ? {itemId:operation.itemId}:{}),
        ...(operation.gemId ? {gemId:operation.gemId}:{}),
        ...(operation.socketIndex != null ? {socketIndex:operation.socketIndex}:{}),
      });
      onTransaction?.(result);
      if (operation.type==='upgrade_gem') {
        setNotice(result.outcome==='success' ? 'Gem fusion succeeded. Your higher-tier gem is in inventory.'
          : result.outcome==='failure' ? 'Fusion failed. One donor gem and Gold were spent; the first gem remains.'
          : readable(result.reason) || 'Upgrade was not completed.');
        setResultStatus(result.outcome==='success' ? 'success'
          : result.outcome==='failure' ? 'failure' : 'error');
        onSelectDonorGem?.('');
      } else {
        setNotice(result.ok
          ? operation.type==='insert_gem' ? 'Gem added to the equipment socket.' : 'Socket drilling succeeded.'
          : readable(result.reason) || 'Action failed. Review the requirements.');
      }
      if (result.ok) { setSocketIndex(0); setSocketVersion(v=>v+1); }
    } catch(error) {
      setResultStatus('error');
      setNotice(error?.message || 'The operation could not be completed.');
    } finally { setBusy(false); }
  };
  return <section className="axe-gem-workspace" aria-label="Sockets and Gems workshop">
    <section className="axe-gem-operations" aria-label="Socket and Gem operations">
      <small className="axe-gem-eyebrow">GEM &amp; SOCKETS</small>
      <h3>Socket &amp; Gem Operation</h3>
      <div className="axe-gem-page-tabs" role="tablist" aria-label="Gem workshop mode">
        <button type="button" role="tab" aria-selected={mode==='insert'}
          onClick={()=>onChangeMode?.('insert')}>Add to Equipment</button>
        <button type="button" role="tab" aria-selected={mode==='upgrade'}
          onClick={()=>onChangeMode?.('upgrade')}>Upgrade Gems</button>
      </div>
      <p className="axe-gem-help">{mode==='insert'
        ? 'Select a gem and a piece of equipment. Open a socket or add the gem.'
        : 'Choose two matching owned gems to upgrade.'}</p>
      {mode==='insert' ? <>
        <div className="axe-gem-resources">
          <h4>Owned Resources</h4>
          <span className="axe-gem-slot-label">Gems</span>
          <button type="button" className="axe-gem-inventory-slot"
            aria-label="Choose gem from inventory"
            title="Show only gems in Inventory" onClick={()=>focus('Gems','primary')}>
            <span className="axe-gem-slot-art" aria-hidden="true">{selectedGem?.icon||'◇'}</span>
            <span className="axe-gem-slot-copy">{selectedGem
              ? <><strong>{selectedGem.name}</strong><small>×{selectedGemCount} · {labelStat(selectedGem.stat)} +{nice(selectedGem.value)}</small></>
              : <><strong>Select Gem</strong><small>View owned gems</small></>}</span>
          </button>
        </div>
        <div className="axe-gem-selection">
          <h4>Current Selection</h4>
          <span className="axe-gem-slot-label">Equipment</span>
          <button type="button" className="axe-gem-inventory-slot"
            aria-label="Choose equipment from inventory"
            title="Show compatible equipment in Inventory" onClick={()=>focus('Equipment','primary')}>
            <span className="axe-gem-slot-art" aria-hidden="true">
              {gear ? itemIcon(gear) ? <img src={itemIcon(gear)} alt=""/> : <Swords size={21}/> : <Shield size={21}/>}
            </span>
            <span className="axe-gem-slot-copy">{gear
              ? <><strong>{gear.name}</strong><small>{gear.rarity||'Equipment'} · Lv. {nice(gear.itemLevel??gear.level??1)}</small></>
              : <><strong>Select Equipment</strong><small>View compatible gear</small></>}</span>
          </button>
        </div>
        <div className="axe-gem-left-footer">
          <div className="axe-gem-actions">
            <button type="button" onClick={beginInsertion} disabled={!canAdd}><Gem size={15}/> Add Gem</button>
            <button type="button" onClick={beginDrilling} disabled={!canOpen}>Open Socket</button>
          </div>
          <p role="note">Tap either selection box to filter the shared Inventory.</p>
        </div>
      </> : <>
        <div className="axe-gem-resources">
          <h4>Owned Resources</h4>
          <span className="axe-gem-slot-label">Gems</span>
          <button type="button" className="axe-gem-inventory-slot"
            aria-label="Choose first gem from inventory" aria-pressed={activeSelectionTarget==='primary'}
            title="Choose the first gem" onClick={()=>focus('Gems','primary')}>
            <span className="axe-gem-slot-art" aria-hidden="true">{selectedGem?.icon||'◇'}</span>
            <span className="axe-gem-slot-copy">{selectedGem
              ? <><strong>{selectedGem.name}</strong><small>{labelStat(selectedGem.stat)} +{nice(selectedGem.value)}</small></>
              : <><strong>First Gem</strong><small>Select an owned gem</small></>}</span>
          </button>
          <span className="axe-gem-plus-sign" aria-hidden="true">+</span>
          <button type="button" className="axe-gem-inventory-slot"
            aria-label="Choose second matching gem from inventory" aria-pressed={activeSelectionTarget==='donor'}
            title="Choose a matching second gem" onClick={()=>focus('Gems','donor')}>
            <span className="axe-gem-slot-art" aria-hidden="true">{donorGem?.icon||'◇'}</span>
            <span className="axe-gem-slot-copy">{donorGem
              ? <><strong>{donorGem.name}</strong><small>{matchingPair?'Matching gem':'Must match first gem'}</small></>
              : <><strong>Second Gem</strong><small>Select a matching gem</small></>}</span>
          </button>
        </div>
        <div className="axe-gem-selection">
          <h4>Current Selection</h4>
          <span className="axe-gem-slot-label">Result</span>
          <div className="axe-gem-result-line">
            <div className="axe-gem-result-slot"
              aria-label={resultStatus==='success' ? 'Successful gem upgrade result' : 'Predicted gem upgrade result'}>
              <span aria-hidden="true">{(matchingPair || resultStatus==='success') && preview.eligible ? preview.nextGem?.icon||'◇' : '◇'}</span>
              <small>{(matchingPair || resultStatus==='success') && preview.eligible ? preview.nextGem?.name||'Next tier' : 'Gem Result'}</small>
            </div>
            <p role="status" aria-live="polite" className={'axe-gem-result-status axe-gem-result-status--'+resultStatus}>
              {resultStatus==='idle'
                ? !selectedGem ? 'Choose your first gem.'
                  : !donorGem ? 'Choose the second matching gem.'
                  : !matchingPair ? 'The two gems must match and you must own two copies.'
                  : !preview.eligible ? 'This gem is at its maximum tier.'
                  : Number(wallet.gold||0)<Number(preview.silver||0) ? 'Not enough Gold to upgrade.'
                  : 'Ready to upgrade. Success is not guaranteed.'
                : notice || (resultStatus==='success'?'Upgrade succeeded.':'Upgrade did not succeed.')}
            </p>
          </div>
        </div>
        <div className="axe-gem-left-footer">
          <div className="axe-gem-actions">
            <button type="button" onClick={beginUpgrade} disabled={!canUpgrade}><Gem size={15}/> Upgrade Gem</button>
          </div>
          <p role="note">A failed upgrade consumes Gold and one donor gem.</p>
        </div>
      </>}
    </section>

    <aside className="axe-gem-details" aria-label="Selected gem stats and costs">
      <header className="axe-gem-details-heading">
        <div><small>GEM &amp; SOCKETS</small>
          <h3>{mode==='insert' ? 'Gem & Socket Details':'Upgrade Gems'}</h3></div>
        <button type="button" onClick={()=>onChangeMode?.(mode==='insert'?'upgrade':'insert')}>
          {mode==='insert'?'Upgrade Gems':'Add to Equipment'} <ArrowRight size={13}/>
        </button>
      </header>
      {mode==='insert' ? <>
        <p>Inspect equipment, select an empty socket and preview the gem's real bonus.</p>
        <h4>Selected Equipment</h4>
        <button type="button" className="axe-gem-detail-picker" onClick={()=>focus('Equipment')}>
          {gear ? itemIcon(gear)?<img src={itemIcon(gear)} alt=""/>:<Swords size={20}/>:<Shield size={20}/>}
          <span>{gear?.name||'Select equipment'}<small>{gear ? (gear.rarity||'Equipment')+' · Lv. '+nice(gear.itemLevel??gear.level??1) : 'Choose from inventory'}</small></span>
          <ArrowRight size={13}/>
        </button>
        <div className="axe-gem-detail-row"><span>Socket Count</span><b>{socketState ? sockets.length+' / '+socketState.maxSockets : '—'}</b></div>
        <div className="axe-gem-detail-row"><span>Empty Sockets</span><b>{gear ? openIndexes.length : '—'}</b></div>
        <div className="axe-gem-socket-picker-heading">
          <span>Gem Socket</span>
          <button type="button" disabled={openIndexes.length<2}
            onClick={()=>setSocketIndex(openIndexes[(openIndexes.indexOf(activeSocket)+1)%openIndexes.length])}
            title="Choose another open, empty socket">Change Gem Socket</button>
        </div>
        <div className="axe-gem-socket-row" role="group" aria-label="Select an empty equipment socket">
          {gear ? Array.from({length:socketState?.maxSockets||4},(_,index)=>{
            const slot=sockets[index];const installed=slot?.gemId?AXE_GEM_DEFINITIONS[slot.gemId]:null;
            return <button type="button" key={index}
              title={installed?.name||(!slot?'Socket locked':'Empty socket')}
              aria-label={'Socket '+(index+1)+': '+(installed?.name||(!slot?'locked':'empty'))}
              aria-pressed={activeSocket===index && !!slot && !installed}
              disabled={!slot || !!installed} onClick={()=>setSocketIndex(index)}>
              {installed?.icon||(!slot?'🔒':'◇')}<small>{index+1}</small>
            </button>;
          }) : <span>Select equipment to view sockets.</span>}
        </div>
        <h4>Selected Gem</h4>
        <button type="button" className="axe-gem-detail-picker" onClick={()=>focus('Gems')}>
          <span className="axe-gem-pick-icon">{selectedGem?.icon||'◇'}</span>
          <span>{selectedGem?.name||'Choose a gem'}<small>{selectedGem ? labelStat(selectedGem.stat)+' +'+nice(selectedGem.value) : 'Owned compatible gems'}</small></span>
          <ArrowRight size={13}/>
        </button>
        <div className="axe-gem-detail-row"><span>Gem Bonus</span><b>{selectedGem ? labelStat(selectedGem.stat)+' +'+nice(selectedGem.value):'—'}</b></div>
        <div className="axe-gem-detail-row"><span>Fits</span><b>{selectedGem?.allowedSlots?.join(', ') || '—'}</b></div>
        <div className="axe-gem-detail-row"><span>Insertion</span><b>{compatibility.ok?'Compatible':readable(compatibility.reason)}</b></div>
        <h4>Socket Opening Requirements</h4>
        {Object.entries(drill?.cost||{}).length ? Object.entries(drill.cost).map(([key,count])=>
          <div className="axe-gem-detail-row" key={key}><span>{key.replaceAll('_',' ')}</span>
            <b>{nice(getLootItemCount(key,'material'))} / {nice(count)}</b></div>) :
          <p>{gear?'No further socket operation is available.':'Select equipment to view socket material costs.'}</p>}
        <div className="axe-gem-detail-row"><span>Success Chance</span>
          <b>{drill?.chance == null?'—':Math.round(drill.chance*100)+'%'}</b></div>
      </> : <>
        <p>Two gems are chosen using the two selection boxes on the left. Both must be the same gem and tier.</p>
        <h4>Gem Upgrade</h4>
        <div className="axe-gem-detail-row"><span>First Gem</span><b>{selectedGem?.name||'—'}</b></div>
        <div className="axe-gem-detail-row"><span>Second Gem</span><b>{donorGem?.name||'—'}</b></div>
        <div className="axe-gem-detail-row"><span>Owned copies</span><b>{nice(selectedGemCount)}</b></div>
        <div className="axe-gem-detail-row"><span>Matching pair</span><b>{matchingPair?'Ready':'Not ready'}</b></div>
        <h4>Upgrade Preview</h4>
        <div className="axe-gem-detail-row"><span>Result</span><b>{preview.nextGem?.name||'Max tier'}</b></div>
        <div className="axe-gem-detail-row"><span>Next bonus</span><b>{preview.nextGem
          ? labelStat(preview.nextGem.stat)+' +'+nice(preview.nextGem.value) : '—'}</b></div>
        <div className="axe-gem-detail-row"><span>Success chance</span><b>{preview.eligible ? Math.round(preview.chance*100)+'%' : '—'}</b></div>
        <div className="axe-gem-detail-row"><span>Gold required</span><b><Coins size={13}/>{preview.eligible?nice(preview.silver):'—'}</b></div>
        <div className="axe-gem-detail-row"><span>Gold owned</span><b>{nice(wallet.gold)}</b></div>
        <p>Failed fusion spends one donor gem and the required Gold. Your first gem remains.</p>
      </>}
      {notice && <p className="axe-gem-notice" role="status">{notice}</p>}
    </aside>

    {mode==='insert' && <section className="axe-gem-preview" aria-label="Gem insertion preview">
      <h3>Insertion Preview</h3>
      <div className="axe-gem-preview-row"><span>Stat</span><b>Current</b><b>With Gem</b></div>
      <div className="axe-gem-preview-row"><span>{selectedGem ? labelStat(selectedGem.stat) : 'Gem bonus'}</span>
        <b>+0</b><b>{selectedGem && compatibility.ok ? '+'+nice(selectedGem.value) : '—'}</b></div>
      <div className="axe-gem-preview-row"><span>Empty sockets</span>
        <b>{gear ? openIndexes.length : '—'}</b><b>{canAdd ? openIndexes.length-1 : '—'}</b></div>
      <small>Projected gem contribution only; existing equipment stats are unchanged until confirmed.</small>
    </section>}

    {pending && <div className="axe-gem-modal-backdrop" role="presentation">
      <div className="axe-gem-modal" role="dialog" aria-modal="true" aria-label="Confirm gem operation">
        <h3>Confirm Gem Operation</h3>
        <p>{pending.type==='upgrade_gem'
          ? 'Fuse two '+(selectedGem?.name||'matching gems')+' for '+nice(preview.silver)+' Gold? Chance: '+Math.round(preview.chance*100)+'%. Failure spends one donor gem and Gold.'
          : pending.type==='insert_gem'
            ? 'Insert '+selectedGem?.name+' into '+gear?.name+'? The gem will be consumed from inventory.'
            : 'Attempt to open a socket on '+gear?.name+'? Materials are spent on every attempt.'}</p>
        <div className="axe-gem-modal-actions">
          <button type="button" onClick={()=>setPending(null)}>Cancel</button>
          <button type="button" onClick={confirm} disabled={busy}>Confirm</button>
        </div>
      </div>
    </div>}
  </section>;
}
