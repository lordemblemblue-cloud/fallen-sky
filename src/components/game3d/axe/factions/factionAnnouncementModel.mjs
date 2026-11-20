// A ticker can only display a faction announcement returned by the
// authoritative server. A client-created event is never sufficient.
export function normalizeVerifiedFactionAnnouncement(value,factionId,now=Date.now()){
  if(!value||!factionId||value.factionId!==factionId||
    value.authorized!==true||
    !['leader','vice'].includes(value.senderRole)||
    typeof value.id!=='string'||!value.id.trim()||
    typeof value.text!=='string'||!value.text.trim())return null;
  const expiresAt=Date.parse(value.expiresAt);
  if(!Number.isFinite(expiresAt)||expiresAt<=now||expiresAt>now+60*60*1000)return null;
  return {
    id:value.id.slice(0,100),
    factionId,
    text:value.text.trim().slice(0,180),
    senderName:typeof value.senderName==='string'?
      value.senderName.trim().slice(0,40):'Faction Command',
    senderRole:value.senderRole,
    expiresAt,
  };
}
