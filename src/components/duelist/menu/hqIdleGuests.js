// Optional Fallen Sky cameos: same HQ scene, no locomotion, AI, combat or renderer.
export const HQ_GUESTS = Object.freeze([
  Object.freeze({ bodyId: 'female', name: 'Eve', classId: 'healer', x: 2.35, z: 0.35, yaw: -0.20 }),
  Object.freeze({ bodyId: 'male', name: 'Adam', classId: 'warrior', x: -2.45, z: -0.65, yaw: 0.26 }),
]);
export function hqGuestSlots(selected, mobile = false) {
  return HQ_GUESTS.filter(guest => guest.bodyId !== selected).slice(0, mobile ? 1 : 2);
}
export function createHQIdleGuests({ THREE, scene, selected, mobile = false, reducedMotion = false, loadBody, prepareIdle }) {
  const root = new THREE.Group();
  root.name = 'HQ_FallenSkyIdleGuests';
  scene.add(root);
  const actors = [];
  let disposed = false, enabled = true, frozen = reducedMotion, accumulator = 0, generation = 0;
  let slow = 0, budgetLevel = 0;
  const removeActor = actor => {
    actor.pose.dispose();
    root.remove(actor.anchor);
    // Body geometry, materials and textures are owned by the shared asset cache.
    // Only cloned skeleton bone textures belong to this individual actor.
    actor.model.traverse(node => { if (node.isSkinnedMesh) node.skeleton?.dispose(); });
  };
  const clear = () => { generation++; for (const actor of actors.splice(0)) removeActor(actor); };
  const slots = hqGuestSlots(selected, mobile);
  return {
    root,
    async start() {
      const run = ++generation;
      for (const slot of slots) {
        if (disposed || !enabled || run !== generation) return;
        let body, pose;
        try {
          body = await loadBody(slot.bodyId);
          if (disposed || !enabled || run !== generation) continue;
          pose = await prepareIdle({model:body.model,bodyId:slot.bodyId,classId:slot.classId,embeddedIdle:body.clips?.idle,armed:false});
          if (disposed || !enabled || run !== generation) { pose.dispose(); continue; }
          // Different initial times, but no route, translation or root motion.
          if (!reducedMotion) pose.update(slot.bodyId === 'female' ? 0.43 : 1.19);
          const anchor = new THREE.Group();
          anchor.name = 'HQ_Idle_' + slot.name;
          anchor.position.set(slot.x, 0.014, slot.z);
          anchor.rotation.y = slot.yaw;
          anchor.add(body.model);
          root.add(anchor);
          actors.push({anchor,model:body.model,pose});
        } catch { pose?.dispose(); /* Missing optional guest must not affect Home. */ }
      }
    },
    update(dt) {
      if (disposed || !enabled || frozen) return;
      accumulator += Math.max(0, Math.min(0.15, Number(dt) || 0));
      if (accumulator < 1 / 8) return;
      const step = accumulator; accumulator = 0;
      for (const actor of actors) actor.pose.update(step);
    },
    reportFrame(ms, dt) {
      if (disposed || !enabled || !Number.isFinite(ms) || !Number.isFinite(dt)) return;
      slow = ms > 40 ? slow + Math.min(dt, .2) : Math.max(0, slow - dt * 2);
      if (slow < 3) return;
      slow = 0;
      if (budgetLevel === 0) { frozen = true; budgetLevel = 1; }
      else if (budgetLevel === 1) { budgetLevel = 2; generation++; if (actors.length > 1) removeActor(actors.pop()); }
      else { budgetLevel = 3; clear(); }
    },
    setActive(value) { if(disposed)return; enabled=!!value; root.visible=enabled; accumulator=0; if(!enabled)clear(); },
    get count() { return enabled ? actors.length : 0; },
    dispose() { if(disposed)return; disposed=true;clear();root.removeFromParent(); },
  };
}
