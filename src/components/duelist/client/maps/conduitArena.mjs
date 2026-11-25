// The Conduit: Phase 4 Undercroft + Phase 7 restoration + combined Phase 8.
// Draft import; not registered in live TDM until authoritative collision and traversal are validated.
import * as THREE from 'three';
        const CFG = Object.freeze({
            foundationR: 44.8,
            pitRadius: 24.0,
            walkwayOuterR: 32.2,
            ringWalkInnerR: 27.2,
            ringWalkOuterR: 32.2,
            ringWalkThick: 0.45,
            crownRadius: 9.0,
            crownThick: 0.60,
            crownLandingR: 6.5,
            t0PerimeterR: 29.0,
            t0PerimeterHalfW: 2.25,
            yT0: -5.0,
            yT0Ceil: -0.60,
            yT1Pit: 0.0,
            yT1Bldg: 0.65,
            yT2: 5.0,
            yCrown: 5.0,
            yRoof: 9.35,
            capsuleRadius: 0.4,
            capsuleHeight: 1.8,
            eyeOffset: 1.62,
            gravity: -22.0,
            jumpPadFlightTime: 1.45,
            cardinals: [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5], // S, E, N, W
            buildings: [
                { id: 'armory',   name: 'ARMORY',   angle: -Math.PI * 0.75, accent: 0xd88625, hex: '#d88625', pad: [-20.79, 5.0, -20.79] }, // NW
                { id: 'reactor',  name: 'REACTOR',  angle:  Math.PI * 0.75, accent: 0xa66cff, hex: '#a66cff', pad: [ 20.79, 5.0, -20.79] }, // NE
                { id: 'medbay',   name: 'MED-BAY',  angle: -Math.PI * 0.25, accent: 0x55da83, hex: '#55da83', pad: [-20.79, 5.0,  20.79] }, // SW
                { id: 'barracks', name: 'BARRACKS', angle:  Math.PI * 0.25, accent: 0xd88625, hex: '#d88625', pad: [ 20.79, 5.0,  20.79] }  // SE
            ]
        });

        // =========================================================================
        // 2. PROCEDURAL PBR MATERIAL LIBRARY (DEDICATED DIAMOND-PLATE TREAD BUMP)
        // =========================================================================
        function createMaterialLibrary(quality = 'medium') {
            const s = quality === 'low' ? 256 : quality === 'high' ? 1024 : 512;
            const textures = [];
            const makeTex = (drawFn, repeat = [1, 1], isColor = true) => {
                const c = document.createElement('canvas'); c.width = c.height = s;
                drawFn(c.getContext('2d'), s);
                const t = new THREE.CanvasTexture(c);
                if (isColor) t.colorSpace = THREE.SRGBColorSpace;
                t.wrapS = t.wrapT = THREE.RepeatWrapping;
                t.repeat.set(repeat[0], repeat[1]);
                t.anisotropy = quality === 'low' ? 1 : quality === 'high' ? 8 : 4;
                textures.push(t);
                return t;
            };

            const texSteelFloor = makeTex((ctx, sz) => {
                ctx.fillStyle = '#485260'; ctx.fillRect(0, 0, sz, sz);
                ctx.strokeStyle = '#1c222b'; ctx.lineWidth = sz * 0.014;
                ctx.strokeRect(sz * 0.02, sz * 0.02, sz * 0.96, sz * 0.96);
                ctx.beginPath(); ctx.moveTo(sz / 2, 0); ctx.lineTo(sz / 2, sz); ctx.moveTo(0, sz / 2); ctx.lineTo(sz, sz / 2); ctx.stroke();
                ctx.fillStyle = '#8b96a3';
                [[0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94]].forEach(([x, y]) => ctx.fillRect(x * sz - 3, y * sz - 3, 6, 6));
                for(let i=0;i<52;i++){const x=((i*137.51)%100)/100*sz,y=((i*61.73)%100)/100*sz;ctx.fillStyle=i%2?'rgba(255,255,255,.055)':'rgba(0,0,0,.055)';ctx.fillRect(x,y,sz*.035,Math.max(1,sz*.002));}
                // Fine repeatable surface wear, based on the revised Gemini texture pass.
                for(let i=0;i<65;i++){
                    ctx.fillStyle=i%2?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)';
                    ctx.fillRect(((i*137.31)%sz),((i*79.63)%sz),sz*.04,1.5);
                }
            }, [4, 4]);

            const texFloorBump = makeTex((ctx, sz) => {
                ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, sz, sz);
                ctx.strokeStyle = '#282828'; ctx.lineWidth = sz * 0.016;
                ctx.strokeRect(sz * 0.02, sz * 0.02, sz * 0.96, sz * 0.96);
                ctx.beginPath(); ctx.moveTo(sz / 2, 0); ctx.lineTo(sz / 2, sz); ctx.moveTo(0, sz / 2); ctx.lineTo(sz, sz / 2); ctx.stroke();
            }, [4, 4], false);

            // DEDICATED Diamond-Plate Tread Albedo & Dedicated Diamond-Plate Bump Map
            const drawDiamonds = (ctx, sz, bg, fg) => {
                ctx.fillStyle = bg; ctx.fillRect(0, 0, sz, sz);
                ctx.fillStyle = fg;
                const step = sz / 8;
                for (let y = 0; y < sz; y += step) {
                    for (let x = 0; x < sz; x += step) {
                        ctx.save(); ctx.translate(x + step / 2, y + step / 2);
                        ctx.rotate(((x + y) / step) % 2 === 0 ? Math.PI / 4 : -Math.PI / 4);
                        ctx.fillRect(-step * 0.24, -step * 0.07, step * 0.48, step * 0.14);
                        ctx.restore();
                    }
                }
            };
            const texDiamondColor = makeTex((ctx, sz) => drawDiamonds(ctx, sz, '#4a535f', '#808d9c'), [3, 3], true);
            const texDiamondBump  = makeTex((ctx, sz) => drawDiamonds(ctx, sz, '#505050', '#f0f0f0'), [3, 3], false);

            const texConcrete = makeTex((ctx, sz) => {
                ctx.fillStyle = '#6c6e73'; ctx.fillRect(0, 0, sz, sz);
                const bw = sz / 4, bh = sz / 8;
                for (let r = 0; r < 8; r++) {
                    const off = (r % 2) * (bw / 2);
                    for (let col = -1; col <= 4; col++) {
                        const v = 102 + Math.floor(Math.random() * 14);
                        ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
                        ctx.fillRect(col * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
                    }
                }
            }, [2, 2]);

            const texCrate = makeTex((ctx, sz) => {
                ctx.fillStyle = '#3d4652'; ctx.fillRect(0, 0, sz, sz);
                ctx.fillStyle = '#54606e'; ctx.fillRect(sz * 0.09, sz * 0.09, sz * 0.82, sz * 0.82);
                ctx.strokeStyle = '#232932'; ctx.lineWidth = sz * 0.06;
                ctx.beginPath(); ctx.moveTo(sz * 0.1, sz * 0.1); ctx.lineTo(sz * 0.9, sz * 0.9); ctx.moveTo(sz * 0.9, sz * 0.1); ctx.lineTo(sz * 0.1, sz * 0.9); ctx.stroke();
                ctx.fillStyle = '#d88625'; ctx.fillRect(sz * 0.1, sz * 0.8, sz * 0.8, sz * 0.09);
            });

            const texVent = makeTex((ctx, sz) => {
                ctx.fillStyle = '#222832'; ctx.fillRect(0, 0, sz, sz);
                ctx.fillStyle = '#5e6875';
                for (let y = sz * 0.08; y < sz * 0.92; y += sz * 0.11) ctx.fillRect(sz * 0.08, y, sz * 0.84, sz * 0.05);
                ctx.strokeStyle = '#7c8694'; ctx.lineWidth = sz * 0.04; ctx.strokeRect(sz * 0.04, sz * 0.04, sz * 0.92, sz * 0.92);
            });

            const texCrown = makeTex((ctx, sz) => {
                const cx = sz / 2, cy = sz / 2, r = sz / 2;
                const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
                g.addColorStop(0, '#5a6675'); g.addColorStop(0.75, '#3b4450'); g.addColorStop(1, '#2a313b');
                ctx.fillStyle = g; ctx.fillRect(0, 0, sz, sz);
                [0.25, 0.55, 0.88].forEach(f => {
                    ctx.beginPath(); ctx.arc(cx, cy, f * r, 0, Math.PI * 2);
                    ctx.strokeStyle = f > 0.8 ? '#d88625' : '#1b2028'; ctx.lineWidth = f > 0.8 ? 10 : 4; ctx.stroke();
                });
                for (let i = 0; i < 4; i++) {
                    const a = Math.PI * 0.25 + i * Math.PI * 0.5;
                    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72, sz * 0.05, 0, Math.PI * 2);
                    ctx.strokeStyle = '#39cfff'; ctx.lineWidth = 4; ctx.stroke();
                }
            });

            const makeSign = (label, hex) => {
                const c = document.createElement('canvas'); c.width = 384; c.height = 96;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#0c131d'; ctx.fillRect(0, 0, 384, 96);
                ctx.strokeStyle = hex; ctx.lineWidth = 5; ctx.strokeRect(5, 5, 374, 86);
                ctx.font = '800 38px Inter, sans-serif'; ctx.fillStyle = '#eefaff';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 192, 50);
                const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
                textures.push(t); return t;
            };

            return {
                steelFloor:   new THREE.MeshStandardMaterial({ map: texSteelFloor, bumpMap: texFloorBump, bumpScale: 0.03, color: 0xffffff, roughness: 0.50, metalness: 0.62 }),
                crownDeck:    new THREE.MeshStandardMaterial({ map: texCrown, color: 0xffffff, roughness: 0.46, metalness: 0.65 }),
                concrete:     new THREE.MeshStandardMaterial({ map: texConcrete, color: 0xffffff, roughness: 0.86, metalness: 0.02 }),
                diamondTread: new THREE.MeshStandardMaterial({ map: texDiamondColor, bumpMap: texDiamondBump, bumpScale: 0.045, color: 0xffffff, roughness: 0.50, metalness: 0.70 }),
                ventGrille:   new THREE.MeshStandardMaterial({ map: texVent, color: 0xffffff, roughness: 0.56, metalness: 0.70 }),
                gunmetal:     new THREE.MeshStandardMaterial({ color: 0x3b4452, roughness: 0.50, metalness: 0.68 }),
                darkSteel:    new THREE.MeshStandardMaterial({ color: 0x252b34, roughness: 0.60, metalness: 0.65 }),
                brushedSteel: new THREE.MeshStandardMaterial({ color: 0x848f9c, roughness: 0.40, metalness: 0.82 }),
                paintedPanel: new THREE.MeshStandardMaterial({ color: 0x505b68, roughness: 0.54, metalness: 0.58 }),
                orangeSafety: new THREE.MeshStandardMaterial({ color: 0xd88625, roughness: 0.42, metalness: 0.42 }),
                yellowHazard: new THREE.MeshStandardMaterial({ color: 0xd6ac35, roughness: 0.45, metalness: 0.40 }),
                copperPipe:   new THREE.MeshStandardMaterial({ color: 0xa96432, roughness: 0.38, metalness: 0.85 }),
                graphiteCable:new THREE.MeshStandardMaterial({ color: 0x272d36, roughness: 0.72, metalness: 0.25 }),
                crate:        new THREE.MeshStandardMaterial({ map: texCrate, color: 0xffffff, roughness: 0.52, metalness: 0.58 }),
                glass:        new THREE.MeshStandardMaterial({ color: 0x8be2ff, transparent: true, opacity: 0.24, roughness: 0.15, metalness: 0.2 }),
                rockCavern:   new THREE.MeshStandardMaterial({ color: 0x342f2b, roughness: 0.92, metalness: 0.05, flatShading: true }),
                cyanGlow:     new THREE.MeshStandardMaterial({ color: 0x9ef0ff, emissive: 0x39cfff, emissiveIntensity: 2.0, roughness: 0.18 }),
                amberGlow:    new THREE.MeshStandardMaterial({ color: 0xffdfb3, emissive: 0xffb45e, emissiveIntensity: 1.7, roughness: 0.22 }),
                greenGlow:    new THREE.MeshStandardMaterial({ color: 0xbaf7ce, emissive: 0x55da83, emissiveIntensity: 1.8, roughness: 0.20 }),
                purpleGlow:   new THREE.MeshStandardMaterial({ color: 0xdec2ff, emissive: 0xa66cff, emissiveIntensity: 1.9, roughness: 0.20 }),
                redGlow:      new THREE.MeshStandardMaterial({ color: 0xffb3b3, emissive: 0xff4d4d, emissiveIntensity: 1.9, roughness: 0.20 }),
                makeSign,
                _textures: textures
            };
        }
export { CFG as CONDUIT_CONFIG };
        class UnifiedCollisionWorld {
            constructor() {
                this.obbs = []; this.ramps = []; this.cylinders = [];
                this.discs = []; this.annuli = []; this.shaftOpenings = []; this.jumpPads = [];
            }
            addOBB(cx, cy, cz, sx, sy, sz, rotY = 0, walkable = false, label = '') {
                this.obbs.push({ cx, cy, cz, hx: sx * 0.5, hy: sy * 0.5, hz: sz * 0.5, rotY, cos: Math.cos(rotY), sin: Math.sin(rotY), walkable, label });
            }
            addRamp(cx, cz, width, length, yStart, yEnd, rotY = 0, label = '', hasUnderside = true, thickness = 0.36) {
                this.ramps.push({ cx, cz, width, length, yStart, yEnd, rotY, cos: Math.cos(rotY), sin: Math.sin(rotY), hasUnderside, thickness, label });
            }
            addCylinder(cx, cz, radius, yMin, yMax, label = '') { this.cylinders.push({ cx, cz, radius, yMin, yMax, label }); }
            addDisc(cx, cz, radius, yMin, yMax, walkable = true, label = '', cutouts = []) { this.discs.push({ cx, cz, radius, yMin, yMax, walkable, label, cutouts }); }
            addAnnulus(rMin, rMax, yMin, yMax, walkable = true, label = '') { this.annuli.push({ rMin, rMax, yMin, yMax, walkable, label }); }
            addShaftOpening(cx, cz, sx, sz, rotY, yMin, yMax, label = '') {
                this.shaftOpenings.push({ cx, cz, hx: sx * 0.5, hz: sz * 0.5, rotY, cos: Math.cos(rotY), sin: Math.sin(rotY), yMin, yMax, label });
            }
            isInsideCutout(x, z, cutouts, shrink = 0) {
                if (!cutouts || !cutouts.length) return false;
                for (const c of cutouts) {
                    const dx = x - c.cx, dz = z - c.cz;
                    const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
                    if (Math.abs(lx) < c.hx - shrink && Math.abs(lz) < c.hz - shrink) return true;
                }
                return false;
            }
            isInShaftOpening(x, y, z, pad = 0.25) {
                for (const s of this.shaftOpenings) {
                    if (y < s.yMin - 0.5 || y > s.yMax + 0.5) continue;
                    const dx = x - s.cx, dz = z - s.cz;
                    const lx = dx * s.cos - dz * s.sin, lz = dx * s.sin + dz * s.cos;
                    if (Math.abs(lx) < s.hx + pad && Math.abs(lz) < s.hz + pad) return true;
                }
                return false;
            }
            getSweptSupportHeight(x, prevY, nextY, z, radius, stepUp = 0.55) {
                let bestY = -Infinity;
                const upper = prevY + stepUp, lower = nextY - 0.14, rDist = Math.hypot(x, z);
                for (const d of this.discs) {
                    if (!d.walkable || d.yMax > upper || d.yMax < lower) continue;
                    if (Math.hypot(x - d.cx, z - d.cz) <= d.radius + radius * 0.45 && !this.isInsideCutout(x, z, d.cutouts, 0.05) && d.yMax > bestY) bestY = d.yMax;
                }
                for (const a of this.annuli) {
                    if (!a.walkable || a.yMax > upper || a.yMax < lower) continue;
                    if (rDist >= a.rMin - radius * 0.45 && rDist <= a.rMax + radius * 0.45 && a.yMax > bestY) bestY = a.yMax;
                }
                for (const rm of this.ramps) {
                    const dx = x - rm.cx, dz = z - rm.cz;
                    const lx = dx * rm.cos - dz * rm.sin, lz = dx * rm.sin + dz * rm.cos;
                    if (Math.abs(lx) <= rm.width * 0.5 + radius * 0.35 && Math.abs(lz) <= rm.length * 0.5 + 0.35) {
                        const t = THREE.MathUtils.clamp((lz + rm.length * 0.5) / rm.length, 0, 1);
                        const sy = rm.yStart + t * (rm.yEnd - rm.yStart);
                        if (sy <= upper && sy >= lower - 0.28 && sy > bestY) bestY = sy;
                    }
                }
                for (const b of this.obbs) {
                    if (!b.walkable) continue;
                    const topY = b.cy + b.hy;
                    if (topY > upper || topY < lower) continue;
                    const dx = x - b.cx, dz = z - b.cz;
                    const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
                    if (Math.abs(lx) <= b.hx + radius * 0.48 && Math.abs(lz) <= b.hz + radius * 0.48 && topY > bestY) bestY = topY;
                }
                return bestY;
            }
            resolveHorizontal(pos, radius, height, stepUp = 0.48) {
                let hit = false, blocker = '';
                const footY = pos.y + stepUp, headY = pos.y + height - 0.05;
                for (let iter = 0; iter < 3; iter++) {
                    for (const b of this.obbs) {
                        if (b.cy + b.hy <= footY || b.cy - b.hy >= headY) continue;
                        const dx = pos.x - b.cx, dz = pos.z - b.cz;
                        const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
                        const cx = THREE.MathUtils.clamp(lx, -b.hx, b.hx), cz = THREE.MathUtils.clamp(lz, -b.hz, b.hz);
                        const diffX = lx - cx, diffZ = lz - cz, dSq = diffX * diffX + diffZ * diffZ;
                        if (dSq < radius * radius) {
                            hit = true; blocker = b.label || 'OBB';
                            let px = 0, pz = 0;
                            if (dSq > 1e-8) { const d = Math.sqrt(dSq), pen = radius - d; px = (diffX / d) * pen; pz = (diffZ / d) * pen; }
                            else {
                                const penX = b.hx - Math.abs(lx) + radius, penZ = b.hz - Math.abs(lz) + radius;
                                if (penX < penZ) px = lx >= 0 ? penX : -penX; else pz = lz >= 0 ? penZ : -penZ;
                            }
                            pos.x += px * b.cos + pz * b.sin;
                            pos.z += -px * b.sin + pz * b.cos;
                        }
                    }
                    for (const c of this.cylinders) {
                        if (c.yMax <= footY || c.yMin >= headY) continue;
                        const dx = pos.x - c.cx, dz = pos.z - c.cz, minD = c.radius + radius, dSq = dx * dx + dz * dz;
                        if (dSq < minD * minD) {
                            hit = true; blocker = c.label || 'Cylinder';
                            const d = Math.sqrt(dSq);
                            if (d > 1e-5) { const pen = minD - d; pos.x += (dx / d) * pen; pos.z += (dz / d) * pen; }
                            else pos.x += minD;
                        }
                    }
                }
                return { hit, blocker };
            }
            resolveCeiling(pos, prevY, radius, height) {
                let hitCeiling = false, blocker = '';
                const headY = pos.y + height, prevHeadY = prevY + height, rDist = Math.hypot(pos.x, pos.z);
                for (const b of this.obbs) {
                    const bMin = b.cy - b.hy, bMax = b.cy + b.hy;
                    if (bMin < prevY + 0.35 || bMin > headY || prevHeadY > bMax) continue;
                    const dx = pos.x - b.cx, dz = pos.z - b.cz;
                    const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
                    if (Math.abs(lx) < b.hx + radius * 0.5 && Math.abs(lz) < b.hz + radius * 0.5) {
                        pos.y = bMin - height - 0.01; hitCeiling = true; blocker = `${b.label} Underside`;
                    }
                }
                for (const d of this.discs) {
                    if (d.yMin < prevY + 0.35 || d.yMin > headY || prevHeadY > d.yMax) continue;
                    if (Math.hypot(pos.x - d.cx, pos.z - d.cz) < d.radius + radius * 0.25 && !this.isInsideCutout(pos.x, pos.z, d.cutouts, 0.05)) {
                        pos.y = d.yMin - height - 0.01; hitCeiling = true; blocker = `${d.label} Underside`;
                    }
                }
                for (const a of this.annuli) {
                    if (a.yMin < prevY + 0.35 || a.yMin > headY || prevHeadY > a.yMax) continue;
                    if (rDist >= a.rMin - radius * 0.25 && rDist <= a.rMax + radius * 0.25) {
                        pos.y = a.yMin - height - 0.01; hitCeiling = true; blocker = `${a.label} Underside`;
                    }
                }
                for (const rm of this.ramps) {
                    if (!rm.hasUnderside) continue;
                    const dx = pos.x - rm.cx, dz = pos.z - rm.cz;
                    const lx = dx * rm.cos - dz * rm.sin, lz = dx * rm.sin + dz * rm.cos;
                    if (Math.abs(lx) <= rm.width * 0.5 + radius * 0.3 && Math.abs(lz) <= rm.length * 0.5) {
                        const t = THREE.MathUtils.clamp((lz + rm.length * 0.5) / rm.length, 0, 1);
                        const surfY = rm.yStart + t * (rm.yEnd - rm.yStart), underY = surfY - rm.thickness;
                        if (prevHeadY <= surfY + 0.05 && underY > prevY + 0.3 && underY <= headY) {
                            pos.y = underY - height - 0.01; hitCeiling = true; blocker = `${rm.label} Underside`;
                        }
                    }
                }
                return { hitCeiling, blocker };
            }
            isEmbedded(pos, radius, height) {
                const footY = pos.y + 0.22, headY = pos.y + height - 0.12;
                for (const b of this.obbs) {
                    if (b.cy + b.hy <= footY || b.cy - b.hy >= headY) continue;
                    const dx = pos.x - b.cx, dz = pos.z - b.cz;
                    const lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
                    if (Math.abs(lx) < b.hx + radius * 0.38 && Math.abs(lz) < b.hz + radius * 0.38) return { embedded: true, blocker: b.label };
                }
                for (const c of this.cylinders) {
                    if (c.yMax <= footY || c.yMin >= headY) continue;
                    if (Math.hypot(pos.x - c.cx, pos.z - c.cz) < c.radius + radius * 0.38) return { embedded: true, blocker: c.label };
                }
                return { embedded: false, blocker: '' };
            }
            hasLineOfSight(p1, p2) {
                for (let i = 1; i < 16; i++) {
                    const pt = new THREE.Vector3().lerpVectors(p1, p2, i / 16);
                    if (this.isEmbedded(new THREE.Vector3(pt.x, pt.y - 0.9, pt.z), 0.15, 1.4).embedded) return false;
                }
                return true;
            }
            checkJumpPad(pos, grounded) {
                if (!grounded) return null;
                for (const pad of this.jumpPads) {
                    if (Math.hypot(pos.x - pad.x, pos.z - pad.z) <= pad.triggerRadius && Math.abs(pos.y - pad.y) <= 0.45) return pad;
                }
                return null;
            }
        }
export { UnifiedCollisionWorld as ConduitCollisionWorld };
export function createConduitArena(hostScene, { quality = 'medium', enableLights = true } = {}) {
    if (!hostScene?.isObject3D) throw new TypeError('Conduit needs an existing Three.js scene or group');
    const scene = new THREE.Group(); scene.name = 'The Conduit';
    const MAT = createMaterialLibrary(quality);
    const world = new UnifiedCollisionWorld();
    const upperGroup = new THREE.Group(), t0Group = new THREE.Group();
    upperGroup.name='Conduit Upper'; t0Group.name='Conduit Undercroft';
    scene.add(upperGroup,t0Group);
            function addBox(parent, sx, sy, sz, x, y, z, mat, col = null, rotY = 0) {
                const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
                m.position.set(x, y, z); m.rotation.y = rotY;
                m.castShadow = true; m.receiveShadow = true;
                parent.add(m);
                if (col) {
                    parent.updateMatrixWorld(true);
                    const wp = new THREE.Vector3(x, y, z).applyMatrix4(parent.matrixWorld);
                    const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq);
                    const pe = new THREE.Euler().setFromQuaternion(pq, 'YXZ');
                    world.addOBB(wp.x, wp.y, wp.z, sx, sy, sz, pe.y + rotY, !!col.walkable, col.label || '');
                }
                return m;
            }

            // Reference-art detail kit. Decorations are flush to existing solid surfaces and have no independent blockers.
            const detailBatches=new Map(), detailMatrix=new THREE.Object3D();
            function detailBox(parent,mat,x,y,z,sx,sy,sz,ry=0){
                let mats=detailBatches.get(parent);if(!mats){mats=new Map();detailBatches.set(parent,mats);}
                let list=mats.get(mat);if(!list){list=[];mats.set(mat,list);}
                detailMatrix.position.set(x,y,z);detailMatrix.rotation.set(0,ry,0);detailMatrix.scale.set(sx,sy,sz);detailMatrix.updateMatrix();list.push(detailMatrix.matrix.clone());
            }
            const detailCounts={instances:0,batches:0};
            function flushDetails(){
                for(const [parent,mats] of detailBatches)for(const [mat,transforms] of mats){
                    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,transforms.length);
                    transforms.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
                    mesh.name='CON_ReferenceDetailBatch';parent.add(mesh);detailCounts.instances+=transforms.length;detailCounts.batches++;
                }
                detailBatches.clear();
            }
            const buildingRoofs=[];
            function addCopperPipe(parent, radius, length, x, y, z, rotX = 0, rotY = 0, rotZ = Math.PI / 2) {
                const pg = new THREE.Group();
                pg.position.set(x, y, z);
                pg.rotation.set(rotX, rotY, rotZ);
                parent.add(pg);
                pg.add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), MAT.copperPipe));
                const collars = Math.max(2, Math.floor(length / 3.8) + 1);
                for (let i = 0; i < collars; i++) {
                    const py = -length * 0.45 + (i / (collars - 1)) * (length * 0.9);
                    const fl = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.24, radius * 1.24, 0.24, 10), MAT.gunmetal);
                    fl.position.y = py;
                    pg.add(fl);
                }
            }
            function addRailing(parent, len, x, y, z, rotY = 0, label = 'Railing') {

                const rg = new THREE.Group(); rg.position.set(x, y, z); rg.rotation.y = rotY; parent.add(rg);
                addBox(rg, len, 0.06, 0.06, 0, 1.07, 0, MAT.orangeSafety);
                addBox(rg, len, 0.04, 0.04, 0, 0.62, 0, MAT.yellowHazard);
                addBox(rg, len, 0.15, 0.05, 0, 0.075, 0, MAT.gunmetal);
                const posts = Math.max(2, Math.round(len / 1.5) + 1);
                for (let i = 0; i < posts; i++) addBox(rg, 0.06, 1.08, 0.06, -len * 0.5 + (i / (posts - 1)) * len, 0.54, 0, MAT.gunmetal);
                parent.updateMatrixWorld(true);
                const wp = new THREE.Vector3(x, y + 0.55, z).applyMatrix4(parent.matrixWorld);
                const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq);
                const pe = new THREE.Euler().setFromQuaternion(pq, 'YXZ');
                world.addOBB(wp.x, wp.y, wp.z, len, 1.1, 0.14, pe.y + rotY, false, label);
            }

            // =====================================================================
            // 7A. PERFORATED T1 COURTYARD (Y=0.0m) & T1 PERIMETER (Y=0.65m)
            // =====================================================================
            const stairStartR = 17.25, stairEndR = 9.75, stairLenC = 7.5, stairMidR = 13.5, stairWC = 3.2;
            const courtyardCutouts = [], courtyardStairWPs = [];
            const pitShape = new THREE.Shape(); pitShape.absarc(0, 0, CFG.pitRadius, 0, Math.PI * 2, false);

            CFG.cardinals.forEach((a, idx) => {
                const cx = Math.sin(a) * stairMidR, cz = Math.cos(a) * stairMidR;
                const hx = 1.75, hz = 3.85, cos = Math.cos(a), sin = Math.sin(a);
                courtyardCutouts.push({ cx, cz, hx, hz, rotY: a, cos, sin });
                world.addShaftOpening(cx, cz, hx * 2, hz * 2, a, CFG.yT0, CFG.yT1Pit, `Courtyard Shaft ${idx + 1}`);
                const hole = new THREE.Path();
                [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].forEach(([lx, lz], ci) => {
                    const wx = cx + lx * cos + lz * sin, wz = cz - lx * sin + lz * cos;
                    if (ci === 0) hole.moveTo(wx, -wz); else hole.lineTo(wx, -wz);
                });
                hole.closePath(); pitShape.holes.push(hole);
            });

            const pitGeo = new THREE.ExtrudeGeometry(pitShape, { depth: 0.60, bevelEnabled: false, curveSegments: 48 });
            pitGeo.rotateX(-Math.PI / 2);
            const pitMesh = new THREE.Mesh(pitGeo, MAT.steelFloor);
            pitMesh.position.y = CFG.yT0Ceil; pitMesh.receiveShadow = true; upperGroup.add(pitMesh);
            world.addDisc(0, 0, CFG.pitRadius, CFG.yT0Ceil, CFG.yT1Pit, true, 'T1 Courtyard Deck', courtyardCutouts);

            const t1Shape = new THREE.Shape(); t1Shape.absarc(0, 0, CFG.walkwayOuterR, 0, Math.PI * 2, false);
            const t1Hole = new THREE.Path(); t1Hole.absarc(0, 0, CFG.pitRadius, 0, Math.PI * 2, true);
            t1Shape.holes.push(t1Hole);
            const t1Geo = new THREE.ExtrudeGeometry(t1Shape, { depth: 1.25, bevelEnabled: false, curveSegments: 48 });
            t1Geo.rotateX(-Math.PI / 2);
            const t1Mesh = new THREE.Mesh(t1Geo, MAT.diamondTread);
            t1Mesh.position.y = CFG.yT0Ceil; t1Mesh.receiveShadow = true; upperGroup.add(t1Mesh);
            world.addAnnulus(CFG.pitRadius, CFG.walkwayOuterR + 1.0, CFG.yT0Ceil, CFG.yT1Bldg, true, 'T1 Perimeter Walkway');

            // 4 Cardinal Courtyard Ramps (Y=0 -> 0.65m)
            const rampLen = 3.4, rampW = 6.8, rampSlope = Math.atan2(CFG.yT1Bldg, rampLen), rampMidR = CFG.pitRadius - rampLen * 0.5;
            CFG.cardinals.forEach((a, idx) => {
                const rg = new THREE.Group(); rg.rotation.y = a; upperGroup.add(rg);
                const deck = new THREE.Mesh(new THREE.BoxGeometry(rampW, 0.18, rampLen + 0.2), MAT.diamondTread);
                deck.position.set(0, CFG.yT1Bldg * 0.5 - 0.07, rampMidR); deck.rotation.x = -rampSlope; rg.add(deck);
                world.addRamp(Math.sin(a) * rampMidR, Math.cos(a) * rampMidR, rampW, rampLen, 0, CFG.yT1Bldg, a, `Courtyard Ramp ${idx + 1}`, false);
            });

            // 12 Structural Support Pillars + Courtyard Barricades & Cargo
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2, r = CFG.walkwayOuterR - 0.15;
                const pg = new THREE.Group(); pg.position.set(Math.sin(a) * r, CFG.yT1Bldg, Math.cos(a) * r); pg.rotation.y = a; upperGroup.add(pg);
                addBox(pg, 1.25, 8.2, 1.25, 0, 4.1, 0, MAT.gunmetal, { label: `Pillar ${i + 1}` });
                addBox(pg, 0.14, 3.6, 0.1, 0, 2.5, -0.66, MAT.cyanGlow);
            }
            [-Math.PI * 0.75, Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.25].forEach((a, idx) => {
                addBox(upperGroup, 3.6, 1.15, 0.75, Math.sin(a) * 10.8, 0.575, Math.cos(a) * 10.8, MAT.gunmetal, { walkable: true, label: `Barricade ${idx + 1}` }, a);
                addBox(upperGroup, 3.65, 0.12, 0.78, Math.sin(a) * 10.8, 1.12, Math.cos(a) * 10.8, MAT.orangeSafety, null, a);
                addBox(upperGroup, 2.4, 1.8, 1.2, Math.sin(a) * 17.6, 0.9, Math.cos(a) * 17.6, MAT.crate, { walkable: true, label: `Cargo ${idx + 1}` }, a);
            });

            // =====================================================================
            // 7B. FOUR TWO-STORY BUILDINGS + DISTINCT INTERIORS + 8 STAIRCASES
            // =====================================================================
            const bldgWPs = {};
            CFG.buildings.forEach(spec => {
                const rDist = 38.0;
                const bg = new THREE.Group(); bg.position.set(Math.sin(spec.angle) * rDist, CFG.yT1Bldg, Math.cos(spec.angle) * rDist); bg.rotation.y = spec.angle; upperGroup.add(bg); bg.updateMatrixWorld(true);
                const bsmtG = new THREE.Group(); bsmtG.position.set(Math.sin(spec.angle) * rDist, CFG.yT0, Math.cos(spec.angle) * rDist); bsmtG.rotation.y = spec.angle; t0Group.add(bsmtG); bsmtG.updateMatrixWorld(true);
                const toW = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(bg.matrixWorld);
                const toB = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(bsmtG.matrixWorld);

                // Perforated T1 Floor
                addBox(bg, 18.4, 0.5, 5.9, 0.0, -0.25, -2.75, MAT.concrete, { walkable: true, label: `${spec.name} T1 Floor Front` });
                addBox(bg, 12.2, 0.5, 5.7, 2.9, -0.25,  3.05, MAT.concrete, { walkable: true, label: `${spec.name} T1 Floor Right` });
                addRailing(bg, 5.2, -3.25, 0.0, 2.8, Math.PI * 0.5, `${spec.name} Bsmt Rail E`);
                addRailing(bg, 2.7, -7.15, 0.0, 0.15, 0, `${spec.name} Bsmt Rail F`);
                const shC = toW(-5.85, 0, 2.9);
                world.addShaftOpening(shC.x, shC.z, 5.1, 5.4, spec.angle, CFG.yT0, CFG.yT1Bldg, `${spec.name} Bsmt Shaft`);

                // Exterior Walls (2 Ground Entrances + 1 Upper Ring Walk Exit)
                addBox(bg, 18.4, 8.7, 0.6, 0, 4.35, 5.6, MAT.paintedPanel, { label: `${spec.name} Back Wall` });
                addBox(bg, 0.6, 8.7, 11.4, -9.0, 4.35, 0, MAT.paintedPanel, { label: `${spec.name} Left Wall` });
                addBox(bg, 0.6, 8.7, 11.4,  9.0, 4.35, 0, MAT.paintedPanel, { label: `${spec.name} Right Wall` });
                addBox(bg, 2.6, 4.35, 0.6, -7.7, 2.175, -5.6, MAT.gunmetal, { label: `${spec.name} Front L` });
                addBox(bg, 6.4, 4.35, 0.6,  0.0, 2.175, -5.6, MAT.gunmetal, { label: `${spec.name} Front C` });
                addBox(bg, 2.6, 4.35, 0.6,  7.7, 2.175, -5.6, MAT.gunmetal, { label: `${spec.name} Front R` });
                addBox(bg, 2.2, 4.35, 0.6, -7.9, 6.525, -5.6, MAT.paintedPanel, { label: `${spec.name} Upper L` });
                addBox(bg, 2.2, 4.35, 0.6,  7.9, 6.525, -5.6, MAT.paintedPanel, { label: `${spec.name} Upper R` });
                [-4.2, 4.2].forEach(wx => {
                    addBox(bg, 5.2, 1.1, 0.55, wx, 4.9, -5.6, MAT.gunmetal, { label: `${spec.name} Win Sill` });
                    addBox(bg, 5.0, 2.2, 0.14, wx, 6.55, -5.6, MAT.glass, { label: `${spec.name} Win Glass` });
                });

                // Modular wall trim, seams and mounting plates, flush to existing solid back wall.
                for (let k=-8;k<=8;k+=2) {
                    addBox(bg,1.86,3.45,.045,k,2.15,5.275,MAT.darkSteel);
                    addBox(bg,1.72,3.30,.05,k,2.15,5.24,MAT.paintedPanel);
                    addBox(bg,.065,3.45,.065,k-.94,2.15,5.22,MAT.brushedSteel);
                    for (const dx of [-.76,.76]) for(const y of [.62,3.68]) addBox(bg,.07,.07,.045,k+dx,y,5.20,MAT.brushedSteel);
                }
                for(const x of [-4.8,4.8]) {
                    for(const dx of [-1.35,1.35]) addBox(bg,.15,4.25,.12,x+dx,2.125,-5.95,MAT.brushedSteel);
                    addBox(bg,2.9,.18,.14,x,4.24,-5.95,MAT.orangeSafety);
                    addBox(bg,2.2,.12,.12,x,4.05,-5.97,MAT.amberGlow);
                }
                addBox(bg,2.2,.75,.06,0,3.25,5.19,MAT.ventGrille);
                // Concept-art facade: inset panel seams, chamfer-like edge trims, framed cyan/amber entrances.
                const accentMat=spec.id==='medbay'?MAT.greenGlow:spec.id==='reactor'?MAT.purpleGlow:MAT.amberGlow;
                for(const [cx,w] of [[-7.7,2.6],[0,6.4],[7.7,2.6]]){
                    const count=Math.max(1,Math.round(w/1.45));
                    for(let j=0;j<count;j++){
                        const x=cx-w/2+(j+.5)*w/count, pw=w/count-.14;
                        detailBox(bg,MAT.darkSteel,x,2.18,-5.925,pw,3.55,.04);
                        detailBox(bg,MAT.paintedPanel,x,2.18,-5.95,pw-.10,3.35,.04);
                        detailBox(bg,MAT.brushedSteel,x,3.88,-5.98,pw,.07,.05);
                        for(const k of [-1,1])detailBox(bg,MAT.brushedSteel,x+k*(pw/2-.11),.68,-5.98,.08,.08,.06);
                    }
                }
                for(const x of [-4.8,4.8]){
                    detailBox(bg,MAT.darkSteel,x,4.36,-5.97,2.7,.22,.18);
                    detailBox(bg,accentMat,x,4.36,-6.08,2.3,.065,.035);
                }
                for(const side of [-1,1])for(let z=-4;z<=4;z+=2){
                    detailBox(bg,MAT.darkSteel,side*9.315,2.15,z,.045,3.4,1.85);
                    detailBox(bg,MAT.paintedPanel,side*9.345,2.15,z,.045,3.2,1.66);
                    detailBox(bg,MAT.brushedSteel,side*9.38,.65,z,.04,.09,1.7);
                    detailBox(bg,MAT.gunmetal,side*9.32,6.15,z,.06,2.8,1.85);
                }
                // Small console display and utility fasteners are mounted on the existing rear wall, not in lanes.
                detailBox(bg,MAT.darkSteel,-1.9,2.55,5.235,1.4,.8,.08);
                detailBox(bg,accentMat,-1.9,2.55,5.175,1.15,.54,.035);
                for(const x of [-2.5,-1.3])detailBox(bg,MAT.brushedSteel,x,2.92,5.17,.08,.08,.05);
                // Upper T2 Bridge, Floors & Walkable Roof
                addBox(bg, 3.6, 0.45, 2.2, 0, 4.125, -6.15, MAT.gunmetal, { walkable: true, label: `${spec.name} T2 Bridge` });
                addBox(bg, 11.5, 0.36, 10.6, -2.95, 4.17, 0.0, MAT.gunmetal, { walkable: true, label: `${spec.name} T2 Floor` });
                addBox(bg, 5.9, 0.36, 5.3, 5.75, 4.17, -2.65, MAT.gunmetal, { walkable: true, label: `${spec.name} T2 Landing` });
                buildingRoofs.push(addBox(bg, 18.8, 0.5, 12.0, 0, 8.95, 0, MAT.gunmetal, { walkable: true, label: `${spec.name} Roof` }));

                const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 2.1), new THREE.MeshBasicMaterial({ map: MAT.makeSign(spec.name, spec.hex) }));
                sign.rotation.y = Math.PI; sign.position.set(0, 10.3, -5.8); bg.add(sign);

                // Internal T1->T2 24-Riser Staircase (Dedicated Diamond-Plate Tread + Sloped Handrails + Undersides)
                const rise = 4.35 / 24, tread = 0.30, sw = 2.4, slope = Math.atan2(2.175, 3.6), hyp = Math.hypot(3.6, 2.175);
                for (let r = 0; r < 12; r++) {
                    addBox(bg, sw, rise, tread, 4.2, (r + 0.5) * rise, 0.15 + r * tread, (r === 0 || r === 11) ? MAT.orangeSafety : MAT.diamondTread);
                    addBox(bg, sw, rise, tread, 7.0, 2.175 + (r + 0.5) * rise, 3.45 - r * tread, (r === 0 || r === 11) ? MAT.orangeSafety : MAT.diamondTread);
                }
                const u1 = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.1, 0.26, hyp), MAT.darkSteel); u1.position.set(4.2, 0.9, 1.8); u1.rotation.x = -slope; bg.add(u1);
                const u2 = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.1, 0.26, hyp), MAT.darkSteel); u2.position.set(7.0, 3.08, 1.8); u2.rotation.x = slope; bg.add(u2);
                [-1.18, 1.18].forEach(dx => {
                    const hr1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, hyp), MAT.orangeSafety); hr1.position.set(4.2 + dx, 2.05, 1.8); hr1.rotation.x = -slope; bg.add(hr1);
                    const hr2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, hyp), MAT.orangeSafety); hr2.position.set(7.0 + dx, 4.22, 1.8); hr2.rotation.x = slope; bg.add(hr2);
                });
                addBox(bg, 5.4, 0.26, 1.9, 5.6, 2.045, 4.55, MAT.diamondTread, { walkable: true, label: `${spec.name} Int Landing` });
                const f1W = toW(4.2, 0, 1.8), f2W = toW(7.0, 0, 1.8);
                world.addRamp(f1W.x, f1W.z, sw, 3.6, CFG.yT1Bldg, CFG.yT1Bldg + 2.175, spec.angle, `${spec.name} Int Stair F1`, true);
                world.addRamp(f2W.x, f2W.z, sw, 3.6, CFG.yT1Bldg + 2.175, CFG.yT2, spec.angle + Math.PI, `${spec.name} Int Stair F2`, true);

                // Visible posts and mounting feet on both interior flights; edge decoration only.
                for(const [x,z0,y0,dir] of [[4.2,0,0,1],[7.0,3.6,2.175,-1]])for(const side of [-1,1])for(let k=0;k<=3;k++){
                    const t=k/3, y=y0+2.175*t,z=z0+dir*3.6*t;
                    detailBox(bg,MAT.gunmetal,x+side*1.18,y+.53,z,.06,1.06,.06);
                    detailBox(bg,MAT.brushedSteel,x+side*1.18,y+.025,z,.15,.05,.15);
                }
                // Distinct Building Interiors
                if (spec.id === 'armory') {
                    for (let k = -2; k <= 2; k += 2) addBox(bg, 0.9, 2.2, 1.4, -8.1, 1.1, k, MAT.gunmetal, { label: 'Armory Locker' });
                    addBox(bg, 2.6, 0.95, 1.0, -1.0, 0.475, 4.4, MAT.brushedSteel, { walkable: true, label: 'Armory Workbench' });
                    // Gemini cargo design retained as a small bench-mounted equipment case rather than a new floor obstruction.
                    detailBox(bg,MAT.crate,-1.65,1.13,4.4,.58,.36,.55);
                } else if (spec.id === 'reactor') {
                    const cPos = toW(-1.2, 0, 0.2);
                    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 3.6, 14), MAT.cyanGlow); core.position.set(-1.2, 2.1, 0.2); bg.add(core);
                    [-1.6, 1.6].forEach(dx => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 4.0, 8), MAT.copperPipe); p.position.set(-1.2 + dx, 2.0, 0.2); bg.add(p); });
                    [-0.78,0.78].forEach(dx=>{const ch=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,1.8,10),MAT.purpleGlow);ch.position.set(-1.2+dx,2.2,-.92);bg.add(ch);});
                    world.addCylinder(cPos.x, cPos.z, 1.9, CFG.yT1Bldg, CFG.yT2, 'Reactor Core Cylinder');
                } else if (spec.id === 'medbay') {
                    addBox(bg, 2.2, 0.85, 1.0, -3.4, 0.425, 0.6, MAT.brushedSteel, { walkable: true, label: 'Med-Bay Recovery Pod' });
                    addBox(bg, 2.0, 0.14, 0.85, -3.4, 0.92, 0.6, MAT.greenGlow);
                    addBox(bg, 0.9, 2.2, 3.4, -8.1, 1.1, -0.6, MAT.paintedPanel, { label: 'Med-Bay Cabinet' });
                } else {
                    addBox(bg, 0.9, 2.2, 4.0, -8.1, 1.1, -0.6, MAT.gunmetal, { label: 'Barracks Lockers' });
                    addBox(bg, 3.0, 2.4, 0.35, -2.5, 1.2, 1.4, MAT.paintedPanel, { label: 'Barracks Partition' });
                    addBox(bg, 2.4, 0.9, 0.9, -2.5, 0.45, -0.8, MAT.brushedSteel, { walkable: true, label: 'Barracks Bench' });
                }

                // Fully Enclosed T0 Basement + Connector + 30-Riser Basement Staircase
                addBox(bsmtG, 18.6, 0.5, 13.0, 0, -0.25, 0.4, MAT.steelFloor, { walkable: true, label: `${spec.name} Bsmt Floor` });
                addBox(bsmtG, 5.0, 0.5, 4.6, 0, -0.25, -7.8, MAT.steelFloor, { walkable: true, label: `${spec.name} Bsmt Conn` });
                addBox(bsmtG, 5.4, 0.5, 4.6, 0, 4.65, -7.8, MAT.gunmetal, { label: `${spec.name} Bsmt Conn Ceil` });
                addBox(bsmtG, 18.6, 5.2, 0.6, 0, 2.6, 6.8, MAT.concrete, { label: `${spec.name} Bsmt Back` });
                addBox(bsmtG, 0.6, 5.2, 13.0, -9.0, 2.6, 0.4, MAT.concrete, { label: `${spec.name} Bsmt Left` });
                addBox(bsmtG, 0.6, 5.2, 13.0,  9.0, 2.6, 0.4, MAT.concrete, { label: `${spec.name} Bsmt Right` });
                addBox(bsmtG, 6.7, 5.2, 0.6, -5.75, 2.6, -5.8, MAT.gunmetal, { label: `${spec.name} Bsmt Front L` });
                addBox(bsmtG, 6.7, 5.2, 0.6,  5.75, 2.6, -5.8, MAT.gunmetal, { label: `${spec.name} Bsmt Front R` });
                addBox(bsmtG, 0.5, 4.6, 3.4, -2.55, 2.3, -7.3, MAT.gunmetal, { label: `${spec.name} Conn Wall L` });
                addBox(bsmtG, 0.5, 4.6, 3.4,  2.55, 2.3, -7.3, MAT.gunmetal, { label: `${spec.name} Conn Wall R` });
                // Ventilation grille panel in basement
                addBox(bsmtG, 2.2, 1.4, 0.12, 5.5, 2.4, 6.45, MAT.ventGrille);

                const bRise = 5.65 / 30;
                const bSlope = Math.atan2(2.825,4.5), bHyp = Math.hypot(4.5,2.825);
                for (let r = 0; r < 15; r++) {
                    addBox(bsmtG, sw, bRise, tread, -4.5, (5.65 - r * bRise) - bRise * 0.5, 0.2 + (r + 0.5) * tread, (r === 0 || r === 14) ? MAT.orangeSafety : MAT.diamondTread);
                    addBox(bsmtG, sw, bRise, tread, -7.1, (2.825 - r * bRise) - bRise * 0.5, 4.7 - (r + 0.5) * tread, (r === 0 || r === 14) ? MAT.orangeSafety : MAT.diamondTread);
                }
                // Phase 8: Basement staircase structural stringers, undersides & sloped orange handrails
                const bu1 = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.14, 0.28, bHyp), MAT.darkSteel); bu1.position.set(-4.5, 4.05, 2.45); bu1.rotation.x = bSlope; bsmtG.add(bu1);
                const bu2 = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.14, 0.28, bHyp), MAT.darkSteel); bu2.position.set(-7.1, 1.23, 2.45); bu2.rotation.x = -bSlope; bsmtG.add(bu2);
                [-1.18, 1.18].forEach(dx => {
                    const bhr1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, bHyp), MAT.orangeSafety); bhr1.position.set(-4.5 + dx, 5.15, 2.45); bhr1.rotation.x = bSlope; bsmtG.add(bhr1);
                    const bhr2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, bHyp), MAT.orangeSafety); bhr2.position.set(-7.1 + dx, 2.33, 2.45); bhr2.rotation.x = -bSlope; bsmtG.add(bhr2);
                });
                for(const [x,z0,y0,dir] of [[-4.5,.2,5.65,1],[-7.1,4.7,2.825,-1]]) {
                    for(const dx of [-1.18,1.18])for(let k=0;k<=3;k++) {
                        const t=k/3, z=z0+dir*4.5*t, y=y0-2.825*t;
                        addBox(bsmtG,.06,1.05,.06,x+dx,y+.525,z,MAT.gunmetal,{label:`${spec.name} Bsmt rail post ${x} ${dx} ${k}`});
                        addBox(bsmtG,.16,.04,.16,x+dx,y+.02,z,MAT.brushedSteel);
                    }
                }
                addBox(bsmtG, 5.4, 0.26, 2.0, -5.8, 2.825 - 0.13, 5.65, MAT.diamondTread, { walkable: true, label: `${spec.name} Bsmt Landing` });
                const bf1 = toB(-4.5, 0, 2.45), bf2 = toB(-7.1, 0, 2.45);
                world.addRamp(bf1.x, bf1.z, sw, 4.5, CFG.yT1Bldg, CFG.yT1Bldg - 2.825, spec.angle, `${spec.name} Bsmt Stair F1`, true);
                world.addRamp(bf2.x, bf2.z, sw, 4.5, CFG.yT1Bldg - 2.825, CFG.yT0, spec.angle + Math.PI, `${spec.name} Bsmt Stair F2`, true);
                const bSign = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.85), new THREE.MeshBasicMaterial({ map: MAT.makeSign(`${spec.name} BSMT`, spec.hex) }));
                bSign.rotation.y = Math.PI;
                bSign.position.set(0, 4.1, -6.12);
                bsmtG.add(bSign);

                addCopperPipe(bsmtG, 0.28, 14.0, 0, 3.85, -3.5, 0, 0, Math.PI / 2);
                // Themed Basement Interiors
                if (spec.id === 'armory') {
                    addBox(bsmtG, 1.2, 2.2, 4.0, 7.8, 1.1, 0.4, MAT.gunmetal, { label: 'Armory Racks' });
                    addBox(bsmtG, 0.1, 1.6, 3.4, 7.15, 1.2, 0.4, MAT.amberGlow);
                    addBox(bsmtG, 2.4, 1.4, 1.2, 3.6, 0.7, 2.4, MAT.crate, { walkable: true, label: 'Armory Cargo' });
                    addBox(bsmtG, 1.2, 1.2, 1.2, 3.8, 0.6, -2.0, MAT.crate, { walkable: true, label: 'Armory Crate' });
                } else if (spec.id === 'reactor') {
                    addCopperPipe(bsmtG, 0.34, 4.6, 7.2, 2.3,  2.2, 0, 0, 0);
                    addCopperPipe(bsmtG, 0.34, 4.6, 7.2, 2.3, -0.5, 0, 0, 0);
                    addBox(bsmtG, 1.3, 2.4, 3.4, 7.6, 1.2, -3.2, MAT.gunmetal, { label: 'Reactor Power Cabinet' });
                    addBox(bsmtG, 0.12, 1.8, 2.8, 6.9, 1.3, -3.2, MAT.purpleGlow);
                    addBox(bsmtG, 2.2, 1.2, 1.2, 3.6, 0.6, 2.0, MAT.gunmetal, { walkable: true, label: 'Reactor Console' });
                    addBox(bsmtG, 2.0, 0.14, 0.25, 3.6, 1.25, 2.0, MAT.cyanGlow);
                } else if (spec.id === 'medbay') {
                    addBox(bsmtG, 1.2, 2.2, 4.0, 7.8, 1.1, 0.2, MAT.paintedPanel, { label: 'Med Cabinets' });
                    addBox(bsmtG, 0.1, 1.6, 3.4, 7.15, 1.2, 0.2, MAT.greenGlow);
                    addBox(bsmtG, 1.2, 1.0, 1.2, 3.8, 0.5, 2.4, MAT.greenGlow, { walkable: true, label: 'Recovery Pod' });
                    addBox(bsmtG, 2.4, 1.1, 1.0, 3.6, 0.55, -2.0, MAT.brushedSteel, { walkable: true, label: 'Med Supply Table' });
                } else {
                    addBox(bsmtG, 1.2, 2.2, 4.2, 7.8, 1.1, 0.4, MAT.gunmetal, { label: 'Barracks Lockers' });
                    addBox(bsmtG, 2.8, 1.0, 1.0, 3.8, 0.5, 2.6, MAT.brushedSteel, { walkable: true, label: 'Barracks Bench' });
                    addBox(bsmtG, 2.4, 1.2, 1.2, 3.6, 0.6, -1.8, MAT.crate, { walkable: true, label: 'Barracks Cargo' });
                }

                const bLight = new THREE.PointLight(spec.id === 'medbay' ? 0x86efac : spec.id === 'reactor' ? 0x9ef0ff : 0xffd7a8, 30, 22, 1.5);
                bLight.position.copy(toB(1.0, 3.7, -0.5));
                t0Group.add(bLight);

                bldgWPs[spec.id] = {
                    entLOut: toW(-4.8, 0, -7.2), entLIn: toW(-4.8, 0, -3.4),
                    entROut: toW( 4.8, 0, -7.2), entRIn: toW( 4.8, 0, -3.4),
                    upperMid: toW(0, 4.35, -2.5), upperOut: toW(0, 4.35, -7.2),
                    intBot: toW(4.2, 0, -0.6), intL1: toW(4.2, 2.175, 4.25), intL2: toW(7.0, 2.175, 4.25), intTop: toW(7.0, 4.35, -0.6),
                    bsmtTop: toW(-4.5, 0, -0.5), bsmtL1: toW(-4.5, -2.825, 5.3), bsmtL2: toW(-7.1, -2.825, 5.3), bsmtBot: toB(-7.1, 0, -0.5),
                    bsmtOut: toB(0, 0, -9.0)
                };
            });

            // =====================================================================
            // 7C. FULLY ENCLOSED T0 UNDERCROFT (WALLS, CEILINGS, PIPES, 4 STAIRS)
            // =====================================================================
            const chFloor = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.8, 0.5, 16), MAT.steelFloor);
            chFloor.position.y = CFG.yT0 - 0.25; chFloor.receiveShadow = true; t0Group.add(chFloor);
            world.addDisc(0, 0, 6.6, CFG.yT0 - 0.5, CFG.yT0, true, 'T0 Central Chamber');
            world.addCylinder(0, 0, 1.1, CFG.yT0, CFG.yT0 + 1.5, 'T0 Central Energy Station');
            // Recessed electrical conduits radiating from center
            for (let i = 0; i < 4; i++) {
                const a = CFG.cardinals[i];
                addBox(t0Group, 0.24, 0.03, 5.2, Math.sin(a) * 3.4, CFG.yT0 + 0.02, Math.cos(a) * 3.4, MAT.cyanGlow, null, a);
            }

            // Octagonal structural support frame (8 columns)
            for (let i = 0; i < 8; i++) {
                const a = (i + 0.5) * (Math.PI / 4);
                addBox(t0Group, 0.85, 4.4, 0.85, Math.sin(a) * 5.85, CFG.yT0 + 2.2, Math.cos(a) * 5.85, MAT.gunmetal, { label: `Chamber Column ${i + 1}` }, a);
                addBox(t0Group, 0.14, 2.8, 0.14, Math.sin(a) * 5.4, CFG.yT0 + 2.2, Math.cos(a) * 5.4, MAT.cyanGlow);
            }

            // 4 Low tactical cover blocks
            [-Math.PI * 0.75, Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.25].forEach((a, idx) => {
                const r = 3.7;
                addBox(t0Group, 1.6, 0.9, 0.55, Math.sin(a) * r, CFG.yT0 + 0.45, Math.cos(a) * r, MAT.gunmetal, { walkable: true, label: `Chamber Cover ${idx + 1}` }, a);
                addBox(t0Group, 1.64, 0.1, 0.6, Math.sin(a) * r, CFG.yT0 + 0.88, Math.cos(a) * r, MAT.orangeSafety, null, a);
            });
            const coreRing = new THREE.Mesh(new THREE.TorusGeometry(1.05, .08, 8, 24), MAT.cyanGlow); coreRing.rotation.x=Math.PI/2;coreRing.position.y=CFG.yT0+.44;t0Group.add(coreRing);

            const cRisers = 25, cRise = 5.0 / cRisers, cTread = 0.30;
            const cSlope = Math.atan2(5,stairLenC), cHyp = Math.hypot(stairLenC,5);
            CFG.cardinals.forEach((a, idx) => {
                const sg = new THREE.Group(); sg.rotation.y = a; t0Group.add(sg);
                for (let r = 0; r < cRisers; r++) {
                    addBox(sg, stairWC, cRise, cTread, 0, -r * cRise - cRise * 0.5, stairStartR - (r + 0.5) * cTread, (r === 0 || r === 24) ? MAT.orangeSafety : MAT.diamondTread);
                }
                sg.updateMatrixWorld(true);
                const cu = new THREE.Mesh(new THREE.BoxGeometry(stairWC+0.16,0.32,cHyp),MAT.darkSteel);
                cu.position.set(0,-2.72,stairMidR); cu.rotation.x=-cSlope; sg.add(cu);
                for (const sx of [-1.76,1.76]) {
                    for (const h of [0.62,1.07]) {
                        const rail=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,cHyp),MAT.orangeSafety);
                        rail.position.set(sx,-2.5+h,stairMidR); rail.rotation.x=-cSlope; sg.add(rail);
                    }
                    for(let k=0;k<=5;k++) {
                        const t=k/5, z=stairStartR-t*stairLenC, y=-5*t;
                        addBox(sg,.06,1.08,.06,sx,y+.54,z,MAT.gunmetal,{label:`CStair post ${idx} ${sx} ${k}`});
                        addBox(sg,.18,.05,.18,sx,y+.025,z,MAT.brushedSteel);
                    }
                    // Stepwise side collision follows the actual slope rather than a flat rail at ground level.
                    for(let k=0;k<15;k++) {
                        const t=(k+.5)/15;
                        const v=new THREE.Vector3(sx,-5*t+.55,stairStartR-t*stairLenC).applyMatrix4(sg.matrixWorld);
                        world.addOBB(v.x,v.y,v.z,.14,1.1,stairLenC/15,a,false,`CStair side ${idx} ${sx} ${k}`);
                    }
                }
                world.addRamp(Math.sin(a) * stairMidR, Math.cos(a) * stairMidR, stairWC, stairLenC, CFG.yT0, CFG.yT1Pit, a, `Courtyard Stair ${idx + 1}`, true);

                // Enclosed Cross Tunnel Floors + Continuous Walls + Ceiling Beams
                addBox(sg, 5.2, 0.5, 4.0, 0, CFG.yT0 - 0.25,  7.6, MAT.steelFloor, { walkable: true, label: `T0 Tun In ${idx}` });
                addBox(sg, 8.8, 0.5, 10.0, 0, CFG.yT0 - 0.25, 13.8, MAT.steelFloor, { walkable: true, label: `T0 Bypass ${idx}` });
                addBox(sg, 5.2, 0.5, 9.2, 0, CFG.yT0 - 0.25, 23.0, MAT.steelFloor, { walkable: true, label: `T0 Tun Out ${idx}` });
                addBox(sg, 5.6, 0.35, 9.4, 0, CFG.yT0Ceil, 23.0, MAT.gunmetal, { label: `T0 Tun Ceil Out ${idx}` });
                addBox(sg, 5.6, 0.35, 4.0, 0, CFG.yT0Ceil,  7.6, MAT.gunmetal, { label: `T0 Tun Ceil In ${idx}` });
                // Physically modeled overhead strip light fixture + floor drainage grate + warning trim
                addBox(sg, 0.22, 0.12, 6.2, 0, CFG.yT0Ceil - 0.22, 23.0, MAT.amberGlow);
                addBox(sg, 1.4, 0.04, 1.4, 0, CFG.yT0 + 0.02, 21.0, MAT.ventGrille);
                addBox(sg, 4.6, 0.03, 0.22, 0, CFG.yT0 + 0.02, 18.8, MAT.orangeSafety);
                // Reinforced tunnel entrance portal frame
                addBox(sg, 5.4, 0.42, 0.55, 0, CFG.yT0 + 4.1, 18.6, MAT.brushedSteel);
                [-2.6, 2.6].forEach(wx => {
                    addBox(sg, 0.5, 4.4, 3.8, wx, CFG.yT0 + 2.2,  7.6, MAT.concrete, { label: `T0 Wall In ${idx}` });
                    addBox(sg, 0.5, 4.4, 8.6, wx, CFG.yT0 + 2.2, 22.8, MAT.concrete, { label: `T0 Wall Out ${idx}` });
                });
                [-4.4, 4.4].forEach(wx => {
                    addBox(sg, 0.5, 4.4, 9.8, wx, CFG.yT0 + 2.2, 13.8, MAT.paintedPanel, { label: `T0 Hall Wall ${idx}` });
                    addBox(sg, 0.1, 1.2, 1.8, wx > 0 ? wx - 0.26 : wx + 0.26, CFG.yT0 + 2.4, 13.8, MAT.ventGrille);
                });
                [-3.5, 3.5].forEach(wx => {
                    addBox(sg, 1.9, 4.4, 0.5, wx, CFG.yT0 + 2.2,  9.1, MAT.gunmetal, { label: `T0 Shoulder In ${idx}` });
                    addBox(sg, 1.9, 4.4, 0.5, wx, CFG.yT0 + 2.2, 18.6, MAT.gunmetal, { label: `T0 Shoulder Out ${idx}` });
                });
                const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 8.5, 8), MAT.copperPipe);
                pipe.rotation.x = Math.PI / 2; pipe.position.set(-1.7, CFG.yT0 + 3.8, 22.8); sg.add(pipe);
                // Ceiling support ribs, overhead copper coolant pipes & directional sign
                [20.2, 24.8].forEach(rz => {
                    addBox(sg, 4.8, 0.28, 0.36, 0, CFG.yT0 + 4.15, rz, MAT.gunmetal);
                });
                addCopperPipe(sg, 0.18, 8.2,  1.75, CFG.yT0 + 3.82, 22.8, Math.PI / 2, 0, 0);

                const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.72), new THREE.MeshBasicMaterial({ map: MAT.makeSign(['SOUTH TUNNEL','EAST TUNNEL','NORTH TUNNEL','WEST TUNNEL'][idx], '#ffb45e') }));
                sign.position.set(0, CFG.yT0 + 3.65, 19.2);
                sign.rotation.y = Math.PI;
                sg.add(sign);

                // Offset tactical cargo cover (keeps 2.8m+ clear sprint lane)
                addBox(sg, 1.1, 1.1, 1.2, 1.65, CFG.yT0 + 0.55, 22.6, MAT.crate, { walkable: true, label: `T0 Cargo ${idx}` });
                // Industrial fixture housings, panel borders and small conduit support plates.
                for(const z of [20,23,26]){
                    detailBox(sg,MAT.darkSteel,0,CFG.yT0Ceil-.18,z,.46,.10,1.25);
                    detailBox(sg,MAT.amberGlow,0,CFG.yT0Ceil-.245,z,.27,.035,.95);
                    for(const side of [-1,1]){
                        detailBox(sg,MAT.gunmetal,side*2.335,CFG.yT0+2.05,z,.06,2.9,1.65);
                        detailBox(sg,MAT.brushedSteel,side*2.29,CFG.yT0+.55,z,.045,.075,1.55);
                    }
                }
                // Pipe support flanges & brackets
                [19.5, 22.8, 26.0].forEach(pz => {
                    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 8), MAT.gunmetal);
                    fl.rotation.x = Math.PI / 2; fl.position.set(-1.7, CFG.yT0 + 3.8, pz); sg.add(fl);
                });

                courtyardStairWPs.push({
                    top: new THREE.Vector3(Math.sin(a) * (stairStartR + 1.1), 0, Math.cos(a) * (stairStartR + 1.1)),
                    bot: new THREE.Vector3(Math.sin(a) * (stairEndR - 1.1), CFG.yT0, Math.cos(a) * (stairEndR - 1.1))
                });
            });

            // Continuous 360° T0 Perimeter Ring + Enclosed Inner & Outer Concrete Walls
            const t0RShape = new THREE.Shape(); t0RShape.absarc(0, 0, CFG.t0PerimeterR + CFG.t0PerimeterHalfW, 0, Math.PI * 2, false);
            const t0RHole = new THREE.Path(); t0RHole.absarc(0, 0, CFG.t0PerimeterR - CFG.t0PerimeterHalfW, 0, Math.PI * 2, true);
            t0RShape.holes.push(t0RHole);
            const t0RGeo = new THREE.ExtrudeGeometry(t0RShape, { depth: 0.5, bevelEnabled: false, curveSegments: 48 });
            t0RGeo.rotateX(-Math.PI / 2);
            const t0RMesh = new THREE.Mesh(t0RGeo, MAT.steelFloor);
            t0RMesh.position.y = CFG.yT0 - 0.5; t0Group.add(t0RMesh);
            world.addAnnulus(CFG.t0PerimeterR - CFG.t0PerimeterHalfW - 0.2, CFG.t0PerimeterR + CFG.t0PerimeterHalfW + 0.2, CFG.yT0 - 0.5, CFG.yT0, true, 'T0 Perimeter Ring');
            const ringCopper = new THREE.Mesh(new THREE.TorusGeometry(CFG.t0PerimeterR + 1.55, 0.30, 8, 64), MAT.copperPipe);
            ringCopper.rotation.x = Math.PI / 2;
            ringCopper.position.y = CFG.yT0 + 3.85;
            t0Group.add(ringCopper);

            // Phase 8: Continuous T0 Perimeter Tunnel Ceiling Ring
            const t0CeilGeo = new THREE.RingGeometry(CFG.t0PerimeterR - CFG.t0PerimeterHalfW - 0.3, CFG.t0PerimeterR + CFG.t0PerimeterHalfW + 0.3, 48);
            t0CeilGeo.rotateX(Math.PI / 2);
            const t0CeilMesh = new THREE.Mesh(t0CeilGeo, MAT.gunmetal);
            t0CeilMesh.position.y = CFG.yT0Ceil;
            t0Group.add(t0CeilMesh);
            world.addAnnulus(CFG.t0PerimeterR - CFG.t0PerimeterHalfW - 0.3, CFG.t0PerimeterR + CFG.t0PerimeterHalfW + 0.3, CFG.yT0Ceil - 0.3, CFG.yT0Ceil, false, 'T0 Perimeter Ceiling');

            const buildT0WallArc = (radius, startA, endA, prefix) => {
                const segs = 4, stepA = (endA - startA) / segs;
                for (let s = 0; s < segs; s++) {
                    const aMid = startA + (s + 0.5) * stepA;
                    const chord = 2 * radius * Math.sin(stepA * 0.5) + 0.28;
                    addBox(t0Group, chord, 4.4, 0.55, Math.sin(aMid) * radius, CFG.yT0 + 2.2, Math.cos(aMid) * radius, MAT.concrete, { label: `${prefix} #${s + 1}` }, aMid);
                    const pR = radius < CFG.t0PerimeterR ? radius + 0.5 : radius - 0.5;
                    addBox(t0Group, chord, 0.14, 0.14, Math.sin(aMid) * pR, CFG.yT0 + 3.45, Math.cos(aMid) * pR, MAT.amberGlow, null, aMid);
                }
            };
            const diagSorted = [-Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.25, Math.PI * 0.75];
            for (let q = 0; q < 4; q++) {
                buildT0WallArc(CFG.t0PerimeterR - CFG.t0PerimeterHalfW - 0.25, CFG.cardinals[q] + 0.11, (q < 3 ? CFG.cardinals[q + 1] : Math.PI * 2) - 0.11, `T0 Inner Wall Q${q + 1}`);
                buildT0WallArc(CFG.t0PerimeterR + CFG.t0PerimeterHalfW + 0.25, diagSorted[q] + 0.095, (q < 3 ? diagSorted[q + 1] : diagSorted[0] + Math.PI * 2) - 0.095, `T0 Outer Wall Q${q + 1}`);
            }

            // =====================================================================
            // 7D. T2 RING WALK + CURVED INSTANCED SAFETY RAILINGS + CROWN + 4 PADS
            // =====================================================================
            const rwShape = new THREE.Shape(); rwShape.absarc(0, 0, CFG.ringWalkOuterR, 0, Math.PI * 2, false);
            const rwHole = new THREE.Path(); rwHole.absarc(0, 0, CFG.ringWalkInnerR, 0, Math.PI * 2, true);
            rwShape.holes.push(rwHole);
            const rwGeo = new THREE.ExtrudeGeometry(rwShape, { depth: CFG.ringWalkThick, bevelEnabled: false, curveSegments: 64 });
            rwGeo.rotateX(-Math.PI / 2);
            const rwMesh = new THREE.Mesh(rwGeo, MAT.diamondTread);
            rwMesh.position.y = CFG.yT2 - CFG.ringWalkThick; rwMesh.castShadow = true; rwMesh.receiveShadow = true;
            upperGroup.add(rwMesh);
            world.addAnnulus(CFG.ringWalkInnerR, CFG.ringWalkOuterR, CFG.yT2 - CFG.ringWalkThick, CFG.yT2, true, 'T2 Ring Walk');

            // Curved Orange Safety Railings on T2 Ring Walk (Instanced Posts + OBBs, open at jump pads & doorways)
            const postMatrices = [], dummy = new THREE.Object3D();
            const buildT2RailArc = (radius, startA, endA, prefix) => {
                const segs = Math.max(2, Math.round((radius * (endA - startA)) / 1.6)), stepA = (endA - startA) / segs;
                for (let s = 0; s < segs; s++) {
                    const aMid = startA + (s + 0.5) * stepA, chord = 2 * radius * Math.sin(stepA * 0.5) + 0.04;
                    const cx = Math.sin(aMid) * radius, cz = Math.cos(aMid) * radius;
                    addBox(upperGroup, chord, 0.06, 0.06, cx, CFG.yT2 + 1.07, cz, MAT.orangeSafety, null, aMid);
                    addBox(upperGroup, chord, 0.04, 0.04, cx, CFG.yT2 + 0.62, cz, MAT.yellowHazard, null, aMid);
                    addBox(upperGroup, chord, 0.15, 0.05, cx, CFG.yT2 + 0.075, cz, MAT.gunmetal, null, aMid);
                    world.addOBB(cx, CFG.yT2 + 0.55, cz, chord, 1.1, 0.14, aMid, false, `${prefix} #${s + 1}`);
                    dummy.position.set(Math.sin(startA + s * stepA) * radius, CFG.yT2 + 0.54, Math.cos(startA + s * stepA) * radius);
                    dummy.rotation.set(0, startA + s * stepA, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
                    postMatrices.push(dummy.matrix.clone());
                    detailBox(upperGroup,MAT.brushedSteel,dummy.position.x,CFG.yT2+.025,dummy.position.z,.14,.05,.14,startA+s*stepA);
                }
            };
            for (let q = 0; q < 4; q++) {
                buildT2RailArc(CFG.ringWalkInnerR + 0.12, diagSorted[q] + 0.085, (q < 3 ? diagSorted[q + 1] : diagSorted[0] + Math.PI * 2) - 0.085, `T2 Inner Rail Q${q + 1}`);
                buildT2RailArc(CFG.ringWalkOuterR - 0.12, diagSorted[q] + 0.072, (q < 3 ? diagSorted[q + 1] : diagSorted[0] + Math.PI * 2) - 0.072, `T2 Outer Rail Q${q + 1}`);
            }
            const postInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 1.08, 0.06), MAT.gunmetal, postMatrices.length);
            postMatrices.forEach((m, i) => postInst.setMatrixAt(i, m));
            upperGroup.add(postInst);

            // Central Crown Platform (18m diameter) + Support Column + Cables + 4 Angled Barriers
            const crownTop = new THREE.Mesh(new THREE.CylinderGeometry(CFG.crownRadius, CFG.crownRadius, 0.18, 32), MAT.crownDeck);
            crownTop.position.y = CFG.yCrown - 0.09; crownTop.castShadow = true; crownTop.receiveShadow = true; upperGroup.add(crownTop);
            const crownHull = new THREE.Mesh(new THREE.CylinderGeometry(CFG.crownRadius - 0.1, CFG.crownRadius - 1.3, 0.44, 24), MAT.gunmetal);
            crownHull.position.y = CFG.yCrown - 0.38; upperGroup.add(crownHull);
            const colShaft = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.65, 4.4, 12), MAT.darkSteel);
            colShaft.position.y = 2.2; upperGroup.add(colShaft);
            world.addDisc(0, 0, CFG.crownRadius, CFG.yCrown - CFG.crownThick, CFG.yCrown, true, 'Central Crown Platform');
            world.addCylinder(0, 0, 1.75, 0, CFG.yCrown - CFG.crownThick, 'Crown Support Column');

            CFG.cardinals.forEach((a, idx) => {
                addBox(upperGroup, 2.0, 0.75, 0.7, Math.sin(a) * 5.3, CFG.yCrown + 0.375, Math.cos(a) * 5.3, MAT.gunmetal, { walkable: true, label: `Crown Cover ${idx + 1}` }, a);
                addBox(upperGroup, 2.2, 1.2, 0.9, Math.sin(a) * 31.1, CFG.yT2 + 0.6, Math.cos(a) * 31.1, MAT.gunmetal, { walkable: true, label: `T2 Cover ${idx + 1}` }, a);
            });

            for(let i=0;i<32;i++){
                const a=i*Math.PI/16,r=8.65;
                detailBox(upperGroup,MAT.darkSteel,Math.sin(a)*r,4.69,Math.cos(a)*r,1.56,.25,.14,a);
                detailBox(upperGroup,i%4===0?MAT.cyanGlow:MAT.brushedSteel,Math.sin(a)*(r+.10),4.75,Math.cos(a)*(r+.10),1.30,.075,.045,a);
            }
            // 4 Functional T2 Jump Pads
            const padRings = [];
            CFG.buildings.forEach(b => {
                const [px, py, pz] = b.pad;
                const tx = Math.sin(b.angle) * CFG.crownLandingR, tz = Math.cos(b.angle) * CFG.crownLandingR;
                const pg = new THREE.Group(); pg.position.set(px, py, pz); upperGroup.add(pg);
                addBox(pg, 2.4, 0.08, 2.4, 0, 0.04, 0, MAT.darkSteel);
                const frame=new THREE.Mesh(new THREE.CylinderGeometry(1.13,1.19,.075,8),MAT.brushedSteel);frame.position.y=.075;pg.add(frame);
                const inset=new THREE.Mesh(new THREE.CylinderGeometry(.95,.98,.04,8),MAT.gunmetal);inset.position.y=.115;pg.add(inset);
                const em = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 18), MAT.cyanGlow); em.position.y = 0.14; pg.add(em);
                for(const x of [-1.02,1.02])for(const z of [-1.02,1.02])detailBox(pg,MAT.brushedSteel,x,.086,z,.11,.025,.11);
                // A pair of directional chevrons at the inward edge; no physical energy bridge.
                const arrow=new THREE.Group();arrow.rotation.y=b.angle;pg.add(arrow);
                for(const side of [-1,1])detailBox(arrow,MAT.cyanGlow,side*.23,.12,-1.0,.07,.025,.36,side*Math.PI/4);
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.04, 6, 20), MAT.cyanGlow); ring.rotation.x = Math.PI / 2; ring.position.y = 0.22; pg.add(ring);
                padRings.push(ring);
                world.jumpPads.push({ id: b.id, name: `${b.name} Pad`, x: px, y: py, z: pz, triggerRadius: 1.05, targetX: tx, targetY: CFG.yCrown, targetZ: tz });
            });

            // =====================================================================
            // 7E. RESTORED PHASE 5 OVERHEAD REACTOR & CAVERN RIBS/CONDUIT
            // =====================================================================
            const reactorGroup = new THREE.Group(); reactorGroup.position.set(0, 20.5, 0); scene.add(reactorGroup);
            reactorGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(5.6, 4.8, 7.2, 16), MAT.gunmetal));
            const rCollar = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 5.8, 2.2, 12), MAT.brushedSteel); rCollar.position.y = 4.6; reactorGroup.add(rCollar);
            const rCore = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.2, 2.4, 16), MAT.cyanGlow); rCore.position.y = -4.6; reactorGroup.add(rCore);
            const rRing1 = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.22, 8, 24), MAT.cyanGlow); rRing1.rotation.x = Math.PI / 2; rRing1.position.y = -3.8; reactorGroup.add(rRing1);
            const rRing2 = new THREE.Mesh(new THREE.TorusGeometry(5.85, 0.16, 8, 24), MAT.amberGlow); rRing2.rotation.x = Math.PI / 2; rRing2.position.y = 0.2; reactorGroup.add(rRing2);

            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const fin = new THREE.Mesh(new THREE.BoxGeometry(0.65, 6.2, 1.4), MAT.gunmetal); fin.position.set(Math.sin(a) * 5.6, 0.2, Math.cos(a) * 5.6); fin.rotation.y = a; reactorGroup.add(fin);
                const strip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.4, 0.16), MAT.amberGlow); strip.position.set(Math.sin(a) * 6.32, 0.2, Math.cos(a) * 6.32); strip.rotation.y = a; reactorGroup.add(strip);
                const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 11.0, 8), MAT.brushedSteel); strut.position.set(Math.sin(a) * 9.5, 8.2, Math.cos(a) * 9.5); strut.rotation.set(-Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45); reactorGroup.add(strut);
                const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.sin(a) * 5.2, -1.8, Math.cos(a) * 5.2), new THREE.Vector3(Math.sin(a) * 18, -3.5, Math.cos(a) * 18), new THREE.Vector3(Math.sin(a) * 34, 6.5, Math.cos(a) * 34));
                reactorGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, i % 2 === 0 ? 0.22 : 0.16, 6, false), i % 2 === 0 ? MAT.copperPipe : MAT.graphiteCable));
            }

            // Cavern Rocks, Instanced Reinforcement Ribs & Overhead Perimeter Conduit
            const rockInst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(4.8, 0), MAT.rockCavern, 24);
            const ribInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 28, 2.2), MAT.gunmetal, 12);
            for (let i = 0; i < 24; i++) {
                const a = (i / 24) * Math.PI * 2;
                dummy.position.set(Math.sin(a) * 47.0, 6.0 + (i % 4) * 4.5, Math.cos(a) * 47.0);
                dummy.rotation.set(i * 0.4, a, i * 0.3); dummy.scale.set(1.2, 2.2, 1.1); dummy.updateMatrix();
                rockInst.setMatrixAt(i, dummy.matrix);
            }
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
                dummy.position.set(Math.sin(a) * 45.2, 10.0, Math.cos(a) * 45.2);
                dummy.rotation.set(0, a, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
                ribInst.setMatrixAt(i, dummy.matrix);
            }
            const overheadConduit = new THREE.Mesh(new THREE.TorusGeometry(42.5, 0.42, 6, 48), MAT.copperPipe);
            overheadConduit.rotation.x = Math.PI / 2; overheadConduit.position.y = 17.5;
            // Phase 8: Complete Overhead Subterranean Rock Cavern Ceiling Dome
            const cavernDome = new THREE.Mesh(
                new THREE.SphereGeometry(52.0, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.48),
                new THREE.MeshStandardMaterial({ color: 0x24201d, roughness: 0.94, metalness: 0.04, flatShading: true, side: THREE.BackSide })
            );
            cavernDome.position.y = 14.0;
            scene.add(rockInst, ribInst, overheadConduit, cavernDome);

            flushDetails();
            // Dust particles
            let dust = null;
            const buildDust = (q) => {
                if (dust) { scene.remove(dust); dust.geometry.dispose(); }
                const n = q === 'low' ? 40 : q === 'high' ? 280 : 140;
                const p = new Float32Array(n * 3);
                for (let i = 0; i < n; i++) {
                    const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 34;
                    p[i * 3] = Math.sin(a) * r; p[i * 3 + 1] = -4 + Math.random() * 20; p[i * 3 + 2] = Math.cos(a) * r;
                }
                const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
                dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9ef0ff, size: 0.16, transparent: true, opacity: 0.4 }));
                scene.add(dust);
            };
            buildDust('medium');

            // Switchable Lighting Profiles (ALL / T0 / T1 / T2 / CROWN)
            const hemi = new THREE.HemisphereLight(0xdceeff, 0x26201b, 1.15); scene.add(hemi);
            const lightGroups = { t0: new THREE.Group(), t1: new THREE.Group(), t2: new THREE.Group(), crown: new THREE.Group() };
            Object.values(lightGroups).forEach(g => scene.add(g));

            const t0Light = new THREE.PointLight(0x39cfff, 55, 30, 1.35); t0Light.position.set(0, -1.8, 0); lightGroups.t0.add(t0Light);
            const t1Light = new THREE.PointLight(0xdceeff, 42, 42, 1.3); t1Light.position.set(0, 3.8, 0); lightGroups.t1.add(t1Light);
            // Even ring lighting from revised Gemini viewer; distribute the light rather than lighting only one quadrant.
            CFG.cardinals.forEach(a=>{const l=new THREE.PointLight(0xdceeff,34,34,1.35);l.position.set(Math.sin(a)*29.5,9.5,Math.cos(a)*29.5);lightGroups.t2.add(l);});
            const crownSpot = new THREE.SpotLight(0x9ef0ff, 520, 66, Math.PI * 0.45, 0.45, 1.2);
            crownSpot.position.set(0, 22, 0); crownSpot.castShadow = true; crownSpot.shadow.mapSize.set(1024, 1024); lightGroups.crown.add(crownSpot);

            const lighting = {
                setProfile(p) {
                    Object.entries(lightGroups).forEach(([k, g]) => { g.visible = (p === 'all' || p === k); });
                    hemi.intensity = p === 'all' ? 1.15 : 0.45;
                }
            };
            const pickups = [
                { id: 'armory',   label: 'Ability Energy +35',  pos: [-27.2, 0.65, -26.2], respawn: 35, mat: MAT.cyanGlow,   avail: true, timer: 0, apply: s => { s.energy = Math.min(s.maxEnergy, s.energy + 35); } },
                { id: 'reactor',  label: 'Energy Surge +40',    pos: [ 27.2, 0.65, -26.2], respawn: 45, mat: MAT.purpleGlow, avail: true, timer: 0, apply: s => { s.energy = Math.min(s.maxEnergy, s.energy + 40); } },
                { id: 'medbay',   label: 'Health +40 HP',       pos: [-26.8, 0.65,  26.2], respawn: 30, mat: MAT.greenGlow,  avail: true, timer: 0, apply: s => { s.hp = Math.min(s.maxHp, s.hp + 40); } },
                { id: 'barracks', label: 'Shield +35',          pos: [ 26.8, 0.65,  26.2], respawn: 45, mat: MAT.amberGlow,  avail: true, timer: 0, apply: s => { s.shield = Math.min(s.maxShield, s.shield + 35); } },
                { id: 't0_core',  label: 'T0 Core Overcharge',  pos: [  0.0, -5.0,   0.0], respawn: 90, mat: MAT.cyanGlow,   avail: true, timer: 0, apply: s => { s.shield = Math.min(s.maxShield, s.shield + 50); s.energy = s.maxEnergy; } },
                { id: 'crown',    label: 'Crown Offensive 1.5x (15s)',pos: [  0.0,  5.0,   0.0], respawn: 90, mat: MAT.redGlow,    avail: true, timer: 0, apply: s => { s.dmgMult = 1.5; s.dmgBuffTimer=15; } }
            ];
            pickups.forEach(pk => {
                const g = new THREE.Group(); g.position.set(...pk.pos); scene.add(g);
                const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.22, 8), MAT.gunmetal); ped.position.y = 0.11; g.add(ped);
                const sym = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), pk.mat); sym.position.y = 1.15; g.add(sym);
                pk.sym = sym; sym.visible=pk.avail;
            });
            const tdmSpawns = { blue: [], red: [] };
            const addTeamSpawns = (team, bIdxs) => {
                bIdxs.forEach(bi => {
                    const b = CFG.buildings[bi], a = b.angle;
                    const pts = [
                        [Math.sin(a) * 35.5, 0.65, Math.cos(a) * 35.5], [Math.sin(a + 0.06) * 35.0, 0.65, Math.cos(a + 0.06) * 35.0],
                        [Math.sin(a - 0.06) * 35.0, 0.65, Math.cos(a - 0.06) * 35.0], [Math.sin(a) * 36.5, -5.0, Math.cos(a) * 36.5],
                        [Math.sin(a + 0.05) * 36.0, -5.0, Math.cos(a + 0.05) * 36.0], [Math.sin(a) * 29.0, -5.0, Math.cos(a) * 29.0],
                        [Math.sin(a + 0.18) * 29.0, -5.0, Math.cos(a + 0.18) * 29.0], [Math.sin(a) * 20.5, 0.0, Math.cos(a) * 20.5]
                    ];
                    pts.forEach(([x, y, z], i) => tdmSpawns[team].push({ id: `${team}_${bi}_${i}`, team, x, y, z }));
                });
            };
            addTeamSpawns('blue', [0, 1]); addTeamSpawns('red', [2, 3]);

            function selectTDMSpawn(team, enemies = [], occupants = []) {
                const list = tdmSpawns[team] || [];
                let best = null, bestScore = -Infinity;
                for (const s of list) {
                    const sup=world.getSweptSupportHeight(s.x,s.y+.2,s.y-.3,s.z,CFG.capsuleRadius,.25);
                    if(!Number.isFinite(sup)||Math.abs(sup-s.y)>.25||world.isEmbedded(new THREE.Vector3(s.x,s.y,s.z),CFG.capsuleRadius,CFG.capsuleHeight).embedded||world.isInShaftOpening(s.x,s.y,s.z,.1))continue;
                    if([...occupants,...enemies].some(o=>Math.abs(o.y-s.y)<CFG.capsuleHeight&&Math.hypot(o.x-s.x,o.z-s.z)<CFG.capsuleRadius*2+.2))continue;
                    let sc = 0;
                    for (const e of enemies) {
                        const d = Math.hypot(s.x - e.x, s.y - e.y, s.z - e.z);
                        sc += Math.min(d, 35);
                        if (d < 10) sc -= 40;
                        if (world.hasLineOfSight(new THREE.Vector3(s.x, s.y + 1.4, s.z), new THREE.Vector3(e.x, e.y + 1.4, e.z))) sc -= 25;
                    }
                    if (sc > bestScore) { bestScore = sc; best = s; }
                }
                return best;
            }

            // Genuine 3-Tier A* Navigation Graph (walk, stair, ramp, jump_pad, drop)
            const navGroup = new THREE.Group(); navGroup.visible = false; scene.add(navGroup);
            const navNodes = new Map();
            const addNode = (id, x, y, z, tier) => navNodes.set(id, { id, pos: new THREE.Vector3(x, y, z), tier, edges: [] });
            const link = (a, b, type = 'walk', bidir = true) => {
                const na = navNodes.get(a), nb = navNodes.get(b);
                if (!na || !nb) return;
                const cost = na.pos.distanceTo(nb.pos);
                na.edges.push({ to: b, cost, type });
                if (bidir) nb.edges.push({ to: a, cost, type:type==='stair_up'?'stair_down':type==='stair_down'?'stair_up':type });
            };

            addNode('t0_center', 0, -5, 2.6, 'T0');
            addNode('crown_center', 0, 5, 2.0, 'CROWN');
            ['S', 'E', 'N', 'W'].forEach((d, i) => {
                const a = i * Math.PI * 0.5;
                addNode(`t0_tun_${d}`, Math.sin(a) * 8.6, -5, Math.cos(a) * 8.6, 'T0');
                addNode(`t0_ring_${d}`, Math.sin(a) * 29, -5, Math.cos(a) * 29, 'T0');
                addNode(`t1_pit_${d}`, Math.sin(a) * 18.4, 0, Math.cos(a) * 18.4, 'T1');
                addNode(`t1_ramp_${d}`, Math.sin(a) * 25.5, 0.65, Math.cos(a) * 25.5, 'T1');
                addNode(`t2_ring_${d}`, Math.sin(a) * 29.0, 5, Math.cos(a) * 29.0, 'T2');
                link('t0_center', `t0_tun_${d}`, 'walk');
                link(`t0_tun_${d}`, `t1_pit_${d}`, 'stair_up');
                link(`t1_pit_${d}`, `t1_ramp_${d}`, 'ramp');
                link('crown_center', `t1_pit_${d}`, 'drop', false);
            });
            CFG.buildings.forEach(b => {
                const a=b.angle,w=bldgWPs[b.id],id=b.id;
                const put=(key,v,tier)=>addNode(`${key}_${id}`,v.x,v.y,v.z,tier);
                put('t0_bsmt',w.bsmtBot,'T0');put('bsmtL2',w.bsmtL2,'STAIR');put('bsmtL1',w.bsmtL1,'STAIR');put('bsmtTop',w.bsmtTop,'T1');
                put('t1_bldg',w.intBot,'T1');put('intL1',w.intL1,'STAIR');put('intL2',w.intL2,'STAIR');put('intTop',w.intTop,'T2');put('upperMid',w.upperMid,'T2');put('upperOut',w.upperOut,'T2');
                addNode(`t2_pad_${id}`,...b.pad,'T2');
                const chain=(keys,types)=>keys.slice(1).forEach((key,i)=>link(`${keys[i]}_${id}`,`${key}_${id}`,types[i]));
                chain(['t0_bsmt','bsmtL2','bsmtL1','bsmtTop','t1_bldg','intL1','intL2','intTop','upperMid','upperOut','t2_pad'],['stair_up','walk','stair_up','walk','stair_up','walk','stair_up','walk','walk','walk']);
                const pad=world.jumpPads.find(p=>p.id===id);addNode(`land_${id}`,pad.targetX,pad.targetY,pad.targetZ,'CROWN');
                link(`t2_pad_${id}`,`land_${id}`,'jump_pad',false);link(`land_${id}`,'crown_center','walk');
                // Connector entry allows basement traffic to avoid the wall around the building.
                put('bsmtOut',w.bsmtOut,'T0');link(`bsmtOut_${id}`,`t0_bsmt_${id}`,'walk');
                addNode(`t0_diag_${id}`,Math.sin(a)*29,-5,Math.cos(a)*29,'T0');link(`t0_diag_${id}`,`bsmtOut_${id}`,'walk');
            });
            [
                ['t1_ramp_N','t1_bldg_armory'],['t1_bldg_armory','t1_ramp_W'],['t1_ramp_W','t1_bldg_medbay'],['t1_bldg_medbay','t1_ramp_S'],['t1_ramp_S','t1_bldg_barracks'],['t1_bldg_barracks','t1_ramp_E'],['t1_ramp_E','t1_bldg_reactor'],['t1_bldg_reactor','t1_ramp_N']
            ].forEach(([u,v])=>link(u,v,'walk'));
            for(const [tier,y] of [['T0',-5],['T2',5]]) {
                const pref=tier.toLowerCase();
                for(let i=0;i<32;i++) {const a=i*Math.PI/16;addNode(`${pref}_arc_${i}`,Math.sin(a)*29,y,Math.cos(a)*29,tier);}
                for(let i=0;i<32;i++)link(`${pref}_arc_${i}`,`${pref}_arc_${(i+1)%32}`,'walk');
                ['S','E','N','W'].forEach((d,i)=>link(`${pref}_ring_${d}`,`${pref}_arc_${i*8}`,'walk'));
                CFG.buildings.forEach(b=>{const i=((Math.round(b.angle/(Math.PI/16))%32)+32)%32;link(`${pref}_arc_${i}`,tier==='T0'?`t0_diag_${b.id}`:`t2_pad_${b.id}`,'walk');});
            }
            // T0 stairs connect to the ring through physical tunnel route, not a teleport.
            // The wide bypass beside each courtyard stair requires intermediate side waypoints.
            ['S','E','N','W'].forEach((d,i)=>{const a=i*Math.PI/2;const at=(id,x,z)=>addNode(id,Math.cos(a)*x+Math.sin(a)*z,-5,-Math.sin(a)*x+Math.cos(a)*z,'T0');at(`bypassIn_${d}`,2.75,10.2);at(`bypassOut_${d}`,2.75,17.6);at(`tunnelOut_${d}`,0,23);link(`t0_tun_${d}`,`bypassIn_${d}`);link(`bypassIn_${d}`,`bypassOut_${d}`);link(`bypassOut_${d}`,`tunnelOut_${d}`);link(`tunnelOut_${d}`,`t0_ring_${d}`);});

            const edgePts = [];
            navNodes.forEach(n => { n.edges.forEach(e => edgePts.push(n.pos, navNodes.get(e.to).pos)); });
            navGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edgePts), new THREE.LineBasicMaterial({ color: 0xa66cff, transparent: true, opacity: 0.65 })));

            function findAStarPath(startId, goalId) {
                if (!navNodes.has(startId) || !navNodes.has(goalId)) return null;
                const open = new Set([startId]), came = new Map(), g = new Map([[startId, 0]]);
                const f = new Map([[startId, navNodes.get(startId).pos.distanceTo(navNodes.get(goalId).pos)]]);
                while (open.size) {
                    let cur = null, low = Infinity;
                    open.forEach(id => { const v = f.get(id) ?? Infinity; if (v < low) { low = v; cur = id; } });
                    if (cur === goalId) { const p = [cur]; while (came.has(cur)) { cur = came.get(cur); p.unshift(cur); } return p; }
                    open.delete(cur);
                    for (const e of navNodes.get(cur).edges) {
                        const tg = (g.get(cur) ?? Infinity) + e.cost;
                        if (tg < (g.get(e.to) ?? Infinity)) {
                            came.set(e.to, cur); g.set(e.to, tg);
                            f.set(e.to, tg + navNodes.get(e.to).pos.distanceTo(navNodes.get(goalId).pos));
                            open.add(e.to);
                        }
                    }
                }
                return null;
            }
    const ownedLights=[];scene.traverse(o=>{if(o.isLight)ownedLights.push(o);});
    if(!enableLights)ownedLights.forEach(o=>{o.visible=false;});
    hostScene.add(scene);
    let disposed=false;
    return {root:scene, world, config:CFG, upperGroup,t0Group, buildingRoofs, lighting,
        spawnCandidates:tdmSpawns, selectTDMSpawn, navGraph:{nodes:navNodes,findPath:findAStarPath},
        pickups:pickups.map(p=>({id:p.id,label:p.label,position:p.pos.slice(),respawn:p.respawn})),
        setPickupAvailable(id,available){const p=pickups.find(p=>p.id===id);if(p)p.sym.visible=!!available;},
        updateVisuals(elapsed){if(disposed)return;rRing1.rotation.z=elapsed*.65;rRing2.rotation.z=-elapsed*.35;padRings.forEach((r,i)=>{r.rotation.z=elapsed*2+i;});pickups.forEach((p,i)=>{p.sym.rotation.y=elapsed*1.4+i;p.sym.position.y=1.15+Math.sin(elapsed*2.5+i)*.12;});},
        dispose(){if(disposed)return;disposed=true;scene.removeFromParent();const gs=new Set(),ms=new Set(),ts=new Set(MAT._textures);scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v);}if(o.isLight)o.shadow?.dispose?.();});for(const m of Object.values(MAT))if(m?.isMaterial)ms.add(m);gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}
    };
}
