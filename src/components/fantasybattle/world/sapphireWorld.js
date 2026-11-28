import worldMarkup from './worldMarkup.html?raw';
import {WORLD_MAX_X,WORLD_END_X,EXTRA_REGIONS,ARENAS,EXTRA_ENCOUNTERS,arenaForEncounter,extraHeight,regionForX} from '../core/worldExpansion.mjs';
import {TREASURE_IDS,treasureFor} from '../core/treasureCatalog.mjs';
import {WORLD_SERVICES,nearestService} from '../core/worldInteractions.mjs';
import {createWorldTelemetry,WORLD_TELEMETRY_INTERVAL} from '../core/worldTelemetry.mjs';
import {disposeResources,createCleanupScope} from '../core/resourceCleanup.mjs';
import {createLocomotion,resetLocomotion,advanceVelocity,updateLocomotion} from '../core/locomotion.mjs';
import {makeExplorationAvatar} from './explorationAvatar.js';
import {renderFirstWorldFrame} from '../core/worldStartup.mjs';
import {createWatercolorNodeMaterial,WATERCOLOR_TSL_NODES} from './watercolorNodeMaterial.mjs';

    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

    /** 0. RESOURCE POOL & SECTION OWNERSHIP */
    class ResourcePool {
      constructor() { this.geometries = new Map(); this.materials = new Map(); this.textures = new Map(); this.scopes = new Map(); }
      registerShared(type, key, resource) { const s = this[type]; if (!s.has(key)) s.set(key, { resource, refs: 0 }); return s.get(key).resource; }
      acquire(ownerId, type, key, resource) {
        const s = this[type]; if (!s.has(key)) s.set(key, { resource, refs: 0 }); s.get(key).refs++;
        if (!this.scopes.has(ownerId)) this.scopes.set(ownerId, new Set());
        this.scopes.get(ownerId).add({ type, key, shared: true });
        return s.get(key).resource;
      }
      trackOwnedObject(ownerId, object3D) {
        if (!this.scopes.has(ownerId)) this.scopes.set(ownerId, new Set());
        this.scopes.get(ownerId).add({ type: 'object3D', object3D, shared: false });
      }
      releaseOwner(ownerId) {
        const entries = this.scopes.get(ownerId);
        if (!entries) return;
        for (const item of entries) if (item.shared) { const rec = this[item.type]?.get(item.key); if (rec) rec.refs = Math.max(0, rec.refs - 1); }
        this.scopes.delete(ownerId);
      }
      getStats() { return { sharedGeos: this.geometries.size, sharedMats: this.materials.size, sharedTex: this.textures.size, activeScopes: this.scopes.size }; }
    }

    /** 1. PROCEDURAL TEXTURE FORGE (Albedo, Normal, AO, Wet Roughness, Emissive Veins) */
    class TextureForge {
      constructor() { this.cache = new Map(); }
      hash(x, y, seed = 1) { const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123; return n - Math.floor(n); }
      valueNoise(x, y, seed = 1) {
        const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        const a = this.hash(xi, yi, seed), b = this.hash(xi + 1, yi, seed), c = this.hash(xi, yi + 1, seed), d = this.hash(xi + 1, yi + 1, seed);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      }
      fbm(x, y, seed = 1, octaves = 4) {
        let val = 0, amp = 0.5, freq = 1;
        for (let i = 0; i < octaves; i++) { val += amp * this.valueNoise(x * freq, y * freq, seed + i * 19); freq *= 2.02; amp *= 0.5; }
        return val;
      }
      makeTexture(key, size, drawFn, opts = {}) {
        if (this.cache.has(key)) return this.cache.get(key);
        const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
        drawFn(canvas.getContext('2d'), size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = opts.wrapS ?? THREE.RepeatWrapping; tex.wrapT = opts.wrapT ?? THREE.RepeatWrapping;
        tex.colorSpace = opts.isData ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        tex.anisotropy = 4; tex.needsUpdate = true;
        this.cache.set(key, tex);
        return tex;
      }
      watercolorAlbedo(seed, baseHex, recessHex, highHex, size = 512) {
        return this.makeTexture(`wc_${seed}_${baseHex}_${size}`, size, (ctx, s) => {
          const cBase = new THREE.Color(baseHex), cRec = new THREE.Color(recessHex), cHigh = new THREE.Color(highHex);
          const img = ctx.createImageData(s, s), d = img.data;
          for (let y = 0; y < s; y++) {
            const v = y / s;
            for (let x = 0; x < s; x++) {
              const u = x / s;
              const broad = this.fbm(u * 4.2, v * 4.2, seed, 4);
              const pool = this.fbm(u * 10.5, v * 10.5, seed + 17, 3);
              const brush = this.fbm(u * 26.0 + pool * 1.4, v * 5.0, seed + 43, 3);
              const crack = Math.abs(this.fbm(u * 9.0, v * 9.0, seed + 71, 3) - 0.5);
              const col = cBase.clone();
              if (broad < 0.46) col.lerp(cRec, (0.46 - broad) * 1.35);
              else if (broad > 0.54) col.lerp(cHigh, (broad - 0.54) * 1.35);
              col.lerp(cRec, Math.min(0.78, (Math.abs(pool - 0.5) < 0.038 ? 0.16 : 0) + (crack < 0.024 ? 0.38 : 0)));
              col.multiplyScalar(0.92 + (brush - 0.5) * 0.16);
              const srgb = col.convertLinearToSRGB(), i = (y * s + x) * 4;
              d[i] = Math.min(255, Math.max(0, srgb.r * 255)); d[i + 1] = Math.min(255, Math.max(0, srgb.g * 255));
              d[i + 2] = Math.min(255, Math.max(0, srgb.b * 255)); d[i + 3] = 255;
            }
          }
          ctx.putImageData(img, 0, 0);
        });
      }
      stoneNormal(seed, strength = 2.2, size = 512) {
        return this.makeTexture(`nrm_${seed}_${strength}_${size}`, size, (ctx, s) => {
          const h = new Float32Array(s * s);
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const u = x / s, v = y / s;
            const crack = Math.abs(this.fbm(u * 10, v * 10, seed + 29, 3) - 0.5);
            h[y * s + x] = this.fbm(u * 6, v * 14, seed, 4) + (crack < 0.026 ? -0.55 : 0) + this.hash(x, y, seed) * 0.08;
          }
          const img = ctx.createImageData(s, s), d = img.data;
          for (let y = 0; y < s; y++) {
            const ym = (y - 1 + s) % s, yp = (y + 1) % s;
            for (let x = 0; x < s; x++) {
              const xm = (x - 1 + s) % s, xp = (x + 1) % s;
              const dx = (h[y * s + xp] - h[y * s + xm]) * strength, dy = (h[yp * s + x] - h[ym * s + x]) * strength;
              const inv = 1 / Math.hypot(dx, dy, 1), i = (y * s + x) * 4;
              d[i] = ((-dx * inv) * 0.5 + 0.5) * 255; d[i + 1] = ((-dy * inv) * 0.5 + 0.5) * 255; d[i + 2] = (inv * 0.5 + 0.5) * 255; d[i + 3] = 255;
            }
          }
          ctx.putImageData(img, 0, 0);
        }, { isData: true });
      }
      stoneAO(seed, size = 512) {
        return this.makeTexture(`ao_${seed}_${size}`, size, (ctx, s) => {
          const img = ctx.createImageData(s, s), d = img.data;
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const u = x / s, v = y / s;
            let ao = 0.64 + this.fbm(u * 7.5, v * 7.5, seed, 4) * 0.36;
            if (Math.abs(this.fbm(u * 10, v * 10, seed + 29, 3) - 0.5) < 0.03) ao *= 0.48;
            const b = Math.round(Math.min(1, Math.max(0.28, ao)) * 255), i = (y * s + x) * 4;
            d[i] = d[i + 1] = d[i + 2] = b; d[i + 3] = 255;
          }
          ctx.putImageData(img, 0, 0);
        }, { isData: true });
      }
      emissiveVeins(seed, coreHex = '#10182b', tipHex = '#78c9ed', size = 256) {
        return this.makeTexture(`em_${seed}_${coreHex}_${tipHex}_${size}`, size, (ctx, s) => {
          const cA = new THREE.Color(coreHex), cB = new THREE.Color(tipHex), img = ctx.createImageData(s, s), d = img.data;
          for (let y = 0; y < s; y++) {
            const v = 1 - y / s;
            for (let x = 0; x < s; x++) {
              const t = Math.min(1, Math.max(0, Math.pow(v, 0.8) * 0.72 + this.fbm((x / s) * 8, v * 8, seed, 3) * 0.35));
              const col = cA.clone().lerp(cB, t).convertLinearToSRGB(), i = (y * s + x) * 4;
              d[i] = Math.min(255, col.r * 255); d[i + 1] = Math.min(255, col.g * 255); d[i + 2] = Math.min(255, col.b * 255); d[i + 3] = 255;
            }
          }
          ctx.putImageData(img, 0, 0);
        });
      }
      wetRoughness(seed, size = 512) {
        return this.makeTexture(`wet_${seed}_${size}`, size, (ctx, s) => {
          const img = ctx.createImageData(s, s), d = img.data;
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const wet = Math.max(0, Math.min(1, (this.fbm((x / s) * 3.8, (y / s) * 3.8, seed, 4) - 0.49) * 11.0));
            const b = Math.round((0.84 * (1 - wet) + 0.14 * wet) * 255), i = (y * s + x) * 4;
            d[i] = d[i + 1] = d[i + 2] = b; d[i + 3] = 255;
          }
          ctx.putImageData(img, 0, 0);
        }, { isData: true });
      }
      barkAlbedo(seed = 505, size = 512) {
        return this.makeTexture(`bark_${seed}_${size}`, size, (ctx, s) => {
          const cDark = new THREE.Color('#0c1324'), cMid = new THREE.Color('#323f4f'), cWood = new THREE.Color('#77634d'), cMoss = new THREE.Color('#465b50');
          const img = ctx.createImageData(s, s), d = img.data;
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const u = x / s, v = y / s;
            const g = this.fbm(u * 26, v * 3.6, seed, 4), f = Math.abs(this.fbm(u * 18, v * 2.4, seed + 7, 3) - 0.5), m = this.fbm(u * 6, v * 6, seed + 19, 3);
            const col = cMid.clone();
            if (g < 0.44) col.lerp(cDark, (0.44 - g) * 2.1); else col.lerp(cWood, (g - 0.44) * 1.15);
            if (f < 0.032) col.lerp(cDark, 0.78);
            if (m > 0.62) col.lerp(cMoss, (m - 0.62) * 2.3);
            const srgb = col.convertLinearToSRGB(), i = (y * s + x) * 4;
            d[i] = Math.min(255, srgb.r * 255); d[i + 1] = Math.min(255, srgb.g * 255); d[i + 2] = Math.min(255, srgb.b * 255); d[i + 3] = 255;
          }
          ctx.putImageData(img, 0, 0);
        });
      }
      blossomFoliageCard(seed = 508) {
        return this.makeTexture(`blossom_card_${seed}`, 512, (ctx, s) => {
          ctx.clearRect(0, 0, s, s);
          ctx.strokeStyle = 'rgba(18, 30, 62, 0.78)'; ctx.lineWidth = 4.5;
          ctx.beginPath();
          ctx.moveTo(s * 0.5, s * 0.92); ctx.quadraticCurveTo(s * 0.46, s * 0.54, s * 0.25, s * 0.22);
          ctx.moveTo(s * 0.5, s * 0.62); ctx.quadraticCurveTo(s * 0.66, s * 0.44, s * 0.80, s * 0.25);
          ctx.stroke();
          const rand = (n) => this.hash(n * 1.37, n * 2.91, seed);
          const drawBloom = (cx, cy, rad, tier) => {
            for (let p = 0; p < 5; p++) {
              const a = (p / 5) * Math.PI * 2 + rand(cx + p) * 0.4;
              const px = cx + Math.cos(a) * rad * 0.55, py = cy + Math.sin(a) * rad * 0.55;
              const g = ctx.createRadialGradient(cx, cy, rad * 0.08, px, py, rad * 0.82);
              if (tier === 0) { g.addColorStop(0, 'rgba(32,48,118,0.96)'); g.addColorStop(0.55, 'rgba(92,82,152,0.92)'); g.addColorStop(1, 'rgba(148,146,206,0.84)'); }
              else if (tier === 1) { g.addColorStop(0, 'rgba(117,101,142,0.95)'); g.addColorStop(0.55, 'rgba(215,179,210,0.95)'); g.addColorStop(1, 'rgba(234,218,238,0.92)'); }
              else { g.addColorStop(0, 'rgba(218,184,214,0.96)'); g.addColorStop(0.55, 'rgba(240,230,244,0.96)'); g.addColorStop(1, 'rgba(252,248,254,0.98)'); }
              ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, py, rad * 0.54, rad * 0.36, a, 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = tier === 0 ? 'rgba(24,34,78,0.9)' : 'rgba(235,214,166,0.92)';
            ctx.beginPath(); ctx.arc(cx, cy, rad * 0.16, 0, Math.PI * 2); ctx.fill();
          };
          for (let i = 0; i < 24; i++) { const a = rand(i + 1) * Math.PI * 2, r = rand(i + 101) * s * 0.28; drawBloom(s * 0.5 + Math.cos(a) * r, s * 0.52 + Math.sin(a) * r, 24 + rand(i + 201) * 18, 0); }
          for (let i = 0; i < 34; i++) { const a = rand(i + 301) * Math.PI * 2, r = (0.1 + rand(i + 401) * 0.29) * s; drawBloom(s * 0.5 + Math.cos(a) * r, s * 0.48 + Math.sin(a) * r, 22 + rand(i + 501) * 16, 1); }
          for (let i = 0; i < 30; i++) { const a = rand(i + 601) * Math.PI * 2, r = (0.15 + rand(i + 701) * 0.27) * s; drawBloom(s * 0.5 + Math.cos(a) * r, s * 0.42 + Math.sin(a) * r * 0.85, 18 + rand(i + 801) * 14, 2); }
        }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
      }
      ceremonialEmblemAlbedo() {
        return this.makeTexture('emblem_carved_1024', 1024, (ctx, s) => {
          const cx = s * 0.5, cy = s * 0.5;
          const bg = ctx.createRadialGradient(cx, cy, s * 0.05, cx, cy, s * 0.5);
          bg.addColorStop(0, '#5f6f85'); bg.addColorStop(0.7, '#506075'); bg.addColorStop(1, '#445266');
          ctx.fillStyle = bg; ctx.fillRect(0, 0, s, s);
          for (let i = 0; i < 360; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(24,39,77,0.1)' : 'rgba(219,225,232,0.06)';
            ctx.beginPath(); ctx.arc(this.hash(i, 1, 15) * s, this.hash(i, 2, 15) * s, 10 + this.hash(i, 3, 15) * 42, 0, Math.PI * 2); ctx.fill();
          }
          const ppm = s / 7.8;
          const ring = (dia, w, col, seed) => {
            const rad = dia * 0.5 * ppm, lw = Math.max(3, w * ppm), step = (Math.PI * 2) / 48;
            for (let k = 0; k < 48; k++) {
              const h = this.hash(k, seed, 71); if (h < 0.22) continue;
              const a0 = k * step, a1 = a0 + step * (0.64 + h * 0.32);
              ctx.strokeStyle = 'rgba(16,24,43,0.86)'; ctx.lineWidth = lw + 5; ctx.beginPath(); ctx.arc(cx, cy, rad, a0, a1); ctx.stroke();
              ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(cx, cy, rad, a0 + 0.01, a1 - 0.01); ctx.stroke();
            }
          };
          ring(7.50, 0.065, 'rgba(204,178,128,0.78)', 1);
          ring(6.70, 0.050, 'rgba(78,152,232,0.62)', 2);
          ring(4.90, 0.045, 'rgba(212,186,136,0.72)', 3);
          ring(2.40, 0.055, 'rgba(222,198,148,0.80)', 4);
          for (let p = 0; p < 8; p++) {
            if (p === 2 || p === 6) continue;
            const ang = (p / 8) * Math.PI * 2, r0 = 1.2 * ppm, r1 = 2.42 * ppm;
            ctx.strokeStyle = 'rgba(16,24,43,0.80)'; ctx.lineWidth = 7;
            ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); ctx.stroke();
            ctx.strokeStyle = p % 2 === 0 ? 'rgba(209,183,132,0.72)' : 'rgba(120,201,237,0.52)'; ctx.lineWidth = 3.5;
            ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); ctx.stroke();
            ctx.fillStyle = p % 2 === 0 ? 'rgba(209,183,132,0.76)' : 'rgba(120,201,237,0.62)';
            ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * 2.9 * ppm, cy + Math.sin(ang) * 2.9 * ppm, 8, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalCompositeOperation = 'destination-in';
          const mask = ctx.createRadialGradient(cx, cy, s * 0.44, cx, cy, s * 0.5);
          mask.addColorStop(0, 'rgba(255,255,255,1)'); mask.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = mask; ctx.fillRect(0, 0, s, s); ctx.globalCompositeOperation = 'source-over';
        }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
      }
      skyDomeTexture() {
        return this.makeTexture('sky_sapphire_1024', 1024, (ctx, s) => {
          const cLeftTop = new THREE.Color('#13224a'), cLeftMid = new THREE.Color('#27478c'), cCenter = new THREE.Color('#4a7fd1');
          const cRightTop = new THREE.Color('#a4daf5'), cRightGold = new THREE.Color('#fff0cc'), cHorizon = new THREE.Color('#d7ecfa');
          const img = ctx.createImageData(s, s), d = img.data;
          for (let y = 0; y < s; y++) {
            const v = 1 - y / s;
            for (let x = 0; x < s; x++) {
              const u = x / s, rightF = Math.sin(u * Math.PI);
              const wash = this.fbm(u * 5.2, v * 4.2, 211, 4), splash = this.fbm(u * 13, v * 10, 223, 3);
              const colL = cLeftTop.clone().lerp(cLeftMid, Math.pow(1 - v, 0.72));
              const colR = cRightTop.clone().lerp(cRightGold, Math.max(0, 1 - Math.abs(v - 0.60) * 2.0));
              const col = colL.lerp(colR, Math.pow(rightF, 0.95));
              if (v < 0.56) col.lerp(cCenter, (0.56 - v) * 0.48);
              if (v < 0.52 && v > 0.28) col.lerp(cHorizon, (1 - Math.abs(v - 0.40) / 0.12) * 0.55 * rightF);
              if (wash > 0.56 && v > 0.42) col.lerp(cRightGold, Math.min(0.45, (wash - 0.56) * 1.4 * rightF));
              col.multiplyScalar(0.95 + (wash - 0.5) * 0.15 + (splash - 0.5) * 0.06);
              const srgb = col.convertLinearToSRGB(), i = (y * s + x) * 4;
              d[i] = Math.min(255, Math.max(0, srgb.r * 255)); d[i + 1] = Math.min(255, Math.max(0, srgb.g * 255));
              d[i + 2] = Math.min(255, Math.max(0, srgb.b * 255)); d[i + 3] = 255;
            }
          }
          ctx.putImageData(img, 0, 0);
        }, { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
      }
      waterfallTexture() {
        return this.makeTexture('waterfall_512', 512, (ctx, s) => {
          const cDeep = new THREE.Color('#193d82'), cCyan = new THREE.Color('#78c9ed'), cPearl = new THREE.Color('#edf2f6');
          const img = ctx.createImageData(s, s), d = img.data;
          for (let y = 0; y < s; y++) {
            const v = y / s;
            for (let x = 0; x < s; x++) {
              const u = x / s, uw = Math.min(1, Math.max(0, u + (this.fbm(u * 4, v * 5, 91, 3) - 0.5) * 0.12));
              const streak = this.fbm(uw * 22, v * 3.2, 89, 4), foam = this.fbm(uw * 13, v * 9, 97, 3);
              const col = cDeep.clone().lerp(cCyan, streak);
              if (streak > 0.56 || foam > 0.64 || v > 0.72) col.lerp(cPearl, Math.min(0.88, 0.52 + Math.max(0, v - 0.64) * 1.4));
              const alpha = Math.pow(Math.sin(uw * Math.PI), 0.75) * (v > 0.72 ? (1 - (v - 0.72) / 0.28) : 1) * (0.48 + streak * 0.52);
              const srgb = col.convertLinearToSRGB(), i = (y * s + x) * 4;
              d[i] = Math.min(255, srgb.r * 255); d[i + 1] = Math.min(255, srgb.g * 255); d[i + 2] = Math.min(255, srgb.b * 255);
              d[i + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
            }
          }
          ctx.putImageData(img, 0, 0);
        });
      }
      mistTexture(seed = 103) {
        return this.makeTexture(`mist_${seed}`, 512, (ctx, s) => {
          const img = ctx.createImageData(s, s), d = img.data;
          for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            const u = x / s, v = y / s;
            const wx = (this.fbm(u * 3.5, v * 3.5, seed + 3, 3) - 0.5) * 0.42;
            const wy = (this.fbm(u * 3.5, v * 3.5, seed + 17, 3) - 0.5) * 0.42;
            const dist = Math.hypot((u + wx - 0.5) * 2.15, (v + wy - 0.5) * 2.35);
            const sil = Math.max(0, 1 - dist - (0.5 - this.fbm(u * 6.5, v * 6.5, seed, 4)) * 0.45);
            const a = Math.pow(sil, 1.25) * ((sil > 0.05 && sil < 0.22) ? 1.18 : 1.0);
            const i = (y * s + x) * 4;
            d[i] = 238; d[i + 1] = 244; d[i + 2] = 253; d[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
          }
          ctx.putImageData(img, 0, 0);
        }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
      }
      fabricTextures() {
        const colorMap = this.makeTexture('fabric_col_512', 512, (ctx, s) => {
          const g = ctx.createLinearGradient(0, 0, 0, s);
          g.addColorStop(0, '#a64d6a'); g.addColorStop(0.5, '#85608a'); g.addColorStop(1, '#46354f');
          ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
          ctx.strokeStyle = 'rgba(235,214,166,0.78)'; ctx.lineWidth = 10;
          ctx.strokeRect(32, 32, s - 64, s - 84);
          ctx.beginPath(); ctx.arc(s * 0.5, s * 0.42, 66, 0, Math.PI * 2); ctx.stroke();
        });
        const alphaMap = this.makeTexture('fabric_alpha_512', 512, (ctx, s) => {
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = '#000000';
          for (let x = 0; x < s; x += 2) { const fray = this.hash(x * 0.4, 1, 67) * 76; ctx.fillRect(x, s - fray, 2, fray); }
        }, { isData: true, wrapT: THREE.ClampToEdgeWrapping });
        return { colorMap, alphaMap };
      }
    }

    /** 2. MASTER MATERIAL LIBRARY (15 Materials + Aligned WebGPU TSL & WebGL2) */
    class MaterialLibrary {
      constructor(forge, renderInfo) {
        this.forge = forge; this.renderInfo = renderInfo; this.cache = new Map();
        this.params = { ink: 0.60, sat: 0.55, diff: 0.65, real: 0.40, edge: 0.35, high: 0.45, gran: 0.30 };
        this.uWebGL = { uInk: { value: 0.60 }, uSat: { value: 0.55 }, uDiff: { value: 0.65 }, uReal: { value: 0.40 }, uEdge: { value: 0.35 }, uHigh: { value: 0.45 }, uGran: { value: 0.30 } };
        this.uTSL = null;
      }
      syncParams() {
        const p = this.params;
        for (const [k, uk] of [['ink','uInk'],['sat','uSat'],['diff','uDiff'],['real','uReal'],['edge','uEdge'],['high','uHigh'],['gran','uGran']]) {
          this.uWebGL[uk].value = p[k];
          if (this.uTSL) this.uTSL[uk].value = p[k];
        }
      }
      ensureTSLUniforms() {
        if (this.uTSL || !this.renderInfo.tsl) return this.uTSL;
        const { uniform } = this.renderInfo.tsl, p = this.params;
        this.uTSL = { uInk: uniform(p.ink), uSat: uniform(p.sat), uDiff: uniform(p.diff), uReal: uniform(p.real), uEdge: uniform(p.edge), uHigh: uniform(p.high), uGran: uniform(p.gran) };
        return this.uTSL;
      }
      applyWatercolor(mat, opts = {}) {
        mat.flatShading = Boolean(opts.faceted); mat.needsUpdate = true;
        if (this.renderInfo.isWebGPU && this.renderInfo.webgpu?.MeshStandardNodeMaterial && this.renderInfo.tsl) {
          return createWatercolorNodeMaterial(this.renderInfo.webgpu, this.renderInfo.tsl, mat, opts, this.ensureTSLUniforms());
        }
        const cRec = new THREE.Color(opts.recess || '#10182B'), cMid = new THREE.Color(opts.mid || '#2859B8'), cHi = new THREE.Color(opts.high || '#DBE1E8');
        mat.customProgramCacheKey = () => `sumi_${opts.recess}_${opts.mid}_${opts.high}_${opts.faceted ? 1 : 0}`;
        mat.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, this.uWebGL, { uRec: { value: cRec }, uMid: { value: cMid }, uHi: { value: cHi } });
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 sumiPos=vec4(transformed,1.0);\nvec3 sumiNormal=objectNormal;\n#ifdef USE_INSTANCING\nsumiPos=instanceMatrix*sumiPos;\nsumiNormal=mat3(instanceMatrix)*sumiNormal;\n#endif\nvWPos=(modelMatrix*sumiPos).xyz;\nvWNorm=normalize(mat3(modelMatrix)*sumiNormal);');
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
              varying vec3 vWPos; varying vec3 vWNorm;
              uniform float uInk, uSat, uDiff, uReal, uEdge, uHigh, uGran;
              uniform vec3 uRec, uMid, uHi;
              float sHash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
              float sNoise(vec3 x){
                vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
                return mix(mix(mix(sHash(i),sHash(i+vec3(1,0,0)),f.x),mix(sHash(i+vec3(0,1,0)),sHash(i+vec3(1,1,0)),f.x),f.y),
                           mix(mix(sHash(i+vec3(0,0,1)),sHash(i+vec3(1,0,1)),f.x),mix(sHash(i+vec3(0,1,1)),sHash(i+vec3(1,1,1)),f.x),f.y),f.z);
              }`)
            .replace('#include <color_fragment>', `#include <color_fragment>
              vec3 wn = normalize(vWNorm);
              float large = sin(vWPos.x*0.24+cos(vWPos.z*0.22))*0.25+cos(vWPos.y*0.28-vWPos.x*0.18)*0.25+0.5;
              float pool = sin(vWPos.x*1.3+large*2.4)*cos(vWPos.z*1.3-vWPos.y*0.9)*0.5+0.5;
              float brush = sin(vWPos.x*5.2+vWPos.y*1.5+large*3.0)*0.5+0.5;
              float fine = fract(sin(dot(vWPos*14.0,vec3(91.7,23.1,57.3)))*19341.2);
              float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
              float up = clamp(wn.y * 0.5 + 0.5, 0.0, 1.0);
              float ndl = clamp(dot(wn, normalize(vec3(0.55, 0.75, 0.38))) * 0.5 + 0.5, 0.0, 1.0);
              float tone = clamp(luma * 0.42 + up * 0.30 + ndl * 0.28 + (large - 0.5) * 0.26 * uDiff + (brush - 0.5) * 0.12 * uDiff, 0.0, 1.0);
              vec3 ramp = mix(uRec, uMid, smoothstep(0.08, 0.54, tone));
              ramp = mix(ramp, uHi, smoothstep(0.48, 0.94, tone) * (0.55 + uHigh * 0.65));
              float recMask = (1.0 - smoothstep(0.06, 0.50, tone)) * uInk;
              float poolEdge = smoothstep(0.42, 0.52, pool) * (1.0 - smoothstep(0.52, 0.64, pool));
              ramp = mix(ramp, uRec * 0.62, clamp(recMask * 0.65 + poolEdge * 0.24 * uDiff, 0.0, 0.82));
              ramp *= (1.0 + (fine - 0.5) * 0.18 * uGran);
              float fres = 1.0 - abs(dot(wn, normalize(cameraPosition - vWPos)));
              ramp = mix(ramp, uRec * 0.55, smoothstep(0.56, 0.94, fres) * smoothstep(0.28, 0.8, brush) * uEdge * 0.7);
              ramp = mix(ramp, uHi, smoothstep(0.54, 0.92, fres) * smoothstep(0.45, 0.92, ndl) * uHigh * 0.42);
              vec3 blended = mix(ramp, diffuseColor.rgb, clamp(uReal * 0.78, 0.12, 0.86));
              diffuseColor.rgb = mix(vec3(dot(blended, vec3(0.299, 0.587, 0.114))), blended, 0.58 + uSat * 0.82);`);
        };
        return mat;
      }
      get(key, fn) { if (this.cache.has(key)) return this.cache.get(key); const m = fn(); this.cache.set(key, m); return m; }
      m01Stone() { return this.get('M01', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#7a8a9e', map: this.forge.watercolorAlbedo(101, '#6f7f94', '#252d3d', '#dbe1e8'), normalMap: this.forge.stoneNormal(201, 2.2), aoMap: this.forge.stoneAO(301), aoMapIntensity: 0.65, roughness: 0.86, metalness: 0 }), { recess: '#18274D', mid: '#566476', high: '#DBE1E8' })); }
      m02WetStone() { return this.get('M02', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#6b7e96', map: this.forge.watercolorAlbedo(102, '#5e7088', '#10182b', '#c4e3f7'), normalMap: this.forge.stoneNormal(202, 1.8), roughnessMap: this.forge.wetRoughness(302), aoMap: this.forge.stoneAO(302), aoMapIntensity: 0.55, roughness: 0.72, metalness: 0.08, envMapIntensity: 1.55 }), { recess: '#10182B', mid: '#394654', high: '#C6E4F7' })); }
      m03Bedrock() { return this.get('M03', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#46566b', map: this.forge.watercolorAlbedo(103, '#3b495c', '#080d1a', '#707d91'), normalMap: this.forge.stoneNormal(203, 3.0), aoMap: this.forge.stoneAO(303), aoMapIntensity: 0.8, roughness: 0.94, metalness: 0 }), { recess: '#080D1A', mid: '#252D3D', high: '#707D91', faceted: true })); }
      m04Crystal() { return this.get('M04', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#346fe0', emissive: '#4ea2ff', emissiveMap: this.forge.emissiveVeins(404, '#10182b', '#9ae0ff'), emissiveIntensity: 0.95, roughness: 0.18, metalness: 0.18, envMapIntensity: 1.4 }), { recess: '#10182B', mid: '#2859B8', high: '#8EE0FF', faceted: true })); }
      m05Bark() { return this.get('M05', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#5a525c', map: this.forge.barkAlbedo(505), normalMap: this.forge.stoneNormal(205, 3.0), aoMap: this.forge.stoneAO(305), aoMapIntensity: 0.75, roughness: 0.92, metalness: 0 }), { recess: '#10182B', mid: '#394654', high: '#77634D' })); }
      m06BlossomCards() { return this.get('M06_CARDS', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#ffffff', map: this.forge.blossomFoliageCard(508), emissive: '#644a75', emissiveIntensity: 0.28, alphaTest: 0.30, roughness: 0.65, metalness: 0, side: THREE.DoubleSide }), { recess: '#46354F', mid: '#D7B3D2', high: '#F8F2FA' })); }
      m06Petal() { return this.get('M06', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#efe3f2', emissive: '#5e486e', emissiveIntensity: 0.24, roughness: 0.6, side: THREE.DoubleSide }), { recess: '#75658E', mid: '#D7B3D2', high: '#F4EEF5' })); }
      m07Moss() { return this.get('M07', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#536e60', map: this.forge.watercolorAlbedo(107, '#465b50', '#203730', '#8ea89b'), roughness: 0.9, metalness: 0 }), { recess: '#203730', mid: '#587B68', high: '#B3C8BD' })); }
      m08Flower() { return this.get('M08', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#5ca4f7', emissive: '#4a98f5', emissiveMap: this.forge.emissiveVeins(408, '#18274d', '#edf2f6'), emissiveIntensity: 0.85, roughness: 0.40, side: THREE.DoubleSide }), { recess: '#18274D', mid: '#448CE0', high: '#EDF2F6' })); }
      m09Gold() { return this.get('M09', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#e0c690', map: this.forge.watercolorAlbedo(109, '#d1b784', '#77634d', '#fff8ec'), roughness: 0.48, metalness: 0.84, envMapIntensity: 1.35 }), { recess: '#77634D', mid: '#D1B784', high: '#FFF8EC' })); }
      m10Fabric() { return this.get('M10', () => { const { colorMap, alphaMap } = this.forge.fabricTextures(); return this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#d4a3c4', map: colorMap, alphaMap, alphaTest: 0.35, roughness: 0.84, side: THREE.DoubleSide }), { recess: '#46354F', mid: '#9B6B8C', high: '#E6D7E9' }); }); }
      m11Waterfall() { return this.get('M11', () => new THREE.MeshStandardMaterial({ color: '#88d4f7', map: this.forge.waterfallTexture(), emissive: '#2256ab', emissiveIntensity: 0.55, transparent: true, opacity: 0.86, roughness: 0.22, side: THREE.DoubleSide, depthWrite: false })); }
      m12Mist() { return this.get('M12', () => new THREE.MeshBasicMaterial({ color: '#b8ddf5', map: this.forge.mistTexture(103), transparent: true, opacity: 0.30, depthWrite: false, side: THREE.DoubleSide })); }
      m13Clouds() { return this.get('M13', () => new THREE.MeshBasicMaterial({ color: '#e7eff8', map: this.forge.mistTexture(131), transparent: true, opacity: 0.44, depthWrite: false, side: THREE.DoubleSide })); }
      m14Soil() { return this.get('M14', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#434d57', map: this.forge.watercolorAlbedo(114, '#38414a', '#10182b', '#587b68'), normalMap: this.forge.stoneNormal(214, 2.3), aoMap: this.forge.stoneAO(314), aoMapIntensity: 0.65, roughness: 0.94, metalness: 0 }), { recess: '#10182B', mid: '#394654', high: '#587B68' })); }
      m15Paving() { return this.get('M15', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#7f8fa8', map: this.forge.watercolorAlbedo(115, '#728299', '#252d3d', '#e4ecf5'), normalMap: this.forge.stoneNormal(215, 1.9), roughnessMap: this.forge.wetRoughness(315), aoMap: this.forge.stoneAO(315), aoMapIntensity: 0.55, roughness: 0.74, metalness: 0.05, envMapIntensity: 1.35 }), { recess: '#252D3D', mid: '#707D91', high: '#E4ECF5' })); }
      mEmblem() { return this.get('EMBLEM', () => this.applyWatercolor(new THREE.MeshStandardMaterial({ color: '#ffffff', map: this.forge.ceremonialEmblemAlbedo(), normalMap: this.forge.stoneNormal(715, 2.4), roughnessMap: this.forge.wetRoughness(719), transparent: true, roughness: 0.76, metalness: 0.14, envMapIntensity: 1.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { recess: '#18274D', mid: '#566476', high: '#EBD6A6' })); }
      getAll15() {
        return [
          { name: '01 Weathered Stone', mat: this.m01Stone() }, { name: '02 Wet Stone', mat: this.m02WetStone() },
          { name: '03 Island Bedrock', mat: this.m03Bedrock() }, { name: '04 Sapphire Crystal', mat: this.m04Crystal() },
          { name: '05 Ancient Bark', mat: this.m05Bark() }, { name: '06 Blossom Petals', mat: this.m06Petal() },
          { name: '07 Forest Moss', mat: this.m07Moss() }, { name: '08 Magical Flowers', mat: this.m08Flower() },
          { name: '09 Ancient Gold', mat: this.m09Gold() }, { name: '10 Ceremonial Fabric', mat: this.m10Fabric() },
          { name: '11 Waterfall Water', mat: this.m11Waterfall() }, { name: '12 Atmospheric Mist', mat: this.m12Mist() },
          { name: '13 Celestial Clouds', mat: this.m13Clouds() }, { name: '14 Forest Soil', mat: this.m14Soil() },
          { name: '15 Pathway Stone', mat: this.m15Paving() }
        ];
      }
    }

    /** 3. PROCEDURAL ASSET FACTORY (25 Rocks, Arch Kit, Trees, Flora, Castle) */
    class AssetFactory {
      constructor(mats) { this.mats = mats; this.geoCache = new Map(); }
      rng(seed) { let s = (seed % 2147483647) || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
      rockGeo(w, h, d, detail = 2, seed = 1, opts = {}) {
        const key = `r_${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}_${detail}_${seed}_${opts.taper ? 1 : 0}`;
        if (this.geoCache.has(key)) return this.geoCache.get(key);
        const rand = this.rng(seed), geo = new THREE.IcosahedronGeometry(0.5, detail), pos = geo.attributes.position;
        const planes = Array.from({ length: 6 }, () => ({ n: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), o: 0.27 + rand() * 0.18 }));
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          for (const pl of planes) { const dist = v.dot(pl.n); if (dist > pl.o) v.addScaledVector(pl.n, -(dist - pl.o) * 0.72); }
          const strata = Math.sin(v.y * 16 + seed) * 0.04, frac = Math.cos(v.x * 11 - v.z * 9 + seed) * 0.035;
          v.x += strata + frac; v.z -= strata * 0.8 - frac;
          if (opts.taper) {
            const yn = v.y + 0.5, sc = 0.18 + Math.pow(Math.max(0, yn), 0.74) * 0.92;
            v.x *= sc; v.z *= sc; if (yn > 0.78) v.y = 0.42 + (yn - 0.78) * 0.22;
          }
          pos.setXYZ(i, v.x * w, v.y * h, v.z * d);
        }
        geo.computeVertexNormals(); this.geoCache.set(key, geo); return geo;
      }
      createLOD(lod0, lod1, lod2 = null, dist1 = 30, dist2 = 75) {
        const lod = new THREE.LOD(); lod.addLevel(lod0, 0); if (lod1) lod.addLevel(lod1, dist1); if (lod2) lod.addLevel(lod2, dist2); return lod;
      }
      createRock(tier = 'medium', variant = 0) {
        const rand = this.rng(600 + variant * 29);
        if (tier === 'small') { const m = new THREE.Mesh(this.rockGeo(0.18 + rand() * 0.12, 0.08 + rand() * 0.08, 0.15 + rand() * 0.1, 1, 610 + variant), this.mats.m01Stone()); m.castShadow = m.receiveShadow = true; return m; }
        if (tier === 'medium') {
          const w = 0.6 + rand() * 0.5, h = 0.4 + rand() * 0.35, d = 0.55 + rand() * 0.4, mat = variant % 2 ? this.mats.m02WetStone() : this.mats.m01Stone();
          const hi = new THREE.Mesh(this.rockGeo(w, h, d, 2, 620 + variant), mat); hi.castShadow = hi.receiveShadow = true;
          return this.createLOD(hi, new THREE.Mesh(this.rockGeo(w, h, d, 0, 620 + variant), mat), null, 28, 70);
        }
        if (tier === 'large') {
          const w = 1.8 + rand() * 1.1, h = 1.3 + rand() * 1.1, d = 1.5 + rand() * 0.9;
          const makeLarge = (det) => {
            const g = new THREE.Group(), m = new THREE.Mesh(this.rockGeo(w, h, d, det, 630 + variant), this.mats.m01Stone());
            m.position.y = h * 0.42; m.castShadow = m.receiveShadow = (det >= 2); g.add(m);
            if (det >= 2 && variant % 2 === 0) { const moss = new THREE.Mesh(this.rockGeo(1.2, 0.18, 1.0, Math.max(1, det - 1), 639 + variant), this.mats.m07Moss()); moss.position.y = h * 0.82; g.add(moss); }
            return g;
          };
          return this.createLOD(makeLarge(3), makeLarge(1), makeLarge(0), 26, 62);
        }
        if (tier === 'vertical') {
          const w = 1.8 + rand() * 1.2, h = 3.5 + rand() * 3.5, d = 1.6 + rand() * 1.0;
          const hi = new THREE.Mesh(this.rockGeo(w, h, d, 2, 640 + variant), this.mats.m03Bedrock()); hi.position.y = h * 0.45; hi.castShadow = hi.receiveShadow = true;
          const lo = new THREE.Mesh(this.rockGeo(w, h, d, 0, 640 + variant), this.mats.m03Bedrock()); lo.position.y = h * 0.45;
          return this.createLOD(hi, lo, null, 40, 95);
        }
        const w = 3.2 + rand() * 3.0, h = 5.0 + rand() * 5.0, d = 2.8 + rand() * 2.4;
        const hi = new THREE.Mesh(this.rockGeo(w, h, d, 2, 650 + variant, { taper: true }), this.mats.m03Bedrock()); hi.castShadow = hi.receiveShadow = true;
        return this.createLOD(hi, new THREE.Mesh(this.rockGeo(w, h, d, 0, 650 + variant, { taper: true }), this.mats.m03Bedrock()), null, 58, 140);
      }
      createFloorSlab(w = 1.4, l = 1.5, h = 0.24, seed = 1) {
        const geo = new THREE.BoxGeometry(w, h, l, 2, 1, 2), pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          if (y > 0) { x *= 0.96; z *= 0.96; }
          pos.setXYZ(i, x + Math.sin(x * 23.7 + y * 13.1 + z * 29.3 + seed) * 0.012, y, z + Math.cos(x * 19.1 + z * 31.7 + seed) * 0.012);
        }
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, this.mats.m15Paving()); m.position.y = h * 0.5; m.receiveShadow = m.castShadow = true;
        const g = new THREE.Group(); g.add(m); return g;
      }
      createColumn(height = 6.2, broken = false, seed = 10) {
        const g = new THREE.Group(), mat = this.mats.m01Stone();
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.45, 1.28), mat); base.position.y = 0.225; base.castShadow = base.receiveShadow = true; g.add(base);
        const shaftH = Math.max(0.7, height - (broken ? 0.5 : 1.0)), shaftGeo = new THREE.CylinderGeometry(0.38, 0.43, shaftH, 16, 4);
        if (broken) {
          const p = shaftGeo.attributes.position, rand = this.rng(seed);
          for (let i = 0; i < p.count; i++) if (p.getY(i) > shaftH * 0.35) p.setY(i, p.getY(i) + Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 2 + seed) * 0.28 + (rand() - 0.5) * 0.16);
          shaftGeo.computeVertexNormals();
        }
        const shaft = new THREE.Mesh(shaftGeo, mat); shaft.position.y = 0.45 + shaftH * 0.5; shaft.castShadow = shaft.receiveShadow = true; g.add(shaft);
        if (!broken) {
          const cap = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.42, 1.22), mat); cap.position.y = height - 0.21; cap.castShadow = cap.receiveShadow = true; g.add(cap);
          const gold = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16), this.mats.m09Gold()); gold.position.y = height - 0.46; g.add(gold);
        }
        return g;
      }
      createArch(openW = 3.8, clearH = 4.8, state = 'complete') {
        const g = new THREE.Group(), mat = this.mats.m01Stone(), thick = 0.72, depth = 0.88, pierH = clearH - openW * 0.5, halfSpan = openW * 0.5 + thick * 0.5;
        const lp = new THREE.Mesh(new THREE.BoxGeometry(thick, pierH, depth), mat); lp.position.set(-halfSpan, pierH * 0.5, 0); lp.castShadow = lp.receiveShadow = true; g.add(lp);
        const rh = state === 'damaged' ? pierH * 0.65 : pierH, rp = new THREE.Mesh(new THREE.BoxGeometry(thick, rh, depth), mat); rp.position.set(halfSpan, rh * 0.5, 0); rp.castShadow = rp.receiveShadow = true; g.add(rp);
        const maxSeg = state === 'complete' ? 11 : (state === 'partial' ? 7 : 3), rMid = openW * 0.5 + thick * 0.5;
        for (let i = 0; i < maxSeg; i++) {
          const ang = Math.PI - ((i + 0.5) / 11) * Math.PI;
          const b = new THREE.Mesh(new THREE.BoxGeometry(thick * 0.92, 0.58, depth * 0.96), i === 5 ? this.mats.m09Gold() : mat);
          b.position.set(Math.cos(ang) * rMid, pierH + Math.sin(ang) * rMid, 0); b.rotation.z = ang - Math.PI * 0.5; b.castShadow = b.receiveShadow = true; g.add(b);
        }
        return g;
      }
      createStaircase(steps = 10, width = 2.8, stepH = 0.17, stepD = 0.36) {
        const g = new THREE.Group(), mat = this.mats.m15Paving();
        for (let i = 0; i < steps; i++) { const h = (i + 1) * stepH, t = new THREE.Mesh(new THREE.BoxGeometry(width, h, stepD + 0.02), mat); t.position.set(0, h * 0.5, -i * stepD); t.castShadow = t.receiveShadow = true; g.add(t); }
        return g;
      }
      createWallBlock(w = 0.75, h = 0.38, d = 0.45, seed = 1) { const b = this.createFloorSlab(w, d, h, seed); b.name = 'WallBlock'; return b; }
      createBridgeSegment(state = 'complete', width = 3.2, length = 5.6) {
        const g = new THREE.Group(); g.name = 'Bridge_' + state; const mat = this.mats.m01Stone();
        const add = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
        if (state === 'complete') { add(width, 0.55, length, 0, -0.275, 0); for (const s of [-1, 1]) add(0.32, 0.65, length, s * (width / 2 - 0.16), 0.325, 0); }
        else for (const e of [-1, 1]) { const len = length * 0.36, m = add(width, 0.55, len, 0, -0.315, e * (length / 2 - len / 2)); m.rotation.x = e * 0.05; }
        return g;
      }
      createRubble(seed = 80) {
        const g = new THREE.Group(); g.name = 'ArchitecturalRubble';
        const b = this.createWallBlock(0.75, 0.38, 0.45, seed); b.rotation.set(0.18, 0.5, -0.22); g.add(b);
        const s = this.createFloorSlab(0.85, 0.70, 0.20, seed + 5); s.position.set(0.65, 0.04, 0.35); s.rotation.set(-0.14, 1.1, 0.19); g.add(s);
        const c = this.createRock('medium', 1); c.position.set(-0.55, 0.12, 0.28); g.add(c); return g;
      }
      createVine(length = 2.2, seed = 1) {
        const rand = this.rng(seed), g = new THREE.Group(); g.name = 'HangingVine';
        const pts = Array.from({ length: 9 }, (_, i) => new THREE.Vector3(Math.sin(i * 0.75) * 0.10, -length * i / 8, Math.cos(i * 0.66) * 0.05));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.013, 5, false), this.mats.m07Moss()));
        const lg = new THREE.SphereGeometry(0.09, 6, 4); lg.scale(0.7, 0.18, 1.4);
        for (let i = 1; i < pts.length; i++) { const l = new THREE.Mesh(lg, this.mats.m07Moss()); l.position.copy(pts[i]); l.position.x += (i % 2 ? 1 : -1) * 0.08; l.rotation.set(rand(), rand() * 2, rand()); g.add(l); }
        return g;
      }
      createCrystalCluster(scale = 1.0, seed = 41) {
        const g = new THREE.Group(), rand = this.rng(seed), count = 4 + Math.floor(rand() * 4);
        for (let i = 0; i < count; i++) {
          const h = (0.28 + rand() * 0.55) * scale, r = (0.06 + rand() * 0.08) * scale;
          const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.18, r, h, 6), this.mats.m04Crystal());
          const a = (i / count) * Math.PI * 2 + rand() * 0.5;
          m.position.set(Math.cos(a) * r * 1.4, h * 0.42, Math.sin(a) * r * 1.4);
          m.rotation.set((rand() - 0.5) * 0.55, rand() * Math.PI, (rand() - 0.5) * 0.55); m.castShadow = true; g.add(m);
        }
        return g;
      }
      createFlowerCluster(type = 'sapphire', seed = 77) {
        const g = new THREE.Group(), rand = this.rng(seed), petalMat = type === 'sapphire' ? this.mats.m08Flower() : this.mats.m06Petal(), count = type === 'sapphire' ? 3 : 5;
        for (let i = 0; i < count; i++) {
          const h = 0.22 + rand() * 0.2, ox = (rand() - 0.5) * 0.22, oz = (rand() - 0.5) * 0.22;
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, h, 5), this.mats.m07Moss()); stem.position.set(ox, h * 0.5, oz); g.add(stem);
          const head = new THREE.Group(); head.position.set(ox, h, oz);
          const geo = new THREE.SphereGeometry(0.036, 6, 4); geo.scale(0.70, 0.24, 1.30);
          const center = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), this.mats.m09Gold()); center.position.y = 0.015; head.add(center);
          const petals = new THREE.InstancedMesh(geo, petalMat, 5 + (i % 2)), dummy = new THREE.Object3D();
          for (let k = 0; k < petals.count; k++) {
            const a = (k / petals.count) * Math.PI * 2;
            dummy.position.set(Math.sin(a) * 0.034, 0.012, Math.cos(a) * 0.034); dummy.rotation.set(-0.22, a, 0); dummy.updateMatrix(); petals.setMatrixAt(k, dummy.matrix);
          }
          petals.instanceMatrix.needsUpdate = true; head.add(petals); g.add(head);
        }
        return g;
      }
      createGrassTuft(seed = 88) {
        const g = new THREE.Group(), rand = this.rng(seed), bg = new THREE.ConeGeometry(0.028, 0.28, 3);
        for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(bg, this.mats.m07Moss()), a = (i / 6) * Math.PI * 2 + rand() * 0.4; b.position.set(Math.cos(a) * 0.07, 0.13, Math.sin(a) * 0.07); b.rotation.set((rand() - 0.5) * 0.45, a, (rand() - 0.5) * 0.45); g.add(b); }
        return g;
      }
      createMossPatch(dia = 0.6) { const m = new THREE.Mesh(new THREE.CylinderGeometry(dia * 0.45, dia * 0.5, 0.035, 10), this.mats.m07Moss()); m.position.y = 0.018; m.receiveShadow = true; return m; }
      createAncientFloweringTree(height = 16.0, seed = 808) {
        const scale = height / 16.0;
        const buildDetailed = () => {
          const g = new THREE.Group(), rand = this.rng(seed), barkMat = this.mats.m05Bark();
          const makeTube = (pts, rStart, rEnd, segs = 14, radSegs = 8) => {
            const curve = new THREE.CatmullRomCurve3(pts), geo = new THREE.TubeGeometry(curve, segs, 1, radSegs, false), pos = geo.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
            for (let i = 0; i <= segs; i++) {
              const t = i / segs, r = rStart * (1 - t) + rEnd * t; curve.getPointAt(t, c);
              for (let j = 0; j <= radSegs; j++) { const idx = i * (radSegs + 1) + j; v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c); pos.setXYZ(idx, v.x, v.y, v.z); }
            }
            geo.computeVertexNormals(); const m = new THREE.Mesh(geo, barkMat); m.castShadow = m.receiveShadow = true; return m;
          };
          const trunkPts = [new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0.55 * scale, 2.8 * scale, 0.2 * scale), new THREE.Vector3(1.35 * scale, 5.8 * scale, -0.3 * scale), new THREE.Vector3(2.2 * scale, 8.6 * scale, 0.2 * scale)];
          g.add(makeTube(trunkPts, 1.3 * scale, 0.56 * scale, 18, 10));
          for (let r = 0; r < 9; r++) {
            const a = (r / 9) * Math.PI * 2 + rand() * 0.35, len = (2.8 + rand() * 2.4) * scale;
            g.add(makeTube([new THREE.Vector3(Math.cos(a) * 0.7 * scale, 0.8 * scale, Math.sin(a) * 0.7 * scale), new THREE.Vector3(Math.cos(a) * len * 0.5, 0.25 * scale, Math.sin(a) * len * 0.5), new THREE.Vector3(Math.cos(a + 0.18) * len, -0.35 * scale, Math.sin(a + 0.18) * len)], 0.34 * scale, 0.08 * scale, 8, 6));
          }
          const crown = trunkPts[3], blossomAnchors = [], ribbonAnchors = [];
          for (let b = 0; b < 7; b++) {
            const a = -0.6 + (b / 7) * Math.PI * 1.9 + (rand() - 0.5) * 0.25, reach = (5.8 + rand() * 3.8) * scale, rise = (4.2 + rand() * 2.8) * scale;
            const mid = new THREE.Vector3(crown.x + Math.cos(a) * reach * 0.52, crown.y + rise * 0.58, crown.z + Math.sin(a) * reach * 0.52);
            const tip = new THREE.Vector3(crown.x + Math.cos(a) * reach, crown.y + rise, crown.z + Math.sin(a) * reach);
            g.add(makeTube([crown, mid, tip], 0.36 * scale, 0.10 * scale, 10, 7));
            blossomAnchors.push({ pos: tip, rad: 3.3 * scale }); if (b < 5) ribbonAnchors.push(mid.clone());
            for (let s = 0; s < 2; s++) {
              const sa = a + (s === 0 ? 0.5 : -0.5) + (rand() - 0.5) * 0.25, sLen = (2.3 + rand() * 1.8) * scale;
              const sTip = new THREE.Vector3(mid.x + Math.cos(sa) * sLen, mid.y + (1.2 + rand() * 1.6) * scale, mid.z + Math.sin(sa) * sLen);
              g.add(makeTube([mid, sTip], 0.15 * scale, 0.04 * scale, 6, 5));
              blossomAnchors.push({ pos: sTip, rad: 2.5 * scale });
            }
          }
          const cardGeo = new THREE.BufferGeometry(), s = 1.0;
          cardGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-s,-s,0,s,-s,0,s,s,0,-s,-s,0,s,s,0,-s,s,0,0,-s,-s,0,-s,s,0,s,s,0,-s,-s,0,s,s,0,s,-s,-s,0.2,-s,s,0.2,-s,s,0.35,s,-s,0.2,-s,s,0.35,s,-s,0.35,s]), 3));
          cardGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0,0,1,0,1,1,0,0,1,1,0,1,0,0,1,0,1,1,0,0,1,1,0,1,0,0,1,0,1,1,0,0,1,1,0,1]), 2));
          cardGeo.computeVertexNormals();
          const per = 6, inst = new THREE.InstancedMesh(cardGeo, this.mats.m06BlossomCards(), blossomAnchors.length * per);
          inst.castShadow = inst.receiveShadow = true;
          const dummy = new THREE.Object3D(), tint = new THREE.Color(), cIn = new THREE.Color('#6b5fa8'), cMid = new THREE.Color('#ebd8ee'), cOut = new THREE.Color('#ffffff');
          let idx = 0;
          for (const anc of blossomAnchors) for (let k = 0; k < per; k++) {
            const th = rand() * Math.PI * 2, df = rand(), d = df * anc.rad * 0.72, dy = (rand() - 0.32) * anc.rad * 0.42;
            dummy.position.set(anc.pos.x + Math.cos(th) * d, anc.pos.y + dy, anc.pos.z + Math.sin(th) * d);
            dummy.scale.set((1.2 + rand() * 0.9) * scale, (0.9 + rand() * 0.6) * scale, (1.2 + rand() * 0.9) * scale);
            dummy.rotation.set((rand() - 0.5) * 0.45, rand() * Math.PI * 2, (rand() - 0.5) * 0.45);
            dummy.updateMatrix(); inst.setMatrixAt(idx, dummy.matrix);
            const bf = Math.min(1, Math.max(0, df * 0.55 + (dy > 0 ? 0.45 : 0.15)));
            tint.copy(bf < 0.5 ? cIn.clone().lerp(cMid, bf * 2) : cMid.clone().lerp(cOut, (bf - 0.5) * 2));
            inst.setColorAt(idx, tint); idx++;
          }
          inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
          g.add(inst); g.userData.ribbonAnchors = ribbonAnchors; return g;
        };
        const lod0 = buildDetailed(), lod1 = new THREE.Group();
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.45 * scale, 1.05 * scale, 9.2 * scale, 6), this.mats.m05Bark());
        st.position.set(0.8 * scale, 4.4 * scale, 0); st.rotation.z = -0.14; lod1.add(st);
        const cg = new THREE.PlaneGeometry(14.5 * scale, 9.0 * scale);
        const c1 = new THREE.Mesh(cg, this.mats.m06BlossomCards()); c1.position.set(1.8 * scale, 11.2 * scale, 0);
        const c2 = new THREE.Mesh(cg, this.mats.m06BlossomCards()); c2.position.set(1.8 * scale, 11.2 * scale, 0); c2.rotation.y = Math.PI * 0.5;
        lod1.add(c1, c2);
        const lod = this.createLOD(lod0, lod1, null, 46, 110);
        lod.name = `AncientTree_${Math.round(height)}m`; lod.userData.ribbonAnchors = lod0.userData.ribbonAnchors; return lod;
      }
      createCeremonialRibbon(len = 1.6, width = 0.16) {
        const geo = new THREE.PlaneGeometry(width, len, 2, 10); geo.translate(0, -len * 0.5, 0);
        const m = new THREE.Mesh(geo, this.mats.m10Fabric()); m.userData.basePos = geo.attributes.position.array.slice(); return m;
      }
      createLantern() {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.36, 6), this.mats.m09Gold()));
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 10), new THREE.MeshBasicMaterial({ color: '#fff3cf' })));
        g.add(new THREE.PointLight('#ffdca3', 2.6, 11, 1.45)); return g;
      }
      createCelestialCastle() {
        const g = new THREE.Group(); g.name = 'CelestialCastle_LOD0';
        const stone = this.mats.m01Stone(), gold = this.mats.m09Gold(), glow = new THREE.MeshBasicMaterial({ color: '#fff1c9' });
        const base = new THREE.Mesh(this.rockGeo(56, 26, 36, 2, 991, { taper: true }), this.mats.m03Bedrock()); base.position.y = -12; g.add(base);
        const nave = new THREE.Mesh(new THREE.BoxGeometry(26, 19, 16), stone); nave.position.y = 9.5; g.add(nave);
        const mt = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.7, 38, 8), stone); mt.position.y = 23; g.add(mt);
        const ms = new THREE.Mesh(new THREE.ConeGeometry(4.5, 20, 8), gold); ms.position.y = 51; g.add(ms);
        for (const [x, h, z] of [[-16, 29, -4], [16, 27, -3], [-24, 19, 5], [24, 21, 4], [-10, 34, -8], [10, 31, -8]]) {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.5, h, 8), stone); t.position.set(x, h * 0.5, z); g.add(t);
          const sp = new THREE.Mesh(new THREE.ConeGeometry(2.5, h * 0.42, 8), stone); sp.position.set(x, h + h * 0.21, z); g.add(sp);
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.6, 0.3), glow); w.position.set(x, h * 0.72, z + 2.3); g.add(w);
        }
        const wall = new THREE.Mesh(new THREE.BoxGeometry(54, 8.5, 2.5), stone); wall.position.set(0, 4.2, 11); g.add(wall);
        const lo = new THREE.Group(); lo.name = 'CelestialCastle_LOD1';
        const lb = new THREE.Mesh(this.rockGeo(56, 26, 36, 0, 991, { taper: true }), this.mats.m03Bedrock()); lb.position.y = -12; lo.add(lb);
        const ln = new THREE.Mesh(new THREE.BoxGeometry(28, 18, 16), stone); ln.position.y = 9; lo.add(ln);
        const ls = new THREE.Mesh(new THREE.ConeGeometry(5.5, 44, 6), gold); ls.position.y = 38; lo.add(ls);
        return this.createLOD(g, lo, null, 175, 340);
      }
    }

    /** 4. CAPSULE COLLISION SYSTEM */
    class CollisionSystem {
      constructor() {
        this.boxes = []; this.cylinders = []; this.platforms = []; this.ramps = []; this.ceilings = [];
        this.debugGroup = new THREE.Group(); this.debugGroup.visible = false; this.currentOwner = 'global';
      }
      setOwner(id = 'global') { this.currentOwner = id; }
      clear() {
        this.boxes = []; this.cylinders = []; this.platforms = []; this.ramps = []; this.ceilings = [];
        while (this.debugGroup.children.length > 0) { const c = this.debugGroup.children[0]; c.geometry?.dispose(); c.material?.dispose(); this.debugGroup.remove(c); }
      }
      unregisterOwner(id) {
        this.boxes = this.boxes.filter(b => b.ownerId !== id); this.cylinders = this.cylinders.filter(c => c.ownerId !== id);
        this.platforms = this.platforms.filter(p => p.ownerId !== id); this.ramps = this.ramps.filter(r => r.ownerId !== id);
        this.ceilings = this.ceilings.filter(c => c.ownerId !== id);
        for (let i = this.debugGroup.children.length - 1; i >= 0; i--) {
          const c = this.debugGroup.children[i];
          if (c.userData.ownerId === id) { c.geometry?.dispose(); c.material?.dispose(); this.debugGroup.remove(c); }
        }
      }
      setDebugVisible(v) { this.debugGroup.visible = v; }
      addDebugMesh(geo, pos, col) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.45 }));
        m.position.copy(pos); m.userData.ownerId = this.currentOwner; this.debugGroup.add(m);
      }
      addBox(cx, cy, cz, sx, sy, sz, tag = 'obstacle') {
        this.boxes.push({ minX: cx - sx * 0.5, maxX: cx + sx * 0.5, minY: cy - sy * 0.5, maxY: cy + sy * 0.5, minZ: cz - sz * 0.5, maxZ: cz + sz * 0.5, tag, ownerId: this.currentOwner });
        this.addDebugMesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.Vector3(cx, cy, cz), 0x78c9ed);
      }
      addCylinder(cx, minY, cz, radius, height, tag = 'cylinder') {
        this.cylinders.push({ cx, cz, minY, maxY: minY + height, radius, tag, ownerId: this.currentOwner });
        this.addDebugMesh(new THREE.CylinderGeometry(radius, radius, height, 10), new THREE.Vector3(cx, minY + height * 0.5, cz), 0x587b68);
      }
      addPlatform(minX, maxX, topY, minZ, maxZ, thickness = 0.4, tag = 'platform') {
        this.platforms.push({ minX, maxX, topY, bottomY: topY - thickness, minZ, maxZ, tag, ownerId: this.currentOwner });
        this.addDebugMesh(new THREE.BoxGeometry(maxX - minX, thickness, maxZ - minZ), new THREE.Vector3((minX + maxX) * 0.5, topY - thickness * 0.5, (minZ + maxZ) * 0.5), 0xebd6a6);
      }
      addRamp(x0, y0, x1, y1, minZ, maxZ, tag = 'ramp') {
        this.ramps.push({ x0, y0, x1, y1, minZ, maxZ, tag, ownerId: this.currentOwner });
        const m = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0), 0.16, maxZ - minZ), new THREE.MeshBasicMaterial({ color: 0xd7b3d2, wireframe: true, transparent: true, opacity: 0.55 }));
        m.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, (minZ + maxZ) * 0.5); m.rotation.z = Math.atan2(y1 - y0, x1 - x0); m.userData.ownerId = this.currentOwner; this.debugGroup.add(m);
      }
      addCeiling(minX, maxX, bottomY, minZ, maxZ, tag = 'ceiling') {
        this.ceilings.push({ minX, maxX, bottomY, minZ, maxZ, tag, ownerId: this.currentOwner });
        this.addDebugMesh(new THREE.BoxGeometry(maxX - minX, 0.25, maxZ - minZ), new THREE.Vector3((minX + maxX) * 0.5, bottomY + 0.125, (minZ + maxZ) * 0.5), 0xe87a90);
      }
      sampleSupportHeight(x, z, feetY, baseTerrainFn, maxStepUp = 0.55) {
        let bestY = baseTerrainFn(x, z);
        for (const r of this.ramps) {
          const minX = Math.min(r.x0, r.x1), maxX = Math.max(r.x0, r.x1);
          if (x >= minX - 0.15 && x <= maxX + 0.15 && z >= r.minZ - 0.1 && z <= r.maxZ + 0.1) {
            const t = Math.max(0, Math.min(1, (x - r.x0) / (r.x1 - r.x0 || 0.0001)));
            const ry = r.y0 + (r.y1 - r.y0) * t;
            if (ry <= feetY + maxStepUp + 0.35 && ry > bestY) bestY = ry;
          }
        }
        for (const p of this.platforms) if (x >= p.minX - 0.1 && x <= p.maxX + 0.1 && z >= p.minZ - 0.1 && z <= p.maxZ + 0.1 && p.topY <= feetY + maxStepUp && p.topY > bestY) bestY = p.topY;
        return bestY;
      }
      resolveCapsule(pos, velY, radius = 0.35, height = 1.75) {
        const feetY = pos.y + 0.18, headY = pos.y + height;
        for (const b of this.boxes) {
          if (headY <= b.minY || feetY >= b.maxY) continue;
          const cx = Math.max(b.minX, Math.min(pos.x, b.maxX)), cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
          const dx = pos.x - cx, dz = pos.z - cz, dSq = dx * dx + dz * dz;
          if (dSq < radius * radius) {
            const d = Math.sqrt(dSq);
            if (d > 0.0001) { pos.x += (dx / d) * (radius - d); pos.z += (dz / d) * (radius - d); }
            else {
              const pL = Math.abs(pos.x - b.minX), pR = Math.abs(b.maxX - pos.x), pB = Math.abs(pos.z - b.minZ), pF = Math.abs(b.maxZ - pos.z), m = Math.min(pL, pR, pB, pF);
              if (m === pL) pos.x = b.minX - radius; else if (m === pR) pos.x = b.maxX + radius; else if (m === pB) pos.z = b.minZ - radius; else pos.z = b.maxZ + radius;
            }
          }
        }
        for (const c of this.cylinders) {
          if (headY <= c.minY || feetY >= c.maxY) continue;
          const dx = pos.x - c.cx, dz = pos.z - c.cz, minD = radius + c.radius, dSq = dx * dx + dz * dz;
          if (dSq < minD * minD) { const d = Math.sqrt(dSq); if (d < 0.0001) pos.x = c.cx + minD; else { pos.x += (dx / d) * (minD - d); pos.z += (dz / d) * (minD - d); } }
        }
        let outVelY = velY;
        for (const ceil of this.ceilings) if (pos.x >= ceil.minX && pos.x <= ceil.maxX && pos.z >= ceil.minZ && pos.z <= ceil.maxZ && pos.y + height > ceil.bottomY && pos.y < ceil.bottomY) { pos.y = ceil.bottomY - height; if (outVelY > 0) outVelY = 0; }
        return outVelY;
      }
      toJSON() { return { boxes: this.boxes, cylinders: this.cylinders, platforms: this.platforms, ramps: this.ramps, ceilings: this.ceilings }; }
    }

    /** 5. BATTLE MAP REGISTRY & PROCEDURAL SAPPHIRE INK TRANSITION */
    class BattleMapRegistry {
      constructor() { this.maps = new Map(); }
      register(id, def) { this.maps.set(id, def); }
      has(id) { return this.maps.has(id); }
      get(id) { return this.maps.get(id) || null; }
      listIds() { return Array.from(this.maps.keys()); }
    }

    class InkTransitionEffect {
      constructor(overlayEl, canvasEl) {
        this.overlay = overlayEl; this.canvas = canvasEl; this.ctx = canvasEl.getContext('2d'); this.progress = 0; this.rafId = null;
        this.blobs = Array.from({ length: 18 }, (_, i) => ({
          u: i / 17, v: 0.12 + ((i * 37) % 76) / 100, rScale: 0.24 + ((i * 19) % 28) / 100,
          hue: i % 3 === 0 ? '#080d1a' : (i % 3 === 1 ? '#18274d' : '#2859b8'),
          rim: i % 2 === 0 ? 'rgba(120,201,237,0.42)' : 'rgba(235,214,166,0.25)'
        }));
      }
      draw(p) {
        const w = window.innerWidth, h = window.innerHeight;
        if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
        const ctx = this.ctx; ctx.clearRect(0, 0, w, h);
        if (p >= 0.999) { ctx.fillStyle = '#080d1a'; ctx.fillRect(0, 0, w, h); }
        const bg = ctx.createLinearGradient(0, 0, w, h * 0.6);
        bg.addColorStop(0, `rgba(8,13,26,${Math.min(0.96, p * 1.15)})`); bg.addColorStop(0.5, `rgba(24,39,77,${Math.min(0.94, p * 1.05)})`); bg.addColorStop(1, `rgba(16,24,43,${Math.min(0.96, p * 1.1)})`);
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        const maxDim = Math.hypot(w, h) * 0.52;
        for (const b of this.blobs) {
          const lp = Math.max(0, Math.min(1, p * 1.45 - b.u * 0.45)); if (lp <= 0.01) continue;
          const cx = b.u * w, cy = b.v * h, rad = maxDim * b.rScale * (0.2 + lp * 1.35);
          const g = ctx.createRadialGradient(cx, cy, rad * 0.08, cx, cy, rad);
          g.addColorStop(0, b.hue); g.addColorStop(0.76, b.hue); g.addColorStop(0.90, b.rim); g.addColorStop(1, 'rgba(8,13,26,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
        }
      }
      animateTo(target, ms = 420) {
        return new Promise((resolve) => {
          if (this.rafId) cancelAnimationFrame(this.rafId);
          const start = performance.now(), from = this.progress;
          if (target > 0) this.overlay.classList.add('active');
          const step = (now) => {
            const t = Math.min(1, (now - start) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            this.progress = from + (target - from) * e; this.draw(this.progress);
            if (t < 1) this.rafId = requestAnimationFrame(step);
            else { this.rafId = null; if (target <= 0) this.overlay.classList.remove('active'); resolve(); }
          };
          this.rafId = requestAnimationFrame(step);
        });
      }
    }

    /** 6. MAIN VIEWER APPLICATION */
    class SapphireSumiViewer {
      constructor() {
        this.viewport = document.getElementById('viewport');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(43, window.innerWidth / window.innerHeight, 0.1, 600);
        this.controls = null; this.renderer = null;
        this.renderInfo = { isWebGPU: false, backend: 'WebGL2', webgpu: null, tsl: null };
        this.forge = new TextureForge(); this.resourcePool = new ResourcePool();
        this.mats = null; this.assets = null;
        this.collisions = new CollisionSystem(); this.battleRegistry = new BattleMapRegistry();
        this.inkFX = new InkTransitionEffect(document.getElementById('ink-curtain'), document.getElementById('ink-canvas'));
        this.worldGroup = new THREE.Group(); this.scene.add(this.worldGroup); this.scene.add(this.collisions.debugGroup);

        this.mode = 'sanctuary'; this.quality = 'performance'; this.assetCategory = 'overview';
        this.adaptiveResEnabled = true; this.adaptiveScale = 1.0; this.emaFrameMs = 16.6;
        this.showAnchors4v4 = false; this.showBossAnchor = false; this.showColliders = false;
        this.wildsSections = new Map(); this.wildsStreamQueue = []; this.wildsRoot = null;
        this.sectionSpecs = [
          { id: 'wilds_sec_0', idx: 0, name: '1. Whispering Grove', minX: 0, maxX: 35 },
          { id: 'wilds_sec_1', idx: 1, name: '2. Broken Pilgrimage', minX: 35, maxX: 75 },
          { id: 'wilds_sec_2', idx: 2, name: '3. Celestial Waterfall', minX: 75, maxX: 110 },
          { id: 'wilds_sec_3', idx: 3, name: '4. Forgotten Passage', minX: 110, maxX: 140 },
          { id: 'wilds_sec_4', idx: 4, name: '5. Blossom Heights', minX: 140, maxX: 185 },
          { id: 'wilds_sec_5', idx: 5, name: '6. Sanctuary Entrance', minX: 185, maxX: 220 },...EXTRA_REGIONS
        ];
        this.combatAnchors = new Map(); this.debug4v4Group = null; this.debugBossGroup = null;
        this.ribbons = []; this.swayObjects = []; this.waterfalls = []; this.clouds = [];
        this.cameraObstacles = []; this.raycaster = new THREE.Raycaster(); this.petals = null; this.petalData = [];
        this.player = null; this.playerPos = new THREE.Vector3(6, 0, 0); this.playerVelY = 0; this.grounded = true;
        this.keys = { left: false, right: false, in: false, out: false, run:false };
        this.locomotion=createLocomotion();
        this.encounters = []; this.discoveries = []; this.foundDiscoveries = new Set(); this.retriggerCooldowns = new Map();
        this.activeEncounter = null; this.activeDiscovery = null; this.savedExploreState = null;
        this.transitionState = 'idle'; this.inputLocked = false; this.inBattleFromExplore = false;
        this.camLerp = null; this.clock = new THREE.Clock(); this.fpsFrames = 0; this.fpsTimer = 0;
        this.baseDprCap = 1.25; this.keyLight = null;
        this.windScale = 1; this.petalScale = 1; this.mistScale = 1;
        this.cleanupScope=createCleanupScope(); this.destroyed=false; this.exportBusy = false; this.renderFailed = false; this.lastAdaptiveAt = 0; this.envMapRT = null;
      }

      resetInput() { Object.keys(this.keys).forEach(k => { this.keys[k] = false; }); if(this.locomotion){resetLocomotion(this.locomotion,this.grounded);this.player?.userData.applyPose?.(this.locomotion);} }
      updateRenderScale() {
        const base = Math.min(window.devicePixelRatio || 1, this.baseDprCap || 1.25);
        this.renderer.setPixelRatio(base * this.adaptiveScale);
        document.getElementById('lbl-res-scale').textContent = `Scale: ${Math.round(this.adaptiveScale * 100)}%`;
      }
      updateAtmosphere() {
        if (!this.qualityConfig) return;
        if (this.petals) this.petals.count = Math.round(this.petalData.length * this.qualityConfig.petalRatio * this.petalScale);
        this.clouds.forEach((c, i) => { c.visible = i < Math.round(this.qualityConfig.mistCount * this.mistScale); });
      }

      async init({deferWorld=false}={}) {
        const w = this.viewport.clientWidth || window.innerWidth, h = this.viewport.clientHeight || window.innerHeight;
        const forceWebGL = new URLSearchParams(location.search).get('renderer') === 'webgl';
        if (!forceWebGL && typeof navigator !== 'undefined' && 'gpu' in navigator) {
          try {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) {
              const WGPU = await import('three/webgpu');
              let TSL; try { TSL = await import('three/tsl'); } catch (err) { TSL = WGPU; }
              if (!WGPU?.WebGPURenderer || !WGPU?.MeshStandardNodeMaterial || !WATERCOLOR_TSL_NODES.every(k => TSL[k] != null)) throw new Error('Required WebGPU painterly material APIs unavailable');
              if (WGPU?.WebGPURenderer) {
                const r = new WGPU.WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
                try{await r.init();}catch(error){disposeResources([r]);throw error;}
                this.renderer = r; this.renderInfo = { isWebGPU: true, backend: 'WebGPU', webgpu: WGPU, tsl: TSL };
              }
            }
          } catch (err) { console.warn('WebGPU init skipped, falling back to WebGL2:', err); }
        }
        if (!this.renderer) {
          this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
          this.renderInfo = { isWebGPU: false, backend: 'WebGL2', webgpu: null, tsl: null };
        }
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.44;
        if (this.renderer.shadowMap) { this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
        this.viewport.appendChild(this.renderer.domElement);
        document.getElementById('badge-renderer').textContent = `Renderer: ${this.renderInfo.backend}${new URLSearchParams(location.search).has('gpuFallback') ? ' (GPU recovery)' : ''}`;

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true; this.controls.dampingFactor = 0.06; this.controls.maxDistance = 260;

        this.mats = new MaterialLibrary(this.forge, this.renderInfo);
        this.assets = new AssetFactory(this.mats);

        window.sapphireViewer = this;
        window.SapphireEngineModules = {
          rendering: { renderer: this.renderer, info: this.renderInfo, camera: this.camera },
          materials: this.mats, assets: this.forge, geometry: this.assets, collision: this.collisions,
          scenes: { resourcePool: this.resourcePool, worldGroup: this.worldGroup }, battleMaps: this.battleRegistry,
          explorationMaps: { sectionSpecs: this.sectionSpecs, loadedSections: this.wildsSections },
          performance: { getStats: () => this.resourcePool.getStats() }
        };

        this.battleRegistry.register('sapphire_sanctuary', {
          title: 'Sapphire Sanctuary', subtitle: 'Sapphire Sanctuary — Floating Island Battleground',
          badge: 'Arena Center', build: () => this.buildSanctuary()
        });

        for(const [id,def] of Object.entries(ARENAS)){if(id==='sapphire_sanctuary')continue;this.battleRegistry.register(id,{title:def.title,subtitle:def.title+' — Battleground',badge:'Arena Center',build:()=>this.buildRegionalArena(def.theme)});}
        this.setupLightsAndSky();
        this.bindUI();
        this.applyQuality('performance');
        this.cleanupScope.listen(window,'resize', () => this.onResize());
        if(!deferWorld){this.loadMode('wilds');this.animate();}
      }

      setupLightsAndSky() {
        this.scene.background = new THREE.Color('#1a2d54');
        this.scene.fog = new THREE.FogExp2('#203866', 0.0024);
        const skyTex = this.forge.skyDomeTexture();
        const skyDome = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 20), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
        skyDome.name = 'CelestialSkyDome'; this.scene.add(skyDome);

        if (!this.renderInfo.isWebGPU && this.renderer.getContext) {
          try {
            const pmrem = new THREE.PMREMGenerator(this.renderer), envScene = new THREE.Scene();
            const geometry=new THREE.SphereGeometry(30,16,12),material=new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide});
            try{envScene.add(new THREE.Mesh(geometry,material));this.envMapRT=pmrem.fromScene(envScene,0.04);this.scene.environment=this.envMapRT.texture;}finally{disposeResources([geometry,material,pmrem]);}
          } catch (e) { console.warn('PMREM reflection skipped:', e); }
        }

        const orb = new THREE.Mesh(new THREE.SphereGeometry(19, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff6de', fog: false }));
        orb.position.set(145, 112, -245); this.scene.add(orb);
        this.scene.add(new THREE.HemisphereLight('#d8efff', '#3d5b94', 1.48));

        const key = new THREE.DirectionalLight('#fff2d6', 2.60);
        key.position.set(28, 42, 22); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.near = 2; key.shadow.camera.far = 140;
        key.shadow.camera.left = -28; key.shadow.camera.right = 28; key.shadow.camera.top = 28; key.shadow.camera.bottom = -28; key.shadow.bias = -0.0006;
        this.keyLight = key; this.scene.add(key); this.scene.add(key.target);

        const fill = new THREE.DirectionalLight('#9ecbf2', 0.88); fill.position.set(-22, 16, 26); this.scene.add(fill);
        const rim = new THREE.DirectionalLight('#62a8f5', 0.92); rim.position.set(-18, 24, -30); this.scene.add(rim);
      }

      getCombatAnchor(name) { return this.combatAnchors.get(name) || null; }

      loadMode(mode,arenaId='sapphire_sanctuary') {
        this.mode = mode; this.clearWorld();
        if (this.keyLight) { this.keyLight.position.set(28, 42, 22); this.keyLight.target.position.set(0, 0, 0); }
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
        const exploreBar = document.getElementById('explore-bar'), discBadge = document.getElementById('badge-discoveries');
        document.getElementById('encounter-bar').classList.add('hidden');
        if (!this.inBattleFromExplore) document.getElementById('return-bar').classList.add('hidden');
        this.controls.enabled = mode !== 'wilds';
        if (mode === 'sanctuary') {
          exploreBar.classList.add('hidden'); discBadge.classList.add('hidden');
          const def=this.battleRegistry.get(arenaId)||this.battleRegistry.get('sapphire_sanctuary');this.activeArenaId=this.battleRegistry.get(arenaId)?arenaId:'sapphire_sanctuary';
          document.getElementById('mode-subtitle').textContent=def.subtitle;document.getElementById('badge-section').textContent=def.badge;def.build();
        } else if (mode === 'wilds') {
          exploreBar.classList.remove('hidden'); discBadge.classList.remove('hidden');
          discBadge.textContent = `Discoveries: ${TREASURE_IDS.filter(id=>this.foundDiscoveries.has(id)).length}/${TREASURE_IDS.length}`;
          document.getElementById('mode-subtitle').textContent = 'The Sapphire Wilds — 302m 8-Section Exploration World';
          this.buildSapphireWilds();
        } else if (mode === 'materials') {
          exploreBar.classList.add('hidden'); discBadge.classList.add('hidden');
          document.getElementById('mode-subtitle').textContent = 'Master Material Library — All 15 Sapphire Sumi Materials';
          document.getElementById('badge-section').textContent = '15 Materials';
          this.buildMaterialGallery();
        } else {
          exploreBar.classList.add('hidden'); discBadge.classList.add('hidden');
          document.getElementById('mode-subtitle').textContent = 'Environmental Asset Kit — Rocks, Ruins, Tree & Flora';
          document.getElementById('badge-section').textContent = 'Asset Kit';
          this.buildAssetKit();
        }
        this.updateAtmosphere();
      }

      addCloudLayer(baseY = -8, count = 10, centerX = 0) {
        const rand = this.assets.rng(911 + Math.round(centerX)), matC = this.mats.m13Clouds(), matM = this.mats.m12Mist();
        for (let i = 0; i < count; i++) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(28 + rand() * 36, 11 + rand() * 15), i % 2 === 0 ? matC : matM);
          m.rotation.x = -Math.PI * 0.5; m.position.set(centerX + (rand() - 0.5) * 190, baseY + (rand() - 0.5) * 6, -15 - rand() * 110);
          m.userData.speed = 0.55 + rand() * 0.85; m.userData.centerX = centerX; m.userData.ownedGeo = true;
          this.clouds.push(m); this.worldGroup.add(m);
        }
      }

      addFallingPetals(count = 140, spanX = 34, centerX = 0, baseY = 0) {
        const rand = this.assets.rng(333 + Math.round(centerX));
        const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.08, 0.12), this.mats.m06Petal(), count);
        inst.userData.ownedGeo = true;
        this.petalData = Array.from({ length: count }, () => ({
          x: centerX + (rand() - 0.5) * spanX, y: baseY + rand() * 15, z: (rand() - 0.5) * 16, speed: 0.20 + rand() * 0.30, phase: rand() * Math.PI * 2
        }));
        inst.frustumCulled = false; this.petalOrigin = {centerX,spanX,baseY}; this.petals = inst; this.worldGroup.add(inst);
      }

      disposeDetached(root) {
        const liveGeo = new Set(this.assets?.geoCache.values() || []), liveMat = new Set(this.mats?.cache.values() || []), liveTex = new Set(this.forge.cache.values());
        const texturesOf = m => Object.values(m || {}).filter(v => v?.isTexture);
        this.scene.traverse(obj => { if (obj.geometry) liveGeo.add(obj.geometry); for (const m of [].concat(obj.material || [])) { liveMat.add(m); texturesOf(m).forEach(t => liveTex.add(t)); } });
        liveMat.forEach(m => texturesOf(m).forEach(t => liveTex.add(t)));
        const geos = new Set(), mats = new Set(), tex = new Set();
        root.traverse(obj => {
          if (obj.isInstancedMesh) obj.dispose?.();
          if (obj.isLight && obj.shadow) obj.shadow.dispose?.();
          if (obj.geometry && !liveGeo.has(obj.geometry)) geos.add(obj.geometry);
          for (const m of [].concat(obj.material || [])) if (!liveMat.has(m)) { mats.add(m); texturesOf(m).forEach(t => { if (!liveTex.has(t)) tex.add(t); }); }
        });
        geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); tex.forEach(t => t.dispose());
      }

      trimGeometryCache(maxEntries = 512) {
        const cache=this.assets?.geoCache; if (!cache || cache.size<=maxEntries) return;
        const live=new Set(); this.scene.traverse(o=>{if(o.geometry)live.add(o.geometry);});
        for (const [key,geo] of cache) { if(cache.size<=maxEntries)break; if(!live.has(geo)){cache.delete(key);geo.dispose();} }
      }

      destroy() {
        if(this.destroyed)return;
        this.destroyed=true;this.renderFailed=true;this.inputLocked=true;
        cancelAnimationFrame(this.animationFrame);this.cleanupScope.close();this.resetInput();
        try{this.clearWorld();}catch(error){console.warn('World cleanup incomplete:',error);}
        const resources=new Set(),textures=new Set();
        const material=m=>{if(!m)return;resources.add(m);for(const v of Object.values(m))if(v?.isTexture&&v!==this.envMapRT?.texture)textures.add(v);};
        this.scene?.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of [].concat(o.material||[]))material(m);if(o.isLight&&o.shadow)resources.add(o.shadow);if(o.isInstancedMesh)resources.add(o);});
        for(const g of this.assets?.geoCache.values()||[])resources.add(g);
        for(const m of this.mats?.cache.values()||[])material(m);
        for(const t of this.forge.cache.values())textures.add(t);
        for(const type of ['geometries','materials','textures']){for(const entry of this.resourcePool[type].values())resources.add(entry.resource);this.resourcePool[type].clear();}
        resources.add(this.envMapRT);if(this.scene)this.scene.environment=null;
        const result=disposeResources([...resources,...textures,this.controls,this.renderer]);
        if(result.failed)console.warn('Some viewer resources could not be disposed:',result.failed);
        this.assets?.geoCache.clear();this.mats?.cache.clear();this.forge.cache.clear();this.resourcePool.scopes.clear();this.scene?.clear();
        this.renderer?.domElement?.remove();
        if(window.sapphireViewer===this){delete window.sapphireViewer;delete window.SapphireEngineModules;}
      }

      clearWorld() {
        for (const secId of Array.from(this.wildsSections.keys())) this.unloadWildsSection(secId);
        this.wildsSections.clear(); this.wildsStreamQueue = []; this.wildsRoot = null; this.resourcePool.releaseOwner('active_scene');
        const detached = new THREE.Group(); while (this.worldGroup.children.length > 0) detached.add(this.worldGroup.children[0]);
        this.disposeDetached(detached);
        this.activeEncounter = this.activeDiscovery = null; this.camLerp = null; this.resetInput();
        this.collisions.clear(); this.combatAnchors.clear(); this.debug4v4Group = null; this.debugBossGroup = null;
        this.ribbons = []; this.swayObjects = []; this.waterfalls = []; this.clouds = []; this.cameraObstacles = [];
        this.petals = null; this.petalData = []; this.encounters = []; this.discoveries = []; this.player = null; this.trimGeometryCache();
      }

      unloadWildsSection(secId) {
        const rec = this.wildsSections.get(secId); if (!rec) return;
        if (rec.group && rec.group.parent) rec.group.parent.remove(rec.group);
        this.collisions.unregisterOwner(secId); if (rec.group) this.disposeDetached(rec.group);
        this.resourcePool.releaseOwner(secId);
        this.ribbons = this.ribbons.filter(r => r.userData?.ownerId !== secId);
        this.swayObjects = this.swayObjects.filter(s => s.ownerId !== secId);
        this.waterfalls = this.waterfalls.filter(w => w.userData?.ownerId !== secId);
        this.cameraObstacles = this.cameraObstacles.filter(o => o.userData?.ownerId !== secId);
        this.encounters = this.encounters.filter(e => e.ownerId !== secId);
        this.discoveries = this.discoveries.filter(d => d.ownerId !== secId);
        this.wildsSections.delete(secId); this.trimGeometryCache();
      }

      buildSanctuary() {
        const root = new THREE.Group(); root.name = 'SapphireSanctuary_Battleground';
        const rand = this.assets.rng(1337);

        // 1. 30m x 14m Irregular Oval Floating Island Core
        const islandGeo = new THREE.CylinderGeometry(1.0, 0.24, 6.4, 36, 8), pos = islandGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i), yn = Math.max(0, Math.min(1, (vy + 3.2) / 6.4));
          const ang = Math.atan2(vz, vx), jag = 0.90 + Math.sin(ang * 5) * 0.05 + Math.cos(ang * 9 + 1.2) * 0.04, taper = 0.22 + Math.pow(yn, 0.72) * 0.80;
          pos.setXYZ(i, vx * 15.0 * jag * taper, vy - (1.0 - yn) * (0.4 + Math.abs(Math.sin(ang * 7)) * 0.9), vz * 7.0 * jag * taper);
        }
        islandGeo.computeVertexNormals();
        const islandCore = new THREE.Mesh(islandGeo, this.mats.m03Bedrock()); islandCore.position.y = -3.3; islandCore.castShadow = islandCore.receiveShadow = true; islandCore.userData.ownedGeo = true; root.add(islandCore);

        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2, fx = Math.cos(a) * (10.5 + rand() * 3.0), fz = Math.sin(a) * (4.5 + rand() * 1.6);
          const frag = this.assets.createRock('island', i); frag.scale.setScalar(0.45 + rand() * 0.35); frag.position.set(fx, -2.2 - rand() * 1.8, fz); root.add(frag);
          if (i % 4 !== 3) { const cr = this.assets.createCrystalCluster(0.85 + rand() * 0.45, 400 + i); cr.position.set(fx * 0.96, -1.3 - rand() * 1.1, fz * 0.96); cr.rotation.z = Math.PI * 0.85; root.add(cr); }
        }
        [[-8.5, -0.5, 5.4], [-3.2, -0.6, 6.2], [9.8, -0.5, 4.9]].forEach(([cx, cy, cz], i) => {
          const c = this.assets.createCrystalCluster(1.0, 520 + i); c.position.set(cx, cy, cz); c.rotation.x = 0.5; root.add(c);
        });

        // 2. Smooth Walkable Combat Floor + Fitted Staggered Elliptical Stone Pavement + Flush Carved Emblem
        const deck = new THREE.Mesh(new THREE.CylinderGeometry(14.4, 14.0, 0.22, 40), this.mats.m02WetStone());
        deck.scale.set(1, 1, 6.7 / 14.4); deck.position.y = -0.14; deck.receiveShadow = true; deck.userData.ownedGeo = true; root.add(deck);

        const paving = new THREE.Group(); paving.name = 'FittedStonePavement';
        const rx = 14.18, rz = 6.55, rowH = 0.95, cellW = 1.65, grout = 0.025;
        const clip = (poly, nx, nz, limit) => {
          const out = [];
          for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i + 1) % poly.length], da = a[0] * nx + a[1] * nz - limit, db = b[0] * nx + b[1] * nz - limit;
            if (da <= 0) out.push(a);
            if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
          }
          return out;
        };
        for (let row = 0; row < 14; row++) {
          const z0 = -6.65 + row * rowH + grout, z1 = z0 + rowH - 2 * grout;
          for (let x0 = -15 + (row % 2) * cellW / 2; x0 < 15; x0 += cellW) {
            let poly = [[x0 + grout, z0], [x0 + cellW - grout, z0], [x0 + cellW - grout, z1], [x0 + grout, z1]];
            for (let j = 0; j < 48 && poly.length; j++) { const a = (j + 0.5) * Math.PI * 2 / 48; poly = clip(poly, Math.cos(a) / rx, Math.sin(a) / rz, Math.cos(Math.PI / 48)); }
            if (poly.length < 3) continue;
            const area = Math.abs(poly.reduce((acc, p, i) => { const q = poly[(i + 1) % poly.length]; return acc + p[0] * q[1] - p[1] * q[0]; }, 0)) / 2;
            if (area < 0.065) continue;
            const geo = new THREE.ExtrudeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: 0.18, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.010, bevelSegments: 1, steps: 1, curveSegments: 1 });
            geo.rotateX(-Math.PI / 2);
            const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
            for (let i = 0; i < p.count; i++) uv.setXY(i, Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i), Math.abs(n.getY(i)) > 0.5 ? p.getZ(i) : p.getY(i));
            const m = new THREE.Mesh(geo, ((row + Math.round(x0)) % 3 === 0) ? this.mats.m02WetStone() : this.mats.m15Paving());
            m.position.y = -0.192; m.receiveShadow = true; paving.add(m);
          }
        }
        root.add(paving);

        const emblemGeo = new THREE.CircleGeometry(3.9, 64); emblemGeo.rotateX(-Math.PI * 0.5);
        const emblem = new THREE.Mesh(emblemGeo, this.mats.mEmblem()); emblem.position.set(0, 0.012, 0); emblem.receiveShadow = true; emblem.userData.ownedGeo = true; root.add(emblem);

        // 3. Left Ancient Flowering Tree & Landscaping
        const tree = this.assets.createAncientFloweringTree(16.0, 808); tree.position.set(-12.2, 0, -4.8); root.add(tree);
        this.swayObjects.push({ obj: tree, speed: 0.7, amp: 0.014, phase: 0.4, ownerId: 'active_scene' });
        const anchors = tree.userData.ribbonAnchors || [];
        for (let i = 0; i < Math.min(5, anchors.length); i++) {
          const rib = this.assets.createCeremonialRibbon(1.2 + rand() * 1.1, 0.14 + rand() * 0.06);
          rib.position.copy(anchors[i]).add(tree.position); rib.userData.ownerId = 'active_scene'; this.ribbons.push(rib); root.add(rib);
        }
        for (let i = 0; i < 10; i++) {
          const a = -0.4 + (i / 10) * Math.PI * 1.4, dist = 2.6 + rand() * 3.4, rxP = -12.2 + Math.cos(a) * dist, rzP = -4.8 + Math.sin(a) * dist * 0.7;
          if (rxP > -9.2 && rzP > -3.5) continue;
          const r = this.assets.createRock(i < 4 ? 'large' : 'medium', i); r.position.set(rxP, 0, rzP); r.scale.multiplyScalar(0.55); root.add(r);
          const fl = this.assets.createFlowerCluster(i % 2 === 0 ? 'sapphire' : 'lavender', 100 + i); fl.position.set(rxP + 0.6, 0, rzP + 0.5); root.add(fl);
        }

        // 4. Right Sanctuary Ruins, Ribbons & Warm Lantern
        const col1 = this.assets.createColumn(6.5, false, 1); col1.position.set(10.6, 0, -4.8); root.add(col1);
        const col2 = this.assets.createColumn(4.2, true, 2); col2.position.set(13.0, 0, -3.5); root.add(col2);
        const col3 = this.assets.createColumn(2.4, true, 3); col3.position.set(9.2, 0, -4.4); root.add(col3);
        const arch = this.assets.createArch(3.8, 4.8, 'partial'); arch.position.set(11.6, 0, -4.2); arch.rotation.y = -0.35; root.add(arch);
        for (let i = 0; i < 2; i++) { const rb = this.assets.createCeremonialRibbon(2.1 + i * 0.5, 0.22); rb.position.set(11.4 + i * 1.3, 4.5, -3.8 + i * 0.4); rb.userData.ownerId = 'active_scene'; this.ribbons.push(rb); root.add(rb); }
        const st = this.assets.createStaircase(5, 2.2, 0.18, 0.34); st.position.set(10.2, 0, -2.9); st.rotation.y = -0.35; root.add(st);
        const lantern = this.assets.createLantern(); lantern.position.set(10.6, 3.8, -3.2); root.add(lantern);

        // 5. Foreground Corners
        [[-11.2, 4.8], [-9.4, 5.4], [-7.5, 5.7], [8.0, 5.5], [10.2, 5.0], [11.8, 4.3]].forEach(([fx, fz], idx) => {
          const r = this.assets.createRock(idx % 2 === 0 ? 'medium' : 'small', 20 + idx); r.position.set(fx, 0, fz); root.add(r);
          const fl = this.assets.createFlowerCluster(idx % 2 === 0 ? 'sapphire' : 'lavender', 220 + idx); fl.position.set(fx * 0.94, 0, fz - 0.5); root.add(fl);
          const gr = this.assets.createGrassTuft(300 + idx); gr.position.set(fx * 0.96, 0, fz + 0.3); root.add(gr);
        });

        // 6. Distant Floating Islands, Aqueduct Bridge & Celestial Castle
        const distIslands = [[-34,4,-46,1.3],[22,8,-58,1.4],[-10,14,-76,1.7],[-56,12,-98,2.1],[68,10,-88,1.9],[-24,24,-142,2.4],[7,2,-105,1.7],[45,-4,-118,1.6],[-75,20,-160,2.7],[82,28,-180,2.5],[-42,37,-200,3.1],[14,48,-225,3.0],[110,19,-230,3.2],[-120,8,-245,3.2]];
        distIslands.forEach(([ix, iy, iz, sc], i) => {
          const isl = this.assets.createRock('island', 40 + i); isl.position.set(ix, iy, iz); isl.scale.setScalar(sc); root.add(isl);
          if (i < 6) { const wf = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 22), this.mats.m11Waterfall()); wf.position.set(ix, iy - 10, iz + 2.5); wf.userData.ownedGeo = true; this.waterfalls.push(wf); root.add(wf); }
        });
        const distBridge = new THREE.Group(); distBridge.name = 'DistantAqueductBridge';
        for (let b = 0; b < 3; b++) { const a = this.assets.createArch(4.8, 5.6, b === 2 ? 'partial' : 'complete'); a.position.set(b * 6.2, 0, 0); distBridge.add(a); }
        distBridge.position.set(-28, 3.5, -44); distBridge.rotation.y = 0.22; distBridge.scale.setScalar(1.35); root.add(distBridge);

        const castle = this.assets.createCelestialCastle(); castle.position.set(38, 22, -135); castle.rotation.y = -0.25; root.add(castle);
        const cWf = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 36), this.mats.m11Waterfall()); cWf.position.set(30, 2, -124); cWf.userData.ownedGeo = true; this.waterfalls.push(cWf); root.add(cWf);

        // 7. Logical Named Combat Anchors (12 Required Anchors)
        const logicalRoot = new THREE.Group(); logicalRoot.name = 'LogicalCombatAnchors';
        const anchorDefs = [['PlayerFront01',-4.5,0,1.5],['PlayerFront02',-4.5,0,-1.5],['PlayerRear01',-8.5,0,2.0],['PlayerRear02',-8.5,0,-2.0],['EnemyFront01',4.5,0,1.5],['EnemyFront02',4.5,0,-1.5],['EnemyRear01',8.5,0,2.0],['EnemyRear02',8.5,0,-2.0],['CombatCenter',0,0,0],['BossCenter',7,0,0],['PlayerEntrance',-11,0,0],['EnemyEntrance',11,0,0]];
        for (const [name, ax, ay, az] of anchorDefs) { const n = new THREE.Object3D(); n.name = name; n.position.set(ax, ay, az); logicalRoot.add(n); this.combatAnchors.set(name, n); }
        root.add(logicalRoot);

        const makeSil = (name, color, h = 1.8) => {
          const g = new THREE.Group(), anc = this.combatAnchors.get(name);
          const b = new THREE.Mesh(new THREE.CapsuleGeometry(h * 0.16, h * 0.68, 4, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.5 }));
          b.position.y = h * 0.5; g.add(b);
          const ring = new THREE.Mesh(new THREE.RingGeometry(h * 0.25, h * 0.34, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
          ring.rotation.x = -Math.PI * 0.5; ring.position.y = 0.04; g.add(ring);
          if (anc) g.position.copy(anc.position); return g;
        };
        this.debug4v4Group = new THREE.Group(); this.debug4v4Group.name = 'Debug4v4Silhouettes'; this.debug4v4Group.visible = this.showAnchors4v4;
        ['PlayerFront01','PlayerFront02','PlayerRear01','PlayerRear02'].forEach(n => this.debug4v4Group.add(makeSil(n, '#78c9ed', 1.8)));
        ['EnemyFront01','EnemyFront02','EnemyRear01','EnemyRear02'].forEach(n => this.debug4v4Group.add(makeSil(n, '#e87a90', 1.8)));
        root.add(this.debug4v4Group);
        this.debugBossGroup = new THREE.Group(); this.debugBossGroup.name = 'DebugBossSilhouette'; this.debugBossGroup.visible = this.showBossAnchor;
        this.debugBossGroup.add(makeSil('BossCenter', '#ebd6a6', 4.5)); root.add(this.debugBossGroup);

        this.worldGroup.add(root);
        this.addCloudLayer(-9, 10, 0);
        this.addFallingPetals(150, 32, 0, 0);
        this.setCameraPreset('battle', false);
      }

      buildRegionalArena(theme) {
        // New low-poly arenas keep the existing 12 anchor positions and flat combat floor.
        const root=new THREE.Group();root.name='RegionalArena_'+theme;
        const deck=new THREE.Mesh(new THREE.CylinderGeometry(14.5,13.5,.44,32),this.mats.m15Paving());deck.scale.z=.48;deck.position.y=-.22;deck.receiveShadow=true;root.add(deck);
        const core=new THREE.Mesh(new THREE.CylinderGeometry(14,9,3.8,20),this.mats.m03Bedrock());core.scale.z=.5;core.position.y=-2.35;root.add(core);
        const color=theme==='garden'?0x94deca:theme==='crystal'?0xa6a1ed:0xe5c48b;
        const ringMat=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.6});
        for(const radius of [2.6,4.0,6.3]){const ring=new THREE.Mesh(new THREE.RingGeometry(radius-.035,radius,40),ringMat);ring.rotation.x=-Math.PI/2;ring.scale.y=.78;ring.position.y=.012;root.add(ring);}
        if(theme==='garden'){
          for(const [i,x] of [-12,-7,7,12].entries()){const tree=this.assets.createAncientFloweringTree(i%2?7:10,3200+i);tree.position.set(x,0,-5.2);root.add(tree);const flowers=this.assets.createFlowerCluster(i%2?'lavender':'sapphire',3300+i);flowers.position.set(x,0,4.9);root.add(flowers);}
          const arch=this.assets.createArch(4.8,5.5,'complete');arch.position.set(0,0,-6);root.add(arch);
        }else if(theme==='crystal'){
          for(let i=0;i<8;i++){const x=-14+i*4,cr=this.assets.createCrystalCluster(1.3+(i%3)*.65,3400+i);cr.position.set(x,0,-5.8);root.add(cr);}
          for(let i=0;i<5;i++){const rock=this.assets.createRock('large',3450+i);rock.position.set(-14+i*7,3.5,-8.5);rock.scale.set(1.8,3.2,1.5);root.add(rock);}
          const wf=new THREE.Mesh(new THREE.PlaneGeometry(4,10),this.mats.m11Waterfall());wf.position.set(0,4,-10);this.waterfalls.push(wf);root.add(wf);
        }else{
          for(let i=0;i<6;i++){const col=this.assets.createColumn(3.6+i%3*1.4,i%2===0,3500+i);col.position.set(-12+i*4.8,0,-5.5);root.add(col);}
          const portal=this.assets.createArch(6,7,'complete');portal.position.set(0,0,-7);root.add(portal);
          const halo=new THREE.Mesh(new THREE.TorusGeometry(2.4,.055,6,40),ringMat);halo.position.set(0,4,-6.9);root.add(halo);
        }
        const anchors=[['PlayerFront01',-4.5,0,1.5],['PlayerFront02',-4.5,0,-1.5],['PlayerRear01',-8.5,0,2],['PlayerRear02',-8.5,0,-2],['EnemyFront01',4.5,0,1.5],['EnemyFront02',4.5,0,-1.5],['EnemyRear01',8.5,0,2],['EnemyRear02',8.5,0,-2],['CombatCenter',0,0,0],['BossCenter',7,0,0],['PlayerEntrance',-11,0,0],['EnemyEntrance',11,0,0]];
        for(const [name,x,y,z] of anchors){const anchor=new THREE.Object3D();anchor.name=name;anchor.position.set(x,y,z);root.add(anchor);this.combatAnchors.set(name,anchor);}
        this.worldGroup.add(root);this.addCloudLayer(-9,10,0);this.addFallingPetals(theme==='crystal'?30:80,32,0,0);this.setCameraPreset('battle',false);
      }

      sampleWildsHeight(x) {
        if(x>=220)return extraHeight(x);
        const cx = Math.max(0, Math.min(220, x));
        if (cx < 35) return (cx / 35) * 1.4 + Math.sin(cx * 0.14) * Math.sin(Math.PI * cx / 35) * 0.18;
        if (cx < 75) return 1.4 + ((cx - 35) / 40) * 1.6;
        if (cx < 110) return 3.0 + Math.sin(((cx - 75) / 35) * Math.PI) * 0.65;
        if (cx < 140) return 3.0 + ((cx - 110) / 30) * 1.4;
        if (cx < 185) return 4.4 + ((cx - 140) / 45) * 5.2;
        if (cx < 194) return 9.6;
        if (cx < 198.32) return 9.6 + ((cx - 194) / 4.32) * 2.04;
        return 11.64;
      }
      terrainVisualHeight(x, z) {
        const y = this.sampleWildsHeight(x);
        const chamberBlend = Math.max(0, Math.min(1, (x - 119) / 1.0, (130 - x) / 1.0));
        return y - Math.max(0, z - 3.6) * 0.45 + Math.max(0, -4.2 - z) * 0.35 * (1 - chamberBlend);
      }
      createWildsTerrain(minX, maxX) {
        const geo = new THREE.PlaneGeometry(maxX - minX, 18, Math.ceil((maxX - minX) * 2), 20); geo.rotateX(-Math.PI / 2);
        const p = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (minX + maxX) / 2, z = p.getZ(i); p.setXYZ(i, x, this.terrainVisualHeight(x, z), z); uv.setXY(i, x / 4, z / 4); }
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, this.mats.m14Soil()); m.name = 'TraversableTerrain'; m.receiveShadow = true; return m;
      }
      getWildsSectionName(x) {
        return regionForX(this.sectionSpecs,Math.max(0,x)).name;
      }

      buildSapphireWilds() {
        const root = new THREE.Group(); root.name = 'TheSapphireWilds_Root'; this.wildsRoot = root;
        this.collisions.clear(); this.collisions.setOwner('wilds_global');
        root.add(this.createWildsTerrain(-5, WORLD_END_X+5));
        this.collisions.addBox(WORLD_END_X/2, 15, 3.85, WORLD_END_X+4, 40, 0.7, 'cliff_front');
        this.collisions.addBox(60, 8, -4.5, 120, 24, 0.7, 'cliff_back_left');
        this.collisions.addBox(174.5, 12, -4.5, 91, 24, 0.7, 'cliff_back_right');
        this.collisions.addBox(261,16,-4.5,82,32,.7,'expansion_back');

        const avatar = makeExplorationAvatar(this.appearanceTint ?? 0xffffff);

        if (this.savedExploreState) { this.playerPos.copy(this.savedExploreState.position); this.playerVelY = this.savedExploreState.velocityY; this.grounded = this.savedExploreState.grounded; }
        else { this.playerPos.set(6, this.sampleWildsHeight(6), 0); this.playerVelY = 0; this.grounded = true; }
        avatar.position.copy(this.playerPos); this.player = avatar; resetLocomotion(this.locomotion,this.grounded);avatar.userData.applyPose(this.locomotion);root.add(avatar);
        this.worldGroup.add(root);
        this.addCloudLayer(-6, 12, 110); this.addFallingPetals(160, 120, 110, 4);
        this.updateWildsStreaming(true);

        if (this.savedExploreState) { this.camera.position.copy(this.savedExploreState.cameraPos); this.controls.target.copy(this.savedExploreState.cameraTarget); }
        else { this.camera.position.set(this.playerPos.x + 2, this.playerPos.y + 4.8, 16.5); this.controls.target.set(this.playerPos.x + 2.5, this.playerPos.y + 1.8, 0); }
        this.controls.update();
      }

      buildMaterialGallery() {
        const root = new THREE.Group(); root.name = 'MasterMaterialGallery';
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 22), this.mats.m02WetStone()); floor.rotation.x = -Math.PI * 0.5; floor.receiveShadow = true; floor.userData.ownedGeo = true; root.add(floor);
        const sphereGeo = new THREE.SphereGeometry(0.92, 28, 20);
        this.mats.getAll15().forEach((item, idx) => {
          const m = new THREE.Mesh(sphereGeo, item.mat); m.name = item.name;
          m.position.set(-8.8 + (idx % 5) * 4.4, 1.25, -4.4 + Math.floor(idx / 5) * 4.4); m.castShadow = m.receiveShadow = true; root.add(m);
        });
        this.worldGroup.add(root);
        this.camera.position.set(0, 8.5, 16.5); this.controls.target.set(0, 1.0, 0); this.controls.update();
      }

      buildAssetKit() {
        const root = new THREE.Group(); root.name = 'EnvironmentalAssetKit';
        const isOv = this.assetCategory === 'overview';
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(isOv ? 46 : 100, isOv ? 30 : 90), this.mats.m15Paving());
        floor.rotation.x = -Math.PI * 0.5; floor.receiveShadow = true; floor.userData.ownedGeo = true; root.add(floor);
        if (!isOv) {
          this.populateAssetLibrary(root, this.assetCategory); this.worldGroup.add(root);
          this.camera.position.set(20, 22, 48); this.controls.target.set(14, 2, 12); this.controls.update(); return;
        }
        ['small', 'medium', 'large', 'vertical', 'island'].forEach((t, i) => { const r = this.assets.createRock(t, i); r.position.set(-14 + i * 7, t === 'island' ? 3.2 : 0, -7); root.add(r); });
        const slab = this.assets.createFloorSlab(1.8, 1.8, 0.26, 1); slab.position.set(-14, 0, 2); root.add(slab);
        const cA = this.assets.createColumn(6.2, false, 1); cA.position.set(-8, 0, 2); root.add(cA);
        const cB = this.assets.createColumn(3.1, true, 2); cB.position.set(-3, 0, 2); root.add(cB);
        const arch = this.assets.createArch(3.8, 4.8, 'partial'); arch.position.set(4, 0, 2); root.add(arch);
        const st = this.assets.createStaircase(8, 2.6); st.position.set(12, 0, 2); root.add(st);
        const tree = this.assets.createAncientFloweringTree(10.0, 901); tree.position.set(-12, 0, 9); root.add(tree);
        const f1 = this.assets.createFlowerCluster('sapphire', 1); f1.position.set(-2, 0, 9); root.add(f1);
        const f2 = this.assets.createFlowerCluster('lavender', 2); f2.position.set(0.5, 0, 9); root.add(f2);
        const cr = this.assets.createCrystalCluster(1.2, 3); cr.position.set(4, 0, 9); root.add(cr);
        const wf = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 8.0), this.mats.m11Waterfall()); wf.position.set(11, 4.0, 9); wf.userData.ownedGeo = true; this.waterfalls.push(wf); root.add(wf);
        this.worldGroup.add(root); this.camera.position.set(0, 12.5, 28); this.controls.target.set(0, 2.2, 2); this.controls.update();
      }

      buildWildsSectionGroup(secIdx, registerRuntime = true) {
        const spec = this.sectionSpecs[secIdx], secId = spec.id, g = new THREE.Group(); g.name = secId;
        const rand = this.assets.rng(2026 + secIdx * 131);
        if (registerRuntime) this.collisions.setOwner(secId);

        const addEnc = (e) => {
          e={...e,battleMapId:arenaForEncounter(e.id)};
          const ey = this.terrainVisualHeight(e.x,e.z), eg = new THREE.Group(); eg.userData.exportExclude = true;
          const sz = e.category === 'Boss' ? 0.78 : (e.category === 'Elite' ? 0.65 : 0.52);
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(sz, 0), new THREE.MeshStandardMaterial({ color: e.color, emissive: e.color, emissiveIntensity: 0.68, roughness: 0.3 }));
          m.position.y = 1.3; m.userData.ownedGeo = m.userData.ownedMat = true; eg.add(m);
          const ring = new THREE.Mesh(new THREE.RingGeometry(e.triggerRadius * 0.55, e.triggerRadius * 0.68, 24), new THREE.MeshBasicMaterial({ color: e.color, side: THREE.DoubleSide, transparent: true, opacity: 0.72 }));
          ring.rotation.x = -Math.PI * 0.5; ring.position.y = 0.08; ring.userData.ownedGeo = ring.userData.ownedMat = true; eg.add(ring);
          eg.position.set(e.x, ey, e.z); eg.visible=!this.completedEncounters?.has(e.id); g.add(eg);
          if (registerRuntime) this.encounters.push({ ...e, pos: eg.position, mesh: m, ownerId: secId });
        };
        const addDisc = (d) => {
          const dg = new THREE.Group(); dg.userData.exportExclude = true;
          const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: '#ebd6a6', emissive: '#ebd6a6', emissiveIntensity: 0.8, roughness: 0.2 }));
          orb.position.y = 1.1; orb.userData.ownedGeo = orb.userData.ownedMat = true; if (this.foundDiscoveries.has(d.id)) orb.visible = false;
          dg.add(orb); dg.position.set(d.x, d.y, d.z); g.add(dg);
          if (registerRuntime) this.discoveries.push({ ...d, pos: dg.position, mesh: orb, ownerId: secId });
        };
        const addCamObs = (obj) => { if (registerRuntime) { obj.userData.ownerId = secId; this.cameraObstacles.push(obj); } };
        if(this.servicePoints)for(const service of this.servicePoints.filter(s=>s.x>=spec.minX&&s.x<spec.maxX)){
          const sy=this.terrainVisualHeight(service.x,service.z);
          const marker=new THREE.Mesh(new THREE.OctahedronGeometry(.48,0),new THREE.MeshStandardMaterial({color:'#ebd6a6',emissive:'#ebd6a6',emissiveIntensity:.8}));
          marker.name=service.id;marker.position.set(service.x,sy+1.15,service.z);marker.userData.ownedGeo=marker.userData.ownedMat=true;g.add(marker);
          const ring=new THREE.Mesh(new THREE.RingGeometry(.55,.65,24),new THREE.MeshBasicMaterial({color:'#ebd6a6',side:THREE.DoubleSide,transparent:true,opacity:.75}));
          ring.rotation.x=-Math.PI/2;ring.position.set(service.x,sy+.04,service.z);ring.userData.ownedGeo=ring.userData.ownedMat=true;g.add(ring);
        }

        const vegStep = this.quality === 'performance' ? 14 : (this.quality === 'balanced' ? 10 : 8);
        for (let x = Math.max(8, spec.minX + 3); x < Math.min(WORLD_MAX_X-4, spec.maxX); x += vegStep) {
          const rz = -3.4 - rand() * 0.8, ry = this.sampleWildsHeight(x), isLarge = x % 16 === 0;
          const r = this.assets.createRock(isLarge ? 'large' : 'medium', x); r.position.set(x, ry, rz); r.scale.multiplyScalar(0.55); g.add(r);
          if (registerRuntime && isLarge && (x < 118 || x > 130)) { addCamObs(r); this.collisions.addBox(x, ry + 0.65, rz, 1.3, 1.3, 1.1, 'major_rock'); }
          const fl = this.assets.createFlowerCluster(x % 2 === 0 ? 'sapphire' : 'lavender', x); fl.position.set(x + 1.5, this.sampleWildsHeight(x + 1.5), 2.2 + rand() * 0.9); g.add(fl);
        }

        if (secIdx === 0) {
          for (let i = 0; i < 7; i++) {
            const x = 4 + i * 5.0, isAnc = (i === 1 || i === 5), tz = isAnc ? -3.4 : -3.8 - rand() * 1.4, y = this.sampleWildsHeight(x);
            const t = this.assets.createAncientFloweringTree(isAnc ? 13 : 7.0, 100 + i); t.position.set(x, y, tz); g.add(t); addCamObs(t);
            if (registerRuntime) { this.collisions.addCylinder(x, y, tz, isAnc ? 1.05 : 0.55, 8.0, 'tree_trunk'); if (isAnc) this.collisions.addCylinder(x + 1.4, y, tz + 1.1, 0.35, 0.9, 'tree_root'); }
          }
          addEnc({ id: 'wilds_grove_01', x: 18, z: 0.0, category: 'Normal', battleMapId: 'sapphire_sanctuary', triggerRadius: 2.0, label: 'Whispering Grove Spirit (Normal)', color: '#78c9ed' });
        } else if (secIdx === 1) {
          for (let x = 37; x < 73; x += 4.5) {
            const y = this.sampleWildsHeight(x), slab = this.assets.createFloorSlab(3.9, 3.8, 0.22, x); slab.position.set(x, y - 0.16, 0); g.add(slab);
            if (x % 9 < 4.5) { const ch = 2.6 + rand() * 3.4, c = this.assets.createColumn(ch, true, x); c.position.set(x, y, -3.1); g.add(c); addCamObs(c); if (registerRuntime) this.collisions.addCylinder(x, y, -3.1, 0.62, ch, 'ruin_column'); }
          }
          const ra = this.assets.createArch(4.2, 5.2, 'partial'); ra.position.set(56, this.sampleWildsHeight(56), -0.4); ra.rotation.y = Math.PI * 0.5; g.add(ra); addCamObs(ra);
          if (registerRuntime) { this.collisions.addBox(56, this.sampleWildsHeight(56) + 2.2, -2.9, 1.0, 4.4, 0.9, 'arch_pier'); this.collisions.addBox(56, this.sampleWildsHeight(56) + 2.2, 2.1, 1.0, 4.4, 0.9, 'arch_pier'); }
          const upB = this.sampleWildsHeight(42), upD = upB + 3.4, downE = this.sampleWildsHeight(68.1);
          const sL = this.assets.createStaircase(14, 1.8, 3.4 / 14, 0.42); sL.position.set(42.0, upB, -2.2); sL.rotation.y = -Math.PI * 0.5; g.add(sL);
          const uDeck = new THREE.Mesh(new THREE.BoxGeometry(14.5, 0.36, 1.9), this.mats.m15Paving()); uDeck.position.set(55.0, upD - 0.18, -2.2); uDeck.castShadow = uDeck.receiveShadow = true; uDeck.userData.ownedGeo = true; g.add(uDeck);
          const sR = this.assets.createStaircase(14, 1.8, (upD - downE) / 14, 0.42); sR.position.set(68.0, downE, -2.2); sR.rotation.y = Math.PI * 0.5; g.add(sR);
          if (registerRuntime) {
            this.collisions.addRamp(42.0, upB, 47.9, upD, -3.1, -1.3, 'pilgrimage_stairs_up');
            this.collisions.addPlatform(47.7, 62.3, upD, -3.15, -1.25, 0.36, 'pilgrimage_deck');
            this.collisions.addRamp(62.2, upD, 68.1, downE, -3.1, -1.3, 'pilgrimage_stairs_down');
          }
          addEnc({ id: 'wilds_pilgrimage_01', x: 46, z: 0.4, category: 'Normal', battleMapId: 'sapphire_sanctuary', triggerRadius: 2.0, label: 'Pilgrimage Sentinel (Normal)', color: '#78c9ed' });
          addEnc({ id: 'wilds_pilgrimage_02', x: 66, z: 0.2, category: 'Normal', battleMapId: 'sapphire_sanctuary', triggerRadius: 2.0, label: 'Ruined Arch Warden (Normal)', color: '#78c9ed' });
          addDisc({ id: 'disc_pilgrimage', x: 55.0, y: upD, z: -2.2, label: 'Hidden Reliquary (Upper Walkway)' });
        } else if (secIdx === 2) {
          const wfY = this.sampleWildsHeight(92);
          const wf1 = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 19), this.mats.m11Waterfall()); wf1.position.set(92, wfY + 8, -5.8); wf1.userData.ownerId = secId; wf1.userData.ownedGeo = true; g.add(wf1);
          const wf2 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 11), this.mats.m11Waterfall()); wf2.position.set(84, wfY + 4.8, -6.2); wf2.userData.ownerId = secId; wf2.userData.ownedGeo = true; g.add(wf2);
          const strm = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 12), this.mats.m11Waterfall()); strm.rotation.x = -Math.PI * 0.5; strm.position.set(92, wfY + 0.06, 0); strm.userData.ownerId = secId; strm.userData.ownedGeo = true; g.add(strm);
          if (registerRuntime) this.waterfalls.push(wf1, wf2, strm);
          const br = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.35, 3.2), this.mats.m15Paving()); br.position.set(92, wfY + 0.24, 0); br.castShadow = br.receiveShadow = true; br.userData.ownedGeo = true; g.add(br);
          for (const [x0,y0,x1,y1] of [[86.2,this.sampleWildsHeight(86.2),87.8,wfY+0.41],[96.2,wfY+0.41,97.8,this.sampleWildsHeight(97.8)]]) {
            const angle = Math.atan2(y1-y0,x1-x0), ramp = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x1-x0,y1-y0),0.18,3.2),this.mats.m15Paving());
            ramp.rotation.z = angle; ramp.position.set((x0+x1)/2 + Math.sin(angle)*0.09,(y0+y1)/2 - Math.cos(angle)*0.09,0); ramp.receiveShadow = true; g.add(ramp);
          }
          if (registerRuntime) {
            this.collisions.addPlatform(87.7, 96.3, wfY + 0.41, -1.6, 1.6, 0.35, 'waterfall_bridge');
            this.collisions.addRamp(86.2, this.sampleWildsHeight(86.2), 87.8, wfY + 0.41, -1.6, 1.6, 'bridge_approach_l');
            this.collisions.addRamp(96.2, wfY + 0.41, 97.8, this.sampleWildsHeight(97.8), -1.6, 1.6, 'bridge_approach_r');
          }
          addEnc({ id: 'wilds_waterfall_01', x: 100, z: 0.0, category: 'Normal', battleMapId: 'sapphire_sanctuary', triggerRadius: 2.0, label: 'Waterfall Mist Spirit (Normal)', color: '#78c9ed' });
        } else if (secIdx === 3) {
          for (const [x,y,z,w,h,d] of [[124.5,6,-7.2,9.6,10,0.6],[119.7,6,-5.6,0.6,10,3.2],[129.3,6,-5.6,0.6,10,3.2]]) {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(w,h,d,Math.ceil(w),5,Math.ceil(d)),this.mats.m03Bedrock());
            wall.position.set(x,y,z); wall.castShadow=wall.receiveShadow=true; g.add(wall);
          }
          if (registerRuntime) {
            this.collisions.addBox(124.5, 6, -7.2, 9.6, 10, 0.6, 'cave_chamber_back');
            this.collisions.addBox(119.7, 6, -5.6, 0.6, 10, 3.2, 'cave_chamber_left');
            this.collisions.addBox(129.3, 6, -5.6, 0.6, 10, 3.2, 'cave_chamber_right');
          }
          for (let x = 112; x <= 138; x += 4.4) {
            const y = this.sampleWildsHeight(x), ca = this.assets.createArch(5.4, 5.4, 'complete'); ca.position.set(x, y, 0); ca.rotation.y = Math.PI * 0.5; g.add(ca); addCamObs(ca);
            if (registerRuntime) this.collisions.addCeiling(x - 2.3, x + 2.3, y + 4.35, -7.2, 3.6, 'cave_ceiling');
            if (x < 120 || x > 129) { const cr = this.assets.createCrystalCluster(1.05, 700 + x); cr.position.set(x, y, -2.5); g.add(cr); if (registerRuntime) this.collisions.addBox(x, y + 0.7, -2.5, 0.9, 1.4, 0.9, 'cave_crystal'); }
          }
          const chY = this.sampleWildsHeight(124.5), sc = this.assets.createCrystalCluster(1.6, 799); sc.position.set(124.5, chY, -6.1); g.add(sc);
          const cl = new THREE.PointLight('#78c9ed', 3.8, 28, 1.35); cl.position.set(125, chY + 3.0, -1.5); g.add(cl);
          addEnc({ id: 'wilds_cave_01', x: 126, z: 0.2, category: 'Normal', battleMapId: 'sapphire_sanctuary', triggerRadius: 2.0, label: 'Forgotten Cavern Wraith (Normal)', color: '#9b96c9' });
          addDisc({ id: 'disc_cave', x: 124.5, y: chY, z: -5.4, label: 'Submerged Crystal Shrine (Side Chamber)' });
        } else if (secIdx === 4) {
          for (let x = 146; x < 182; x += 9) {
            const y = this.sampleWildsHeight(x), t = this.assets.createAncientFloweringTree(10 + rand() * 3, 200 + x); t.position.set(x, y, -3.6); g.add(t); addCamObs(t);
            if (registerRuntime) this.collisions.addCylinder(x, y, -3.6, 0.78, 8.0, 'heights_tree');
          }
          const oS = this.sampleWildsHeight(152), oT = oS + 2.8, oE = this.sampleWildsHeight(173.5);
          const oSt = this.assets.createStaircase(12, 1.9, 2.8 / 12, 0.42); oSt.position.set(152, oS, -2.2); oSt.rotation.y = -Math.PI * 0.5; g.add(oSt);
          const oDk = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.36, 2.0), this.mats.m15Paving()); oDk.position.set(162.8, oT - 0.18, -2.2); oDk.castShadow = oDk.receiveShadow = true; oDk.userData.ownedGeo = true; g.add(oDk);
          const descent = this.assets.createStaircase(12,1.9,(oT-oE)/12,5/12); descent.position.set(173.5,oE,-2.2); descent.rotation.y=Math.PI*0.5; g.add(descent);
          if (registerRuntime) {
            this.collisions.addRamp(152, oS, 157, oT, -3.15, -1.25, 'overlook_stairs');
            this.collisions.addPlatform(157, 168.6, oT, -3.2, -1.2, 0.36, 'overlook_deck');
            this.collisions.addRamp(168.5, oT, 173.5, oE, -3.15, -1.25, 'overlook_exit');
          }
          addEnc({ id: 'wilds_heights_01', x: 148, z: 0, category: 'Normal', battleMapId: 'sapphire_sanctuary', triggerRadius: 2.0, label: 'Blossom Terrace Scout (Normal)', color: '#78c9ed' });
          addEnc({ id: 'wilds_heights_02', x: 164, z: 0.5, category: 'Normal', battleMapId: 'sapphire_sanctuary', triggerRadius: 2.0, label: 'Sapphire Canopy Guard (Normal)', color: '#78c9ed' });
          addEnc({ id: 'wilds_heights_elite', x: 179, z: 0, category: 'Elite', battleMapId: 'sapphire_sanctuary', triggerRadius: 2.2, label: 'Blossom Heights Warden (Elite)', color: '#ebd6a6' });
          addDisc({ id: 'disc_overlook', x: 163.0, y: oT, z: -2.2, label: 'Sky Blossom Overlook (Upper Terrace)' });
        } else if(secIdx===5) {
          const stS = this.sampleWildsHeight(194), gs = this.assets.createStaircase(12, 4.4, 0.17, 0.36); gs.position.set(194, stS, 0); gs.rotation.y = -Math.PI * 0.5; g.add(gs);
          const gY = this.sampleWildsHeight(208), ga = this.assets.createArch(5.0, 7.0, 'complete'); ga.position.set(208, gY, 0); ga.rotation.y = Math.PI * 0.5; g.add(ga); addCamObs(ga);
          const gl = this.assets.createLantern(); gl.position.set(206.8, gY + 4.8, 1.9); g.add(gl);
          const c = this.assets.createCelestialCastle(); c.position.set(238, 24, -108); g.add(c);
          if (registerRuntime) {
            this.collisions.addRamp(194, stS, 198.32, stS + 2.04, -2.2, 2.2, 'sanctuary_grand_stairs');
            this.collisions.addBox(208, gY + 3.0, -2.95, 1.1, 6.0, 1.0, 'grand_arch_pier');
            this.collisions.addBox(208, gY + 3.0, 2.95, 1.1, 6.0, 1.0, 'grand_arch_pier');
          }
          addEnc({ id: 'wilds_sanctuary_guard', x: 202, z: 0, category: 'Elite', battleMapId: 'sapphire_sanctuary', triggerRadius: 2.2, label: 'Sanctuary Vanguard (Elite)', color: '#ebd6a6' });
          addEnc({ id: 'wilds_sanctuary_boss', x: 213, z: 0, category: 'Boss', battleMapId: 'sapphire_sanctuary', triggerRadius: 2.4, label: 'Celestial Gatekeeper (Boss)', color: '#e87a90' });
        }
        if(secIdx>=6){
          const garden=secIdx===6;
          for(let i=0;i<5;i++){const x=spec.minX+4+i*7,y=this.sampleWildsHeight(x);const obj=garden?this.assets.createAncientFloweringTree(6+i%3,3600+i):this.assets.createColumn(4+i%3,true,3700+i);obj.position.set(x,y,-3.6);g.add(obj);addCamObs(obj);if(registerRuntime)this.collisions.addCylinder(x,y,-3.6,.52,4,'expansion_pillar');}
          for(let i=0;i<3;i++){const x=spec.minX+9+i*11,obj=garden?this.assets.createFlowerCluster('lavender',3800+i):this.assets.createCrystalCluster(1.1,3900+i);obj.position.set(x,this.terrainVisualHeight(x,2.65),2.65);g.add(obj);}
          const gx=spec.minX+18,arch=this.assets.createArch(4.5,5.2,garden?'complete':'partial');arch.position.set(gx,this.sampleWildsHeight(gx),-3.1);g.add(arch);addCamObs(arch);
          // Optional side alcove, off the main travel lane and within existing collision bounds.
          const dx=spec.minX+29,dz=-2.2,dy=this.terrainVisualHeight(dx,dz);const shrine=this.assets.createCrystalCluster(1.2,4000+secIdx);shrine.position.set(dx,dy,-3.25);g.add(shrine);
          addDisc({id:garden?'disc_moonveil':'disc_astral',x:dx,y:dy,z:dz,label:garden?'Moonveil Reliquary (Garden Alcove)':'Astral Archive (Ruined Alcove)'});
          for(const enc of EXTRA_ENCOUNTERS.filter(e=>e.x>=spec.minX&&e.x<spec.maxX))addEnc(enc);
        }
        if (registerRuntime) { this.resourcePool.trackOwnedObject(secId, g); this.collisions.setOwner('global'); }
        return g;
      }

      updateWildsStreaming(immediate = false) {
        if (!this.wildsRoot) return;
        const px = this.playerPos.x, loadDist = 54, unloadDist = 78;
        for (const spec of this.sectionSpecs) {
          const dist = px < spec.minX ? (spec.minX - px) : (px > spec.maxX ? (px - spec.maxX) : 0);
          const isLoaded = this.wildsSections.has(spec.id);
          if (!isLoaded && dist <= loadDist) {
            if (immediate && dist === 0) { const grp = this.buildWildsSectionGroup(spec.idx, true); this.wildsRoot.add(grp); this.wildsSections.set(spec.id, { group: grp, spec }); }
            else if (!this.wildsStreamQueue.includes(spec.idx)) this.wildsStreamQueue.push(spec.idx);
          } else if (isLoaded && dist > unloadDist) this.unloadWildsSection(spec.id);
        }
        if (this.wildsStreamQueue.length > 0) {
          const nextIdx = this.wildsStreamQueue.shift(), spec = this.sectionSpecs[nextIdx];
          const distance = spec ? Math.max(spec.minX - px, px - spec.maxX, 0) : Infinity;
          if (spec && distance <= loadDist && !this.wildsSections.has(spec.id)) { const grp = this.buildWildsSectionGroup(nextIdx, true); this.wildsRoot.add(grp); this.wildsSections.set(spec.id, { group: grp, spec }); }
        }
      }

      async triggerEncounterTransition(enc) {
        if (this.transitionState !== 'idle' || this.exportBusy) return;
        this.transitionState = 'entering_battle'; this.inputLocked = true; this.resetInput(); let sceneChanged = false;
        try {
          const mapId = enc.battleMapId || 'sapphire_sanctuary', mapDef = this.battleRegistry.get(mapId);
          if (!mapDef) throw new Error(`Battle map "${mapId}" not registered in BattleMapRegistry`);
          document.getElementById('curtain-sub').textContent = `${enc.category.toUpperCase()} ENCOUNTER • ${enc.label}`;
          document.getElementById('curtain-title').textContent = `Entering ${mapDef.title}`;
          this.savedExploreState = {
            position: enc.safeReturnPosition ? enc.safeReturnPosition.clone() : this.playerPos.clone(),
            velocityY: this.playerVelY, grounded: this.grounded,
            cameraPos: this.camera.position.clone(), cameraTarget: this.controls.target.clone(), encounterId: enc.id
          };
          await this.inkFX.animateTo(1, 440);
          sceneChanged = true; this.inBattleFromExplore = true; this.mode = 'sanctuary'; this.controls.enabled = true; this.clearWorld();
          if (this.keyLight) { this.keyLight.position.set(28, 42, 22); this.keyLight.target.position.set(0, 0, 0); }
          document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'sanctuary'));
          document.getElementById('explore-bar').classList.add('hidden');
          document.getElementById('encounter-bar').classList.add('hidden');
          document.getElementById('badge-discoveries').classList.add('hidden');
          document.getElementById('return-bar').classList.remove('hidden');
          document.getElementById('mode-subtitle').textContent = mapDef.subtitle;
          document.getElementById('badge-section').textContent = mapDef.badge;
          await mapDef.build(); this.updateAtmosphere();
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          await this.inkFX.animateTo(0, 420);
        } catch (err) {
          console.error('Battle transition failed:', err);
          if (sceneChanged) { this.inBattleFromExplore = false; try { this.loadMode('wilds'); } catch (e) { console.error(e); } }
          await this.inkFX.animateTo(0, 260);
        } finally { this.resetInput(); this.inputLocked = false; this.transitionState = 'idle'; }
      }

      async returnToExploration() {
        if (this.transitionState !== 'idle' || this.exportBusy) return;
        this.transitionState = 'returning_explore'; this.inputLocked = true; this.resetInput();
        try {
          document.getElementById('curtain-sub').textContent = 'Restoring Exploration State';
          document.getElementById('curtain-title').textContent = 'The Sapphire Wilds';
          await this.inkFX.animateTo(1, 400);
          if (this.savedExploreState?.encounterId) this.retriggerCooldowns.set(this.savedExploreState.encounterId, performance.now() + 3500);
          this.inBattleFromExplore = false; this.loadMode('wilds');
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          await this.inkFX.animateTo(0, 380);
        } catch (err) {
          console.error('Return failed:', err); this.inBattleFromExplore = true;
          try { this.loadMode('sanctuary'); document.getElementById('return-bar').classList.remove('hidden'); } catch (e) { console.error(e); }
          await this.inkFX.animateTo(0, 260);
        } finally { this.resetInput(); this.inputLocked = false; this.transitionState = 'idle'; }
      }

      setCameraPreset(name, smooth = true) {
        const presets = {
          battle: { p: [0, 6.5, 24], t: [0, 1.5, 0] }, tree: { p: [-4.5, 6.2, 8.5], t: [-11.5, 6.0, -4.5] },
          emblem: { p: [0, 9.5, 6.2], t: [0, 0, 0] }, ruins: { p: [6.0, 4.5, 8.0], t: [11.2, 2.5, -4.2] },
          castle: { p: [10, 16, 18], t: [36, 28, -130] }, underside: { p: [0, -5.5, 25], t: [0, -2.5, 0] }
        };
        const cfg = presets[name] || presets.battle, p = new THREE.Vector3(...cfg.p), t = new THREE.Vector3(...cfg.t);
        if (smooth) this.camLerp = { pos: p, target: t };
        else { this.camLerp = null; this.camera.position.copy(p); this.controls.target.copy(t); this.controls.update(); }
      }

      applyQuality(q) {
        this.quality = q;
        const map = {
          performance: { dpr: 0.85, shadows: false, shadowSize: 512, petalRatio: 0.35, mistCount: 4, wetRough: 0.62, label: 'Performance' },
          balanced: { dpr: 1.25, shadows: true, shadowSize: 1024, petalRatio: 0.65, mistCount: 8, wetRough: 0.48, label: 'Balanced' },
          high: { dpr: 1.65, shadows: true, shadowSize: 2048, petalRatio: 1.00, mistCount: 10, wetRough: 0.36, label: 'High' },
          cinematic: { dpr: 2.00, shadows: true, shadowSize: 4096, petalRatio: 1.00, mistCount: 12, wetRough: 0.26, label: 'Cinematic' }
        };
        const cfg = map[q] || map.balanced; this.baseDprCap = cfg.dpr; this.qualityConfig = cfg; this.updateRenderScale();
        if (this.renderer.shadowMap) { this.renderer.shadowMap.enabled = cfg.shadows; this.renderer.shadowMap.needsUpdate = true; }
        this.keyLight.castShadow = cfg.shadows;
        if (this.keyLight.shadow) {
          if (this.keyLight.shadow.map) { this.keyLight.shadow.map.dispose(); this.keyLight.shadow.map = null; }
          this.keyLight.shadow.mapSize.set(cfg.shadowSize, cfg.shadowSize);
        }
        this.updateAtmosphere();
        const wet = this.mats.m02WetStone(); if (wet && typeof wet.roughness === 'number') wet.roughness = cfg.wetRough;
        document.getElementById('lbl-quality').textContent = cfg.label;
        document.querySelectorAll('.q-btn').forEach(b => b.classList.toggle('active', b.dataset.q === q));
      }

      populateAssetLibrary(root, category) {
        const place = (o, n, x, z = 0, y = 0) => { o.name = n; o.position.set(x, y, z); root.add(o); };
        if (category === 'rocks') ['small', 'medium', 'large', 'vertical', 'island'].forEach((t, r) => { for (let v = 0; v < 5; v++) place(this.assets.createRock(t, v), `Rock_${t}_v${v}`, v * 7, r * 8, t === 'island' ? 4 : 0); });
        if (category === 'arch') {
          place(this.assets.createFloorSlab(1.5, 1.5, 0.24, 1), 'FloorSlab', 0); place(this.assets.createWallBlock(), 'WallBlock', 3);
          place(this.assets.createColumn(6.5, false, 1), 'Column_Complete', 6);
          [1.5, 2.5, 3.5, 5].forEach((h, i) => place(this.assets.createColumn(h, true, i + 2), `Column_Broken_${h}m`, 10 + i * 3));
          ['complete', 'partial', 'damaged'].forEach((s, i) => place(this.assets.createArch(3.8, 4.8, s), 'Arch_' + s, i * 8, 8));
          place(this.assets.createStaircase(10, 2.8), 'Staircase', 24, 8);
          place(this.assets.createBridgeSegment('complete'), 'Bridge_Complete', 0, 16); place(this.assets.createBridgeSegment('broken'), 'Bridge_Broken', 8, 16);
          place(this.assets.createRubble(), 'Rubble', 15, 16); place(this.assets.createLantern(), 'Lantern', 20, 16, 2);
        }
        if (category === 'vegetation') for (let i = 0; i < 4; i++) {
          place(this.assets.createFlowerCluster('sapphire', i + 1), 'SapphireFlowers_' + i, i * 3, 0);
          place(this.assets.createFlowerCluster('lavender', i + 20), 'LavenderFlowers_' + i, i * 3, 3);
          place(this.assets.createGrassTuft(i + 40), 'Grass_' + i, i * 3, 6);
          place(this.assets.createMossPatch(0.25 + i * 0.18), 'Moss_' + i, i * 3, 9);
          place(this.assets.createCrystalCluster(0.65 + i * 0.2, i + 60), 'Crystal_' + i, i * 3, 12);
          place(this.assets.createVine(0.8 + i * 0.7, i + 80), 'Vine_' + i, i * 3, 15, 4);
        }
        if (category === 'trees') [16, 10, 7, 4].forEach((h, i) => place(this.assets.createAncientFloweringTree(h, 800 + i), `AncientTree_${h}m`, i * 16, 0));
      }

      makeExportSnapshot(source, ownedMaterials) {
        const standard = new Map();
        const mapMat = (m) => {
          if (standard.has(m)) return standard.get(m);
          const props = {};
          for (const k of ['color','map','normalMap','normalScale','roughnessMap','metalnessMap','aoMap','aoMapIntensity','emissiveMap','emissive','emissiveIntensity','roughness','metalness','alphaMap','alphaTest','transparent','opacity','side','depthWrite','vertexColors']) if (m[k] !== undefined) props[k] = m[k];
          const out = m.isMeshBasicMaterial
            ? new THREE.MeshBasicMaterial({ color: props.color, map: props.map, transparent: props.transparent, opacity: props.opacity, side: props.side, alphaTest: props.alphaTest })
            : new THREE.MeshStandardMaterial(props);
          out.name = m.name || 'SapphireMaterial'; standard.set(m, out); ownedMaterials.add(out); return out;
        };
        const clone = obj => {
          if (obj.name.startsWith('Debug') || obj.userData.exportExclude || obj === this.petals || obj.isLight || obj.isCamera) return null;
          let node; const material = () => Array.isArray(obj.material) ? obj.material.map(mapMat) : mapMat(obj.material);
          if (obj.isInstancedMesh) {
            node = new THREE.Group(); const mat = material(), mx = new THREE.Matrix4(), tint = new THREE.Color();
            for (let i = 0; i < obj.count; i++) {
              let im = mat; if (obj.instanceColor && !Array.isArray(mat)) { obj.getColorAt(i, tint); im = mat.clone(); im.color.multiply(tint); ownedMaterials.add(im); }
              const mesh = new THREE.Mesh(obj.geometry, im); obj.getMatrixAt(i, mx); mx.decompose(mesh.position, mesh.quaternion, mesh.scale); node.add(mesh);
            }
          } else if (obj.isMesh) node = new THREE.Mesh(obj.geometry, material()); else node = new THREE.Group();
          node.name = obj.name; node.position.copy(obj.position); node.quaternion.copy(obj.quaternion); node.scale.copy(obj.scale);
          if (obj.isLOD) { const c = clone(obj.levels[0].object); if (c) node.add(c); }
          else for (const child of obj.children) { const c = clone(child); if (c) node.add(c); }
          return node;
        };
        return clone(source);
      }

      exportGLBTarget(targetKey) {
        if (this.exportBusy || this.inputLocked) return;
        if (targetKey === 'battle_map' && this.mode !== 'sanctuary') { document.getElementById('lbl-export-status').textContent = 'Select Sanctuary first to export battle map.'; return; }
        this.exportBusy = true;
        const statusEl = document.getElementById('lbl-export-status'); statusEl.textContent = `Building ${targetKey} for GLB export...`;
        const exportRoot = new THREE.Group(), temporary = targetKey !== 'battle_map', exportMats = new Set(); let done = false;
        const finish = () => { if (done) return; done = true; exportMats.forEach(m => m.dispose()); if (temporary) this.disposeDetached(exportRoot); this.exportBusy = false; };
        try {
          if (['rocks', 'arch', 'vegetation', 'trees'].includes(targetKey)) this.populateAssetLibrary(exportRoot, targetKey);
          else if (targetKey.startsWith('wilds_sec_')) {
            const idx = Number(targetKey.replace('wilds_sec_', '')), spec = this.sectionSpecs[idx];
            exportRoot.add(this.createWildsTerrain(spec.minX, spec.maxX)); exportRoot.add(this.buildWildsSectionGroup(idx, false));
          }
          const clean = this.makeExportSnapshot(temporary ? exportRoot : this.worldGroup, exportMats);
          clean.name = `SapphireSumi_${targetKey}`;
          new GLTFExporter().parse(clean, (res) => {
            const blob = new Blob([res], { type: 'model/gltf-binary' }), url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url; a.download = `sapphire_sumi_${targetKey}.glb`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
            statusEl.textContent = `Exported sapphire_sumi_${targetKey}.glb (${Math.round(blob.size / 1024)} KB)`; finish();
          }, (err) => { console.error(err); statusEl.textContent = 'Export failed (see console)'; finish(); }, { binary: true, onlyVisible: false });
        } catch (err) { console.error(err); statusEl.textContent = 'Export failed: ' + err.message; finish(); }
      }

      exportRuntimeShaders() {
        const src = `import * as THREE from 'three';\nexport const SAPPHIRE_SUMI_DEFAULTS = ${JSON.stringify(this.mats.params, null, 2)};\nexport ${TextureForge.toString()}\nexport ${MaterialLibrary.toString()}\nexport function createSapphireMaterials(renderInfo={isWebGPU:false}){const lib=new MaterialLibrary(new TextureForge(),renderInfo);Object.assign(lib.params,SAPPHIRE_SUMI_DEFAULTS);lib.syncParams();return lib;}\n`;
        const blob = new Blob([src], { type: 'application/javascript' }), url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'sapphire_sumi_runtime_shaders.js'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
        document.getElementById('lbl-export-status').textContent = 'Exported sapphire_sumi_runtime_shaders.js';
      }

      exportMapMetadataJSON() {
        const anchors = {}; for (const [k, v] of this.combatAnchors.entries()) anchors[k] = { x: v.position.x, y: v.position.y, z: v.position.z };
        const payload = { mode: this.mode, scope: this.mode === "wilds" ? "loaded exploration sections only" : "active scene", loadedSections: Array.from(this.wildsSections.keys()), renderer: this.renderInfo.backend, shaderDefaults: this.mats.params, battleMaps: this.battleRegistry.listIds(), combatAnchors: anchors, sectionSpecs: this.sectionSpecs, activeEncounters: this.encounters.map(e => ({ id: e.id, x: e.pos.x, y: e.pos.y, z: e.pos.z, category: e.category, battleMapId: e.battleMapId, triggerRadius: e.triggerRadius })), activeDiscoveries: this.discoveries.map(d => ({ id: d.id, x: d.x, y: d.y, z: d.z, label: d.label })), colliders: this.collisions.toJSON() };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = `sapphire_sumi_${this.mode}_metadata.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
        document.getElementById('lbl-export-status').textContent = `Exported sapphire_sumi_${this.mode}_metadata.json`;
      }

      runLiveDiagnostics() {
        const out = document.getElementById('diag-output');
        const req = ['PlayerFront01','PlayerFront02','PlayerRear01','PlayerRear02','EnemyFront01','EnemyFront02','EnemyRear01','EnemyRear02','CombatCenter','BossCenter','PlayerEntrance','EnemyEntrance'];
        const ancOk = this.mode === 'sanctuary' ? (req.every(n => Boolean(this.getCombatAnchor(n))) ? 'PASS (12/12)' : 'FAIL') : 'Switch to Sanctuary';
        const info = this.renderer.info?.render || {}, mem = this.renderer.info?.memory || {};
        out.textContent = [
          `Backend: ${this.renderInfo.backend} | Quality: ${this.quality} | DPR: ${this.renderer.getPixelRatio().toFixed(2)}`,
          `Mode: ${this.mode} | 12 Combat Anchors: ${ancOk}`,
          `BattleMapRegistry: [${this.battleRegistry.listIds().join(', ')}]`,
          `Draws: ${info.calls ?? 0} | Tris: ${info.triangles ?? 0} | Tex: ${mem.textures ?? this.forge.cache.size}`,
          `Colliders: ${this.collisions.boxes.length}B / ${this.collisions.cylinders.length}C / ${this.collisions.ramps.length}R`,
          `Cache: ${this.assets.geoCache.size} geometries / ${this.mats.cache.size} materials / ${this.forge.cache.size} textures | active scopes: ${this.resourcePool.scopes.size}`
        ].join('\n');
        out.classList.remove('hidden');
      }

      bindUI() {
        const toggleClean = () => { const c = document.body.classList.toggle('clean-view'); document.getElementById('btn-clean-view').textContent = c ? 'Show UI (H)' : 'Hide UI (H)'; };
        document.getElementById('btn-clean-view').addEventListener('click', toggleClean);
        document.getElementById('asset-category').addEventListener('change', e => { if (this.inputLocked || this.exportBusy) return; this.assetCategory = e.target.value; this.inBattleFromExplore = false; this.loadMode('assets'); });
        this.cleanupScope.listen(document,'click', e => { if ((this.inputLocked || this.exportBusy) && e.target.closest('button,select,input')) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
        this.cleanupScope.listen(window,'blur', () => this.resetInput());
        this.cleanupScope.listen(document,'visibilitychange', () => { if (document.hidden) this.resetInput(); });
        this.cleanupScope.listen(window,'keydown', e => { if (e.code === 'KeyH' && !e.repeat && !/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName || '')) toggleClean(); });

        for (const [id, key] of [['wind','windScale'],['petals','petalScale'],['mist','mistScale']]) {
          document.getElementById('s-' + id).addEventListener('input', e => { this[key] = Number(e.target.value) / 100; document.getElementById('v-' + id).textContent = e.target.value + '%'; this.updateAtmosphere(); });
        }
        const rendererURL = (force) => { const u = new URL(location.href); u.searchParams.delete('gpuFallback'); if (force) u.searchParams.set('renderer', 'webgl'); else u.searchParams.delete('renderer'); location.href = u.href; };
        document.getElementById('btn-force-gl').addEventListener('click', () => rendererURL(true));
        document.getElementById('btn-auto-gpu').addEventListener('click', () => rendererURL(false));
        document.getElementById('btn-diagnostics').addEventListener('click', () => this.runLiveDiagnostics());

        document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => { this.inBattleFromExplore = false; this.loadMode(btn.dataset.mode); }));
        document.getElementById('btn-drawer').addEventListener('click', () => document.getElementById('drawer').classList.toggle('hidden'));
        document.querySelectorAll('.cam-btn').forEach(btn => btn.addEventListener('click', () => {
          document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
          if (this.mode !== 'sanctuary') this.loadMode('sanctuary');
          this.setCameraPreset(btn.dataset.cam, true);
        }));
        document.getElementById('btn-reset-cam').addEventListener('click', () => {
          if (this.mode === 'wilds' && this.player) { this.camera.position.set(this.playerPos.x + 2, this.playerPos.y + 4.8, this.playerPos.z + 16.5); this.controls.target.copy(this.playerPos).add(new THREE.Vector3(2.5, 1.8, 0)); this.controls.update(); }
          else if (this.mode === 'sanctuary') this.setCameraPreset('battle', true); else this.loadMode(this.mode);
        });
        document.getElementById('btn-anchors').addEventListener('click', e => { this.showAnchors4v4 = !this.showAnchors4v4; e.target.textContent = `4v4 Models (1.8m): ${this.showAnchors4v4 ? 'ON' : 'OFF'}`; e.target.classList.toggle('active', this.showAnchors4v4); if (this.debug4v4Group) this.debug4v4Group.visible = this.showAnchors4v4; });
        document.getElementById('btn-boss-anchor').addEventListener('click', e => { this.showBossAnchor = !this.showBossAnchor; e.target.textContent = `Boss Model (4.5m): ${this.showBossAnchor ? 'ON' : 'OFF'}`; e.target.classList.toggle('active', this.showBossAnchor); if (this.debugBossGroup) this.debugBossGroup.visible = this.showBossAnchor; });
        document.getElementById('btn-colliders').addEventListener('click', e => { this.showColliders = !this.showColliders; e.target.textContent = `Colliders: ${this.showColliders ? 'ON' : 'OFF'}`; e.target.classList.toggle('active', this.showColliders); this.collisions.setDebugVisible(this.showColliders); });

        document.querySelectorAll('.sec-btn').forEach(btn => btn.addEventListener('click', () => {
          const tx = [6, 40, 82, 114, 146, 190][Number(btn.dataset.sec)] || 6, ty = this.sampleWildsHeight(tx);
          this.savedExploreState = { position: new THREE.Vector3(tx, ty, 0), velocityY: 0, grounded: true, cameraPos: new THREE.Vector3(tx + 2, ty + 4.8, 16.5), cameraTarget: new THREE.Vector3(tx + 2.5, ty + 1.8, 0), encounterId: null };
          this.loadMode('wilds');
        }));
        document.querySelectorAll('.q-btn').forEach(btn => btn.addEventListener('click', () => this.applyQuality(btn.dataset.q)));
        document.getElementById('btn-adaptive-res').addEventListener('click', e => {
          this.adaptiveResEnabled = !this.adaptiveResEnabled; e.target.textContent = `Adaptive Res: ${this.adaptiveResEnabled ? 'ON' : 'OFF'}`; e.target.classList.toggle('active', this.adaptiveResEnabled);
          if (!this.adaptiveResEnabled) { this.adaptiveScale = 1.0; this.updateRenderScale(); }
        });

        document.getElementById('btn-export-glb').addEventListener('click', () => this.exportGLBTarget(document.getElementById('glb-export-target').value));
        document.getElementById('btn-export-shaders').addEventListener('click', () => this.exportRuntimeShaders());
        document.getElementById('btn-export-meta').addEventListener('click', () => this.exportMapMetadataJSON());

        for (const [id, lbl, key] of [['s-ink','v-ink','ink'],['s-sat','v-sat','sat'],['s-diff','v-diff','diff'],['s-real','v-real','real'],['s-edge','v-edge','edge'],['s-high','v-high','high'],['s-gran','v-gran','gran']]) {
          document.getElementById(id).addEventListener('input', e => { const v = Number(e.target.value); document.getElementById(lbl).textContent = `${v}%`; this.mats.params[key] = v / 100; this.mats.syncParams(); });
        }

        this.cleanupScope.listen(window,'keydown', e => {
          if (this.inputLocked || /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target?.tagName || '')) return;
          if (this.mode === 'wilds' && ['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
          if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = true;
          if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = true;
          if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.in = true;
          if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.out = true;
          if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.run = true;
          if (!e.repeat && e.code === 'Space' && this.mode === 'wilds' && this.grounded) { this.playerVelY = 7.6; this.grounded = false; }
          if (!e.repeat && e.code === 'KeyE' && this.mode === 'wilds') {
            if (this.activeDiscovery) this.collectDiscovery(this.activeDiscovery);
            else if (this.activeEncounter) this.triggerEncounterTransition(this.activeEncounter);
            else this.openService?.();
          }
        });
        this.cleanupScope.listen(window,'blur', () => this.resetInput());
        this.cleanupScope.listen(document,'visibilitychange', () => { if(document.hidden)this.resetInput(); });
        this.cleanupScope.listen(window,'keyup', e => {
          if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = false;
          if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = false;
          if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.in = false;
          if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.out = false;
          if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.run = e.shiftKey;
        });

        for (const [id, key] of [['touch-left','left'],['touch-right','right'],['touch-in','in'],['touch-out','out']]) {
          const el = document.getElementById(id);
          const on = (e) => { if (!this.inputLocked && !this.exportBusy) { this.keys[key] = true; el.setPointerCapture?.(e.pointerId); } }, off = () => { this.keys[key] = false; };
          el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
        }
        document.getElementById('touch-jump').addEventListener('click', () => { if (!this.inputLocked && this.mode === 'wilds' && this.grounded) { this.playerVelY = 7.6; this.grounded = false; } });
        const act = () => { if (!this.inputLocked && this.mode === 'wilds') { if (this.activeDiscovery) this.collectDiscovery(this.activeDiscovery); else if (this.activeEncounter) this.triggerEncounterTransition(this.activeEncounter); else this.openService?.(); } };
        document.getElementById('touch-act').addEventListener('click', act);
        document.getElementById('btn-engage').addEventListener('click', act);
        document.getElementById('btn-return').addEventListener('click', () => this.returnToExploration());
      }

      collectDiscovery(disc) {
        if(this.inputLocked||this.mode!=='wilds'||!disc||!treasureFor(disc.id)||this.foundDiscoveries.has(disc.id)||!this.discoveries.includes(disc))return false;
        if(Math.hypot(this.playerPos.x-disc.pos.x,this.playerPos.z-disc.pos.z)>2||Math.abs(this.playerPos.y-disc.pos.y)>=1.6)return false;
        this.foundDiscoveries.add(disc.id); disc.mesh.visible = false;
        this.activeDiscovery=null;
        document.getElementById('badge-discoveries').textContent = `Discoveries: ${TREASURE_IDS.filter(id=>this.foundDiscoveries.has(id)).length}/${TREASURE_IDS.length}`;
        return true;
      }

      onResize() {
        const w = this.viewport.clientWidth || window.innerWidth, h = this.viewport.clientHeight || window.innerHeight;
        this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
      }

      updateAnimations(t, dt) {
        t = this.environmentTime = (this.environmentTime || 0) + dt * this.windScale;
        dt *= this.windScale;
        const wfMat = this.mats.m11Waterfall(); if (wfMat.map) wfMat.map.offset.y -= dt * 0.42;
        for (const rib of this.ribbons) {
          const pos = rib.geometry.attributes.position, base = rib.userData.basePos;
          for (let i = 0; i < pos.count; i++) { const by = base[i * 3 + 1]; pos.setZ(i, base[i * 3 + 2] + Math.sin(t * 2.6 + by * 2.4) * 0.14 * Math.min(1, Math.abs(by) * 0.6)); }
          pos.needsUpdate = true;
        }
        for (const s of this.swayObjects) s.obj.rotation.z = Math.sin(t * s.speed + s.phase) * s.amp;
        for (const c of this.clouds) { c.position.x += dt * c.userData.speed; const center=c.userData.centerX || 0; if (c.position.x > center+115) c.position.x -= 230; }
        if (this.petals) {
          const dummy = this.petalMatrixScratch ??= new THREE.Object3D();
          const wilds = this.mode === "wilds";
          const base = wilds ? this.sampleWildsHeight(this.playerPos.x) : this.petalOrigin.baseY;
          const center = wilds ? this.playerPos.x : this.petalOrigin.centerX;
          const half = wilds ? 24 : this.petalOrigin.spanX / 2;
          const width = 2 * half;
          const count = Math.min(this.petals.count, this.petalData.length);
          // Keep hidden particles' simulation current for quality changes, but
          // avoid composing and uploading matrices that cannot be drawn.
          for (let i = 0; i < this.petalData.length; i++) {
            const p = this.petalData[i];
            p.y -= dt * p.speed;
            p.x += Math.sin(t * 0.8 + p.phase) * dt * 0.35;
            if (p.y < base - 1) p.y = base + 14;
            p.x = center + (((p.x - center + half) % width + width) % width) - half;
            if (i >= count) continue;
            dummy.position.set(p.x, p.y, p.z);
            dummy.rotation.set(t + p.phase, t * 0.7 + p.phase, p.phase);
            dummy.updateMatrix();
            this.petals.setMatrixAt(i, dummy.matrix);
          }
          if (count > 0) this.petals.instanceMatrix.needsUpdate = true;
        }
      }

      updateExploration(dt, t) {
        if (this.mode !== 'wilds' || !this.player || this.inputLocked) return;
        const startX=this.playerPos.x,startZ=this.playerPos.z;
        let landingImpact=0;
        const steps = Math.max(1, Math.ceil(dt / (1/120))), step = dt / steps;
        for (let i=0;i<steps;i++) {
          const motion=advanceVelocity(this.locomotion,this.keys,this.grounded,step);
          this.playerPos.x = Math.max(1.5, Math.min(WORLD_MAX_X, this.playerPos.x + motion.x));
          this.playerPos.z = Math.max(-6.8, Math.min(3.4, this.playerPos.z + motion.z));
          this.playerVelY -= 19.5 * step; this.playerPos.y += this.playerVelY * step;
          const fallSpeed=this.playerVelY,wasGrounded=this.grounded;
          this.playerVelY = this.collisions.resolveCapsule(this.playerPos, this.playerVelY, 0.35, 1.75);
          this.playerPos.x = Math.max(1.5, Math.min(WORLD_MAX_X,this.playerPos.x)); this.playerPos.z=Math.max(-6.8,Math.min(3.4,this.playerPos.z));
          const supY = this.collisions.sampleSupportHeight(this.playerPos.x, this.playerPos.z, this.playerPos.y, (x, z) => this.terrainVisualHeight(x, z), 0.55);
          if (this.playerVelY <= 0 && this.playerPos.y <= supY) { if(!wasGrounded)landingImpact=Math.max(landingImpact,-fallSpeed);this.playerPos.y = supY; this.playerVelY = 0; this.grounded = true; } else this.grounded = false;
        }
        this.player.position.copy(this.playerPos);
        updateLocomotion(this.locomotion,{dx:this.playerPos.x-startX,dz:this.playerPos.z-startZ,vy:this.playerVelY,grounded:this.grounded,impact:landingImpact,running:this.keys.run},dt);
        this.player.userData.applyPose(this.locomotion);

        const inCave = this.playerPos.x >= 109 && this.playerPos.x <= 141;
        const camZ = inCave ? 9.2 : 16.2, camY = inCave ? 2.6 : 4.7, lookX = inCave ? 1.8 : 2.6;
        const targetPos = new THREE.Vector3(this.playerPos.x + lookX, this.playerPos.y + 1.65, this.playerPos.z * 0.45);
        const desiredCam = new THREE.Vector3(this.playerPos.x + lookX * 0.85, this.playerPos.y + camY, this.playerPos.z + camZ);
        const rayOrigin = new THREE.Vector3(this.playerPos.x, this.playerPos.y + 1.4, this.playerPos.z);
        const rayDir = desiredCam.clone().sub(rayOrigin), maxDist = rayDir.length();
        if (maxDist > 0.5 && this.cameraObstacles.length > 0) {
          this.raycaster.set(rayOrigin, rayDir.normalize()); this.raycaster.far = maxDist;
          const hits = this.raycaster.intersectObjects(this.cameraObstacles, true);
          if (hits.length > 0 && hits[0].distance < maxDist) desiredCam.copy(rayOrigin).addScaledVector(rayDir, Math.max(0.2, hits[0].distance - 0.35));
        }
        if (this.keyLight) { this.keyLight.position.set(this.playerPos.x + 28, this.playerPos.y + 42, 22); this.keyLight.target.position.set(this.playerPos.x, this.playerPos.y, 0); }
        this.camera.position.lerp(desiredCam, Math.min(1, dt * 4.8));
        this.controls.target.lerp(targetPos, Math.min(1, dt * 5.6));
        document.getElementById('badge-section').textContent = this.getWildsSectionName(this.playerPos.x);
        this.updateWildsStreaming(false);

        const now = performance.now(); let nearEnc = null, nearDisc = null;
        for (const e of this.encounters) {
          e.mesh.rotation.y = t * 1.4; e.mesh.position.y = 1.3 + Math.sin(t * 2.5 + e.x) * 0.16;
          if (this.completedEncounters?.has(e.id)) { e.mesh.parent.visible=false; continue; }
          if (now < (this.retriggerCooldowns.get(e.id) || 0)) continue;
          if (Math.hypot(this.playerPos.x - e.pos.x, this.playerPos.z - e.pos.z) <= e.triggerRadius && Math.abs(this.playerPos.y - e.pos.y) < 1.8) nearEnc = e;
        }
        for (const d of this.discoveries) {
          if (this.foundDiscoveries.has(d.id)) continue;
          d.mesh.rotation.y = t * 1.8; d.mesh.position.y = 1.1 + Math.sin(t * 3.0 + d.x) * 0.14;
          if (Math.hypot(this.playerPos.x - d.pos.x, this.playerPos.z - d.pos.z) <= 2.0 && Math.abs(this.playerPos.y - d.pos.y) < 1.6) nearDisc = d;
        }
        this.activeEncounter = nearEnc; this.activeDiscovery = nearDisc;
        const bar = document.getElementById('encounter-bar');
        if (nearDisc) {
          document.getElementById('encounter-title').textContent = nearDisc.label;
          document.getElementById('encounter-sub').textContent = 'Press [E] to record Hidden Discovery';
          document.getElementById('btn-engage').textContent = 'Inspect [E]'; bar.classList.remove('hidden');
        } else if (nearEnc) {
          document.getElementById('encounter-title').textContent = nearEnc.label;
          document.getElementById('encounter-sub').textContent = `Press [E] to enter ${nearEnc.battleMapId}`;
          document.getElementById('btn-engage').textContent = 'Engage [E]'; bar.classList.remove('hidden');
        } else if(this.nearService?.()) {
          document.getElementById('encounter-title').textContent=this.nearService().label;
          document.getElementById('encounter-sub').textContent='Press [E] to interact';
          document.getElementById('btn-engage').textContent='Interact [E]'; bar.classList.remove('hidden');
        } else bar.classList.add('hidden');
      }

      handleRenderFailure(err) {
        if (this.renderFailed) return;
        this.renderFailed = true;
        if(this.onRuntimeError)this.onRuntimeError(err);else recoverOrShowError(err, this);
      }

      animate() {
        if (this.renderFailed) return;
        this.animationFrame=requestAnimationFrame(() => this.animate());
        const rawDt = this.clock.getDelta(), dt = Math.min(0.05, rawDt), t = this.clock.elapsedTime;
        if (this.camLerp) {
          this.camera.position.lerp(this.camLerp.pos, Math.min(1, dt * 5));
          this.controls.target.lerp(this.camLerp.target, Math.min(1, dt * 5));
          if (this.camera.position.distanceTo(this.camLerp.pos) < 0.08) this.camLerp = null;
        }
        try { this.updateExploration(dt, t); this.updateAnimations(t, dt); this.controls.update(); const result = this.renderer.render(this.scene, this.camera); if (result && typeof result.catch === 'function') result.catch(err => this.handleRenderFailure(err)); } catch (err) { this.handleRenderFailure(err); return; }

        this.emaFrameMs = this.emaFrameMs * 0.94 + (rawDt * 1000) * 0.06;
        this.fpsFrames++; this.fpsTimer += rawDt;
        if (this.fpsTimer >= 0.4) {
          document.getElementById('badge-fps').textContent = `${Math.round(this.fpsFrames / this.fpsTimer)} FPS`;
          document.getElementById('stat-ms').textContent = `${this.emaFrameMs.toFixed(1)}ms`;
          if (this.adaptiveResEnabled && performance.now() - this.lastAdaptiveAt > 1500) {
            let changed = false;
            if (this.emaFrameMs > 22.0 && this.adaptiveScale > 0.65) { this.adaptiveScale = Math.max(0.65, this.adaptiveScale - 0.05); changed = true; }
            else if (this.emaFrameMs < 14.0 && this.adaptiveScale < 1.0) { this.adaptiveScale = Math.min(1.0, this.adaptiveScale + 0.05); changed = true; }
            if (changed) { this.lastAdaptiveAt = performance.now(); this.updateRenderScale(); }
          }
          const info = this.renderer.info?.render, mem = this.renderer.info?.memory;
          if (info) {
            document.getElementById('stat-draws').textContent = `Draws: ${info.calls ?? 0}`;
            document.getElementById('stat-tris').textContent = `Tris: ${Math.round((info.triangles ?? 0) / 1000)}k`;
          }
          document.getElementById('stat-particles').textContent = `Pts: ${this.petals ? this.petals.count : 0}`;
          document.getElementById('stat-sections').textContent = `Sec: ${this.mode === 'wilds' ? this.wildsSections.size : 1}`;
          document.getElementById('stat-tex').textContent = `Tex: ${mem?.textures ?? this.forge.cache.size}`;
          this.fpsFrames = 0; this.fpsTimer = 0;
        }
      }
    }

    function showStartupError(err) {
      console.error('Viewer error:', err);
      const el = document.getElementById('startup-error'); el.hidden = false;
      el.textContent = '3D viewer could not start or render: ' + (err?.message || String(err)) + '\nTry serving over localhost with internet access. To force WebGL2, append ?renderer=webgl to the URL.';
    }
    function recoverOrShowError(err, app) {
      showStartupError(err);
      const u = new URL(location.href);
      if (app?.renderInfo?.isWebGPU && u.searchParams.get('renderer') !== 'webgl') {
        u.searchParams.set('renderer', 'webgl'); u.searchParams.set('gpuFallback', '1');
        document.getElementById('startup-error').textContent += '\nRecovering with WebGL2. Use Auto GPU to retry WebGPU.';
        location.replace(u.href);
      }
    }

export async function mountSapphireWorld(root, onEvent) {
  const parsed = new DOMParser().parseFromString(worldMarkup, 'text/html');
  root.replaceChildren(...Array.from(parsed.body.childNodes));
  const app = new SapphireSumiViewer();
  const send = (type, data = {}) => onEvent({type, ...data});
  app.onRuntimeError=err=>send('error',{message:err?.message||String(err)});
  const snapshot = () => {
    for(const e of app.encounters) registeredMarkers.set(e.id,{id:e.id,label:e.label,position:e.pos.toArray(),category:e.category,battleMapId:e.battleMapId,completed:app.completedEncounters.has(e.id)});
    for(const m of registeredMarkers.values()) m.completed=app.completedEncounters.has(m.id);
    return ({
    position: app.playerPos.toArray(), regions: app.sectionSpecs.map(({id,name,minX,maxX})=>({id,name,minX,maxX})),
    encounters: [...registeredMarkers.values()],
    discoveries: [...app.foundDiscoveries], region: app.getWildsSectionName(app.playerPos.x),
    nearby: app.activeDiscovery?.label || app.activeEncounter?.label || nearService()?.label || null, nearbyService:nearService()?.id||null, services:app.servicePoints, renderer: app.renderInfo.backend, mode:app.mode
  }); };
  app.triggerEncounterTransition = async (enc) => {
    if(app.inputLocked || app.completedEncounters.has(enc.id)) return;
    const world=snapshot(); app.resetInput(); app.inputLocked=true;
    send('encounter',{encounter:{id:enc.id,label:enc.label,category:enc.category,battleMapId:enc.battleMapId},world});
  };
  app.completedEncounters = new Set();
  app.appearanceTint=0xffffff;
  app.servicePoints=WORLD_SERVICES;
  const nearService=()=>app.mode==='wilds'?nearestService(app.playerPos.toArray(),(x,z)=>app.terrainVisualHeight(x,z)):null;
  app.nearService=nearService;
  app.openService=()=>{const service=nearService();if(service&&!app.inputLocked){app.resetInput();app.inputLocked=true;send('service',{service,world:snapshot()});}};
  const registeredMarkers = new Map();
  const collect = app.collectDiscovery.bind(app);
  app.collectDiscovery = d => { if(!collect(d))return false; app.resetInput(); app.inputLocked=true; send('discovery',{id:d.id,label:d.label,world:snapshot()}); return true; };
  // Initialize the renderer/materials once; do not build a default world only to
  // immediately destroy it when the saved position arrives.
  app.inputLocked=true;send('startup',{phase:'renderer'});
  try{await app.init({deferWorld:true});if(app.renderFailed)throw Error('World renderer did not start.');}catch(error){app.destroy();throw error;}
  let firstWorld=true,restoring=false;
  const telemetry=createWorldTelemetry();
  const timer=setInterval(()=>{if(app.mode!=='wilds'||app.inputLocked||app.renderFailed)return;const sample=telemetry.sample(snapshot(),performance.now());if(sample)send('world',sample);},WORLD_TELEMETRY_INTERVAL);
  return {
    snapshot,
    pause(value){app.resetInput();app.inputLocked=Boolean(value);if(!value)telemetry.reset();},
    battle(data){if(typeof data?.token!=='string'||!data.token)return;app.activeBattleToken=data.token;app.resetInput();app.inputLocked=true;const arenaId=arenaForEncounter(typeof data.id==='string'?data.id:null);app.loadMode('sanctuary',arenaId);app.controls.enabled=false;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(app.activeBattleToken!==data.token)return;if(!app.renderFailed)send('battleReady',{arenaId,token:data.token});else send('error',{message:'Battleground renderer failed.'});}));},
    async restore(data){
      if(restoring||app.destroyed)return;
      if(!data||!Array.isArray(data.position)||data.position.length!==3||!data.position.every(Number.isFinite))throw Error('Invalid saved world position. Your save was not changed.');
      restoring=true;app.activeBattleToken=null;
      try{const [x,,z]=data.position;
      app.foundDiscoveries=new Set(data.discoveries||[]);app.completedEncounters=new Set(data.completedEncounters||[]);
      const px=Math.max(1.5,Math.min(WORLD_MAX_X,x)), pz=Math.max(-6.8,Math.min(3.4,z)), py=app.terrainVisualHeight(px,pz);
      app.savedExploreState={position:new THREE.Vector3(px,py,pz),velocityY:0,grounded:true,cameraPos:new THREE.Vector3(px+2,py+4.8,pz+16.5),cameraTarget:new THREE.Vector3(px+2.5,py+1.8,pz),encounterId:null};
      app.inputLocked=true;if(firstWorld)send('startup',{phase:'restore'});app.loadMode('wilds');
      if(firstWorld){send('startup',{phase:'render'});await renderFirstWorldFrame(app);if(app.destroyed)return;firstWorld=false;app.clock.start();app.animate();}
      if(app.renderFailed)throw Error('World renderer failed during restoration.');
      send('restored',{world:snapshot()});
      }finally{restoring=false;}},
    finish(id,won){if(won)app.completedEncounters.add(id);app.retriggerCooldowns.set(id,performance.now()+3500);app.activeEncounter=null;app.resetInput();app.inputLocked=false;},
    appearance(tint){if(![0xffffff,0x98c8ff,0xffc9dc,0xc8b5ff].includes(tint))return;app.appearanceTint=tint;app.player?.userData.setAppearance?.(tint);},
    quality(q){if(['performance','balanced','high','cinematic'].includes(q))app.applyQuality(q);},
    interact(){if(app.inputLocked)return;if(app.activeDiscovery)app.collectDiscovery(app.activeDiscovery);else if(app.activeEncounter)app.triggerEncounterTransition(app.activeEncounter);else app.openService();},
    move(key,value){if(Object.hasOwn(app.keys,key))app.keys[key]=!app.inputLocked && Boolean(value);},
    jump(){if(!app.inputLocked&&app.mode==='wilds'&&app.grounded){app.playerVelY=7.6;app.grounded=false;}},
    stop(){clearInterval(timer);app.destroy();}
  };
}
