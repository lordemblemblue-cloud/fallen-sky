// Read-only, server-sourced faction dashboard model. Never calculate a
// world-wide player count or collective power from a single browser's roster.
// Elections, leadership appointments, buffs and announcements must all be
// checked by the authoritative multiplayer backend (not this UI).
export function formatFactionMetric(value) {
  return Number.isFinite(value)&&value>=0 ? Math.floor(value).toLocaleString('en-US') : '—';
}
const safeName=value=>typeof value==='string'&&value.trim()?
  value.trim().slice(0,48):null;
const safeValue=value=>Number.isFinite(value)&&value>=0?Math.floor(value):null;

export function normalizeFactionOverview(response, factionIds=[]) {
  const rows=Array.isArray(response?.factions)?response.factions:[];
  const byId=new Map(rows.filter(row=>row&&typeof row.id==='string').map(row=>[row.id,row]));
  return factionIds.map(id=>{
    const source=byId.get(id)||{};
    const bonusRows=Array.isArray(source.bonuses)?source.bonuses:[];
    const bonuses=bonusRows.slice(0,8).filter(item=>item&&typeof item.label==='string'&&
      Number.isFinite(item.percent)&&item.percent>=0&&item.percent<=200).map(item=>({
        label:item.label.slice(0,60),percent:item.percent,
      }));
    return {
      id,
      online:safeValue(source.online),
      members:safeValue(source.members),
      power:safeValue(source.power),
      leader:safeName(source.leader),
      deputies:Array.isArray(source.deputies)?source.deputies.map(safeName).filter(Boolean).slice(0,12):[],
      bonuses,
      votingOpen:source.votingOpen===true,
      electionEndsAt:typeof source.electionEndsAt==='string'?source.electionEndsAt:null,
    };
  });
}

export function computeFactionPower(members=[]) {
  if(!Array.isArray(members))return null;
  return members.reduce((sum,member)=>{
    const power=Number(member?.verifiedGearScore);
    return sum+(Number.isFinite(power)&&power>0?Math.floor(power):0);
  },0);
}
