// Display contract for trusted gameplay announcements. Text is constructed
// from a closed set of server event kinds, never from arbitrary chat content.
export const WORLD_ANNOUNCEMENT_KINDS=Object.freeze([
  'item_acquired','dungeon_cleared','player_kill','killing_spree',
]);
const clean=(v,max=56)=>{
  if(typeof v!=='string')return '';
  return v.replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,max);
};
export function worldAnnouncementFromReceipt(raw){
  if(!raw||!WORLD_ANNOUNCEMENT_KINDS.includes(raw.kind))return null;
  const actor=clean(raw.actorName),target=clean(raw.targetName),
    item=clean(raw.itemName),dungeon=clean(raw.dungeonName);
  let title='',description='',tone='gold';
  if(raw.kind==='item_acquired'&&actor&&item){
    title='Rare Discovery';description=actor+' acquired '+item; 
  }else if(raw.kind==='dungeon_cleared'&&actor&&dungeon){
    title='Dungeon Cleared';description=actor+' cleared '+dungeon;
  }else if(raw.kind==='player_kill'&&actor&&target){
    title='Player Killer';description=actor+' defeated '+target+' in PvP';tone='red';
  }else if(raw.kind==='killing_spree'&&actor&&
    Number.isSafeInteger(raw.streak)&&raw.streak>=3){
    title='Killing Spree';description=actor+' is on a '+raw.streak+'-kill spree';tone='red';
  }else return null;
  return Object.freeze({kind:raw.kind,title,description,tone});
}
