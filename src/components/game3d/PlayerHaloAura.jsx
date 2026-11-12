// ─── PlayerHaloAura ──────────────────────────────────────────────────────
// Liquid-glass angelic halo floating directly above the local player's head.
// Mounts a Three.js group into the live scene (window.__gw3dScene) and each
// frame anchors it to the player's world position (window.__localPlayerPos),
// keeping the halo perfectly centered above the model's head as the player
// moves and rotates.
//
// Detail tiers (visual quality) — more ornate as Halo level rises:
//   L1–29   → tier 1 (single liquid-glass ring, ~70% smaller than before)
//   L30–69  → tier 2 (adds inner concentric ring)
//   L70–99  → tier 3 (adds orbiting glass shards / motes)
//   L100–129→ tier 4 (adds a second elevated ring layer)
//   L130–169→ tier 5 (adds delicate cross-band arcs)
//   L170+   → tier 6 (full celestial — more motes, more layers, brighter)
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { getPlayerPosition } from './playerPositionStore';
import { subscribeHalo } from './progression/haloStore';
import { GAME3D_SHARED_SPIRITUAL_ASSETS } from './axe/factions/AXEFactionMountAssets.mjs';

// Player model head offset (matches the archer scaling in GameWorld3D — 1.7u tall).
const HEAD_OFFSET_Y = 2.05;

// Crown is a real user-uploaded 3D wearable; shared by every faction.
// The older approved crown remains a fallback for this character's halo slot.
export const HALO_GLB_URL = GAME3D_SHARED_SPIRITUAL_ASSETS.halo;
export const HALO_GLB_BACKUP_URL =
  'https://media.base44.com/files/public/6876751a602125f45f1861b9/abd8bcc4e_spiritual_winged_halo_CORRECTED_3D_8K.glb';
// New source bounds: 0.984 × 0.551 × 0.542 units, Y-up. Scaled to a
// ~0.74m head-wrapping circlet. Older fallback is larger in source units.
export const HALO_GLB_SCALE = 0.75;
const LEGACY_HALO_GLB_SCALE = 0.13;

// Decide visual tier from halo level.
const tierForLevel = (lvl) => {
  if (lvl >= 170) return 6;
  if (lvl >= 130) return 5;
  if (lvl >= 100) return 4;
  if (lvl >= 70)  return 3;
  if (lvl >= 30)  return 2;
  return 1;
};

export default function PlayerHaloAura() {
  const levelRef = useRef(0);
  const settingsRef = useRef({ hidden: false, lowEffects: false });

  useEffect(() => {
    let frameId = null;
    let mounted = true;
    let scene = null;
    let group = null;
    let currentTier = 0;
    let parts = null; // { mainRing, innerRing, outerRing, motes:[], arcs:[], glow }
    let timeRef = 0;
    let model = null;
    let modelLoading = false;
    let orbitalDetails = [];
    let sceneReadyListener = null;

    // ── Build a liquid-glass ring (physical-material with transmission) ──
    const makeGlassRing = (radius, tubeRadius, color = 0xfff2a8, opacity = 0.85) => {
      const geo = new THREE.TorusGeometry(radius, tubeRadius, 24, 96);
      // No `transmission` — it forces a full extra scene render pass per frame.
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.15,
        metalness: 0.0,
        emissive: color,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = Math.PI / 2; // Lay flat above the head.
      return m;
    };

    // ── Build a soft additive glow ring (gives the “light” feel) ──
    const makeGlowRing = (radius, tubeRadius, color = 0xfff4c0, opacity = 0.35) => {
      const geo = new THREE.TorusGeometry(radius, tubeRadius, 14, 48);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = Math.PI / 2;
      return m;
    };

    // ── A tiny glass mote (sphere) that orbits the halo ──
    const makeMote = (color = 0xfff4c0) => {
      const geo = new THREE.SphereGeometry(0.012, 10, 10);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.1,
        emissive: color,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.9,
      });
      return new THREE.Mesh(geo, mat);
    };

    // ── A delicate cross arc (a thin partial torus) ──
    const makeArc = (radius, color = 0xfff4c0) => {
      // Use a thin torus with reduced arc length for an "arc" feel.
      const geo = new THREE.TorusGeometry(radius, 0.008, 8, 64, Math.PI * 0.6);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      return new THREE.Mesh(geo, mat);
    };

    // Dispose helper.
    const disposeNode = (n) => {
      if (!n) return;
      n.traverse?.((c) => {
        if (c.geometry) c.geometry.dispose?.();
        if (c.material) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach((m) => m.dispose?.());
        }
      });
    };

    // Once the 3D GLB is ready, remove the legacy procedural placeholder.
    const clearFallback = () => {
      if (!parts || !group) return;
      Object.values(parts).forEach((part) => {
        if (Array.isArray(part)) part.forEach((m) => { group.remove(m); disposeNode(m); });
        else if (part) { group.remove(part); disposeNode(part); }
      });
      parts = null;
    };

    // Lazy-load once a player has a nonzero Halo level. This avoids loading
    // its embedded 8K map for characters who have not unlocked a halo.
    const loadWearableHalo = () => {
      if (modelLoading || model || !group || levelRef.current <= 0) return;
      modelLoading = true;
      const loader = new GLTFLoader();
      const onLoaded = (gltf, legacy = false) => {
          const wearable = gltf.scene;
          if (!mounted || !group || !group.parent) {
            disposeNode(wearable);
            return;
          }
          wearable.name = 'SpiritualHaloWingedCrownGLB';
          // Preserve the genuine 3D ring and side wings, not a billboard.
          // The new crown straddles the head; legacy backup keeps its old fit.
          wearable.scale.setScalar(legacy ? LEGACY_HALO_GLB_SCALE : HALO_GLB_SCALE);
          wearable.position.y = legacy ? 0 : -0.32;
          orbitalDetails = [];
          wearable.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow = false;
            node.receiveShadow = false;
            if (/orbital|soul_orbit|spirit_flow|energy/i.test(node.name)) {
              orbitalDetails.push(node);
            }
          });
          group.add(wearable);
          model = wearable;
          clearFallback();
      };
      loader.load(HALO_GLB_URL, onLoaded, undefined, () => {
        // Asset mirroring to GitHub may lag behind the source branch.
        // The original GLB is already hosted in our own AXE media library.
        loader.load(HALO_GLB_BACKUP_URL, (gltf) => onLoaded(gltf, true), undefined, (error) => {
          console.warn('[Game 3D Halo] GLB unavailable; retaining procedural fallback.', error);
        });
      });
    };

    // (Re)build the halo for the given visual tier.
    const buildForTier = (tier) => {
      // Tiered legacy fallback is only needed if no GLB has loaded.
      if (model) return;
      clearFallback();
      parts = { mainRing: null, innerRing: null, outerRing: null, motes: [], arcs: [], glow: null };

      // Base sizes — original was r=0.32. Reduced by ~70% → 0.10.
      const baseR = 0.10;
      const tubeR = 0.014;

      // Main liquid-glass halo (always present)
      parts.mainRing = makeGlassRing(baseR, tubeR, 0xfff2a8, 0.9);
      group.add(parts.mainRing);

      // Subtle outer glow (always present, but grows with tier)
      const glowR = baseR + 0.012;
      const glowTube = 0.026 + tier * 0.004;
      parts.glow = makeGlowRing(glowR, glowTube, 0xfff4c0, 0.30 + tier * 0.03);
      group.add(parts.glow);

      // Tier 2+: inner concentric ring
      if (tier >= 2) {
        parts.innerRing = makeGlassRing(baseR * 0.62, tubeR * 0.7, 0xfffbe0, 0.85);
        group.add(parts.innerRing);
      }

      // Tier 3+: orbiting glass motes — count scales with tier
      if (tier >= 3) {
        const moteCount = tier === 3 ? 6 : tier === 4 ? 8 : tier === 5 ? 10 : 14;
        for (let i = 0; i < moteCount; i++) {
          const mote = makeMote(0xfff4c0);
          mote.userData.phase = (i / moteCount) * Math.PI * 2;
          mote.userData.orbitR = baseR + 0.025;
          parts.motes.push(mote);
          group.add(mote);
        }
      }

      // Tier 4+: second elevated ring layer (slightly above the main)
      if (tier >= 4) {
        parts.outerRing = makeGlassRing(baseR * 1.18, tubeR * 0.6, 0xfff2a8, 0.7);
        parts.outerRing.position.y = 0.02;
        group.add(parts.outerRing);
      }

      // Tier 5+: cross-band arcs (3 arcs, gently tilted)
      if (tier >= 5) {
        for (let i = 0; i < 3; i++) {
          const arc = makeArc(baseR * 1.05, 0xfff4c0);
          arc.rotation.x = Math.PI / 2;
          arc.rotation.z = (i / 3) * Math.PI * 2;
          arc.userData.spin = 0.4 + i * 0.15;
          parts.arcs.push(arc);
          group.add(arc);
        }
      }

      // Tier 6: brighter overall + extra arcs
      if (tier >= 6) {
        for (let i = 0; i < 3; i++) {
          const arc = makeArc(baseR * 1.22, 0xffffff);
          arc.rotation.x = Math.PI / 2;
          arc.rotation.z = (i / 3) * Math.PI * 2 + Math.PI / 6;
          arc.userData.spin = -0.55 - i * 0.1;
          parts.arcs.push(arc);
          group.add(arc);
        }
        if (parts.glow?.material) parts.glow.material.opacity = 0.55;
      }

      currentTier = tier;
    };

    const attachToScene = () => {
      scene = window.__gw3dScene;
      if (!scene) return false;
      group = new THREE.Group();
      group.visible = false;
      scene.add(group);
      buildForTier(tierForLevel(levelRef.current));
      loadWearableHalo();
      return true;
    };

    if (!attachToScene()) {
      sceneReadyListener = () => {
        if (!mounted) return;
        if (attachToScene()) {
          window.removeEventListener('gw3dSceneReady', sceneReadyListener);
          sceneReadyListener = null;
        }
      };
      window.addEventListener('gw3dSceneReady', sceneReadyListener);
    }

    // Track halo level — rebuild visuals when the tier changes.
    const unsubHalo = subscribeHalo((s) => {
      const lvl = s.level || 0;
      levelRef.current = lvl;
      settingsRef.current = { hidden: !!s.hidden, lowEffects: !!s.lowEffects };
      if (!group || lvl <= 0) return;
      loadWearableHalo();
      const wantTier = tierForLevel(lvl);
      if (!model && wantTier !== currentTier) buildForTier(wantTier);
    });

    let last = performance.now();
    const tick = () => {
      if (!mounted) return;
      frameId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      timeRef += dt;

      if (!group) return;
      const pos = window.__localPlayerPos;
      const level = levelRef.current;

      if (!pos || level <= 0 || settingsRef.current.hidden) {
        group.visible = false;
        return;
      }
      group.visible = true;

      // Anchor directly above the player's head.
      group.position.set(pos.x, pos.y + HEAD_OFFSET_Y, pos.z);

      // Gentle bob
      group.position.y += Math.sin(timeRef * 1.6) * 0.02;

      // Real GLB orientation follows player yaw, without rolling the crown.
      if (model) {
        model.rotation.y = getPlayerPosition().yaw || 0;
        for (const detail of orbitalDetails) {
          detail.visible = !settingsRef.current.lowEffects;
        }
        return;
      }

      // Legacy fallback only: slow ring spin.
      if (parts?.mainRing) parts.mainRing.rotation.z =  timeRef * 0.55;
      if (parts?.innerRing) parts.innerRing.rotation.z = -timeRef * 0.85;
      if (parts?.outerRing) parts.outerRing.rotation.z =  timeRef * 0.30;
      if (parts?.glow) parts.glow.rotation.z = -timeRef * 0.25;

      // Orbiting motes
      if (parts?.motes?.length) {
        for (let i = 0; i < parts.motes.length; i++) {
          const m = parts.motes[i];
          const ang = m.userData.phase + timeRef * 1.2;
          const r = m.userData.orbitR;
          m.position.set(Math.cos(ang) * r, Math.sin(timeRef * 2 + i) * 0.008, Math.sin(ang) * r);
        }
      }

      // Arcs spin
      if (parts?.arcs?.length) {
        for (let i = 0; i < parts.arcs.length; i++) {
          parts.arcs[i].rotation.z += parts.arcs[i].userData.spin * dt;
        }
      }

      // Subtle level-based brightness pulse
      if (parts?.mainRing?.material) {
        parts.mainRing.material.emissiveIntensity = 0.55 + Math.sin(timeRef * 2) * 0.10 + Math.min(0.4, level * 0.003);
      }
      if (parts?.glow?.material) {
        parts.glow.material.opacity = 0.28 + Math.sin(timeRef * 1.4) * 0.08 + Math.min(0.25, level * 0.002);
      }
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      mounted = false;
      if (frameId) cancelAnimationFrame(frameId);
      unsubHalo();
      if (sceneReadyListener) window.removeEventListener('gw3dSceneReady', sceneReadyListener);
      if (group && group.parent) group.parent.remove(group);
      if (group) {
        const maps = new Set();
        group.traverse((node) => {
          if (!node.material) return;
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const material of materials) {
            for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
              if (material[key]) maps.add(material[key]);
            }
          }
        });
        disposeNode(group);
        maps.forEach((texture) => texture.dispose());
      }
    };
  }, []);

  return null;
}