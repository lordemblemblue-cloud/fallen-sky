import { useMemo, useState } from 'react';
import { SHOP_ITEMS, SHOP_RULES, shopItem, tierPrice, tierItemPassive } from '../core/shop.mjs';
import { SHOP_CATEGORIES, STAT_FILTERS, STATUS_FILTERS, itemArt, itemTier, recipeFor, buildsInto, shopQuote, filterShopItems, nextPrice, tierStats } from '../core/shopView.mjs';
import './duelistBattleShop.css';

const ROMAN=['','I','II','III'];
const LABELS=Object.fromEntries(STAT_FILTERS);
const CATEGORY_ICONS={power:'⚔',defense:'◈',ability:'✦',health:'✚',tenacity:'✥',hybrid:'◇',support:'✧',counter:'◎',relic:'♜'};
export function ItemIcon({ item, tier=3 }) {
  return <img className="duelist-item-art" alt={item.name+' Tier '+ROMAN[tier]} loading="lazy"
    src={itemArt(item.id,tier)} draggable={false}/>;
}
const formatStat=(key,value)=>key==='health'?'+'+Math.round(value)+' HP':'+'+Math.round(value*1000)/10+'% '+(LABELS[key]||key);
const names={
  'unknown-item':'That item is not available','shop-at-spawn':'Buy at spawn or while waiting to respawn',
  'invalid-loadout':'Invalid item loadout','fully-upgraded':'This item is already Tier III',
  'inventory-full':'All six equipment slots are filled','not-enough-gold':'Not enough gold',
  'not-available':'Shop is closed','no-match':'Join a match to buy items',
  'active-relic-slot-full':'Only one active relic can be equipped at a time',
  'invalid-tier':'Select a higher valid tier','invalid-recipe':'This recipe cannot be combined',
  'missing-components':'Own both Tier I components first','shop-build-unavailable':'This room needs the updated shop host. No gold was spent.',
};
const toggle=(set,id)=>set(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);
function Coin({value}) { return <span className="bs-coin"><span aria-hidden="true">◉</span> {value}</span>; }
function FilterRail({title,options,active,onToggle,onClear,children}) {
  return <aside className="bs-filter-rail" aria-label={title}>
    <h3>{title}</h3>
    {options.map(([id,label])=><label key={id} className="bs-filter-option"><input type="checkbox" checked={active.includes(id)} onChange={()=>onToggle(id)}/><span>{label}</span></label>)}
    {children}
    <button type="button" className="bs-quiet" onClick={onClear}>Clear</button>
  </aside>;
}
function BuildNode({item,tier,owned,selected,onSelect}) {
  return <button type="button" className="bs-build-node" data-selected={selected} data-owned={owned>=tier}
    aria-pressed={selected} onClick={onSelect}>
    <ItemIcon item={item} tier={tier}/>
    <span>{item.name} · {ROMAN[tier]}</span>
    <Coin value={tierPrice(item,tier)}/>
    {owned>=tier&&<small>Owned</small>}
  </button>;
}
export default function ShopPanel({ me, answer, onBuy, onClose }) {
  const [stats,setStats]=useState([]);
  const [statuses,setStatuses]=useState([]);
  const [matchAll,setMatchAll]=useState(true);
  const [search,setSearch]=useState('');
  const [selectedId,setSelectedId]=useState(SHOP_ITEMS[0].id);
  const [selectedTier,setSelectedTier]=useState(null);
  const [mobilePane,setMobilePane]=useState('catalog');
  const owned=Array.isArray(me?.items)?me.items:[];
  const gold=Number.isFinite(me?.gold)?me.gold:0;
  const item=shopItem(selectedId)||SHOP_ITEMS[0];
  const current=itemTier(owned,item.id);
  const tier=selectedTier??Math.min(3,current+1);
  const quote=shopQuote(me,item.id,tier);
  const activePassive=tierItemPassive(item,tier);
  const recipe=recipeFor(item.id);
  const combined=shopQuote(me,item.id,3,true);
  const destinations=buildsInto(item.id);
  const items=useMemo(()=>filterShopItems(me,{stats,statuses,search,matchAll}),[me,stats,statuses,search,matchAll]);
  const select=(id,t=null)=>{setSelectedId(id);setSelectedTier(t);setMobilePane('build');};
  const buy=(combine=false)=>{const wanted=combine?3:tier;const q=shopQuote(me,item.id,wanted,combine);if(q.ok)onBuy(item.id,wanted,combine);};
  return <section className="duelist-shop bs-shop" role="dialog" aria-modal="true" aria-label="In-match item shop" data-mobile-pane={mobilePane}>
    <header className="duelist-shop-head bs-head">
      <div className="bs-title"><span aria-hidden="true">◇</span><strong>Battle Shop</strong><small>Match equipment · Tier III unlocks full passive</small></div>
      <div className="duelist-shop-balance"><Coin value={Math.floor(gold)}/></div>
      <button type="button" className="duelist-shop-close" onClick={onClose} aria-label="Close shop">×</button>
    </header>
    <nav className="bs-mobile-tabs" aria-label="Shop sections">
      {['stats','catalog','build','filters'].map(p=><button type="button" key={p} aria-pressed={mobilePane===p} onClick={()=>setMobilePane(p)}>{p==='stats'?'Stats':p==='catalog'?'Items':p==='build'?'Build':'Filters'}</button>)}
    </nav>
    <div className="bs-layout">
      <div className="bs-stat-pane bs-separator"><FilterRail title="Stat filters" options={STAT_FILTERS} active={stats} onToggle={id=>toggle(setStats,id)} onClear={()=>setStats([])}>
        <button className="bs-quiet" type="button" aria-pressed={matchAll} onClick={()=>setMatchAll(v=>!v)}>{matchAll?'Match all':'Match any'}</button>
      </FilterRail><small className="bs-muted">Select a tier to see its current benefits.</small></div>
      <div className="bs-catalog bs-separator">
        <label className="bs-search"><span aria-hidden="true">⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search items…" aria-label="Search shop items"/></label>
        {!items.length&&<p role="status">No items match. Clear a filter to see more.</p>}
        {SHOP_CATEGORIES.map(cat=>{
          const group=items.filter(it=>it.category===cat);
          return group.length>0&&<section className="bs-category-row" key={cat}><h3><span aria-hidden="true">{CATEGORY_ICONS[cat]}</span> {cat}</h3>
            <div className="bs-item-grid">{group.map(it=>{const level=itemTier(owned,it.id);return <button type="button" key={it.id} className="bs-item" aria-pressed={item.id===it.id} onClick={()=>select(it.id)}>
              <ItemIcon item={it} tier={level||3}/><span>{it.name}</span><small>{level===3?'Complete':<Coin value={nextPrice(it,level)}/>}</small>
            </button>;})}</div></section>;
        })}
      </div>
      <div className="bs-detail bs-separator" aria-label="Selected item build path">
        <div className="bs-item-summary"><ItemIcon item={item} tier={tier}/><div><h2>{item.name}</h2><small>{item.category} · Tier {ROMAN[tier]}</small><div className="bs-stats">{tierStats(item,tier).map(([k,v])=><span key={k}>{formatStat(k,v)}</span>)}</div></div></div>
        {destinations.length>0&&<section className="bs-destinations"><h3>Builds into</h3><div>{destinations.map(it=><button type="button" key={it.id} title={it.name+' recipe'} onClick={()=>select(it.id,3)}><ItemIcon item={it} tier={3}/><small>{it.name}</small></button>)}</div></section>}
        <section className="bs-build-tree" aria-label="Item upgrade tree">
          <h3>Build path</h3>
          <div className="bs-root"><BuildNode item={item} tier={3} owned={current} selected={tier===3} onSelect={()=>setSelectedTier(3)}/></div>
          <div className="bs-branches">
            <div><BuildNode item={item} tier={2} owned={current} selected={tier===2} onSelect={()=>setSelectedTier(2)}/><div className="bs-stem"/><BuildNode item={item} tier={1} owned={current} selected={tier===1} onSelect={()=>setSelectedTier(1)}/></div>
            {recipe.length>0&&<div className="bs-recipe"><small>OR combine Tier I</small><div className="bs-recipe-parts">{recipe.map(id=><BuildNode key={id} item={shopItem(id)} tier={1} owned={itemTier(owned,id)} selected={false} onSelect={()=>select(id,1)}/>)}</div></div>}
          </div>
        </section>
        {activePassive&&<p className="bs-passive"><strong>{tier===3?'Passive':'Early passive'}</strong> · {activePassive.text}</p>}
        {tier<3&&<p className="bs-passive"><strong>Tier III passive (locked)</strong> · {item.passive.text}</p>}
        <div className="bs-tier-row" aria-label="Select purchase tier">{[1,2,3].map(t=><button key={t} type="button" aria-pressed={tier===t} onClick={()=>setSelectedTier(t)}>{ROMAN[t]}</button>)}<span>{current>=tier?'Owned':<Coin value={tierPrice(item,tier)-tierPrice(item,current)}/>}</span></div>
        <div className="bs-buy-row"><button className="bs-primary" type="button" disabled={!quote.ok} onClick={()=>buy()}> {current>=tier?'Owned':current?'Upgrade':'Buy'} Tier {ROMAN[tier]}</button>
          {recipe.length>0&&<button type="button" disabled={!combined.ok} onClick={()=>buy(true)}>Combine{combined.ok?' · '+combined.cost+' gold':''}</button>}</div>
        <small className="bs-muted">{recipe.length?'Combining consumes both Tier I components. ':''}{!quote.ok&&current<tier?(names[quote.reason]||'Purchase unavailable'):''}</small>
      </div>
      <div className="bs-status-pane"><FilterRail title="Shop filters" options={STATUS_FILTERS} active={statuses} onToggle={id=>toggle(setStatuses,id)} onClear={()=>setStatuses([])}/></div>
    </div>
    <footer className="bs-bottom">
      <div className="bs-equipped-title">Equipped</div>
      <div className="duelist-shop-slots" aria-label="Equipped item slots">
        {Array.from({length:SHOP_RULES.slots},(_,i)=>{const entry=owned[i],it=entry&&shopItem(entry.id);return <button type="button" className="duelist-shop-slot" key={i} title={it?.name||'Empty item slot'} disabled={!it} onClick={()=>select(it.id,entry.tier)}>{it?<><ItemIcon item={it} tier={entry.tier}/><span className="duelist-slot-tier">{ROMAN[entry.tier]}</span></>:<span className="duelist-shop-empty">+</span>}</button>;})}
      </div>
      <div className="duelist-shop-note" aria-live="polite">{answer&&!answer.ok?(names[answer.reason]||'Purchase not available'):answer?.ok?'Purchased '+(shopItem(answer.id)?.name||'item')+' · Tier '+ROMAN[answer.tier]:!me?.canShop?'Move back to spawn or buy while respawning.':'Gold and equipment reset each match.'}</div>
    </footer>
  </section>;
}
