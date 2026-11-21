import { useMemo, useState } from 'react';
import { SHOP_ITEMS, SHOP_RULES, tierPrice } from '../core/shop.mjs';

const CATEGORIES = ['all', 'power', 'defense', 'ability', 'health', 'tenacity', 'hybrid', 'support', 'counter', 'relic'];
const GLYPHS = {
  power: 'blade', defense: 'shield', ability: 'crystal', health: 'heart',
  tenacity: 'crest', hybrid: 'ring', support: 'lantern', counter: 'eye', relic: 'relic',
};
const COL = {
  power: ['#d76335','#f6d18b'], defense: ['#4b83a6','#bfdcf5'], ability: ['#7b60ca','#d5bbff'],
  health: ['#428e70','#aee9b9'], tenacity: ['#ac8852','#f4daa5'],
  hybrid: ['#567da8','#e2b979'], support: ['#44a2af','#a9e8ec'],
  counter: ['#944a85','#f1b1ce'], relic: ['#a46d54','#eed1a0'],
};
// Lightweight, consistently framed 2D placeholder art: no 3D item asset is required.
// A future illustrated icon can replace this component without changing an item's logic.
export function ItemIcon({ item }) {
  const color = COL[item.category] || COL.relic;
  const seed = [...item.id].reduce((n, c) => (n * 33 + c.charCodeAt(0)) % 360, 17);
  const gid = 'di-' + item.id;
  const glyph = GLYPHS[item.category] || 'relic';
  return <svg viewBox="0 0 72 72" className="duelist-item-art" role="img" aria-label={item.name + ' icon'}>
    <defs>
      <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={color[1]} /><stop offset="1" stopColor={color[0]} />
      </linearGradient>
    </defs>
    <rect width="72" height="72" rx="10" fill="#151923"/>
    <circle cx="36" cy="34" r="27" fill={color[0]} fillOpacity=".14" stroke={color[0]} strokeOpacity=".45"/>
    <g fill={'url(#'+gid+')'} stroke={color[1]} strokeWidth="1.2" strokeLinejoin="round">
      {glyph === 'blade' && <><path d="M17 57 L29 43 L49 12 L58 9 L55 20 L39 44 L27 54 Z"/><path d="M19 45 L38 59 L42 54 L24 41 Z" fill="#262b35"/></>}
      {glyph === 'shield' && <path d="M36 9 L58 19 L55 40 Q50 56 36 63 Q22 56 17 40 L14 19 Z"/>}
      {glyph === 'crystal' && <path d="M35 8 L51 25 L45 54 L33 63 L20 38 L23 21 Z"/>}
      {glyph === 'heart' && <path d="M36 57 Q10 39 13 26 Q15 10 29 16 L36 24 Q49 8 59 21 Q70 41 36 57 Z"/>}
      {glyph === 'crest' && <><path d="M36 8 L57 26 L55 52 L36 63 L16 52 L15 27 Z"/><path d="M36 14 L36 57" stroke="#1c2030"/></>}
      {glyph === 'ring' && <><circle cx="36" cy="35" r="20" fill="none" strokeWidth="7"/><path d="M36 9 L44 25 L36 33 L28 25 Z"/></>}
      {glyph === 'lantern' && <><path d="M29 10 H44 L49 18 L43 25 H30 L24 18 Z"/><path d="M23 26 L29 20 H43 L49 26 L50 55 L44 62 H28 L22 55 Z"/><path d="M30 30 H43 V53 H30 Z" fill="#e1f3d1"/></>}
      {glyph === 'eye' && <><path d="M7 35 Q36 5 65 35 Q36 64 7 35 Z"/><circle cx="36" cy="35" r="12" fill="#171b29"/><circle cx="36" cy="35" r="5"/></>}
      {glyph === 'relic' && <><path d="M35 9 L44 25 L61 35 L44 45 L35 62 L26 45 L10 35 L26 25 Z"/><circle cx="35" cy="35" r="8" fill="#1c2030"/></>}
    </g>
    <g stroke={color[1]} strokeOpacity=".7" fill="none" transform={'rotate('+seed+' 36 36)'}>
      <circle cx="36" cy="36" r="31" strokeDasharray="2 12"/>
      <path d="M36 3 V9 M36 63 V69"/>
    </g>
  </svg>;
}

const formatStat = (key, value) => key === 'health' ? '+' + Math.round(value) + ' HP'
  : '+' + Math.round(value * 1000) / 10 + '% ' + ({ ability: 'Ability', defense: 'Defense', power: 'Power', tenacity: 'Tenacity' }[key] || key);
const names = Object.freeze({
  'unknown-item': 'That item is not available', 'shop-at-spawn': 'Buy at spawn or while waiting to respawn',
  'invalid-loadout': 'Invalid item loadout', 'fully-upgraded': 'This item is already Tier III',
  'inventory-full': 'All six equipment slots are filled', 'not-enough-gold': 'Not enough gold',
  'not-available': 'Shop is closed', 'no-match': 'Join a match to buy items',
});
export default function ShopPanel({ me, answer, onBuy, onClose }) {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const owned = Array.isArray(me?.items) ? me.items : [];
  const gold = Number.isFinite(me?.gold) ? me.gold : 0;
  const items = useMemo(() => SHOP_ITEMS.filter((item) =>
    (category === 'all' || item.category === category) &&
    (item.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      item.passive.text.toLowerCase().includes(search.trim().toLowerCase()))), [category, search]);
  const slots = Array.from({ length: SHOP_RULES.slots }, (_, i) => owned[i] || null);
  return <section className="duelist-shop" role="dialog" aria-modal="true" aria-label="In-match item shop">
    <header className="duelist-shop-head">
      <div><strong>Battle Shop</strong><small>Gold and items reset each match · Tier III unlocks the passive</small></div>
      <div className="duelist-shop-balance">{Math.floor(gold)} Gold</div>
      <button type="button" className="duelist-shop-close" onClick={onClose} aria-label="Close shop">×</button>
    </header>
    <div className="duelist-shop-slots" aria-label="Equipped item slots">
      {slots.map((entry, i) => {
        const item = entry && SHOP_ITEMS.find((x) => x.id === entry.id);
        return <div className="duelist-shop-slot" key={i} title={item?.name || 'Empty item slot'}>
          {item ? <><ItemIcon item={item}/><span className="duelist-slot-tier">{entry.tier}</span><small>Tier {entry.tier}</small></> : <span className="duelist-shop-empty">+</span>}
        </div>;
      })}
    </div>
    <div className="duelist-shop-filter">
      <div className="duelist-shop-categories" aria-label="Item types">
        {CATEGORIES.map((cat) => <button type="button" key={cat} aria-pressed={cat === category} onClick={() => setCategory(cat)}>{cat}</button>)}
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find items and passives" aria-label="Search shop items"/>
    </div>
    <div className="duelist-shop-grid">
      {items.map((item) => {
        const tier = owned.find((x) => x.id === item.id)?.tier || 0;
        const next = Math.min(3, tier + 1);
        const cost = tier >= 3 ? 0 : tierPrice(item, next) - tierPrice(item, tier);
        const canBuy = me?.canShop && tier < 3 && gold >= cost;
        const mult = SHOP_RULES.tierShares[next];
        return <article key={item.id} className="duelist-shop-item">
          <div className="duelist-shop-item-top"><ItemIcon item={item}/>
            <div><strong>{item.name}</strong><small>{item.category} · Tier {Math.max(tier,1)} of III</small></div>
          </div>
          <div className="duelist-shop-stats">
            {Object.entries(item.stats).map(([key, value]) => <span key={key}>{formatStat(key, value * mult)}</span>)}
          </div>
          <p>{tier < 3 ? 'Tier III: ' : ''}{item.passive.text}</p>
          <button type="button" disabled={!canBuy} onClick={() => onBuy(item.id)}>
            {tier >= 3 ? 'Max tier' : 'Upgrade to Tier ' + next + ' · ' + cost + ' gold'}
          </button>
        </article>;
      })}
    </div>
    <footer className="duelist-shop-note" aria-live="polite">
      {answer && !answer.ok ? names[answer.reason] || 'Purchase not available' :
        !me?.canShop ? 'Move back to your spawn or buy while respawning.' :
        'You can equip up to six items. All 50 items are available to every class.'}
    </footer>
  </section>;
}
