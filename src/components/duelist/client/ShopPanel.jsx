import { useMemo, useState } from 'react';
import { SHOP_ITEMS, SHOP_RULES, tierPrice } from '../core/shop.mjs';

const CATEGORIES = ['all', 'power', 'defense', 'ability', 'health', 'tenacity', 'hybrid', 'support', 'counter', 'relic'];
// Every item has its own 2D picture in public/duelist/items/<id>.svg.
// The separate illustrated WebP pack can replace these lightweight icons later.
export function ItemIcon({ item }) {
  return <img className="duelist-item-art" alt={item.name + ' item'} loading="lazy"
    src={'/duelist/items/' + item.id + '.svg'} draggable={false} />;
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
