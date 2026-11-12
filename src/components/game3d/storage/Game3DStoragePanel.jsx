import { useEffect, useMemo, useState } from 'react';
import { Archive, X, Search } from 'lucide-react';
import { getGame3DStorage, subscribeGame3DStorage } from './game3dStorageStore';
import { GAME3D_LOOT_STORAGE_CAPACITY } from './game3dStorageModel.mjs';

// Completed display for the future chest/stable/storage NPC. Intentionally not
// mounted in the world until authenticated custody withdrawal is connected.
export default function Game3DStoragePanel({ open = false, onClose }) {
  const [vault, setVault] = useState(getGame3DStorage);
  const [query, setQuery] = useState('');
  useEffect(() => subscribeGame3DStorage(setVault), []);
  const results = useMemo(() => vault.items.filter(item =>
    String(item.name || item.id).toLowerCase().includes(query.toLowerCase())), [vault,query]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[180] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-label="Personal storage">
      <section className="w-full max-w-2xl overflow-hidden rounded-[26px] border border-cyan-200/20 bg-slate-950/90 text-white shadow-[0_35px_100px_rgba(0,0,0,.7)] backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <div><div className="flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-100/60"><Archive className="h-4 w-4" /> Personal storage</div>
            <h2 className="mt-1 text-xl">Collected treasures</h2>
            <p className="mt-1 text-xs text-white/50">{vault.items.length} / {GAME3D_LOOT_STORAGE_CAPACITY} slots used</p>
          </div>
          <button type="button" aria-label="Close storage" onClick={onClose} className="rounded-xl p-2 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <label className="mx-5 mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.035] px-3">
          <Search className="h-4 w-4 text-cyan-100/40" />
          <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search stored loot"
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-white/35" />
        </label>
        <div className="mx-5 my-4 max-h-[50vh] min-h-24 space-y-1 overflow-auto">
          {results.map(item => (
            <div key={item.dropId} className="flex items-center justify-between rounded-lg border border-white/[.07] bg-white/[.035] px-3 py-2 text-sm">
              <span className="truncate">{item.icon || '◈'} {item.name || item.id}</span>
              <span className="text-[11px] text-white/40">{item.rarity || 'Stored'}</span>
            </div>
          ))}
          {!results.length && <div className="p-5 text-center text-sm text-white/45">No stored items match.</div>}
        </div>
        <p className="border-t border-white/10 px-5 py-3 text-xs text-white/40">
          Access and withdrawal will open at the future storage location. Until then, overflow loot remains saved to this character.
        </p>
      </section>
    </div>
  );
}
