// Cosmetic shared-world presence only. Never use these IDs or positions for
// account identity, damage, quests, inventory, rewards, or admin privileges.
import { randomUUID } from 'node:crypto';
export const WORLD_CAPACITY = 20;
export const WORLD_SCENES = Object.freeze(['wolfveil:all','wolfveil:town','wolfveil:south','wolfveil:west','wolfveil:east','wolfveil:north','lunar-cave','astral-dungeon','wolfveil-caves']);
const sceneSet = new Set(WORLD_SCENES);
const poseKeys = ['t','scene','x','y','z','yaw','anim'];
export function parseWorldPose(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet) ||
      Object.keys(packet).length !== poseKeys.length ||
      !poseKeys.every(key => Object.hasOwn(packet,key)) || packet.t !== 'pose' ||
      !sceneSet.has(packet.scene) || ![packet.x,packet.y,packet.z,packet.yaw].every(Number.isFinite) ||
      Math.max(Math.abs(packet.x),Math.abs(packet.y),Math.abs(packet.z)) > 10000 ||
      Math.abs(packet.yaw) > 100000 ||
      typeof packet.anim !== 'string' || !/^[A-Za-z0-9_-]{1,48}$/.test(packet.anim)) return null;
  return {scene:packet.scene,x:packet.x,y:packet.y,z:packet.z,
    yaw:Math.atan2(Math.sin(packet.yaw),Math.cos(packet.yaw)),anim:packet.anim};
}
export function createPublicWorldPresence({capacity=WORLD_CAPACITY,clock=Date.now}={}) {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > WORLD_CAPACITY) throw new RangeError('invalid capacity');
  const peers = new Map();
  return {
    admit() {
      if (peers.size >= capacity) return null;
      const id = 'presence-' + randomUUID();
      peers.set(id,{id,pose:null,updated:clock()});
      return id;
    },
    update(id,packet) {
      const peer = peers.get(id);
      const pose = parseWorldPose(packet);
      if (!peer || !pose) return false;
      peer.pose=pose;peer.updated=clock();return true;
    },
    leave(id) { return peers.delete(id); },
    get count() { return peers.size; },
    get capacity() { return capacity; },
    snapshot(id) {
      const viewer=peers.get(id);
      if (!viewer) return null;
      const scene=viewer.pose?.scene ?? null;
      const players=[];
      if (scene) for (const peer of peers.values()) {
        if (peer.id===id || peer.pose?.scene!==scene) continue;
        const {x,y,z,yaw,anim}=peer.pose;
        players.push({player_id:peer.id,display_name:'Traveler '+peer.id.slice(-4),x,y,z,yaw,anim,last_update:peer.updated});
      }
      return {t:'presence',scene,count:peers.size,max:capacity,players};
    },
  };
}
