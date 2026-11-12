// 14.4 optional private encounter inspector. NOT mounted in GameView or HUD.
// Displays only the separate authoritative 13.7 read model: never mutates
// live health, world transforms, quest kill counts, XP, loot, or currency.
import React,{useSyncExternalStore} from 'react';
const EMPTY_VIEW=Object.freeze({
 mode:'disconnected',snapshot:null,cursor:0,effects:[],lastError:null,
});
const empty=()=>EMPTY_VIEW;
export default function PrivateWorldHUDPreview144({
 view,previewEnabled=false,
}={}){
 const state=useSyncExternalStore(
  cb=>view?.subscribe?.(()=>cb())??(()=>{}),
  ()=>view?.getState?.()??empty(),
  empty,
 );
 if(!previewEnabled||!view)return null;
 const {snapshot,effects=[]}=state;
 return (
  <aside aria-label="Private server encounter preview"
   data-game3d-private-world-preview="14.4"
   className="pointer-events-none rounded-xl border border-white/20 bg-black/80 text-white p-3 max-w-sm text-xs space-y-2">
   <div className="font-semibold tracking-wider">PRIVATE WORLD PREVIEW · NO REWARDS</div>
   <div aria-live="polite">{state.mode==='connected'?'Server preview connected':
    'Private preview disconnected'}</div>
   {snapshot&&(
    <>
     <div>Player HP: {Math.round(snapshot.player.hp)} / {Math.round(snapshot.player.maxHp)}</div>
     <div>Will: {Math.round(snapshot.player.stamina)}%</div>
     <div>Position: {snapshot.player.x.toFixed(1)}, {snapshot.player.z.toFixed(1)}</div>
     <div>Event cursor: {state.cursor} / {snapshot.eventSeq}</div>
     <ul className="space-y-1">
      {snapshot.enemies.map(e=>(
       <li key={e.id}>
        {e.id}: {Math.round(e.hp)} / {Math.round(e.maxHp)} HP
        {!e.alive?' · defeated':''}
       </li>
      ))}
     </ul>
     <div aria-label="Recent server combat events">
      {effects.map(e=>(
       <div key={e.seq}>
        #{e.seq} {e.kind.replaceAll('_',' ')}
        {Number.isFinite(e.damage)?` · ${Math.round(e.damage)} damage`:''}
       </div>
      ))}
     </div>
    </>
   )}
   {state.lastError&&(
    <div role="status">Reconciliation: {state.lastError.replaceAll('_',' ')}</div>
   )}
  </aside>
 );
}
