import { useEffect, useRef, useState } from 'react';
import { FantasyBattleStage, UNITS } from './FantasyBattleStage.js';
import { ACTIONS } from './core/battleRules.mjs';
import { UI_SCREENS, PAUSE_LINKS, HOTKEY_SCREENS, UNSUPPORTED } from './uiCatalog.mjs';
import { ITEMS, SETTINGS_KEY, SLOT_IDS, STAT_KEYS, DEFAULT_SETTINGS, createProfile, readSlots, writeSlot, mostRecent, readSettings, updateWorld, rewardVictory, allocate, heroStats, levelFor, pointsFor, availableActions, learnedAt, acceptGroveQuest, claimGroveQuest, collectLoot, equipItem, buyItem, sellItem, enhanceWeapon, craftTonic, heal, travelTo, comparison } from './core/adventureState.mjs';
import './fantasybattle.css';
import './sapphireAdventure.css';
import { artFor, artUrl, makeSapphireTemplate } from './sapphireArt.mjs';
import { ItemArt, SkillArt } from './SapphireIcons.jsx';

const EMPTY={slots:[],error:null};
const fmt=(n)=>new Intl.NumberFormat('en-US').format(n);
const skillName=id=>ACTIONS[id]?.name||id;
const isWorldScreen=id=>id==='10'||id==='09';

function Panel({rect,children,className=''}) {
  if(!rect)return null;
  const [x,y,w,h]=rect;
  return <section className={'fa-panel '+className} style={{left:x*100+'%',top:y*100+'%',width:w*100+'%',height:h*100+'%'}}>{children}</section>;
}
function Btn({children,onClick,disabled=false,primary=false,...props}){
  return <button type="button" className={'fa-button'+(primary?' primary':'')} disabled={disabled} onClick={onClick} {...props}>{children}</button>;
}
function StatRows({stats}){return <dl className="fa-stats">{Object.entries(stats).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{typeof v==='number'?fmt(v):v}</dd></div>)}</dl>;}
function RegionMap({world,profile,small=false}){
  const regions=world?.regions||[];
  const min=regions.length?Math.min(...regions.map(r=>r.minX)):0;
  const max=regions.length?Math.max(...regions.map(r=>r.maxX)):1;
  const px=x=>30+740*(x-min)/Math.max(1,max-min);
  const pos=world?.position||profile?.world.position;
  const markers=world?.encounters||[];
  return <div className="fa-map">
    {regions.length===0?<p>Map data is available when the world loads.</p>:<svg viewBox="0 0 800 190" role="img" aria-label="Live Sapphire Wilds map">
      {regions.map((r,i)=><g key={r.id}><rect x={px(r.minX)} y="48" width={Math.max(1,px(r.maxX)-px(r.minX)-2)} height="86" rx="6" fill={profile?.world.visitedRegions.includes(r.id)?'#2859b8':'#18274d'} stroke="#d1b784"/>{!small&&<text x={(px(r.minX)+px(r.maxX))/2} y="77" fill="#edf2f6" textAnchor="middle" fontSize="14">{i+1}</text>}</g>)}
      <path d="M30 105 H770" stroke="#78c9ed" strokeDasharray="6 5"/>
      {markers.map(m=><g key={m.id}><circle cx={px(m.position[0])} cy="105" r="6" fill={m.completed?'#84c5a0':m.category==='Boss'?'#e87a90':'#ebd6a6'}/><title>{m.label}</title></g>)}
      {pos&&<g><path d={'M'+px(pos[0])+' 86 l-8 -15 h16Z'} fill="#fff8ec" stroke="#78c9ed"/><circle cx={px(pos[0])} cy="105" r="8" fill="#78c9ed" stroke="white"/></g>}
    </svg>}
    {!small&&regions.map((r,i)=><div key={r.id} className="fa-map-row"><span>{i+1}. {r.name.replace(/^\d+\. /,'')}</span><span>{profile?.world.visitedRegions.includes(r.id)?'Discovered':'Unexplored'}</span></div>)}
    {pos&&<small>{world?.region||'Sapphire Wilds'} · X {pos[0].toFixed(1)} · Z {pos[2].toFixed(1)}</small>}
  </div>;
}
function BattleSurface({profile,encounter,paused,muted,onHud,onError,stageRef}){
  const mount=useRef(null), callback=useRef({onHud,onError});callback.current={onHud,onError};
  useEffect(()=>{
    const stats=heroStats(profile);
    const scale=encounter.category==='Boss'?1.45:encounter.category==='Elite'?1.2:1;
    const units=[{...UNITS[0],...stats,hp:encounter.practice?stats.maxHp:profile.hp,name:profile.name},{...UNITS[1],name:encounter.label||UNITS[1].name,maxHp:Math.round(UNITS[1].maxHp*scale),atk:Math.round(UNITS[1].atk*scale)}];
    const stage=new FantasyBattleStage(mount.current,{units,availableActions:encounter.practice?Object.keys(ACTIONS):availableActions(levelFor(profile.xp)),transparentBackdrop:true,onHud:state=>callback.current.onHud(state)});
    stageRef.current=stage;
    stage.init().catch(e=>{if(!stage.disposed)callback.current.onError(String(e?.message||e));});
    return()=>{stage.dispose();if(stageRef.current===stage)stageRef.current=null;};
    // A battle is one immutable encounter; changes to the profile apply next encounter.
  },[encounter.token,stageRef]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(stageRef.current){stageRef.current.paused=paused;stageRef.current.setMuted(muted);}},[paused,muted,stageRef]);
  return <div className="fa-battle-stage" ref={mount}/>;
}
export default function SapphireAdventure(){
  const [stack,setStack]=useState(['01']),[slots,setSlots]=useState(EMPTY),[settings,setSettings]=useState(DEFAULT_SETTINGS);
  const [profile,setProfile]=useState(null),[slot,setSlot]=useState(null),[world,setWorld]=useState(null),[running,setRunning]=useState(false);
  const [name,setName]=useState(''),[selected,setSelected]=useState(null),[encounter,setEncounter]=useState(null),[arenaReady,setArenaReady]=useState(false);
  const [hud,setHud]=useState(null),[result,setResult]=useState(null),[notice,setNotice]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(null);
  const [itemId,setItemId]=useState('starterBow'),[loot,setLoot]=useState([]),[service,setService]=useState(null),[candidate,setCandidate]=useState(null),[destination,setDestination]=useState(null);
  const [notifications,setNotifications]=useState([]),[lesson,setLesson]=useState(0),[discovery,setDiscovery]=useState(null),[saveStatus,setSaveStatus]=useState('');
  const frame=useRef(null),stageRef=useRef(null),current=useRef({}),processed=useRef(null),startReady=useRef(false),saveTimer=useRef(null),focusRef=useRef(null),timeoutRef=useRef(null),startTimer=useRef(null),restorePending=useRef(false);
  const id=stack[stack.length-1],screen=UI_SCREENS[id];
  current.current={id,stack,profile,slot,settings,world,encounter,result,running,service,candidate};
  const replaceProfile=p=>{current.current.profile=p;setProfile(p);};
  const go=target=>{if(UI_SCREENS[target])setStack(old=>old[old.length-1]===target?old:[...old,target]);};
  const back=()=>setStack(old=>old.length>1?old.slice(0,-1):old);
  const root=target=>setStack([target]);
  const post=(type,data)=>frame.current?.contentWindow?.postMessage({channel:'fantasy-host',type,data},location.origin);
  const notify=message=>{setNotifications(old=>[{message,time:Date.now()},...old].slice(0,40));setNotice(message);};
  const fail=message=>{setError(message);go('47');};
  const transact=(operation,success)=>{const p=current.current.profile;if(!p||current.current.encounter){notify('This action is available only outside battle.');return false;}try{const next=operation(p);replaceProfile(next);autosave(next);notify(success);return true;}catch(e){notify(e.message);return false;}};
  const reloadSlots=()=>{const s=readSlots(localStorage);setSlots(s);return s;};
  useEffect(()=>{reloadSlots();setSettings(readSettings(localStorage));return()=>{clearTimeout(saveTimer.current);clearTimeout(timeoutRef.current);clearTimeout(startTimer.current);};},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(t);},[notice]);
  useEffect(()=>{if(id==='10'&&running)frame.current?.focus();else if(!isWorldScreen(id)&&id!=='35')focusRef.current?.focus();},[id,running]);
  useEffect(()=>{post('pause',id!=='10');if(stageRef.current)stageRef.current.paused=id!=='09';},[id]);
  useEffect(()=>{if(running){post('quality',settings.quality);}if(stageRef.current)stageRef.current.setMuted(settings.muted);},[running,settings]);
  const applySettings=patch=>{const next={...current.current.settings,...patch};setSettings(next);try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(next));}catch(e){fail('Settings could not be saved: '+e.message);}};
  const save=(target,overwrite=false,p=current.current.profile)=>{
    if(!p||!target)return false;
    setSaveStatus('Saving…');
    try{writeSlot(localStorage,target,p,{overwrite});setSlot(target);current.current.slot=target;reloadSlots();setSaveStatus('Progress saved');clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>setSaveStatus(''),3000);return true;}
    catch(e){setSaveStatus('');fail('Save failed: '+e.message);return false;}
  };
  const autosave=p=>{const s=current.current.slot;if(s){try{const record=readSlots(localStorage).slots.find(x=>x.id===s);if(record?.status==='valid'&&record.profile.id!==p.id){notify('Autosave paused: slot belongs to another character.');return;}if(record?.status==='corrupt'){notify('Autosave paused: save slot damaged.');return;}save(s,record?.status==='valid',p);}catch(e){fail(e.message);}}};
  const begin=(p,saveSlot=null)=>{
    clearTimeout(timeoutRef.current);clearTimeout(startTimer.current);restorePending.current=false;startReady.current=false;processed.current=null;
    replaceProfile(p);setSlot(saveSlot);current.current.slot=saveSlot;setWorld(null);setEncounter(null);setArenaReady(false);setHud(null);setResult(null);
    setService(null);setCandidate(null);setLoot([]);setRunning(false);root('35');
    // Remount even if loading from an active session.
    startTimer.current=setTimeout(()=>{setRunning(true);timeoutRef.current=setTimeout(()=>{if(!startReady.current)fail('The 3D world did not become ready. Check your graphics device and retry.');},30000);},0);
  };
  const startNew=()=>{try{const p=createProfile(name);replaceProfile(p);go('20');}catch(e){setNotice(e.message);}};
  const enterNew=()=>{const p=current.current.profile;if(!p)return;const empty=SLOT_IDS.find(s=>!slots.slots.some(x=>x.id===s));begin(p,empty||null);};
  const leaveTitle=()=>{clearTimeout(startTimer.current);clearTimeout(timeoutRef.current);restorePending.current=false;setRunning(false);setEncounter(null);setArenaReady(false);setHud(null);setResult(null);replaceProfile(null);setWorld(null);setPending(null);root('01');reloadSlots();};
  const requestConfirm=(message,action)=>{setPending({message,action});go('40');};
  const openPause=()=>{if(isWorldScreen(current.current.id))go('04');};
  const onKey=code=>{
    const s=current.current.id;
    if(code==='Escape'){if(s==='40')setPending(null);if(isWorldScreen(s))openPause();else if(s!=='35'&&s!=='01')back();return;}
    const target=HOTKEY_SCREENS[code];
    if(target&&current.current.running&&(isWorldScreen(s)||s==='04'||s===target)){if(s===target)back();else go(target);}
  };
  const startBattle=(e)=>{
    if(current.current.encounter)return;
    const next={...e,token:crypto.randomUUID()};
    current.current.encounter=next;setEncounter(next);processed.current=null;setHud(null);setResult(null);setArenaReady(false);root('35');post('battle');
  };
  const resumeWorld=(p=current.current.profile)=>{
    const e=current.current.encounter;
    setEncounter(null);current.current.encounter=null;setArenaReady(false);setHud(null);
    post('restore',p.world);if(e&&!e.practice)post('finish',{id:e.id,won:p.world.completedEncounters.includes(e.id)});
    post('pause',false);root('10');setTimeout(()=>frame.current?.focus(),0);
  };
  const retryBattle=()=>{const e=current.current.encounter;if(!e)return;processed.current=null;setHud(null);setResult(null);setEncounter({...e,token:crypto.randomUUID()});root('09');};
  const handleBattleHud=state=>{
    setHud(state);
    const e=current.current.encounter,p=current.current.profile;
    if(state.phase!=='over'||!e||!p||processed.current===e.token)return;
    processed.current=e.token;
    const won=state.winner==='player';
    if(won&&!e.practice){const r=rewardVictory(p,e,state.units.find(u=>u.id==='hero')?.hp);replaceProfile(r.profile);setResult(r);setLoot(r.loot);notify('Victory · +'+r.xp+' XP · +'+r.gold+' gold');autosave(r.profile);}
    else setResult({profile:p,xp:0,leveled:false,unlocked:[]});
    root(won?'14':'15');
  };
  const victoryContinue=()=>{const r=current.current.result,p=current.current.profile;if(r?.leveled){go('32');return;}resumeWorld(p);};
  const finishLevel=()=>{if(current.current.result?.unlocked?.length){go('45');return;}if(current.current.encounter&&current.current.result?.leveled)resumeWorld();else back();};
  const eventHandler=useRef(null);
  eventHandler.current=e=>{
    const s=current.current,p=s.profile;
    if(e.type==='ready'&&p){
      if(startReady.current||restorePending.current)return;
      restorePending.current=true;post('quality',s.settings.quality);post('restore',p.world);return;
    }
    if(e.type==='restored'&&p&&!s.encounter){
      const updated=updateWorld(p,e.world);replaceProfile(updated);setWorld(e.world);
      if(!startReady.current){startReady.current=true;restorePending.current=false;clearTimeout(timeoutRef.current);post('pause',false);root('10');autosave(updated);}return;
    }
    if(e.type==='world'&&p&&startReady.current&&!s.encounter){
      const updated=updateWorld(p,e.world);setWorld(e.world);replaceProfile(updated);
      const newRegion=updated.world.visitedRegions.find(x=>!p.world.visitedRegions.includes(x));
      if(newRegion&&s.id==='10'){const item=e.world.regions.find(x=>x.id===newRegion);if(p.world.visitedRegions.length){setDiscovery(item?.name||e.world.region);go('42');notify('New region: '+(item?.name||e.world.region));}autosave(updated);}
      return;
    }
    if(e.type==='encounter'&&p&&s.id==='10'&&!s.encounter){
      const updated=updateWorld(p,e.world);replaceProfile(updated);setWorld(e.world);if(e.encounter.category==='Normal')startBattle(e.encounter);else{setCandidate(e.encounter);go('23');}return;
    }
    if(e.type==='discovery'&&p&&!s.encounter){const updated=updateWorld(p,e.world);const awarded=collectLoot(updated,e.id);replaceProfile(awarded.profile);setWorld(e.world);setDiscovery(e.label);setLoot(awarded.loot);notify(e.label);autosave(awarded.profile);go(awarded.loot.length?'31':'42');return;}
    if(e.type==='service'&&p&&s.id==='10'&&!s.encounter){setService(e.service);setWorld(e.world);replaceProfile(updateWorld(p,e.world));go('13');return;}
    if(e.type==='battleReady'&&s.encounter){setArenaReady(true);root('09');return;}
    if(e.type==='error')fail(e.message||'World error');
    if(e.type==='key')onKey(e.code);
  };
  useEffect(()=>{
    const receive=e=>{if(e.origin===location.origin&&e.source===frame.current?.contentWindow&&e.data?.channel==='fantasy-world')eventHandler.current(e.data);};
    const key=e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||''))return;const s=current.current.id;if(e.code==='Escape'||HOTKEY_SCREENS[e.code]){e.preventDefault();eventHandler.current({type:'key',code:e.code});}else if(s==='09'&&stageRef.current?.handleKey(e.key))e.preventDefault();};
    window.addEventListener('message',receive);window.addEventListener('keydown',key);return()=>{window.removeEventListener('message',receive);window.removeEventListener('keydown',key);};
  },[]);
  const recent=mostRecent(slots.slots),level=profile?levelFor(profile.xp):1,stats=heroStats(profile);
  const serviceAvailable=Boolean(service&&world?.nearbyService===service.id&&!encounter);
  const inv=profile?.inventory||{};const selectedItem=ITEMS[itemId];const compare=profile?comparison(profile,itemId):null;
  const listItems=(filter=()=>true)=>Object.entries(ITEMS).filter(([k,item])=>filter(item,k)).map(([k,item])=><Btn key={k} primary={itemId===k} onClick={()=>setItemId(k)}><ItemArt id={k}/><span>{item.name} · {inv[k]||0}</span></Btn>);
  const lootList=loot.length?loot.map(l=><div className="fa-loot-row" key={l.id}><ItemArt id={l.id}/><span>{ITEMS[l.id]?.name||l.id} ×{l.count}</span></div>):<p>No items awarded.</p>;
  const validSlots=slots.slots.filter(s=>s.status==='valid');
  const selectedSave=validSlots.find(s=>s.id===selected);
  const statPanel=<StatRows stats={{Level:level,Experience:profile?profile.xp%100+' / 100':'—','Current HP':profile?.hp??'—','Maximum HP':stats.maxHp,Attack:stats.atk,Defense:stats.def,Speed:stats.spd,'Unspent points':profile?pointsFor(profile):0}}/>;
  const nav=(targets)=>targets.map(t=><Btn key={t} onClick={()=>go(t)}>{UI_SCREENS[t].name}{UNSUPPORTED.has(t)?' · Not available':''}</Btn>);
  const buttons=(...children)=><div className="fa-buttons">{children}</div>;
  const pane=(i,content,cls)=> <Panel key={i} rect={screen.layout[i]} className={cls}>{content}</Panel>;
  let content;
  switch(id){
    case '01':content=pane(0,<><div className="fa-title-mark" aria-hidden="true">✧</div><h1>Fantasy Battle</h1><p className="fa-title-subtitle">A Sapphire Sumi adventure</p><div className="fa-title-divider" aria-hidden="true"/><Btn primary onClick={()=>go('48')}>Start New Game</Btn><Btn disabled={!recent} onClick={()=>begin(recent.profile,recent.id)}>Continue</Btn><Btn disabled={!validSlots.length} onClick={()=>{setSelected(recent?.id||null);go('02');}}>Load Game</Btn><Btn onClick={()=>go('03')}>Settings</Btn><a className="fa-button" href="/">Back to Games</a>{slots.error&&<small role="alert">{slots.error}</small>}</>);break;
    case '48':content=<>{pane(0,<>{nav(['03','34'])}<Btn onClick={back}>Back</Btn></>)}{pane(2,<><h2>Welcome, adventurer</h2><p>Guest progress is stored on this browser. No account is required. Choose your settings before beginning.</p><Btn primary onClick={()=>go('19')}>Create Character</Btn><Btn onClick={()=>go('03')}>Graphics and Audio</Btn><Btn onClick={()=>go('34')}>Tutorial</Btn></>)}</>;break;
    case '19':content=<>{pane(0,<><Btn onClick={back}>Back</Btn></>)}{pane(1,<><h2>Silver Archer</h2><p>The existing playable bow class.</p></>)}{pane(2,<><label>Adventurer name<input value={name} maxLength={40} onChange={e=>setName(e.target.value)} placeholder="Enter name"/></label><Btn primary disabled={!name.trim()} onClick={startNew}>Create</Btn></>)}</>;break;
    case '20':content=<>{pane(0,<>{profile&&<p>{profile.name}</p>}<Btn onClick={()=>go('19')}>Create Character</Btn></>)}{pane(2,<>{statPanel}<Btn primary disabled={!profile} onClick={enterNew}>Enter World</Btn><Btn onClick={back}>Back</Btn></>)}</>;break;
    case '02':content=<>{pane(0,<>{validSlots.map(s=><Btn primary={selected===s.id} key={s.id} onClick={()=>setSelected(s.id)}>Slot {s.id} · {s.profile.name}</Btn>)}{!validSlots.length&&<p>No loadable saves on this browser.</p>}{slots.slots.filter(s=>s.status==='corrupt').map(s=><p key={s.id}>Slot {s.id} is damaged.</p>)}<Btn onClick={back}>Back</Btn></>)}{pane(1,<><h2>{selectedSave?.profile.name||'Select a save'}</h2>{selectedSave&&<p>Level {levelFor(selectedSave.profile.xp)} · X {selectedSave.profile.world.position[0].toFixed(1)} · {new Date(selectedSave.savedAt).toLocaleString('en-US')}</p>}</>)}{pane(2,<Btn primary disabled={!selectedSave} onClick={()=>begin(selectedSave.profile,selectedSave.id)}>Load Game</Btn>)}</>;break;
    case '03':content=<>{pane(0,<><h2>Settings</h2><Btn onClick={back}>Back</Btn></>)}{pane(1,<><label>Graphics quality<select value={settings.quality} onChange={e=>applySettings({quality:e.target.value})}>{['performance','balanced','high','cinematic'].map(q=><option key={q}>{q}</option>)}</select></label><label><input type="checkbox" checked={settings.muted} onChange={e=>applySettings({muted:e.target.checked})}/> Mute battle audio</label><label><input type="checkbox" checked={settings.reducedMotion} onChange={e=>applySettings({reducedMotion:e.target.checked})}/> Reduce UI motion</label><p>Renderer: {world?.renderer||'Detected when world loads'}</p><Btn onClick={()=>{if(document.fullscreenElement)document.exitFullscreen().catch(e=>setNotice(e.message));else document.documentElement.requestFullscreen?.().catch(e=>setNotice(e.message));}}>Toggle fullscreen</Btn><Btn primary onClick={back}>Done</Btn></>)}</>;break;
    case '04':content=<>{pane(0,<><Btn primary onClick={back}>Resume</Btn>{nav(PAUSE_LINKS)}<Btn onClick={()=>requestConfirm('Return to the title? Unsaved progress may be lost.',leaveTitle)}>Return to Title</Btn></>)}{pane(1,<><h2>{profile?.name}</h2><p>{world?.region||'Sapphire Wilds'} · Level {level}</p></>)}{pane(2,statPanel)}</>;break;
    case '05':content=<>{pane(0,nav(['06','12','32','27']))}{pane(1,<><h2>{profile?.name||'No character'}</h2><p>Archer · Level {level}</p></>)}{pane(2,statPanel)}</>;break;
    case '06':content=<>{pane(0,nav(['21','17','39']))}{pane(1,<><h2>{profile?.name||'No character'}</h2><p>Equipped: {ITEMS[profile?.equipped]?.name||'None'} +{profile?.enhancements?.[profile?.equipped]||0}</p><p>Gold: {profile?.gold||0}</p></>)}{pane(2,<>{listItems((item,k)=>item.kind==='weapon'&&inv[k]>0)}<Btn disabled={!compare||Boolean(encounter)} onClick={()=>go('39')}>Compare Selected</Btn></>)}{pane(3,statPanel)}</>;break;
    case '07':content=<>{pane(0,nav(['25','08']))}{pane(1,<RegionMap world={world} profile={profile}/>)}{pane(2,<><h2>Current position</h2><p>{world?.region||'World not loaded'}</p><p>{world?.nearby||'No nearby interaction'}</p><small>Encounter markers are added from streamed sections, not sample artwork.</small></>)}</>;break;
    case '08':content=<>{pane(0,<><Btn onClick={()=>go('07')}>Map</Btn><Btn onClick={()=>go('43')} disabled={!profile||Boolean(encounter)||profile.quests.grove!=='available'}>Available Quest</Btn></>)}{pane(1,<><h2>Whispering Grove</h2><p>{profile?.quests.grove||'No active profile'}</p></>)}{pane(2,<><h2>Defeat the Grove Spirit</h2><p>Find the encounter in Whispering Grove and win the battle.</p><Btn primary disabled={Boolean(encounter)||profile?.quests.grove!=='complete'} onClick={()=>{const p=claimGroveQuest(profile);replaceProfile(p);autosave(p);go('44');}}>Complete Quest</Btn></>)}</>;break;
    case '09':content=<>{pane(0,<><h2>{hud?'Round '+hud.round:'Preparing combat…'}</h2><div className="fa-turns">{hud?.order.map(o=><span className={o.active?'active':''} key={o.id}>{o.name}{o.action?' · '+o.action:''}</span>)}</div></>)}{pane(1,<>{hud?.units.filter(u=>u.id==='hero').map(u=><div key={u.id}><strong>{u.name}</strong><progress value={u.hp} max={u.maxHp}/><p>HP {u.hp}/{u.maxHp} · Focus {u.focus}/{u.maxFocus}</p></div>)}<small aria-live="polite">{hud?.log.at(-1)}</small></>)}{pane(2,<div className="fa-combat-actions">{hud?.legal.map(a=><Btn key={a.id} disabled={!a.enabled} onClick={()=>stageRef.current?.chooseAction(a.id)}><SkillArt id={a.id}/><span>{a.action.hotkey} · {a.action.name}</span><small>{a.reason||a.action.summary}</small></Btn>)}</div>)}{pane(3,<>{hud?.units.filter(u=>u.id==='rival').map(u=><div key={u.id}><strong>{u.name}</strong><progress value={u.hp} max={u.maxHp}/><small>HP {u.hp}/{u.maxHp}</small></div>)}</>)}<div className="fa-hud-top"><Btn onClick={openPause}>Pause · Esc</Btn><Btn onClick={()=>go('12')}>Skills · K</Btn></div></>;break;
    case '10':content=<>{pane(0,<><strong>{profile?.name}</strong><p>Level {level}</p><progress value={profile?.xp%100||0} max={100}/><small>{profile?.xp||0} total XP</small><progress value={profile?.hp||0} max={stats.maxHp}/><small>HP {profile?.hp||0}/{stats.maxHp} · Gold {profile?.gold||0}</small></>)}{pane(1,<button className="fa-map-button" onClick={()=>go('07')}><RegionMap world={world} profile={profile} small/></button>)}{pane(2,<><small>{world?.region}</small>{world?.nearby&&<Btn primary onClick={()=>post('interact')}>{world.nearby} · E</Btn>}{profile?.quests.grove==='active'&&<p>Quest: Defeat the Grove Spirit</p>}</>)}{pane(3,<div className="fa-hud-buttons"><Btn onClick={openPause}>Menu</Btn><Btn onClick={()=>go('07')}>Map</Btn><Btn onClick={()=>go('08')}>Journal</Btn><Btn onClick={()=>go('12')}>Skills</Btn></div>)}<div className="fa-touch">{[['left','←'],['right','→'],['in','↑'],['out','↓']].map(([k,label])=><Btn key={k} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);post('move',{key:k,value:true});}} onPointerUp={()=>post('move',{key:k,value:false})} onPointerCancel={()=>post('move',{key:k,value:false})} onLostPointerCapture={()=>post('move',{key:k,value:false})}>{label}</Btn>)}<Btn onClick={()=>post('jump')}>Jump</Btn></div><div className="fa-hud-top"><Btn onClick={()=>frame.current?.focus()}>Focus world · WASD</Btn></div></>;break;
    case '11':content=<>{pane(0,nav(['05','26']))}{pane(1,<><h2>Active party</h2><p>{profile?.name||'No member'} · Archer</p><p>Additional party slots await the multi-character combat system.</p></>)}{pane(2,statPanel)}</>;break;
    case '12':content=<>{pane(0,<>{nav(['05','32'])}<Btn onClick={back}>Back</Btn></>)}{pane(1,<>{Object.entries(ACTIONS).map(([k,a])=><div className="fa-skill" key={k}><SkillArt id={k}/><strong>{a.name}</strong><small>{level>=learnedAt[k]?'Learned':'Unlocks at level '+learnedAt[k]} · {a.hotkey}</small><p>{a.summary}</p></div>)}</>)}{pane(2,<><h2>Progression</h2><p>Skills unlock when the required level is reached.</p>{statPanel}</>)}</>;break;
    case '14':content=pane(0,<><h2>Victory</h2><p>{encounter?.label}</p><p>Experience earned: +{result?.xp||0} · Gold +{result?.gold||0}</p>{lootList}{loot.length>0&&<Btn onClick={()=>go('38')}>View Acquired Items</Btn>}{result?.leveled&&<p>Level {level} reached! {pointsFor(profile)} unspent points.</p>}<Btn primary onClick={victoryContinue}>{result?.leveled?'Level Up':'Continue'}</Btn></>);break;
    case '15':content=pane(0,<><h2>Defeat</h2><p>No rewards were granted.</p><Btn primary onClick={retryBattle}>Retry</Btn><Btn onClick={()=>resumeWorld()}>Return to Exploration</Btn><Btn disabled={!validSlots.length} onClick={()=>go('02')}>Load Game</Btn><Btn onClick={()=>requestConfirm('Return to the title?',leaveTitle)}>Title</Btn></>);break;
    case '18':content=<>{pane(0,<><h2>Save</h2><p>Save your current exploration position.</p></>)}{pane(1,<>{SLOT_IDS.map(s=>{const r=slots.slots.find(x=>x.id===s);return <Btn key={s} onClick={()=>setSelected(s)} primary={selected===s}>Slot {s} · {r?.status==='valid'?r.profile.name:r?'Damaged':'Empty'}</Btn>;})}</>)}{pane(2,<>{statPanel}<Btn primary disabled={!profile||!selected||Boolean(encounter)} onClick={()=>{const occupied=slots.slots.some(x=>x.id===selected);const perform=()=>save(selected,occupied);if(occupied)requestConfirm('Overwrite slot '+selected+'? Existing progress in this slot will be replaced.',perform);else perform();}}>Save Game</Btn>{encounter&&<p>Manual saves are disabled during combat.</p>}</>)}</>;break;
    case '13':content=pane(0,<><h2>{service?.label||'World interaction'}</h2><p>{serviceAvailable?'Rest, trade or prepare for the next encounter.':'Approach a gold service marker in the world.'}</p>{serviceAvailable&&nav(['16','17','22','33','43','26'])}<Btn onClick={back}>Leave</Btn></>);break;
    case '16':content=<>{pane(0,<><h2>Merchant</h2><p>Gold: {profile?.gold||0}</p>{!serviceAvailable&&<p>Visit a service marker to trade.</p>}</>)}{pane(1,listItems((item)=>item.buy>0))}{pane(2,<><h2>{selectedItem?.name}</h2><p>Buy: {selectedItem?.buy||0} gold · Sell: {selectedItem?.sell||0} gold</p><Btn disabled={!serviceAvailable||!selectedItem?.buy||profile.gold<selectedItem.buy} onClick={()=>requestConfirm('Buy '+selectedItem.name+'?',()=>transact(p=>buyItem(p,itemId),'Item purchased'))}>Buy</Btn><Btn disabled={!serviceAvailable||!selectedItem?.sell||!inv[itemId]} onClick={()=>requestConfirm('Sell '+selectedItem.name+'?',()=>transact(p=>sellItem(p,itemId),'Item sold'))}>Sell</Btn></>)}</>;break;
    case '17':content=<>{pane(0,<><h2>Blacksmith</h2><p>Gold: {profile?.gold||0} · Ore: {inv.sapphireOre||0}</p>{!serviceAvailable&&<p>Visit a service marker.</p>}</>)}{pane(1,<><h2>{ITEMS[profile?.equipped]?.name}</h2><p>Enhancement +{profile?.enhancements?.[profile?.equipped]||0} / 5</p><p>Cost: {15+(profile?.enhancements?.[profile?.equipped]||0)*10} gold and 1 ore.</p></>)}{pane(2,<><p>Attack after enhancement: {stats.atk+2}</p><Btn disabled={!serviceAvailable||!inv.sapphireOre||(profile?.enhancements?.[profile?.equipped]||0)>=5} onClick={()=>requestConfirm('Enhance equipped bow?',()=>transact(enhanceWeapon,'Weapon enhanced'))}>Enhance</Btn></>)}</>;break;
    case '21':content=<>{pane(0,nav(['06','22']))}{pane(1,listItems((item,k)=>item.kind!=='weapon'&&inv[k]>0))}{pane(2,<><h2>{selectedItem?.name}</h2><p>Owned: {inv[itemId]||0}</p>{itemId==='recoveryTonic'&&<Btn disabled={!inv.recoveryTonic||Boolean(encounter)} onClick={()=>go('46')}>Use Tonic</Btn>}</>)}</>;break;
    case '22':content=<>{pane(0,<h2>Crafting</h2>)}{pane(1,<><h2>Recovery Tonic</h2><p>Requires 2 Sapphire Ore · Owned {inv.sapphireOre||0}</p></>)}{pane(2,<Btn disabled={!serviceAvailable||inv.sapphireOre<2} onClick={()=>requestConfirm('Craft Recovery Tonic?',()=>transact(craftTonic,'Recovery Tonic crafted'))}>Craft</Btn>)}</>;break;
    case '23':content=<>{pane(1,<h2>{candidate?.label||'Encounter entrance'}</h2>)}{pane(2,<><p>{candidate?.category} encounter. Current prototype uses the archer opponent rig with stronger stats.</p><Btn disabled={!candidate} onClick={()=>go('36')}>Encounter Details</Btn><Btn onClick={back}>Leave</Btn></>)}</>;break;
    case '24':content=<>{pane(0,nav(['29']))}{pane(1,<>{world?.encounters.map(e=><p key={e.id}>{e.label} · {e.completed?'Defeated':'Discovered'}</p>)||<p>No enemies discovered.</p>}</>)}{pane(2,<p>Detailed enemy abilities and loot tables are not implemented. Entries reflect encountered map markers.</p>)}</>;break;
    case '25':content=<>{pane(0,<>{world?.regions.filter(r=>profile?.world.visitedRegions.includes(r.id)).map(r=><Btn key={r.id} primary={destination?.id===r.id} onClick={()=>setDestination(r)}>{r.name}</Btn>)}</>)}{pane(1,<RegionMap world={world} profile={profile}/>)}{pane(2,<><h2>{destination?.name||'Choose discovered region'}</h2><Btn disabled={!destination||Boolean(encounter)} onClick={()=>requestConfirm('Travel to '+destination.name+'?',()=>{if(transact(p=>travelTo(p,destination),'Arrived at '+destination.name)){post('restore',current.current.profile.world);post('pause',false);root('10');}})}>Travel</Btn></>)}</>;break;
    case '26':content=<>{pane(0,<h2>Available companions</h2>)}{pane(1,<p>No recruitable companions are registered yet.</p>)}{pane(2,<><p>Recruitment requires additional playable rigs and party combat support.</p><Btn onClick={()=>go('11')}>Party</Btn></>)}</>;break;
    case '27':content=<>{pane(0,<h2>Wardrobe</h2>)}{pane(1,<p>Current appearance: Silver Archer.</p>)}{pane(2,<p>No alternative appearance assets are registered.</p>)}{pane(3,<Btn onClick={back}>Back</Btn>)}</>;break;
    case '28':content=<>{pane(0,nav(['24','29']))}{pane(1,<StatRows stats={{'Regions discovered':profile?.world.visitedRegions.length||0,'Encounters defeated':profile?.world.completedEncounters.length||0,'Hidden discoveries':profile?.world.discoveries.length||0}}/>)}{pane(2,<p>Milestone tracking is live. Achievement rewards have not been defined.</p>)}</>;break;
    case '29':content=<>{pane(0,nav(['24','07']))}{pane(1,<>{world?.regions.filter(r=>profile?.world.visitedRegions.includes(r.id)).map(r=><p key={r.id}>{r.name}</p>)||<p>No discoveries.</p>}</>)}{pane(2,<p>Only discovered map regions are shown. Story and lore records will appear when authored.</p>)}</>;break;
    case '30':content=<>{pane(0,<h2>Companions</h2>)}{pane(1,<p>{profile?.name}</p>)}{pane(2,<p>No bond records exist until companion recruitment is implemented.</p>)}{pane(3,<Btn onClick={()=>go('26')}>Recruitment</Btn>)}</>;break;
    case '31':content=pane(0,<><h2>Treasure Discovered</h2><p>{discovery}</p>{lootList}<p>These items were recorded once in your inventory.</p><Btn primary onClick={()=>go('38')}>View Items</Btn><Btn onClick={back}>Continue</Btn></>);break;
    case '32':content=<>{pane(0,<><p>{profile?.name}</p><h2>Level {level}</h2><p>{profile?pointsFor(profile):0} available points</p></>)}{pane(1,statPanel)}{pane(2,<>{STAT_KEYS.map(k=><div className="fa-allocation" key={k}><span>{k}: {profile?.attributes[k]||0}</span><Btn disabled={!profile||pointsFor(profile)<1||Boolean(encounter&&hud?.phase!=='over')} onClick={()=>{const p=allocate(current.current.profile,k);replaceProfile(p);}}>+</Btn></div>)}<Btn primary disabled={Boolean(encounter&&hud?.phase!=='over')} onClick={()=>{autosave(current.current.profile);finishLevel();}}>Confirm Allocation</Btn></>)}</>;break;
    case '33':content=<>{pane(0,<><h2>Rest Point</h2><p>{service?.label||'Not at a sanctuary'}</p></>)}{pane(1,statPanel)}{pane(2,<><p>Restore HP at a registered service point.</p><Btn disabled={!serviceAvailable||profile.hp>=stats.maxHp} onClick={()=>requestConfirm('Rest and recover?',()=>transact(p=>heal(p,{sanctuary:true}),'Health restored'))}>Rest</Btn><Btn onClick={()=>go('18')}>Save</Btn></>)}{pane(3,<Btn onClick={()=>root('10')}>Leave</Btn>)}</>;break;
    case '34':{const lessons=['Explore with WASD or the on-screen movement controls. Approach a marker and press E.','Choose a legal combat action. Quick Shot and Guard generate Focus; stronger skills spend it.','Open Character with C, Skillbook with K, Map with M, Journal with L, Equipment with I; Escape returns one level.'];content=<>{pane(0,<>{lessons.map((_,i)=><Btn key={i} primary={lesson===i} onClick={()=>setLesson(i)}>Lesson {i+1}</Btn>)}</>)}{pane(1,<><h2>Lesson {lesson+1}</h2><p>{lessons[lesson]}</p></>)}{pane(2,<Btn disabled={!running||Boolean(encounter)} onClick={()=>startBattle({id:'practice',label:'Practice Archer',category:'Normal',practice:true})}>Practice Battle</Btn>)}{pane(3,buttons(<Btn onClick={()=>setLesson(Math.max(0,lesson-1))}>Previous</Btn>,<Btn onClick={()=>setLesson(Math.min(lessons.length-1,lesson+1))}>Next</Btn>))}</>;break;}
    case '35':content=pane(0,<><h2>Loading the world…</h2><progress aria-label="Loading world"/><p>Waiting for the 3D renderer and map to become ready.</p><Btn onClick={leaveTitle}>Cancel</Btn></>);break;
    case '36':content=<>{pane(0,<h2>{candidate?.label||'Boss encounter'}</h2>)}{pane(1,<><p>Category: {candidate?.category||'Unknown'}</p><p>Single-opponent wait-and-attack preview. No unimplemented boss skills or rewards are advertised.</p><Btn primary disabled={!candidate} onClick={()=>startBattle(candidate)}>Enter Battle</Btn><Btn onClick={back}>Back</Btn></>)}</>;break;
    case '37':content=<>{pane(0,<h2>Local gameplay events</h2>)}{pane(1,<>{notifications.length?notifications.map((n,i)=><p key={n.time+'-'+i}>{n.message}</p>):<p>No notifications.</p>}</>)}{pane(2,<p>Notifications are generated by actual game events.</p>)}</>;break;
    case '38':content=<>{pane(0,<h2>Items Acquired</h2>)}{pane(1,<>{lootList}<p>Already added to your inventory.</p></>)}{pane(2,<>{!encounter&&<Btn onClick={()=>go('06')}>Inventory</Btn>}<Btn primary onClick={back}>Continue</Btn></>)}</>;break;
    case '39':content=<>{pane(0,listItems((item,k)=>item.kind==='weapon'&&inv[k]>0))}{pane(1,<><h2>Equipped</h2><p>{ITEMS[profile?.equipped]?.name}</p>{compare&&<StatRows stats={compare.current}/>}</>)}{pane(2,<><h2>Selected</h2><p>{selectedItem?.name}</p>{compare&&<StatRows stats={compare.candidate}/>}</>)}{pane(3,<><p>Attack difference: {compare?compare.candidate.atk-compare.current.atk:'—'}</p><Btn primary disabled={!compare||Boolean(encounter)} onClick={()=>{if(transact(p=>equipItem(p,itemId),'Weapon equipped'))back();}}>Equip</Btn></>)}</>;break;
    case '40':content=pane(0,<><h2>Confirmation</h2><p>{pending?.message||'No pending action.'}</p>{buttons(<Btn primary disabled={!pending} onClick={()=>{const f=pending?.action;setPending(null);back();f?.();}}>Confirm</Btn>,<Btn onClick={()=>{setPending(null);back();}}>Cancel</Btn>)}</>);break;
    case '41':content=pane(0,<p role="status">{saveStatus||'No save operation in progress.'}</p>);break;
    case '42':content=<>{pane(1,<><h2>Discovered</h2><p>{discovery}</p><Btn primary onClick={back}>Continue</Btn><Btn onClick={()=>go('07')}>Map</Btn></>)}</>;break;
    case '43':content=pane(1,<><h2>Whispering Grove Spirit</h2><p>Defeat the Grove Spirit in the first exploration region.</p><p>Battle experience is awarded on victory, not again for claiming the quest.</p><Btn primary disabled={!profile||profile.quests.grove!=='available'} onClick={()=>{const p=acceptGroveQuest(profile);replaceProfile(p);autosave(p);root('10');go('08');}}>Accept Quest</Btn><Btn onClick={back}>Decline</Btn></>);break;
    case '44':content=pane(0,<><h2>Quest Complete</h2><p>Whispering Grove Spirit · Completed</p><Btn primary onClick={()=>root('10')}>Continue</Btn></>);break;
    case '45':content=pane(1,<><h2>Skill Unlocked</h2>{result?.unlocked?.map(k=><div key={k}><SkillArt id={k}/><strong>{skillName(k)}</strong><p>{ACTIONS[k].summary}</p></div>)}<Btn primary onClick={()=>{resumeWorld();go('12');}}>View Skillbook</Btn></>);break;
    case '46':content=<>{pane(0,statPanel)}{pane(1,<><h2>Recovery Tonic</h2><p>Restore up to 40 HP. Owned: {inv.recoveryTonic||0}</p></>)}{pane(2,<><p>HP: {profile?.hp} → {Math.min(stats.maxHp,(profile?.hp||0)+40)}</p><Btn primary disabled={!profile||Boolean(encounter)||!inv.recoveryTonic||profile.hp>=stats.maxHp} onClick={()=>{if(transact(p=>heal(p),'Health restored'))back();}}>Confirm Recovery</Btn></>)}</>;break;
    case '47':content=pane(0,<><h2>Unable to continue</h2><p role="alert">{error}</p><Btn primary onClick={()=>{if(profile)begin(profile,slot);else leaveTitle();}}>Retry</Btn><Btn onClick={leaveTitle}>Return to Title</Btn></>);break;
    default:content=<>{pane(0,<><h2>{screen.name}</h2><p>This screen is reserved for the corresponding gameplay service. No items, currencies, rewards or transactions are simulated.</p><Btn onClick={back}>Back</Btn></>)}{screen.layout.length>1&&pane(screen.layout.length-1,<p>Gameplay service not available in the current archer prototype.</p>)}</>;break;
  }
  const template='data:image/svg+xml,'+encodeURIComponent(makeSapphireTemplate(id));
  const artwork=artFor(id,running);
  const artworkUrl=artUrl(artwork.asset);
  return <main className={'fa-root'+(settings.reducedMotion?' reduced-motion':'')}>
    {running?<iframe className="fa-world" ref={frame} src="/fantasy-battle-world" title="Sapphire Wilds 3D world" tabIndex={id==='10'?0:-1} style={{pointerEvents:id==='10'?'auto':'none'}}/>:<div className="fa-title-art"/>}
    {encounter&&arenaReady&&profile&&<BattleSurface key={encounter.token} encounter={encounter} profile={profile} paused={id!=='09'} muted={settings.muted} stageRef={stageRef} onHud={handleBattleHud} onError={fail}/>}
    {artwork.mode==='cinematic'&&<div className={'fa-cinematic-art'+(artwork.asset==='title-original'?' title-original':'')} aria-hidden="true" style={{'--fa-scene-art':'url("'+artworkUrl+'")'}}/>}
    <div className={'fa-ui '+(isWorldScreen(id)?'hud':'page')} key={id} data-screen={id} data-art-mode={artwork.mode}>
      <div aria-hidden="true" className="fa-template" style={{backgroundImage:'url("'+template+'")'}}/>
      {!isWorldScreen(id)&&id!=='01'&&<header className="fa-header"><h1 tabIndex={-1} ref={focusRef}>{screen.name}</h1>{!['35','14','15','40','47','45'].includes(id)&&<Btn onClick={back}>Back · Esc</Btn>}</header>}
      {content}
    </div>
    {(notice||saveStatus)&&<aside className="fa-notice" role="status">{saveStatus||notice}</aside>}
  </main>;
}
