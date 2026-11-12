import { useEffect, useMemo, useState } from 'react';
import { Trophy, Check, X } from 'lucide-react';
import { listGame3DCompetitions, respondGame3DCompetition } from './game3dWorldInteractions';

// Small opt-in invite surface: a challenge is never scored or completed here.
export default function Game3DCompetitionInbox({ enabled = false, userId }) {
  const [items, setItems] = useState([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!enabled || !userId) { setItems([]); return undefined; }
    let live = true;
    const refresh = async () => {
      try {
        const result = await listGame3DCompetitions();
        if (live) setItems((result.challenges || []).filter(item =>
          item.opponent_id === userId && item.status === 'pending' &&
          Date.parse(item.expires_at) > Date.now()));
      } catch { /* an offline session must not block the world */ }
    };
    void refresh();
    const interval = window.setInterval(refresh, 12000);
    return () => { live = false; window.clearInterval(interval); };
  }, [enabled, userId]);
  const pending = useMemo(() => items[0] || null, [items]);
  const respond = async accept => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const out = await respondGame3DCompetition(pending.id, accept);
      setItems(prev => prev.filter(item => item.id !== pending.id));
      setNotice(out.status === 'awaiting_setup'
        ? 'Challenge accepted. The contest waits for an arena and trusted scoring.'
        : 'Challenge declined.');
    } catch (error) { setNotice(error?.message || 'Could not respond to the challenge.'); }
    finally { setBusy(false); }
  };
  if (!enabled || !userId || (!pending && !notice)) return null;
  return (
    <div className="fixed right-[5%] bottom-24 z-[105] w-[min(340px,90vw)] rounded-2xl border border-cyan-200/25 bg-slate-950/90 p-4 text-white shadow-2xl backdrop-blur-xl" role="status">
      {pending ? (
        <>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-cyan-200"><Trophy className="w-4 h-4" /> Competition invitation</div>
          <p className="mt-2 text-sm">Another player challenged you to <strong>{pending.kind?.replaceAll('_',' ') || 'a contest'}</strong>.</p>
          <p className="mt-1 text-[11px] text-white/50">Both players must consent. Arena and outcome rules are not active yet.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => void respond(false)} className="flex gap-1 rounded-lg border border-white/20 px-3 py-2 text-xs"><X className="w-3.5 h-3.5" /> Decline</button>
            <button type="button" disabled={busy} onClick={() => void respond(true)} className="flex gap-1 rounded-lg bg-cyan-200 px-3 py-2 text-xs font-bold text-slate-950"><Check className="w-3.5 h-3.5" /> Accept</button>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-2 text-xs">
          <span className="flex-1">{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice('')}><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
