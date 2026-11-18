import { GAME2_MISSION_ARCHIVE } from './engine/missionArchive.js';

// A mission window receives only a whitelisted map ID. The player's saber
// and 360-degree experimental combat controls are managed in the game. No
// arbitrary URL, server address, token, or private asset URI is accepted.
export const MISSION_LAUNCH_KEY='game2Mission';
export const MISSION_RETURN_CHANNEL='atomxe-game2-mission-return';
export function notifyMissionReturn(createChannel=typeof BroadcastChannel==='undefined'?null:(name=>new BroadcastChannel(name))) {
  if(!createChannel)return false;
  try {const channel=createChannel(MISSION_RETURN_CHANNEL);channel.postMessage({type:'return-to-jedi-duels'});channel.close?.();return true;}
  catch {return false;}
}
export function parseMissionWindow(search) {
  const params=new URLSearchParams(String(search||'').replace(/^\?/,''));
  const id=params.get(MISSION_LAUNCH_KEY);
  if(!id||!Object.hasOwn(GAME2_MISSION_ARCHIVE,id))return null;
  return {choice:'archive',mapId:id};
}
export function missionWindowUrl(currentUrl,id) {
  if(!Object.hasOwn(GAME2_MISSION_ARCHIVE,id))throw Error('Unknown mission selected');
  // Always open the actual Game 2 route, not the parent app/editor's
  // current path or query (which may contain obsolete flags or session data).
  const url=new URL('/Game2',currentUrl);
  url.searchParams.set(MISSION_LAUNCH_KEY,id);
  url.hash='';
  return url;
}
export function openMissionWindow(currentUrl,id,_legacySaber,open) {
  const url=missionWindowUrl(currentUrl,id);
  const popup=open(url.href,'atomxe_game2_mission_'+id,'popup=yes,resizable=yes,scrollbars=no,width=1280,height=800');
  if(!popup)return {opened:false,url:url.href};
  try{popup.opener=null;}catch{/* popup isolation may be restricted */}
  try{popup.focus();}catch{/* focus denied by browser */}
  return {opened:true,url:url.href};
}
