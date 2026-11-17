import { useEffect, useRef, useState } from 'react';
import { X, ShoppingBag, Eye, HeartPulse } from 'lucide-react';
import { ARTISAN_SHOPS } from './WolfveilArtisanShopCatalog.mjs';
import { getShopState, subscribeShop, purchaseItem, spendGold, addGold, consumeItem } from '../shop/shopStore';
import { addAXEEquipmentItem } from '../axe/equipment/AXEEquipmentInventoryStore';
import { getPlayerHUD, setHP } from '../playerHUDStore';

// A real client-side storefront connected to the existing character-scoped
// Silver and inventory stores. This does NOT issue authoritative server items;
// multiplayer server validation must be added before trading/publishing.
export default function WolfveilArtisanShopPanel({ shopId, onClose }) {
  const shop = ARTISAN_SHOPS[shopId];
  const [snapshot, setSnapshot] = useState(() => getShopState());
  const [notice, setNotice] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const busy = useRef(false);

  useEffect(() => subscribeShop(setSnapshot), []);
  useEffect(() => {
    if (!shop) return undefined;
    const previousModalLock = Boolean(window.__axeUiModalOpen);
    window.__axeUiModalOpen = true;
    window.__axeArtisanShopOpen = true;
    if (document.pointerLockElement) document.exitPointerLock?.();
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation?.();
      onClose?.();
    };
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('keydown', escape, true);
      window.__axeArtisanShopOpen = false;
      if (!previousModalLock) window.__axeUiModalOpen = false;
    };
  }, [shop, onClose]);

  useEffect(() => { setNotice(''); setPreviewIndex(0); }, [shopId]);

  if (!shop) return null;

  function buy(item) {
    if (busy.current) return;
    busy.current = true;
    try {
      if (item.category === 'consumable') {
        const result = purchaseItem(item);
        setNotice(result.ok ? item.name + ' added to your bag.' : (result.reason || 'Purchase unsuccessful.'));
        return;
      }
      const payment = spendGold(item.price);
      if (!payment.ok) { setNotice(payment.reason || 'Not enough Silver.'); return; }
      const result = addAXEEquipmentItem({
        ...item,
        rarity: 'common', level: 1, tier: 1, qualityBand: 0,
        equipped: false, locked: false, tradeable: true,
        templateId: item.id, baseStats: { ...item.baseStats },
        rolledStats: {}, sockets: [], mastery: 1,
      }, { source: 'wolfveil_artisan_shop' });
      if (!result.ok) {
        addGold(item.price); // refund failed insert; no orphaned currency charge
        setNotice('Inventory unavailable; Silver refunded.');
      } else setNotice(item.name + ' added to your equipment inventory.');
    } finally { busy.current = false; }
  }

  function drink(item) {
    const hud = getPlayerHUD();
    if (!hud || hud.hp <= 0) { setNotice('Cannot drink while defeated.'); return; }
    if (hud.hp >= hud.maxHP) { setNotice('Your health is already full.'); return; }
    const result = consumeItem(item);
    if (!result.ok) { setNotice(result.reason || 'No potions available.'); return; }
    setHP(Math.min(hud.maxHP, hud.hp + item.heal));
    setNotice('Recovered ' + Math.min(item.heal, hud.maxHP - hud.hp) + ' HP.');
  }

  function preview(index) {
    setPreviewIndex(index);
    window.dispatchEvent(new CustomEvent('game3dArtisanShowroomSelect', { detail: { index } }));
    setNotice('Model selected in the showroom. Walk around to inspect it.');
  }

  return (
    <div className="absolute inset-0 z-[95] flex items-center justify-center bg-black/55 px-3 py-6 backdrop-blur-[3px] pointer-events-auto"
      onMouseDown={event => event.stopPropagation()}>
      <section role="dialog" aria-modal="true" aria-labelledby="axe-artisan-title"
        className="w-full max-w-[660px] max-h-[85vh] overflow-hidden rounded-2xl border border-amber-400/45 bg-slate-950/95 shadow-2xl shadow-black/70 text-slate-100 flex flex-col">
        <header className="flex items-start gap-3 border-b border-amber-400/20 p-5 bg-gradient-to-r from-slate-900 via-slate-950 to-cyan-950/45">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-300/10 text-2xl" aria-hidden>{shop.icon}</div>
          <div className="min-w-0 flex-1">
            <h2 id="axe-artisan-title" className="font-semibold text-amber-100 text-lg">{shop.title}</h2>
            <p className="text-xs text-slate-300 mt-1">{shop.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 border border-white/15 hover:bg-white/10" aria-label="Close shop"><X size={18}/></button>
        </header>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3 text-sm">
          <span className="flex items-center gap-2 text-cyan-200"><ShoppingBag size={15}/> {shopId === 'models' ? 'Showroom previews' : 'Local vendor inventory'}</span>
          <span className="font-semibold text-amber-200 tabular-nums">{Math.floor(snapshot.gold).toLocaleString()} Silver</span>
        </div>
        <div className="overflow-y-auto p-4 sm:p-5 space-y-2">
          {shop.items.map(item => {
            const owned = snapshot.inventory[item.id] || 0;
            const isModel = shopId === 'models';
            return (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-sky-400/15 bg-slate-900/70 p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-slate-100">{item.name}</div>
                  <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                  {!isModel && <p className="text-xs text-amber-200 mt-1">{item.price} Silver{item.category === 'consumable' ? ' · Owned ' + owned : ' · Common'}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isModel ? (
                    <button type="button" onClick={() => preview(item.previewIndex)}
                      className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-1.5 ${previewIndex === item.previewIndex ? 'border-cyan-300 bg-cyan-950 text-cyan-100' : 'border-white/25 bg-slate-800 hover:bg-slate-700'}`}>
                      <Eye size={14}/> Preview
                    </button>
                  ) : (
                    <>
                      {item.category === 'consumable' && owned > 0 && <button type="button" onClick={() => drink(item)}
                        className="rounded-lg border border-emerald-400/35 bg-emerald-950/80 px-3 py-2 text-xs text-emerald-100 flex gap-1 items-center">
                        <HeartPulse size={14}/> Use
                      </button>}
                      <button type="button" onClick={() => buy(item)} disabled={snapshot.gold < item.price}
                        className="rounded-lg border border-amber-400/45 bg-amber-900/30 hover:bg-amber-900/55 px-3 py-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed">
                        Buy
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <footer className="px-5 py-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
          <span aria-live="polite" role="status">{notice || (shopId === 'models' ? 'Preview changes the displayed 3D model.' : 'Purchases are saved to this character.')}</span>
          <button type="button" onClick={onClose} className="text-amber-200 hover:text-white">Close · Esc</button>
        </footer>
      </section>
    </div>
  );
}
