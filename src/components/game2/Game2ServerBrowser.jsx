import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, RefreshCw, Search, Server, Swords } from 'lucide-react';
import { GAME2_SKIRMISH_MAPS } from './engine/arenaMaps.js';
import { SERVER_MODES, serversFromStatus, validateServerSettings } from './net/serverRules.js';
import './Game2Menus.css';

export function MapDiagram({ mapId }) {
  return <div className="g2-map-art" aria-hidden="true"><svg viewBox="0 0 180 125">
    {mapId === 'training' ? <><path d="M53 9h74v38h-28v8h58v61H23V55h58v-8H53z"/><path d="M35 67h110v37H35zM59 16h62v25H59zM78 76h24v23H78z"/><path d="M90 3v119M15 85h150" strokeDasharray="3 6"/></> : mapId === 'skybridge' ? <><path d="M8 23h49v79H8zM123 23h49v79h-49zM57 43h66v11H57zM57 77h66v11H57z"/><path d="M14 31h37v63H14M129 31h37v63h-37M65 15v94M115 15v94" strokeDasharray="3 6"/></> : <><path d="M20 18h140v90H20zM30 28h120v70H30zM60 43h60v40H60zM20 61h40M120 61h40"/><path d="M9 61h162M90 9v107" strokeDasharray="3 6"/></>}
  </svg></div>;
}

function CreateServer({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', mapId: 'training', matchMode: 'ffa', maxPlayers: 100, botFill: 0 });
  const [error, setError] = useState('');
  const ref = useRef(null);
  useEffect(() => { const previous=document.activeElement; ref.current?.querySelector('input')?.focus(); return ()=>previous?.focus(); }, []);
  const set = (key, value) => setForm(f => ({ ...f, [key]: value, ...(key === 'maxPlayers' ? {botFill:Math.min(f.botFill,value)} : {}) }));
  const submit = e => { e.preventDefault(); try { onCreate(validateServerSettings(form)); } catch (err) { setError(err.message); } };
  const trap = e => {
    if (e.key === 'Escape') onClose();
    if (e.key !== 'Tab') return;
    const nodes=[...ref.current.querySelectorAll('button,input,select')].filter(n=>!n.disabled),first=nodes[0],last=nodes.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  };
  return <div className="g2-overlay" onKeyDown={trap}><form ref={ref} className="g2-dialog" role="dialog" aria-modal="true" aria-labelledby="g2-create-title" onSubmit={submit}>
    <div className="g2-eyebrow">Multiplayer / Host a match</div><h2 id="g2-create-title">Make it your arena.</h2>
    <p className="g2-muted">Name your server, set the rules and open it to other players.</p>
    <label className="g2-field">Server name<input required maxLength={48} placeholder="e.g. Temple duels · all welcome" value={form.name} onChange={e=>set('name',e.target.value)}/></label>
    <div className="g2-form-grid">
      <label className="g2-field">Map<select value={form.mapId} onChange={e=>set('mapId',e.target.value)}>{Object.values(GAME2_SKIRMISH_MAPS).map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
      <label className="g2-field">Match rules<select value={form.matchMode} onChange={e=>set('matchMode',e.target.value)}>{Object.entries(SERVER_MODES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <label className="g2-field">Player capacity<select value={form.maxPlayers} onChange={e=>set('maxPlayers',Number(e.target.value))}><option value={50}>50 players{form.matchMode==='teams'?' · 25 per team':''}</option><option value={100}>100 players{form.matchMode==='teams'?' · 50 per team':''}</option></select></label>
      <label className="g2-field">Fill empty slots with bots<select value={form.botFill} onChange={e=>set('botFill',Number(e.target.value))}>{[0,8,16,32,50,100].filter(n=>n<=form.maxPlayers).map(n=><option value={n} key={n}>{n===0?'Off · humans only':`Fill to ${n} fighters`}</option>)}</select></label>
    </div>
    <p className="g2-muted">Each arriving player replaces one bot until only humans remain. A bot returns when a slot opens. Team matches have no friendly fire.</p>
    <p className="g2-muted">Custom servers appear in the public browser immediately after you deploy. Hosting transfers automatically to an available player with a stable low-latency connection.</p>
    {error&&<div role="alert" className="g2-notice">{error}</div>}
    <div className="g2-dialog-footer"><button type="button" className="g2-button" onClick={onClose}>Cancel</button><button className="g2-button g2-button-primary" type="submit">Continue to arena <ArrowRight size={14}/></button></div>
  </form></div>;
}

export default function Game2ServerBrowser({ status, error, refreshing, signedIn, initialHost=false, onBack, onRefresh, onJoin, onCreate, onSignIn, onPractice }) {
  const [filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[selected,setSelected]=useState(null),[create,setCreate]=useState(false);
  const initialHostConsumed=useRef(false);
  useEffect(()=>{
    if(initialHost && !initialHostConsumed.current && signedIn && status?.serverBrowser && !error){
      initialHostConsumed.current=true;
      setCreate(true);
    }
  },[initialHost,signedIn,status?.serverBrowser,error]);
  const servers=status ? serversFromStatus(status,GAME2_SKIRMISH_MAPS) : [];
  const filtered=servers.filter(s=>(filter==='all'||s.matchMode===filter)&&`${s.name} ${GAME2_SKIRMISH_MAPS[s.mapId]?.label||''}`.toLowerCase().includes(search.toLowerCase()));
  const active=filtered.find(s=>s.id===selected)||filtered[0],full=active&&active.players>=active.maxPlayers;
  const join=()=>{if(!signedIn)onSignIn();else if(active&&!full&&!error)onJoin(active);};
  return <div className="g2-shell g2-browser"><div className="g2-browser-inner">
    <button className="g2-back" onClick={onBack}><ArrowLeft size={14}/> Main menu</button>
    <header className="g2-head"><div><div className="g2-eyebrow">Duelist Adventure / Multiplayer</div><h1>Find your next fight.</h1><p className="g2-muted">Choose a server. Enter the arena. Make it yours.</p></div><button className="g2-button g2-button-primary" disabled={!status?.serverBrowser||!!error} onClick={()=>signedIn?setCreate(true):onSignIn()}><Plus size={15}/> Create server</button></header>
    <div className="g2-browser-grid"><section aria-label="Available servers">
      <div className="g2-toolbar"><div className="g2-tabs" role="group" aria-label="Filter servers">{[['all','All servers'],['ffa','Free-for-all'],['teams','Team battle'],['ctf','Capture the Flag']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div><label className="g2-search"><Search size={14}/><input aria-label="Search servers" placeholder="Search servers or maps" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
      <div className="g2-table-wrap"><table className="g2-table"><thead><tr><th>Server name</th><th>Map</th><th>Mode</th><th>Players</th><th>Bots</th></tr></thead><tbody>{filtered.map(s=><tr key={s.id} data-selected={active?.id===s.id}>
        <td><button className="g2-server-name" onClick={()=>setSelected(s.id)} aria-pressed={active?.id===s.id}>{s.name}<small>{s.custom?'Player-created server':'Default public server'} · {s.players>=s.maxPlayers?'Full':'Open'}</small><small className="g2-mobile-map">{GAME2_SKIRMISH_MAPS[s.mapId]?.label||s.mapId} · {SERVER_MODES[s.matchMode]}</small></button></td><td>{GAME2_SKIRMISH_MAPS[s.mapId]?.label||s.mapId}</td><td>{SERVER_MODES[s.matchMode]||'Free-for-all'}</td><td><span className="g2-count">{s.players}</span> / {s.maxPlayers}</td><td>{s.ai||'—'}</td>
      </tr>)}</tbody></table>{!filtered.length&&<div className="g2-empty">{!status&&!error?'Finding available servers…':error?'Server list unavailable. Retry to reconnect.':'No active servers match this mode or search. Online Capture the Flag requires its own networked flag rules before rooms can be opened.'}</div>}</div>
      <footer className="g2-footer"><span>{status?`${filtered.length} servers · ${servers.reduce((n,s)=>n+(s.players||0),0)} players online`:'Connecting to multiplayer'}</span><button className="g2-back" onClick={onRefresh} disabled={refreshing}><RefreshCw size={12} className={refreshing?'animate-spin':''}/> Refresh servers</button></footer>
      {error&&<div className="g2-notice" role="alert">{error}</div>}
      {status&&!status.serverBrowser&&<div className="g2-notice">Public arenas are available. Player-created servers will appear when the multiplayer service receives the server-browser update.</div>}
      {!signedIn&&<div className="g2-notice">Browse freely. <button className="g2-back" onClick={onSignIn}>Sign in to join a server</button></div>}
      <button className="g2-back" onClick={onPractice}><Swords size={14}/> Prefer to practice? Enter an offline duel</button>
    </section><aside aria-label="Selected server" className="g2-detail">{active?<><MapDiagram mapId={active.mapId}/><div className="g2-detail-body"><div className="g2-eyebrow">Selected server</div><h2>{active.name}</h2><span className="g2-status"><i className="g2-dot"/>{full?'Server full':'Ready to join'}</span><dl className="g2-facts">{[['Map',GAME2_SKIRMISH_MAPS[active.mapId]?.label||active.mapId],['Rules',SERVER_MODES[active.matchMode]],['Players',`${active.players} / ${active.maxPlayers}`],['Bots',active.ai||'None'],['Current host',active.host_name || 'Awaiting players'],['Friendly fire',active.matchMode==='teams'?'Off':'Everyone is an opponent']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><button className="g2-button g2-button-primary" style={{width:'100%'}} disabled={full||!!error} onClick={join}>Enter server <ArrowRight size={14}/></button><p className="g2-muted" style={{fontSize:11,marginTop:14}}>Choose your character and lightsaber inside the arena, before you deploy.</p></div></>:<div className="g2-detail-body"><Server size={24}/><h2>Your arena awaits.</h2><p className="g2-muted">Select an available server to see its map and match rules.</p></div>}</aside></div>
    {create&&<CreateServer onClose={()=>setCreate(false)} onCreate={onCreate}/>}
  </div></div>;
}
