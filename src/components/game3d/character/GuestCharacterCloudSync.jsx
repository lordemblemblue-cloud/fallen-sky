import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cloud, CloudOff } from 'lucide-react';
import { createCharacterVaultSync, summarizeCharacterSave } from './characterVault';
import { callGuestCharacterVault } from './guestCharacterCloud';
import { getActiveId, getStorageUser, notifyCharacterChange, subscribeCharacterChange } from '../characterStorage';
import { getCharacterState } from '../characterStore';
import { reloadPlayerHUDFromSave } from '../playerHUDStore';

const STATUS = {
  syncing: ['Checking cloud save…', Cloud],
  saving: ['Saving character…', Cloud],
  saved: ['Character saved to cloud', Cloud],
  offline: ['Saved on this device — cloud unavailable', CloudOff],
  rejected: ['Cloud rejected this save', AlertTriangle],
  error: ['Cloud save needs attention', AlertTriangle],
  local_only: ['Local character', CloudOff],
};

export default function GuestCharacterCloudSync({ showStatus = false }) {
  const engine = useMemo(() => createCharacterVaultSync({
    allowAnonymous: true,
    call: callGuestCharacterVault,
    getIdentity: () => ({ userId: getStorageUser(), characterId: getActiveId() }),
    reloadCharacter: () => { reloadPlayerHUDFromSave(); notifyCharacterChange(); },
    getRosterEntry: (id) => getCharacterState().roster.find((c) => c.id === id) || null,
  }), []);
  const [vault, setVault] = useState(engine.get());
  useEffect(() => engine.subscribe(setVault), [engine]);
  useEffect(() => {
    let pending;
    void engine.start();
    const unsub = subscribeCharacterChange(() => {
      clearTimeout(pending);
      pending = setTimeout(() => { void engine.refresh(); }, 300);
    });
    return () => { clearTimeout(pending); unsub(); engine.stop(); };
  }, [engine]);
  useEffect(() => {
    const onCheckpoint = () => { queueMicrotask(() => { void engine.flush(); }); };
    window.addEventListener('game3dCheckpointFlush', onCheckpoint);
    return () => window.removeEventListener('game3dCheckpointFlush', onCheckpoint);
  }, [engine]);

  const [message, Icon] = STATUS[vault.status] || [];
  const conflict = vault.status === 'conflict' ? vault.conflict : null;
  return <>
    {showStatus && message && vault.status !== 'local_only' && (
      <div className="fixed bottom-4 left-[10.5rem] z-40 flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] text-white" role="status">
        <Icon size={13}/>{message}
      </div>
    )}
    {conflict && (
      <div className="fixed inset-0 z-[220] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Character cloud-save conflict">
        <section className="w-full max-w-md rounded-2xl border border-amber-300/30 bg-slate-950 p-6 text-white shadow-2xl">
          <h2 className="text-lg font-semibold">Your character has two different saves</h2>
          <p className="mt-2 text-sm text-slate-300">Choose the progress you want to keep. No login is required.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {[['This device', conflict.local], ['Cloud', conflict.saved]].map(([label, detail]) => (
              <div key={label} className="rounded-lg border border-white/15 p-3">
                <strong>{label}</strong>
                <div>Level {detail?.level ?? 1}</div>
                <div>{detail?.items ?? 0} items · {detail?.silver ?? 0} silver</div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="rounded-lg border border-white/30 px-4 py-2" onClick={() => { void engine.resolve('keep_device'); }}>Keep device</button>
            <button type="button" className="rounded-lg bg-amber-200 px-4 py-2 font-medium text-slate-950" onClick={() => { void engine.resolve('use_saved'); }}>Use cloud save</button>
          </div>
        </section>
      </div>
    )}
  </>;
}
