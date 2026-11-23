/* global document */
// What a match adds to the arena: name tags over the other fighters, and for capture the flag the two
// bases (a ring of light and a crystal plinth) and the flags (a crystal standard with a waving banner)
// that sit at home, lie where they were dropped, or ride on the carrier's back.
import * as THREE from 'three';
import { setNodeTwin } from '../../../lib/webgpuMaterialTwins.js';
import { bannerTwin } from './duelistNodes.mjs';

export const TEAM_COLORS = Object.freeze({ red: 0xff6f61, blue: 0x5fb4ff });
const FFA_COLORS = [0xff8a7a, 0xffd36a, 0xa48bff, 0x7dffb0, 0xff7ad9, 0xc4ff6a, 0xffffff, 0x9fe8ff];
export const fighterColor = (team, index) => (team ? TEAM_COLORS[team] : FFA_COLORS[index % FFA_COLORS.length]);

/** Opponent name tags and readable overhead health tanks; no new world UI panels. */
export function createNameTags(scene) {
  const tags = new Map();
  const make = (name, hex, enemy) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '600 30px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(5, 10, 18, 0.85)';
    ctx.strokeText(name, 128, 34);
    ctx.fillStyle = `#${new THREE.Color(hex).getHexString()}`;
    ctx.fillText(name, 128, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.35, 0.34, 1);
    sprite.renderOrder = 10;
    scene.add(sprite);

    // One extra sprite follows the same fighter. Repaint its texture only when
    // rounded HP changes, not on every rendered frame or network snapshot.
    const healthCanvas = document.createElement('canvas');
    healthCanvas.width = 512;
    healthCanvas.height = 104;
    const healthCtx = healthCanvas.getContext('2d');
    const healthTexture = new THREE.CanvasTexture(healthCanvas);
    healthTexture.colorSpace = THREE.SRGBColorSpace;
    const healthMaterial = new THREE.SpriteMaterial({
      map: healthTexture, depthTest: false, transparent: true, depthWrite: false,
    });
    const healthSprite = new THREE.Sprite(healthMaterial);
    healthSprite.scale.set(1.85, 0.38, 1); // substantial at real combat distances
    healthSprite.renderOrder = 11;
    healthSprite.visible = false;
    scene.add(healthSprite);
    return {
      sprite, texture, material, healthCtx, healthTexture, healthMaterial,
      healthSprite, lastHealth: null, enemy,
    };
  };

  const paintHealth = (tag, hp, maxHp) => {
    if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
      tag.healthSprite.visible = false;
      return;
    }
    const current = Math.max(0, Math.min(maxHp, hp));
    const percent = current / maxHp;
    const roundedHp = Math.ceil(current);
    const roundedMax = Math.ceil(maxHp);
    const key = `${roundedHp}:${roundedMax}`;
    tag.healthSprite.visible = true;
    if (tag.lastHealth === key) return;
    tag.lastHealth = key;
    const ctx = tag.healthCtx;
    ctx.clearRect(0, 0, 512, 104);
    ctx.fillStyle = 'rgba(6,14,26,.9)';
    ctx.fillRect(8, 12, 496, 76);
    ctx.strokeStyle = tag.enemy ? '#ff9898' : '#82d9bb';
    ctx.lineWidth = 5;
    ctx.strokeRect(10, 14, 492, 72);
    ctx.fillStyle = tag.enemy ? '#cf253f' : '#249c77';
    ctx.fillRect(14, 18, 484 * percent, 64);
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(14, 18, 484 * percent, 10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px Inter, system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#071019';
    const label = `${roundedHp.toLocaleString()} / ${roundedMax.toLocaleString()}`;
    ctx.strokeText(label, 256, 52);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 256, 52);
    tag.healthTexture.needsUpdate = true;
  };

  const disposeTag = (tag) => {
    tag.texture.dispose();
    tag.material.dispose();
    tag.sprite.removeFromParent();
    tag.healthTexture.dispose();
    tag.healthMaterial.dispose();
    tag.healthSprite.removeFromParent();
  };

  return {
    set(id, name, hex, enemy = true) {
      if (tags.has(id)) return;
      tags.set(id, make(name, hex, enemy));
    },
    remove(id) {
      const tag = tags.get(id);
      if (!tag) return;
      disposeTag(tag);
      tags.delete(id);
    },
    // getHealth(id) returns only public match HP from the current server snapshot.
    update(actors, hidden = () => false, getHealth = () => null) {
      for (const [id, tag] of tags) {
        const actor = actors[id];
        tag.sprite.visible = !!actor && !hidden(id);
        tag.healthSprite.visible = tag.sprite.visible;
        if (!tag.sprite.visible) continue;
        const head = actor.chest();
        tag.sprite.position.set(head.x, head.y + 1.14, head.z);
        tag.healthSprite.position.set(head.x, head.y + 0.86, head.z);
        const hp = getHealth(id);
        if (hp) paintHealth(tag, hp.hp, hp.maxHp);
        else tag.healthSprite.visible = false;
      }
    },
    dispose() {
      for (const tag of tags.values()) disposeTag(tag);
      tags.clear();
    },
  };
}

const BANNER_VERTEX = /* glsl */`
  uniform float uTime; varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float wave = sin(uv.x * 7.0 - uTime * 6.0) * 0.07 * uv.x + sin(uv.x * 13.0 - uTime * 9.0) * 0.02 * uv.x;
    p.z += wave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const BANNER_FRAGMENT = /* glsl */`
  uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
  void main() {
    float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
    float sheen = 0.65 + 0.35 * sin(vUv.x * 9.0 - uTime * 4.0);
    float mark = step(0.38, abs(vUv.y - 0.5)) * 0.4; // two bands of light along the banner
    gl_FragColor = vec4(uColor * (sheen + mark) * (0.75 + 0.25 * edge), 0.92);
  }`;

/** Bases and flags for capture the flag: props.update(dt, flags (match.flags), actors, bodies). */
export function createCtfProps(scene, flags) {
  const group = new THREE.Group();
  scene.add(group);
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const parts = {};
  for (const [team, flag] of Object.entries(flags)) {
    const color = new THREE.Color(TEAM_COLORS[team]);
    // the base
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(1.7, 2.25, 64)),
      keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(flag.home.x, 0.015, flag.home.z);
    group.add(ring);
    const plinth = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.75, 0.95, 0.25, 6)),
      keep(new THREE.MeshStandardMaterial({ color: 0x1a2232, emissive: color, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.35, flatShading: true })));
    plinth.position.set(flag.home.x, 0.125, flag.home.z);
    plinth.receiveShadow = true;
    group.add(plinth);
    const light = new THREE.PointLight(color, 4, 9, 2);
    light.position.set(flag.home.x, 1.6, flag.home.z);
    group.add(light);
    // the flag: a crystal standard
    const standard = new THREE.Group();
    const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.025, 0.03, 2.3, 8)),
      keep(new THREE.MeshStandardMaterial({ color: 0x2a3344, metalness: 0.8, roughness: 0.3 })));
    pole.position.y = 1.15;
    standard.add(pole);
    const cap = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.09)),
      keep(new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.6), emissive: color, emissiveIntensity: 1.4, flatShading: true })));
    cap.position.y = 2.38;
    standard.add(cap);
    const bannerMaterial = keep(new THREE.ShaderMaterial({ vertexShader: BANNER_VERTEX, fragmentShader: BANNER_FRAGMENT, side: THREE.DoubleSide, transparent: true,
      uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 } } }));
    setNodeTwin(bannerMaterial, bannerTwin);
    const banner = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.95, 0.6, 16, 4).translate(0.475, 0, 0)), bannerMaterial);
    banner.position.set(0.03, 1.95, 0);
    standard.add(banner);
    group.add(standard);
    parts[team] = { standard, bannerMaterial, glow: light };
  }
  let time = 0;
  const back = new THREE.Vector3();
  return {
    update(dt, flagsNow, actors, bodyOf) {
      time += dt;
      for (const [team, flag] of Object.entries(flagsNow)) {
        const p = parts[team];
        p.bannerMaterial.uniforms.uTime.value = time + (team === 'red' ? 0 : 1.3);
        const s = p.standard;
        if (flag.state === 'carried' && actors[flag.carrier]) {
          // on the carrier's back, leaning
          const actor = actors[flag.carrier];
          const chest = actor.chest();
          const body = bodyOf(flag.carrier);
          back.set(-Math.sin(body?.yaw || 0), 0, -Math.cos(body?.yaw || 0)).multiplyScalar(0.28);
          s.position.set(chest.x + back.x, chest.y - 1.1, chest.z + back.z);
          s.rotation.set(0.25, (body?.yaw || 0) + Math.PI / 2, 0);
          s.scale.setScalar(0.72);
        } else if (flag.state === 'dropped') {
          s.position.set(flag.x, 0, flag.z);
          s.rotation.set(0, time * 0.8, 0.35);
          s.scale.setScalar(0.9);
        } else {
          s.position.set(flag.home.x, 0.25, flag.home.z);
          s.rotation.set(0, time * 0.25, 0);
          s.scale.setScalar(1);
        }
      }
    },
    dispose() { disposables.forEach((d) => d.dispose()); group.removeFromParent(); },
  };
}
