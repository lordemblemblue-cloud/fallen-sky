/**
 * three.js view of one puppet: a mesh per rig layer whose vertices come from puppetCore's deformed grids every frame,
 * the live bowstring, the nocked arrow, and the debug overlay (triangle wireframe, bone pivots).
 * Plain MeshBasicMaterials, so it draws the same on WebGPURenderer and the WebGL fallback.
 */
import * as THREE from 'three';
import { faceState, socketPosition } from '../core/puppetCore.mjs';

const STRING_HALF_WIDTH = 1.1;
const FLASH_COLOR = new THREE.Color(1, 0.6, 0.55);
export const NOCKED_ARROW_LENGTH = 292;

export async function loadTextures(names, base) {
  const loader = new THREE.TextureLoader();
  const entries = await Promise.all([...new Set(names)].map(async (name) => {
    const tex = await loader.loadAsync(`${base}${name}.png`);
    prepareTexture(tex);
    return [name, tex];
  }));
  return new Map(entries);
}

export function prepareTexture(tex) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // grid uvs have v = 0 at the image top
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function stripGeometry(points) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < points - 1; i += 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setIndex(idx);
  return geo;
}

export class PuppetView {
  /**
   * @param {object} o
   * @param {object} o.rig        buildRig() output
   * @param {Map} o.textures      part name -> THREE.Texture (every part the rig and its expressions use)
   * @param {THREE.Texture} o.arrowTexture
   * @param {number} [o.tint]     colour multiplied into every layer (the rival's shade)
   * @param {number} [o.renderBase]
   */
  constructor({ rig, textures, arrowTexture, tint = 0xffffff, renderBase = 100 }) {
    this.rig = rig;
    this.textures = textures;
    this.renderBase = renderBase;
    this.group = new THREE.Group();
    this.tint = new THREE.Color(tint);
    this.flash = 0;
    this.opacity = 1;
    this.overrides = new Map();
    this._color = new THREE.Color();
    this.layers = rig.layers.map((l) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(l.grid.count * 3), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(l.grid.uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(l.grid.indices, 1));
      const material = new THREE.MeshBasicMaterial({
        map: textures.get(l.part) || null, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, color: this.tint,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      mesh.name = `layer:${l.id}`;
      this.group.add(mesh);
      return { layer: l, geo, material, mesh };
    });
    this.string = new THREE.Mesh(stripGeometry(3), new THREE.MeshBasicMaterial({ color: 0xf3ead6, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.string.frustumCulled = false;
    this.group.add(this.string);
    const arrowGeo = new THREE.PlaneGeometry(1, 1);
    arrowGeo.translate(0.5, 0, 0); // pivot at the nock end
    this.arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ map: arrowTexture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.arrow.frustumCulled = false;
    this.arrow.visible = false;
    this.group.add(this.arrow);
    this.arrowGlow = null;
    this.lastArrow = null;
    this.debug = { wireframe: false, pivots: false };
    this.wire = null;
    this.pivots = null;
    this.layerIds = Object.fromEntries(rig.layers.map((l) => [l.id, l.index]));
  }

  setLayerTexture(layerId, texture) {
    const previous = this.overrides.get(layerId);
    if (previous && previous !== texture) previous.dispose();
    if (texture) this.overrides.set(layerId, texture);
    else this.overrides.delete(layerId);
  }

  setDebug({ wireframe = this.debug.wireframe, pivots = this.debug.pivots } = {}) {
    this.debug = { wireframe, pivots };
    if (wireframe && !this.wire) {
      let segments = 0;
      for (const { layer } of this.layers) segments += layer.grid.indices.length;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments * 2 * 3), 3));
      this.wire = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x38e0ff, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
      this.wire.frustumCulled = false;
      this.wire.renderOrder = 5000;
      this.group.add(this.wire);
    }
    if (pivots && !this.pivots) {
      const n = this.rig.bones.length;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n * 4 + (n - 1) * 2) * 3), 3));
      this.pivots = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff3b7a, depthTest: false, depthWrite: false, transparent: true }));
      this.pivots.frustumCulled = false;
      this.pivots.renderOrder = 5001;
      this.group.add(this.pivots);
    }
    if (this.wire) this.wire.visible = wireframe;
    if (this.pivots) this.pivots.visible = pivots;
  }

  /** Copy one frame of puppetCore output into the meshes. */
  update(state) {
    const { rig } = this;
    const face = faceState(rig, state.life);
    const rank = new Array(rig.layers.length);
    state.order.forEach((li, r) => { rank[li] = r; });
    this._color.copy(this.tint);
    if (this.flash > 0) this._color.lerp(FLASH_COLOR, Math.min(1, this.flash) * 0.6);
    for (const view of this.layers) {
      const { layer, geo, material, mesh } = view;
      const src = state.positions[layer.index];
      const pos = geo.attributes.position.array;
      for (let i = 0, j = 0; i < src.length; i += 2, j += 3) { pos[j] = src[i]; pos[j + 1] = src[i + 1]; pos[j + 2] = 0; }
      geo.attributes.position.needsUpdate = true;
      mesh.renderOrder = this.renderBase + rank[layer.index] * 2;
      let map = this.overrides.get(layer.id) || this.textures.get(layer.part);
      let opacity = 1;
      if (layer.role === 'face') map = this.overrides.get(layer.id) || this.textures.get(face.face) || map;
      else if (layer.role === 'faceFade') { map = face.fadeFrom ? this.textures.get(face.fadeFrom) : null; opacity = face.fadeOpacity; }
      else if (layer.role === 'blink') opacity = face.blink;
      mesh.visible = !!map && opacity > 0.003;
      if (material.map !== map) { material.map = map; material.needsUpdate = true; }
      material.opacity = opacity * this.opacity;
      material.color.copy(this._color);
    }
    this.updateString(state, rank);
    if (this.debug.wireframe && this.wire) this.updateWire(state);
    if (this.debug.pivots && this.pivots) this.updatePivots(state);
  }

  updateString(state, rank) {
    const { rig } = this;
    const top = socketPosition(rig, state, 'bowTop');
    const bottom = socketPosition(rig, state, 'bowBottom');
    if (!top || !bottom) { this.string.visible = false; return; }
    const draw = Math.max(0, Math.min(1, state.params.draw ?? 0));
    const rest = [(top[0] + bottom[0]) / 2, (top[1] + bottom[1]) / 2];
    const hand = socketPosition(rig, state, 'nock');
    const nock = [rest[0] + (hand[0] - rest[0]) * draw, rest[1] + (hand[1] - rest[1]) * draw];
    const pts = [top, nock, bottom];
    const pos = this.string.geometry.attributes.position.array;
    for (let i = 0; i < 3; i += 1) {
      const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(2, i + 1)];
      let nx = -(b[1] - a[1]); let ny = b[0] - a[0];
      const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      pos.set([pts[i][0] + nx * STRING_HALF_WIDTH, pts[i][1] + ny * STRING_HALF_WIDTH, 0, pts[i][0] - nx * STRING_HALF_WIDTH, pts[i][1] - ny * STRING_HALF_WIDTH, 0], i * 6);
    }
    this.string.geometry.attributes.position.needsUpdate = true;
    this.string.visible = true;
    const bowRank = rank[this.layerIds.bow];
    const handRank = rank[this.layerIds.drawHand];
    const drawing = draw > 0.05 && handRank > bowRank;
    const base = this.renderBase + (drawing ? handRank * 2 - 1 : bowRank * 2 + 1);
    this.string.renderOrder = base;
    this.string.material.opacity = 0.92 * this.opacity;
    // the nocked arrow: from the string's nock through the bow grip
    const nocked = (state.params.nocked ?? 0) > 0.5;
    this.arrow.visible = nocked;
    if (nocked) {
      const grip = socketPosition(rig, state, 'bowGrip');
      const angle = Math.atan2(grip[1] - nock[1], grip[0] - nock[0]);
      this.arrow.position.set(nock[0], nock[1], 0);
      this.arrow.rotation.z = angle;
      this.arrow.scale.set(NOCKED_ARROW_LENGTH, NOCKED_ARROW_LENGTH * (18 / 168), 1);
      this.arrow.renderOrder = base + 0.5;
      this.arrow.material.opacity = this.opacity;
      this.lastArrow = { nock, angle, tip: [nock[0] + Math.cos(angle) * NOCKED_ARROW_LENGTH, nock[1] + Math.sin(angle) * NOCKED_ARROW_LENGTH] };
    }
  }

  updateWire(state) {
    const pos = this.wire.geometry.attributes.position.array;
    let k = 0;
    for (const { layer, mesh } of this.layers) {
      if (!mesh.visible) continue;
      const p = state.positions[layer.index];
      const idx = layer.grid.indices;
      for (let i = 0; i < idx.length; i += 3) {
        for (let e = 0; e < 3; e += 1) {
          const a = idx[i + e]; const b = idx[i + ((e + 1) % 3)];
          pos[k++] = p[a * 2]; pos[k++] = p[a * 2 + 1]; pos[k++] = 0;
          pos[k++] = p[b * 2]; pos[k++] = p[b * 2 + 1]; pos[k++] = 0;
        }
      }
    }
    this.wire.geometry.setDrawRange(0, k / 3);
    this.wire.geometry.attributes.position.needsUpdate = true;
  }

  updatePivots(state) {
    const pos = this.pivots.geometry.attributes.position.array;
    let k = 0;
    const s = 7;
    for (const bone of this.rig.bones) {
      const x = state.frame[bone.index * 6 + 4]; const y = state.frame[bone.index * 6 + 5];
      pos.set([x - s, y, 0, x + s, y, 0, x, y - s, 0, x, y + s, 0], k); k += 12;
      if (bone.parent >= 0) {
        pos.set([state.frame[bone.parent * 6 + 4], state.frame[bone.parent * 6 + 5], 0, x, y, 0], k); k += 6;
      }
    }
    this.pivots.geometry.setDrawRange(0, k / 3);
    this.pivots.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    for (const { geo, material } of this.layers) { geo.dispose(); material.dispose(); }
    this.string.geometry.dispose(); this.string.material.dispose();
    this.arrow.geometry.dispose(); this.arrow.material.dispose();
    if (this.wire) { this.wire.geometry.dispose(); this.wire.material.dispose(); }
    if (this.pivots) { this.pivots.geometry.dispose(); this.pivots.material.dispose(); }
    for (const tex of this.overrides.values()) tex.dispose?.();
  }
}
