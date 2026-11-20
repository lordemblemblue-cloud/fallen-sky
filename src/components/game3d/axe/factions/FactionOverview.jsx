import {useEffect,useState} from 'react';
import {Crown,Shield,Users,Flag,Zap,CalendarDays,Radio,RefreshCw} from 'lucide-react';
import {AXE_FACTIONS} from './AXEFactionWeaponConfig';
import {getActiveCharacter,subscribeCharacters} from '../../characterStore';
import {callGameServer} from '../../social/socialServer';
import {normalizeFactionOverview,formatFactionMetric} from './factionOverviewModel.mjs';
import './FactionOverview.css';

const FACTION_IDS=AXE_FACTIONS.map(faction=>faction.id);
const empty=()=>normalizeFactionOverview(null,FACTION_IDS);

export default function FactionOverview(){
  const [character,setCharacter]=useState(getActiveCharacter);
  const [rows,setRows]=useState(empty);
  const [loading,setLoading]=useState(false);
  const [notice,setNotice]=useState('Faction-wide statistics require a connected game server.');
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>subscribeCharacters(()=>setCharacter(getActiveCharacter())),[]);
  useEffect(()=>{
    let live=true;
    setLoading(true);
    // This read contract intentionally does not grant any faction leadership,
    // votes or announcements. A server that has not installed the faction
    // service will reject it; we show unavailable instead of invented counts.
    callGameServer('factionSystem','overview',{}).then(data=>{
      if(!live)return;
      setRows(normalizeFactionOverview(data,FACTION_IDS));
      setNotice('');
    }).catch(()=>{
      if(!live)return;
      setRows(empty());
      setNotice('Live faction totals and elections are awaiting server support.');
    }).finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[refresh]);
  const current=AXE_FACTIONS.find(f=>f.id===character?.factionId);
  return <section className="axe-faction-overview" aria-label="Faction overview">
    <div className="axe-faction-overview__intro">
      <div>
        <span className="axe-faction-overview__eyebrow">FACTION COMMAND</span>
        <h3>Faction Overview</h3>
        <p>{current?<>You belong to <strong>{current.displayName}</strong>.</>:'Select a faction for your character to participate.'}
          {' '}World population, gear power, leadership, and objective bonuses update when verified server data is available.</p>
      </div>
      <button type="button" aria-label="Refresh faction statistics" title="Refresh statistics"
        onClick={()=>setRefresh(value=>value+1)} disabled={loading}><RefreshCw size={18}/></button>
    </div>
    {notice&&<p className="axe-faction-overview__notice" role="status">{notice}</p>}
    <div className="axe-faction-overview__grid">
      {AXE_FACTIONS.map((faction,index)=>{
        const row=rows[index];
        return <article key={faction.id} className={'axe-faction-overview__card'+(current?.id===faction.id?' is-mine':'')}>
          <div className="axe-faction-overview__card-head">
            <span className="axe-faction-overview__index">0{index+1}</span>
            <div><strong>{faction.displayName}</strong><small>{current?.id===faction.id?'Your faction':'World faction'}</small></div>
            <Flag size={20} aria-hidden="true"/>
          </div>
          <dl className="axe-faction-overview__stats">
            <div><dt><Users size={14}/> Online</dt><dd>{formatFactionMetric(row?.online)}</dd></div>
            <div><dt>Members</dt><dd>{formatFactionMetric(row?.members)}</dd></div>
            <div><dt><Zap size={14}/> Total gear power</dt><dd>{formatFactionMetric(row?.power)}</dd></div>
          </dl>
          <div className="axe-faction-overview__leadership">
            <span><Crown size={15}/> Faction Leader</span>
            <strong>{row?.leader||'Not announced'}</strong>
            <span><Shield size={15}/> Vice Faction Leaders</span>
            <p>{row?.deputies?.length?row.deputies.join(' · '):'No verified appointments'}</p>
          </div>
          <div className="axe-faction-overview__bonuses">
            <span>Objective bonuses</span>
            {row?.bonuses?.length?row.bonuses.map(bonus=><div key={bonus.label}>
              <span>{bonus.label}</span><strong>+{bonus.percent}%</strong>
            </div>):<p>No active server-confirmed buffs.</p>}
          </div>
        </article>;
      })}
    </div>
    <div className="axe-faction-overview__bottom">
      <div><CalendarDays size={20}/><div><strong>Monthly faction elections</strong>
        <p>Members will vote for a faction leader each month; leaders will appoint vice leaders. Voting is not enabled until the server verifies eligibility and enforces one vote per eligible character.</p></div></div>
      <div><Radio size={20}/><div><strong>Faction command broadcasts</strong>
        <p>Leaders and appointed vice leaders will be able to send faction-wide calls for help. The server must verify the sender’s current rank before delivering an announcement.</p></div></div>
    </div>
    <p className="axe-faction-overview__footnote">Inspired by faction leadership and elections in Twelve Sky 2. No faction scores, votes, buffs, or leadership privileges are calculated or granted by the browser.</p>
  </section>;
}
