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

/** Name tags over fighters: tags.set(id, name, hex), tags.update(actors), tags.dispose(). */
export function createNameTags(scene) {
  const tags = new Map();
  const make = (name, hex) => {
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
    sprite.scale.set(1.1, 0.275, 1);
    sprite.renderOrder = 10;
    scene.add(sprite);
    return { sprite, texture, material };
  };
  return {
    set(id, name, hex) {
      if (tags.has(id)) return;
      tags.set(id, make(name, hex));
    },
    remove(id) {
      const tag = tags.get(id);
      if (!tag) return;
      tag.texture.dispose(); tag.material.dispose(); tag.sprite.removeFromParent();
      tags.delete(id);
    },
    // actors: { [id]: { root, chest() } }; dead: (id) => bool hides a fallen fighter's tag
    update(actors, hidden = () => false) {
      for (const [id, tag] of tags) {
        const actor = actors[id];
        tag.sprite.visible = !!actor && !hidden(id);
        if (!tag.sprite.visible) continue;
        const head = actor.chest();
        tag.sprite.position.set(head.x, head.y + 0.85, head.z);
      }
    },
    dispose() {
      for (const tag of tags.values()) { tag.texture.dispose(); tag.material.dispose(); tag.sprite.removeFromParent(); }
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
