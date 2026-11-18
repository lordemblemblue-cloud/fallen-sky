import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/components/auth/AuthContext';
import { CAMPAIGNS, campaignChunks, importCampaignFiles, loadCampaignSources, signedCampaignManifest } from './campaignStorage';
import { importPrivateMissionBsp, storedMissionIds } from './privateMissionCloud.js';
import { GAME2_MISSION_ARCHIVE } from '../engine/missionArchive.js';
import { openCampaignWindow } from './campaignWindow.js';

export function CampaignPlayer({ gameKey, onBack, standalone = false }) {
  const game = CAMPAIGNS[gameKey];
  const frame = useRef(null), request = useRef(null), sent = useRef(false);
  const [notice, setNotice] = useState('Connecting verified original archives…');
  const [error, setError] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const connect = () => frame.current?.contentWindow.postMessage({type:'atom-jedi-host-ready'}, location.origin);
  useEffect(() => {
    let disposed = false;
    sent.current = false;
    const receive = async event => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'atom-jedi-source-request' && !sent.current) {
        sent.current = true;
        try {
          const rows = await loadCampaignSources(base44, gameKey);
          const paks = await signedCampaignManifest(base44, gameKey, rows);
          if (!disposed) frame.current?.contentWindow.postMessage({type:'atom-jedi-canonical-source',paks},location.origin);
        } catch (e) { if (!disposed) { setError(true); setNotice(e.message); } }
      }
      if (event.data?.type === 'atom-jedi-progress') setNotice('Loading original data · ' + Math.round(event.data.done / 1048576) + ' / ' + Math.round(event.data.total / 1048576) + ' MB');
      if (event.data?.type === 'atom-jedi-status') {
        setError(event.data.state === 'error');
        setNotice(event.data.state === 'engine-ready' ? 'Original engine running · use New Game or Load Game' : event.data.detail || event.data.state);
      }
      if (event.data?.type === 'atom-jedi-flushed' && request.current?.id === event.data.requestId) request.current.finish(event.data.error);
    };
    window.addEventListener('message', receive);
    connect();
    return () => { disposed = true; window.removeEventListener('message', receive); request.current?.cancel?.(); };
  }, [gameKey, attempt]);
  const leave = () => {
    if (exiting) return;
    setExiting(true);
    const id = crypto.randomUUID();
    const timer = setTimeout(() => finish('Save synchronization timed out. Try returning again.'), 10000);
    const finish = failure => {
      clearTimeout(timer); request.current = null;
      if (failure) { setError(true); setNotice(failure); setExiting(false); } else onBack();
    };
    request.current = {id, finish, cancel:()=>clearTimeout(timer)};
    frame.current?.contentWindow.postMessage({type:'atom-jedi-flush',requestId:id},location.origin);
  };
  return <div className="absolute inset-0 z-30 flex flex-col bg-[#080c13] text-white" data-game2-interface>
    <header className="shrink-0 flex flex-wrap items-center gap-3 border-b border-white/15 px-4 py-3"><button type="button" disabled={exiting} onClick={leave} className="rounded border border-white/20 px-3 py-1.5 text-xs">{exiting?'Saving…':standalone?'Save and close':'Back to Game 2'}</button><strong className="text-sm">{game.title} · Original campaign</strong><span role={error?'alert':'status'} className={'text-xs '+(error?'text-amber-200':'text-white/60')}>{notice}</span>{standalone && <button type="button" onClick={async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
      catch { setNotice('Fullscreen is unavailable in this browser window.'); }
    }} className="ml-auto rounded border border-white/20 px-3 py-1.5 text-xs">Toggle fullscreen</button>}</header>
    {error && <button type="button" onClick={() => { setError(false); setNotice('Reconnecting original campaign…'); setAttempt(n => n + 1); }} className="shrink-0 p-2 text-sm underline">Retry campaign</button>}
    <iframe key={attempt} ref={frame} onLoad={connect} src={game.runtime + (gameKey === 'jedi_outcast' ? '?mode=original' : '')} title={game.title+' original campaign'} allow="autoplay; fullscreen; gamepad" className="w-full min-w-0 min-h-0 flex-1 border-0" />
  </div>;
}

export default function OriginalCampaigns({ onBack }) {
  const {user} = useAuth();
  const [gameKey, setGameKey] = useState('jedi_outcast');
  const [rows, setRows] = useState(null), [notice, setNotice] = useState('Checking Base44 archives…');
  const [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const [mapBusy,setMapBusy]=useState(false), [mapNotice,setMapNotice]=useState('');
  const [storedMaps,setStoredMaps]=useState(new Set());
  useEffect(()=>{
    let active=true;
    if(user?.role==='admin')storedMissionIds(base44).then(ids=>{if(active)setStoredMaps(ids);}).catch(error=>{if(active)setMapNotice(error?.message||'Cannot check mission maps');});
    return ()=>{active=false;};
  },[retry,user?.role]);
  const uploadMissionMaps=async event=>{
    const files=Array.from(event.target.files||[]);event.target.value='';
    if(!files.length||user?.role!=='admin')return;
    setMapBusy(true);setMapNotice('Uploading mission files…');
    try{
      const result=await importPrivateMissionBsp(base44,files,setMapNotice);
      setStoredMaps(result.ready);
      setMapNotice(result.stored.length+' mission file(s) transferred.'+
        (result.errors.length?' Some files could not be verified: '+result.errors.map(e=>e.file).join(', '):''));
    }catch(error){setMapNotice(error?.message||'Import failed');}
    finally{setMapBusy(false);}
  };
  const game = CAMPAIGNS[gameKey];
  useEffect(() => {
    let live = true; setRows(null); setNotice('Checking Base44 archives…');
    if (user?.role !== 'admin') { setNotice('Original campaign data is restricted to the app administrator.'); return; }
    loadCampaignSources(base44,gameKey).then(next=>{if(live){setRows(next);setNotice('');}}).catch(e=>{if(live)setNotice(e.message);});
    return ()=>{live=false;};
  },[gameKey,user?.role,retry]);
  let ready = false, missing = '';
  if(rows)try { campaignChunks(gameKey,[...rows.files,...rows.sources],rows.chunks);ready=true; }catch(e){missing=e.message;}
  const upload = async event => {
    const files=Array.from(event.target.files||[]);event.target.value='';if(!files.length)return;
    setBusy(true);
    try { const next=await importCampaignFiles(base44,gameKey,files,setNotice);setRows(next);setNotice('Archive import complete. All supplied chunks verified.'); }
    catch(e){setNotice(e.message);}finally{setBusy(false);}
  };
  const launch = () => {
    // Open synchronously from the click, before any network work, so the browser
    // recognizes the user's popup gesture. Never silently embed a blocked popup.
    const result = openCampaignWindow(window.location.href, gameKey, (...args) => window.open(...args));
    setNotice(result.opened ? 'Campaign opened in its own game window.' : 'The browser blocked the game window. Allow pop-ups for this site, then select Play again.');
  };
  return <section className="absolute inset-0 z-30 overflow-y-auto bg-[#10151e] p-6 text-white" data-game2-interface>
    <button type="button" onClick={onBack} disabled={busy} className="mb-6 rounded border border-white/20 px-3 py-2 text-xs">Back to Game 2</button>
    <p className="text-xs uppercase tracking-widest text-cyan-200/70">Game 2 · Original campaigns</p><h2 className="mt-2 text-3xl font-semibold">Original campaign archive storage</h2>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">Both browser engine runtimes are installed, but original retail data is required before the complete campaigns can start. The Base44 private archive importer below stores verified original Steam PK3 files in resumable chunks. Your current Google Drive contains extracted folders, not the four verified PK3 archives expected by this importer. The new Mission Archive window uses our custom combat system; the native original-campaign engines remain separate.</p>
    <div className="my-6 flex flex-wrap gap-3" role="group" aria-label="Original campaign edition">{Object.entries(CAMPAIGNS).map(([key,value])=><button type="button" key={key} disabled={busy} aria-pressed={gameKey===key} onClick={()=>setGameKey(key)} className={'rounded-xl border px-5 py-4 text-sm '+(key===gameKey?'border-cyan-200/60 bg-cyan-200/10':'border-white/15 bg-white/5')}>{value.title}</button>)}</div>
    <div className="max-w-3xl rounded-xl border border-white/15 bg-white/5 p-5"><h3 className="text-lg font-semibold">{game.title}</h3><p className="mt-2 text-xs text-white/60">{game.entry_count.toLocaleString()} original asset entries · {game.archives.map(a=>a.name).join(', ')} · {(game.total_archive_bytes/1048576).toFixed(0)} MB</p>
      <p className="my-4 text-sm text-white/70">{ready?'All original archives are available and match the audited Steam files.':missing||notice}</p>
      {user?.role==='admin' && <label className={'inline-block rounded-lg border border-white/25 px-4 py-3 text-xs '+(busy?'opacity-50':'cursor-pointer hover:bg-white/10')}>{busy?'Importing original data…':'Import Steam assets*.pk3 to private Base44 storage'}<input type="file" accept=".pk3" multiple disabled={busy||!rows} onChange={upload} aria-label={'Import '+game.title+' original archives'} className="sr-only"/></label>}
      <button type="button" disabled={!ready||busy} onClick={launch} className="ml-3 rounded-lg bg-cyan-100 px-4 py-3 text-xs font-bold text-slate-950 disabled:opacity-30">Play original campaign in new window</button>
      <button type="button" disabled={busy} onClick={()=>setRetry(n=>n+1)} className="ml-3 text-xs text-white/60">Refresh storage status</button>
      <p role="status" className="mt-4 text-xs leading-6 text-white/60">{notice}</p>
    </div>
    {user?.role==='admin'&&<section className="mt-8 max-w-3xl rounded-xl border border-white/15 bg-white/5 p-5" aria-label="Mission map administration">
      <h3 className="text-base font-semibold">Mission map administration</h3>
      <p className="mt-2 text-xs leading-relaxed text-white/60">Administrator tools only. Import and verify map files here rather than on the player-facing mission selector.</p>
      <p className="mt-3 text-sm text-cyan-200">{storedMaps.size} of {Object.keys(GAME2_MISSION_ARCHIVE).length} maps stored</p>
      <label className="mt-4 inline-flex cursor-pointer rounded-lg border border-cyan-200/30 bg-cyan-200/10 px-4 py-3 text-sm text-cyan-100 hover:bg-cyan-200/20">
        {mapBusy?'Uploading…':'Import mission maps'}
        <input type="file" multiple accept=".bsp" disabled={mapBusy} onChange={uploadMissionMaps}
          aria-label="Import original BSP maps to private Base44 storage" className="sr-only" />
      </label>
      {mapNotice&&<p role="status" className="mt-3 text-xs text-white/70">{mapNotice}</p>}
    </section>}
    <p className="mt-5 max-w-2xl text-xs leading-6 text-white/50">Choose assets*.pk3 from your own licensed game installation. Base44 stores them privately and remembers verified chunks, so repeat Google Drive downloads are not needed. An extracted GameData/base folder alone cannot pass these exact PK3 archive fingerprints. Personal saves, settings, executables and Steam account files are excluded. Saves and key bindings from each original engine persist separately in this browser.</p>
  </section>;
}
