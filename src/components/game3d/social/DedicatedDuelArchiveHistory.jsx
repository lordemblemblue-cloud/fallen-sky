import {useEffect,useState} from 'react';
import {listArchivedDedicatedDuels} from './dedicatedDuelClient';

// Private beta: server-wide PostgreSQL history read, not Base44 session cleanup.
// No game action and no reward/equipment write is initiated by this component.
export default function DedicatedDuelArchiveHistory({userId}){
  const [open,setOpen]=useState(false);
  const [entries,setEntries]=useState([]);
  const [state,setState]=useState('idle');
  useEffect(()=>{setOpen(false);setEntries([]);setState('idle');},[userId]);
  const load=async()=>{
    setState('loading');
    try{
      const rows=await listArchivedDedicatedDuels(10);
      setEntries(rows);
      setState('loaded');
    }catch{
      setState('unavailable');
    }
  };
  const toggle=()=>{
    if(open){setOpen(false);return;}
    setOpen(true);
    void load();
  };
  if(!userId)return null;
  return (
    <div className="fixed top-20 left-4 z-[66] text-xs text-white">
      <button type="button" onClick={toggle}
        className="rounded border border-sky-400/40 bg-slate-950/90 px-3 py-1.5 text-sky-100">
        {open?'Close completed duels':'Completed duels'}
      </button>
      {open&&(
        <section aria-label="Verified committed duel history"
          className="mt-2 max-h-[52vh] w-[310px] overflow-y-auto rounded-xl border border-sky-500/40 bg-slate-950/95 p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <strong>Completed duels</strong>
            <button type="button" onClick={load}
              disabled={state==='loading'}
              className="rounded border border-white/20 px-2 py-0.5 disabled:opacity-50">
              Refresh
            </button>
          </div>
          <p className="mb-3 text-[11px] text-slate-300">
            PostgreSQL records only · Base44 may still list old sessions as active.
            No rewards or ranked credit issued.
          </p>
          {state==='loading'&&<p className="text-sky-200">Loading archived results…</p>}
          {state==='unavailable'&&<p className="text-amber-200">
            Verified archive unavailable. No result was inferred from Base44.
          </p>}
          {state==='loaded'&&entries.length===0&&
            <p className="text-slate-300">No archived duels were found.</p>}
          {state==='loaded'&&entries.map(row=>(
            <article key={row.duelId} className="border-t border-white/10 py-2">
              <div className="flex justify-between">
                <strong className={
                  row.outcome==='win'?'text-emerald-200':
                  row.outcome==='loss'?'text-red-200':'text-amber-200'
                }>{row.outcome==='win'?'Victory':
                   row.outcome==='loss'?'Defeat':'Draw'}</strong>
                <span className="text-slate-400">
                  {new Date(row.archivedAt).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-1 break-all text-slate-300">
                Opponent: {row.opponentId}
              </p>
              <p className="mt-1 text-[11px] text-amber-200">
                Rewards blocked: account stats, equipment, ranked policy unverified.
              </p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
