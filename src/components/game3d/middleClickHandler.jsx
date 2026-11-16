import * as THREE from 'three';
import { setTarget, clearTarget } from './abilityStore';

const raycaster = new THREE.Raycaster();

/**
 * Handle a middle-click lock-on in the 3D game world. Priority:
 *   1. Hits on a remote player → lock camera/combat target.
 *   2. Hits on an enemy → lock camera/combat target.
 *   3. Empty space → clear current target.
 */
export function handleMiddleClick({ event, renderer, camera, enemies, remoteManager, setPlayerMenu, rogues = [], bosses = [], clearOnMiss = true }) {
  const rect = renderer.domElement.getBoundingClientRect();
  // A pointer-locked game has no movable cursor: select the reticle center.
  const locked=typeof document!=='undefined'&&document.pointerLockElement===renderer.domElement;
  const ndcX = locked ? 0 : ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = locked ? 0 : -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);

  // 1. Remote players first
  const remoteMeshes = remoteManager ? remoteManager.getMeshes() : [];
  if (remoteMeshes.length > 0) {
    const remoteHits = raycaster.intersectObjects(remoteMeshes, false);
    if (remoteHits.length > 0) {
      const hitMesh = remoteHits[0].object;
      const pid = hitMesh.userData?.remotePlayerId;
      const pname = hitMesh.userData?.remotePlayerName || 'Player';
      if (pid) {
        // PvP uses explicit lock-on. Middle-click selects the player only;
        // it never deals damage by itself. Basic attacks and offensive abilities
        // are validated against this locked target later in GameWorld3D.
        // Also set the player as the active ability target so targeted skills
        // (e.g. Lightning Strike, Frost Tornado) know the target is a player
        // and apply their PvP effect instead of enemy damage.
        setTarget({
          id: pid,
          name: pname,
          kind: 'player',
        });
        const remote = remoteManager?.getRemotes?.()?.get(pid);
        return remote?.group ? {
          id: pid,
          group: remote.group,
          name: pname,
          kind: 'player',
          aliveRef: () => remoteManager?.getRemotes?.()?.has(pid),
        } : null;
      }
    }
  }

  // 2. Hostile AI and bosses. Raycast the roots once and walk the winning
  // hit's parent chain, instead of building every skinned submesh list and
  // traversing every enemy again on EVERY held basic-attack click.
  const byRoot=new Map();
  for(const en of [...enemies,...rogues,...bosses]){
    if(!en?.alive||en.dying||en.defeated||en.group?.visible===false||!en.group)continue;
    byRoot.set(en.group,en);
  }
  const hits=byRoot.size?raycaster.intersectObjects([...byRoot.keys()],true):[];
  if(hits.length){
    let node=hits[0].object;
    let foundEnemy=null;
    while(node&&!foundEnemy){
      foundEnemy=byRoot.get(node)||null;
      node=node.parent;
    }
    if(foundEnemy){
      const isWorldBoss=!!foundEnemy.isBoss;
      const targetKind=isWorldBoss?'boss':
        foundEnemy.color!==undefined?'rogue':'enemy';
      setTarget({
        id:foundEnemy.id,
        name:foundEnemy.name || foundEnemy.bossName ||
          (foundEnemy.tier?foundEnemy.tier.charAt(0).toUpperCase()+
            foundEnemy.tier.slice(1)+' Enemy':'Enemy'),
        kind:targetKind,hp:foundEnemy.hp,maxHp:foundEnemy.maxHp,
        level:foundEnemy.level,
        tier:isWorldBoss?'boss':(foundEnemy.tier||
          (foundEnemy.color!==undefined?'rogue':'normal')),
        bossName:foundEnemy.bossName||foundEnemy.name||null,
      });
      return {
        id:foundEnemy.id,group:foundEnemy.group,
        name:foundEnemy.name||foundEnemy.bossName||'Enemy',
        kind:targetKind,
        aliveRef:()=>!!foundEnemy.alive&&!foundEnemy.dying&&
          foundEnemy.group?.visible!==false,
      };
    }
  }

  // A normal left click on empty terrain must never clear a deliberate lock.
  if (!clearOnMiss) return null;
  // 3. Empty middle click → clear
  clearTarget();
  setPlayerMenu?.(null);
  return null;
}
