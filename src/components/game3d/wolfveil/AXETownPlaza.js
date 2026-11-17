import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * AXE / Wolfveil - Japanese-Egyptian Grand Town Plaza (Three.js)
 * Extracted and adapted from the user's 3D town diorama HTML.
 *
 * Scene origin: ground center at (0,0,0), fountain at origin, radius ~60 world units.
 * Designed for drop-in inclusion in an existing Three.js world, not a standalone renderer.
 *
 * All artistry remains procedural; no remote asset fetches are needed by this module.
 * The host must supply its own Three.js instance, render loop, collision engine and lighting.
 * Do not call renderer.render() from this module.
 */
export function createAXETownPlaza({ THREE, renderer = null, includeLighting = false, showOuterHomes = true, showInnerShops = true, worldScale = 1, quality = 'auto' } = {}) {
    const lowDetail = quality === 'low' || (quality === 'auto' && typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)')?.matches));
    if (!THREE) throw new Error('createAXETownPlaza: Three.js namespace (THREE) is required');
    if (typeof document === 'undefined') throw new Error('createAXETownPlaza: browser canvas API is required for procedural textures');

            function makeCanvasTexture(width, height, drawFn, repeatX = 1, repeatY = 1) {
                const c = document.createElement('canvas');
                c.width = width;
                c.height = height;
                const ctx = c.getContext('2d');
                drawFn(ctx, width, height);
                const tex = new THREE.CanvasTexture(c);
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(repeatX, repeatY);
                tex.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
                return tex;
            }

            // 1. Coursed Egyptian Sandstone Ashlar Masonry (Color + Bump)
            const sandstoneTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#5c462e';
                ctx.fillRect(0, 0, w, h);
                const rows = 8;
                const rowH = h / rows;
                for (let r = 0; r < rows; r++) {
                    const y = r * rowH;
                    const cols = 4;
                    const colW = w / cols;
                    const offset = (r % 2) * (colW / 2);
                    for (let c = -1; c <= cols; c++) {
                        const x = c * colW + offset;
                        const shade = 152 + Math.floor(Math.random() * 34);
                        ctx.fillStyle = `rgb(${shade}, ${shade - 26}, ${shade - 58})`;
                        ctx.fillRect(x + 4, y + 4, colW - 8, rowH - 8);
                        ctx.strokeStyle = 'rgba(255, 232, 190, 0.28)';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x + 5, y + 5, colW - 10, rowH - 10);
                    }
                }
            }, 2, 2);

            const sandstoneBumpTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#181818';
                ctx.fillRect(0, 0, w, h);
                const rows = 8;
                const rowH = h / rows;
                for (let r = 0; r < rows; r++) {
                    const y = r * rowH;
                    const cols = 4;
                    const colW = w / cols;
                    const offset = (r % 2) * (colW / 2);
                    for (let c = -1; c <= cols; c++) {
                        const x = c * colW + offset;
                        const v = 165 + Math.floor(Math.random() * 55);
                        ctx.fillStyle = `rgb(${v},${v},${v})`;
                        ctx.fillRect(x + 4, y + 4, colW - 8, rowH - 8);
                    }
                }
            }, 2, 2);

            // 2. Weathered Multi-Brick Stair & Fountain Basin Coping Masonry (with Moss & Mortar)
            const stairBrickTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#25211d';
                ctx.fillRect(0, 0, w, h);
                const rows = 12;
                const rowH = h / rows;
                for (let r = 0; r < rows; r++) {
                    const y = r * rowH;
                    const cols = 6;
                    const colW = w / cols;
                    const offset = (r % 2) * (colW / 2);
                    for (let c = -1; c <= cols; c++) {
                        const x = c * colW + offset;
                        const warm = Math.random();
                        const baseR = 114 + Math.floor(warm * 40);
                        const baseG = 98 + Math.floor(warm * 34);
                        const baseB = 78 + Math.floor(warm * 26);
                        ctx.fillStyle = `rgb(${baseR}, ${baseG}, ${baseB})`;
                        ctx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);
                        ctx.fillStyle = 'rgba(255, 238, 205, 0.24)';
                        ctx.fillRect(x + 4, y + 3, colW - 8, 3);
                        if (Math.random() > 0.52) {
                            ctx.fillStyle = 'rgba(62, 92, 46, 0.45)';
                            ctx.beginPath();
                            ctx.arc(x + 6 + Math.random() * (colW - 12), y + rowH - 4, 4 + Math.random() * 5, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }
            }, 4, 2);

            // 3. Plaza Cobblestone & Radial Flagstone Pavement
            const plazaCobbleTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#17181c';
                ctx.fillRect(0, 0, w, h);
                const grid = 8;
                const step = w / grid;
                for (let gx = 0; gx < grid; gx++) {
                    for (let gy = 0; gy < grid; gy++) {
                        const v = 42 + Math.floor(Math.random() * 24);
                        ctx.fillStyle = `rgb(${v + 4}, ${v + 2}, ${v - 2})`;
                        ctx.fillRect(gx * step + 3, gy * step + 3, step - 6, step - 6);
                        ctx.strokeStyle = 'rgba(145, 132, 112, 0.22)';
                        ctx.lineWidth = 1.5;
                        ctx.strokeRect(gx * step + 4, gy * step + 4, step - 8, step - 8);
                    }
                }
            }, 14, 14);

            // 4. Yakisugi & Hinoki Wood Grain
            const woodGrainTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#5c3b24';
                ctx.fillRect(0, 0, w, h);
                const planks = 6;
                const pw = w / planks;
                for (let p = 0; p < planks; p++) {
                    const x = p * pw;
                    const delta = (p % 2 === 0) ? 8 : -6;
                    ctx.fillStyle = `rgb(${94 + delta}, ${60 + delta}, ${38 + delta})`;
                    ctx.fillRect(x + 1, 0, pw - 2, h);
                    ctx.fillStyle = '#24150c';
                    ctx.fillRect(x, 0, 2, h);
                }
            }, 2, 2);

            // 5. Shikkui Lime Plaster
            const plasterTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#dfd0b8';
                ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 160; i++) {
                    ctx.fillStyle = (i % 2 === 0) ? 'rgba(185, 165, 135, 0.18)' : 'rgba(248, 240, 225, 0.22)';
                    ctx.beginPath();
                    ctx.arc(Math.random() * w, Math.random() * h, 14 + Math.random() * 28, 0, Math.PI * 2);
                    ctx.fill();
                }
            }, 2, 2);

            // 6. Egyptian Turquoise & Gold Hieroglyphic Frieze Band
            const friezeTex = makeCanvasTexture(512, 128, (ctx, w, h) => {
                ctx.fillStyle = '#15524d';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#d4a548';
                ctx.fillRect(0, 0, w, 14);
                ctx.fillRect(0, h - 14, w, 14);
                ctx.fillStyle = '#8b261d';
                ctx.fillRect(0, 14, w, 8);
                ctx.fillRect(0, h - 22, w, 8);
                for (let x = 12; x < w; x += 32) {
                    ctx.fillStyle = '#f2c96d';
                    ctx.fillRect(x, 28, 20, 72);
                    ctx.fillStyle = '#113f3c';
                    ctx.fillRect(x + 3, 34, 14, 26);
                    ctx.fillStyle = '#38bdf8';
                    ctx.beginPath();
                    ctx.arc(x + 10, 47, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#f59e0b';
                    ctx.fillRect(x + 5, 66, 10, 26);
                }
            }, 3, 1);

            // 7. Glowing Shoji Screen Texture
            const shojiTex = makeCanvasTexture(256, 256, (ctx, w, h) => {
                const grad = ctx.createRadialGradient(w / 2, h / 2, 15, w / 2, h / 2, w * 0.7);
                grad.addColorStop(0, '#fff7de');
                grad.addColorStop(1, '#f0c46e');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = '#3b2414';
                ctx.lineWidth = 6;
                ctx.strokeRect(0, 0, w, h);
                ctx.lineWidth = 4;
                for (let x = 0; x <= w; x += w / 4) {
                    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
                }
                for (let y = 0; y <= h; y += h / 6) {
                    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
                }
            }, 1, 1);

            // 8. Egyptian Painted Lotus Column Shaft
            const columnTex = makeCanvasTexture(256, 512, (ctx, w, h) => {
                ctx.fillStyle = '#bfa074';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#1d6b63';
                ctx.fillRect(0, h - 95, w, 95);
                ctx.fillStyle = '#d4a853';
                for (let x = 0; x < w; x += 32) {
                    ctx.beginPath();
                    ctx.moveTo(x, h);
                    ctx.lineTo(x + 16, h - 90);
                    ctx.lineTo(x + 32, h);
                    ctx.fill();
                }
                ctx.fillStyle = '#8c2d19';
                ctx.fillRect(0, 56, w, 18);
                ctx.fillRect(0, h - 115, w, 16);
                ctx.fillStyle = '#d4a853';
                ctx.fillRect(0, 74, w, 10);
            }, 1, 1);

            // 9. Animated Flowing Waterfall & Foam Sheet Texture
            const waterfallTex = makeCanvasTexture(256, 512, (ctx, w, h) => {
                const g = ctx.createLinearGradient(0, 0, 0, h);
                g.addColorStop(0, 'rgba(186, 230, 253, 0.92)');
                g.addColorStop(0.5, 'rgba(56, 189, 248, 0.78)');
                g.addColorStop(1, 'rgba(224, 242, 254, 0.95)');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
                for (let i = 0; i < 95; i++) {
                    ctx.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 6, 28 + Math.random() * 65);
                }
            }, 2, 2);

            // 10. Iridescent Cyan-Violet Spiral Ribbon Texture (Matching Reference Image)
            const spiralRibbonTex = makeCanvasTexture(512, 128, (ctx, w, h) => {
                const g = ctx.createLinearGradient(0, 0, w, 0);
                g.addColorStop(0, '#38bdf8');
                g.addColorStop(0.35, '#a855f7');
                g.addColorStop(0.7, '#22d3ee');
                g.addColorStop(1, '#c084fc');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                ctx.fillRect(0, h * 0.4, w, h * 0.2);
            }, 2, 1);

            // 11. Woven Tatami Straw Mat with Gold-Stitched Brocade Border (from uploaded houses)
            const tatamiTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#b9a66b';
                ctx.fillRect(0, 0, w, h);
                for (let y = 0; y < h; y += 4) {
                    ctx.fillStyle = (y % 8 === 0) ? 'rgba(82, 70, 36, 0.22)' : 'rgba(215, 200, 140, 0.18)';
                    ctx.fillRect(0, y, w, 2);
                }
                ctx.fillStyle = '#1a3634';
                ctx.fillRect(0, 0, w, 18);
                ctx.fillRect(0, h - 18, w, 18);
                ctx.fillRect(0, 0, 18, h);
                ctx.fillRect(w - 18, 0, 18, h);
                ctx.strokeStyle = '#d4a853';
                ctx.lineWidth = 3;
                ctx.strokeRect(18, 18, w - 36, h - 36);
            }, 3, 2);

            // 12. Golden Straw Stable Bedding Texture (from Mount Shop)
            const strawBedTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.fillStyle = '#b59142';
                ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 450; i++) {
                    ctx.strokeStyle = (i % 2 === 0) ? '#e5c168' : '#856522';
                    ctx.lineWidth = 2.5;
                    const sx = Math.random() * w;
                    const sy = Math.random() * h;
                    const ang = Math.random() * Math.PI;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(sx + Math.cos(ang) * 28, sy + Math.sin(ang) * 28);
                    ctx.stroke();
                }
            }, 3, 3);

            // 13. Custom Silk Brocade Fabric Generator (from Clothing Atelier)
            function createBrocadeTexture(bgHex, motifHex, accentHex) {
                return makeCanvasTexture(256, 256, (ctx, w, h) => {
                    ctx.fillStyle = bgHex;
                    ctx.fillRect(0, 0, w, h);
                    ctx.strokeStyle = motifHex;
                    ctx.lineWidth = 2;
                    const step = 32;
                    for (let row = 0; row <= h / (step / 2) + 1; row++) {
                        const y = row * (step / 2);
                        const offsetX = (row % 2) * (step / 2);
                        for (let col = -1; col <= w / step + 1; col++) {
                            const x = col * step + offsetX;
                            for (let r = 14; r >= 4; r -= 5) {
                                ctx.beginPath();
                                ctx.arc(x, y, r, Math.PI, 0, false);
                                ctx.stroke();
                            }
                            ctx.fillStyle = accentHex;
                            ctx.beginPath();
                            ctx.arc(x, y - 5, 2.2, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                    ctx.fillStyle = accentHex;
                    ctx.fillRect(0, 0, w, 8);
                    ctx.fillRect(0, h - 8, w, 8);
                }, 1, 1);
            }

            const crimsonBrocadeTex = createBrocadeTexture('#7c1919', '#f3c66f', '#ffd875');
            const turquoiseBrocadeTex = createBrocadeTexture('#125954', '#f2cb74', '#ffffff');
            const indigoBrocadeTex = createBrocadeTexture('#1b2848', '#d9a74a', '#70d6ff');
            const royalGoldBrocadeTex = createBrocadeTexture('#b88328', '#42160b', '#fff3c4');
            const pleatedLinenTex = createBrocadeTexture('#ece3cf', '#c99e4c', '#1c7870');

            // 14. Arcane Eye-of-Horus & Onmyo Runic Circle + Spell Page Textures (from Augment Shop)
            const magicCircleTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
                ctx.clearRect(0, 0, w, h);
                const cx = w / 2, cy = h / 2;
                ctx.strokeStyle = '#e9d5ff';
                ctx.lineWidth = 6;
                ctx.beginPath(); ctx.arc(cx, cy, 230, 0, Math.PI * 2); ctx.stroke();
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(cx, cy, 195, 0, Math.PI * 2); ctx.stroke();
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(cx, cy, 135, 0, Math.PI * 2); ctx.stroke();
                for (let rot = 0; rot < 2; rot++) {
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate((rot * Math.PI) / 4);
                    ctx.strokeStyle = rot === 0 ? '#c084fc' : '#fde047';
                    ctx.lineWidth = 4;
                    ctx.strokeRect(-135, -135, 270, 270);
                    ctx.restore();
                }
            }, 1, 1);

            const spellPageTex = makeCanvasTexture(256, 256, (ctx, w, h) => {
                ctx.fillStyle = '#f5ead2';
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = '#b48a3e';
                ctx.lineWidth = 8;
                ctx.strokeRect(8, 8, w - 16, h - 16);
                ctx.strokeStyle = '#7e22ce';
                ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(w / 2, h * 0.38, 42, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = '#3b2314';
                for (let y = 155; y < 230; y += 14) ctx.fillRect(28, y, w - 56, 5);
            }, 1, 1);

            // 15. Custom Noren Curtain & Chochin Lantern Textures
            function makeNorenTex(bgHex, trimHex, kanji) {
                return makeCanvasTexture(256, 384, (ctx, w, h) => {
                    ctx.fillStyle = bgHex;
                    ctx.fillRect(0, 0, w, h);
                    ctx.fillStyle = trimHex;
                    ctx.fillRect(0, h - 58, w, 58);
                    ctx.fillStyle = '#e5b85c';
                    ctx.fillRect(0, h - 64, w, 6);
                    ctx.fillRect(0, h - 14, w, 8);
                    ctx.strokeStyle = '#f3c86b';
                    ctx.lineWidth = 6;
                    ctx.beginPath(); ctx.arc(w / 2, h * 0.42, 64, 0, Math.PI * 2); ctx.stroke();
                    ctx.fillStyle = '#fde68a';
                    ctx.font = 'bold 68px serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(kanji, w / 2, h * 0.44);
                    ctx.font = 'bold 34px serif';
                    ctx.fillText('☥', w / 2, h * 0.56);
                }, 1, 1);
            }
            const norenClothTex = makeNorenTex('#182942', '#1b7a72', '呉');
            const norenAugmentTex = makeNorenTex('#23153c', '#1b7a72', '術');
            const norenMountTex = makeNorenTex('#12352c', '#7c2d12', '騎');

            // 16. Fountain Rim Lantern Panel Texture with Fierce Wolf Emblem (Matching Reference Picture)
            const wolfLanternPanelTex = makeCanvasTexture(256, 256, (ctx, w, h) => {
                const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.65);
                g.addColorStop(0, '#fff7c2');
                g.addColorStop(0.55, '#ffb73b');
                g.addColorStop(1, '#c96412');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, w, h);

                // Dark bronze border frame
                ctx.strokeStyle = '#24170e';
                ctx.lineWidth = 14;
                ctx.strokeRect(6, 6, w - 12, h - 12);

                // Stylized Wolf Head Silhouette Emblem in center of lantern glass
                ctx.fillStyle = '#331c0c';
                ctx.beginPath();
                ctx.moveTo(w * 0.5, h * 0.82);   // Snout tip
                ctx.lineTo(w * 0.34, h * 0.62);  // Left jaw
                ctx.lineTo(w * 0.24, h * 0.46);  // Left cheek ruff
                ctx.lineTo(w * 0.28, h * 0.20);  // Left ear tip
                ctx.lineTo(w * 0.42, h * 0.34);  // Left brow
                ctx.lineTo(w * 0.5, h * 0.30);   // Forehead center
                ctx.lineTo(w * 0.58, h * 0.34);  // Right brow
                ctx.lineTo(w * 0.72, h * 0.20);  // Right ear tip
                ctx.lineTo(w * 0.76, h * 0.46);  // Right cheek ruff
                ctx.lineTo(w * 0.66, h * 0.62);  // Right jaw
                ctx.closePath();
                ctx.fill();

                // Glowing amber wolf eyes & forehead markings
                ctx.fillStyle = '#fff59e';
                ctx.beginPath();
                ctx.moveTo(w * 0.36, h * 0.48);
                ctx.lineTo(w * 0.45, h * 0.52);
                ctx.lineTo(w * 0.38, h * 0.55);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(w * 0.64, h * 0.48);
                ctx.lineTo(w * 0.55, h * 0.52);
                ctx.lineTo(w * 0.62, h * 0.55);
                ctx.closePath();
                ctx.fill();
            }, 1, 1);

            const lanternTex = makeCanvasTexture(256, 256, (ctx, w, h) => {
                const g = ctx.createLinearGradient(0, 0, 0, h);
                g.addColorStop(0, '#ffba52');
                g.addColorStop(0.5, '#fff1b5');
                g.addColorStop(1, '#ff9e2c');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = 'rgba(92, 42, 12, 0.55)';
                ctx.lineWidth = 3;
                for (let y = 14; y < h; y += 20) {
                    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
                }
                ctx.fillStyle = '#23140b';
                ctx.font = 'bold 44px serif';
                ctx.textAlign = 'center';
                ctx.fillText('鍛', w * 0.25, h * 0.58);
                ctx.fillText('☥', w * 0.75, h * 0.58);
            }, 1, 1);

            // ============================================================================
            // 3. SHARED MATERIALS PALETTE
            // ============================================================================
            const mats = {
                charredTimber: new THREE.MeshStandardMaterial({
                    color: 0x261d17,
                    bumpMap: woodGrainTex,
                    bumpScale: 0.04,
                    roughness: 0.8,
                    metalness: 0.06
                }),
                darkWood: new THREE.MeshStandardMaterial({
                    color: 0x452e20,
                    map: woodGrainTex,
                    bumpMap: woodGrainTex,
                    bumpScale: 0.03,
                    roughness: 0.74
                }),
                warmWood: new THREE.MeshStandardMaterial({
                    color: 0x8f6443,
                    map: woodGrainTex,
                    bumpMap: woodGrainTex,
                    bumpScale: 0.025,
                    roughness: 0.66
                }),
                lacquerRed: new THREE.MeshStandardMaterial({
                    color: 0x6b1815,
                    roughness: 0.25,
                    metalness: 0.18
                }),
                cabinet: new THREE.MeshStandardMaterial({
                    color: 0x543622,
                    map: woodGrainTex,
                    roughness: 0.58,
                    metalness: 0.14
                }),
                plaster: new THREE.MeshStandardMaterial({
                    map: plasterTex,
                    bumpMap: plasterTex,
                    bumpScale: 0.02,
                    roughness: 0.88
                }),
                sandstone: new THREE.MeshStandardMaterial({
                    map: sandstoneTex,
                    bumpMap: sandstoneBumpTex,
                    bumpScale: 0.065,
                    roughness: 0.86
                }),
                stairBrick: new THREE.MeshStandardMaterial({
                    map: stairBrickTex,
                    bumpMap: stairBrickTex,
                    bumpScale: 0.075,
                    roughness: 0.85
                }),
                plazaStone: new THREE.MeshStandardMaterial({
                    map: plazaCobbleTex,
                    bumpMap: plazaCobbleTex,
                    bumpScale: 0.06,
                    roughness: 0.86
                }),
                flagstone: new THREE.MeshStandardMaterial({
                    map: plazaCobbleTex,
                    bumpMap: plazaCobbleTex,
                    bumpScale: 0.055,
                    roughness: 0.86
                }),
                tatami: new THREE.MeshStandardMaterial({
                    map: tatamiTex,
                    bumpMap: tatamiTex,
                    bumpScale: 0.03,
                    roughness: 0.8
                }),
                strawBed: new THREE.MeshStandardMaterial({
                    map: strawBedTex,
                    bumpMap: strawBedTex,
                    bumpScale: 0.06,
                    roughness: 0.9
                }),
                frieze: new THREE.MeshStandardMaterial({
                    map: friezeTex,
                    bumpMap: friezeTex,
                    bumpScale: 0.03,
                    roughness: 0.48,
                    metalness: 0.28
                }),
                column: new THREE.MeshStandardMaterial({
                    map: columnTex,
                    bumpMap: columnTex,
                    bumpScale: 0.035,
                    roughness: 0.65
                }),
                shojiGlow: new THREE.MeshStandardMaterial({
                    map: shojiTex,
                    emissive: new THREE.Color(0xffb85c),
                    emissiveMap: shojiTex,
                    emissiveIntensity: 0.9,
                    roughness: 0.4
                }),
                kawaraTile: new THREE.MeshStandardMaterial({
                    color: 0x262b32,
                    roughness: 0.42,
                    metalness: 0.38
                }),
                gold: new THREE.MeshStandardMaterial({
                    color: 0xe6b24c,
                    roughness: 0.25,
                    metalness: 0.88
                }),
                turquoise: new THREE.MeshStandardMaterial({
                    color: 0x167c73,
                    roughness: 0.36,
                    metalness: 0.25
                }),
                obsidian: new THREE.MeshStandardMaterial({
                    color: 0x171421,
                    roughness: 0.2,
                    metalness: 0.75
                }),
                darkIron: new THREE.MeshStandardMaterial({
                    color: 0x202429,
                    roughness: 0.42,
                    metalness: 0.85
                }),
                steelBlade: new THREE.MeshStandardMaterial({
                    color: 0xdce2ea,
                    roughness: 0.15,
                    metalness: 0.95
                }),
                bronzeMirror: new THREE.MeshStandardMaterial({
                    color: 0xffe4b5,
                    roughness: 0.08,
                    metalness: 0.96
                }),
                silkCrimson: new THREE.MeshStandardMaterial({
                    map: crimsonBrocadeTex,
                    roughness: 0.42,
                    metalness: 0.15,
                    side: THREE.DoubleSide
                }),
                silkTurquoise: new THREE.MeshStandardMaterial({
                    map: turquoiseBrocadeTex,
                    roughness: 0.42,
                    metalness: 0.15,
                    side: THREE.DoubleSide
                }),
                silkIndigo: new THREE.MeshStandardMaterial({
                    map: indigoBrocadeTex,
                    roughness: 0.45,
                    metalness: 0.12,
                    side: THREE.DoubleSide
                }),
                silkGold: new THREE.MeshStandardMaterial({
                    map: royalGoldBrocadeTex,
                    roughness: 0.36,
                    metalness: 0.32,
                    side: THREE.DoubleSide
                }),
                silkLinen: new THREE.MeshStandardMaterial({
                    map: pleatedLinenTex,
                    roughness: 0.55,
                    metalness: 0.08,
                    side: THREE.DoubleSide
                }),
                indigoVatLiquid: new THREE.MeshStandardMaterial({
                    color: 0x10254c,
                    roughness: 0.15,
                    metalness: 0.35
                }),
                saffronVatLiquid: new THREE.MeshStandardMaterial({
                    color: 0xb85d14,
                    roughness: 0.18,
                    metalness: 0.3
                }),
                spellPage: new THREE.MeshStandardMaterial({
                    map: spellPageTex,
                    emissive: new THREE.Color(0xfef08a),
                    emissiveMap: spellPageTex,
                    emissiveIntensity: 0.35,
                    roughness: 0.5,
                    side: THREE.DoubleSide
                }),
                magicCircle: new THREE.MeshBasicMaterial({
                    map: magicCircleTex,
                    transparent: true,
                    opacity: 0.9,
                    side: THREE.DoubleSide,
                    depthWrite: false
                }),
                norenClothMat: new THREE.MeshStandardMaterial({ map: norenClothTex, roughness: 0.72, side: THREE.DoubleSide }),
                norenAugmentMat: new THREE.MeshStandardMaterial({ map: norenAugmentTex, roughness: 0.72, side: THREE.DoubleSide }),
                norenMountMat: new THREE.MeshStandardMaterial({ map: norenMountTex, roughness: 0.72, side: THREE.DoubleSide }),
                wolfLanternMat: new THREE.MeshStandardMaterial({
                    map: wolfLanternPanelTex,
                    emissive: new THREE.Color(0xffa826),
                    emissiveMap: wolfLanternPanelTex,
                    emissiveIntensity: 1.35,
                    roughness: 0.25
                }),
                lanternGlowMat: new THREE.MeshStandardMaterial({
                    map: lanternTex,
                    emissive: new THREE.Color(0xff9d2e),
                    emissiveMap: lanternTex,
                    emissiveIntensity: 1.15,
                    roughness: 0.35
                }),
                emeraldArmor: new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.28, metalness: 0.65 }),
                crimsonLeather: new THREE.MeshStandardMaterial({ color: 0x7c1d1d, roughness: 0.45, metalness: 0.15 }),
                ivoryCoat: new THREE.MeshStandardMaterial({ color: 0xf3ece0, roughness: 0.62, metalness: 0.05 }),
                obsidianCoat: new THREE.MeshStandardMaterial({ color: 0x1e2029, roughness: 0.48, metalness: 0.15 }),
                duneCoat: new THREE.MeshStandardMaterial({ color: 0xc89658, roughness: 0.65, metalness: 0.05 }),
                oasisWater: new THREE.MeshStandardMaterial({ color: 0x14b8a6, emissive: 0x0d9488, emissiveIntensity: 0.45, roughness: 0.12 }),
                speedRuneGem: new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x10b981, emissiveIntensity: 1.6, roughness: 0.12 }),
                gemVoid: new THREE.MeshStandardMaterial({ color: 0xc084fc, emissive: 0x9333ea, emissiveIntensity: 1.45, roughness: 0.1 }),
                gemSolar: new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xf59e0b, emissiveIntensity: 1.5, roughness: 0.1 }),
                gemFrost: new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 1.45, roughness: 0.1 }),
                gemCrimson: new THREE.MeshStandardMaterial({ color: 0xf87171, emissive: 0xdc2626, emissiveIntensity: 1.45, roughness: 0.1 }),
                gemJade: new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x059669, emissiveIntensity: 1.45, roughness: 0.1 }),
                wolfStone: new THREE.MeshStandardMaterial({
                    color: 0x8d8980,
                    bumpMap: sandstoneBumpTex,
                    bumpScale: 0.035,
                    roughness: 0.62,
                    metalness: 0.14
                }),
                cragRock: new THREE.MeshStandardMaterial({
                    color: 0x56524b,
                    bumpMap: stairBrickTex,
                    bumpScale: 0.08,
                    roughness: 0.85
                }),
                mossFoliage: new THREE.MeshStandardMaterial({
                    color: 0x4b6e32,
                    roughness: 0.82
                }),
                foliage: new THREE.MeshStandardMaterial({
                    color: 0x355c2b,
                    roughness: 0.82
                }),
                poolWater: new THREE.MeshStandardMaterial({
                    color: 0x0891b2,
                    emissive: 0x0369a1,
                    emissiveIntensity: 0.45,
                    roughness: 0.1,
                    metalness: 0.25,
                    transparent: true,
                    opacity: 0.9
                }),
                waterfallStream: new THREE.MeshStandardMaterial({
                    map: waterfallTex,
                    emissive: 0x38bdf8,
                    emissiveMap: waterfallTex,
                    emissiveIntensity: 0.65,
                    transparent: true,
                    opacity: 0.88,
                    roughness: 0.15,
                    side: THREE.DoubleSide
                }),
                spiralRibbon: new THREE.MeshStandardMaterial({
                    map: spiralRibbonTex,
                    emissive: 0xa855f7,
                    emissiveMap: spiralRibbonTex,
                    emissiveIntensity: 1.35,
                    transparent: true,
                    opacity: 0.88,
                    roughness: 0.1
                }),
                foamWhite: new THREE.MeshBasicMaterial({
                    color: 0xe0f2fe,
                    transparent: true,
                    opacity: 0.78
                }),
                emberMat: new THREE.MeshStandardMaterial({
                    color: 0xff5500,
                    emissive: 0xff3b00,
                    emissiveIntensity: 2.4
                }),
                gemPurple: new THREE.MeshStandardMaterial({
                    color: 0xc084fc,
                    emissive: 0x9333ea,
                    emissiveIntensity: 1.65,
                    roughness: 0.1
                }),
                gemEmerald: new THREE.MeshStandardMaterial({
                    color: 0x34d399,
                    emissive: 0x059669,
                    emissiveIntensity: 1.5,
                    roughness: 0.1
                }),
                crimsonSilk: new THREE.MeshStandardMaterial({
                    color: 0x881b1b,
                    roughness: 0.42,
                    side: THREE.DoubleSide
                })
            };

            const fabricPalette = [mats.silkCrimson, mats.silkTurquoise, mats.silkIndigo, mats.silkGold, mats.silkLinen];
            const gemPalette = [mats.gemVoid, mats.gemSolar, mats.gemFrost, mats.gemCrimson, mats.gemJade];

            const townGroup = new THREE.Group();
            const shopInteriors = [];
            const houseEntries = [];
            const stoneRingGroups = [];
            // The host game decides where to attach this town group.

            const allRoofs = [];

            function addBox(parent, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
                mesh.position.set(x, y, z);
                if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                parent.add(mesh);
                return mesh;
            }

            // ============================================================================
            // 4. GRAND CIRCULAR TOWN PLAZA BASE, AVENUES & TORII-OBELISK GATEWAYS
            // ============================================================================
            const mainPlazaDisc = new THREE.Mesh(
                new THREE.CylinderGeometry(58, 60, 0.8, 72),
                mats.plazaStone
            );
            mainPlazaDisc.position.y = -0.4;
            mainPlazaDisc.receiveShadow = true;
            townGroup.add(mainPlazaDisc);

            const innerPlazaRing = new THREE.Mesh(
                new THREE.RingGeometry(7.2, 8.2, 64),
                mats.stairBrick
            );
            innerPlazaRing.rotation.x = -Math.PI / 2;
            innerPlazaRing.position.y = 0.02;
            townGroup.add(innerPlazaRing);

            const midAvenueRing = new THREE.Mesh(
                new THREE.RingGeometry(31.5, 34.5, 64),
                mats.stairBrick
            );
            midAvenueRing.rotation.x = -Math.PI / 2;
            midAvenueRing.position.y = 0.02;
            townGroup.add(midAvenueRing);

            // 4 Radial Ceremonial Walkways with Egyptian Torii-Obelisk Gateways
            for (let a = 0; a < 4; a++) {
                const angle = (a * Math.PI) / 2;
                const road = new THREE.Group();
                road.rotation.y = angle;
                addBox(road, 3.8, 0.06, 42.0, mats.sandstone, 0, 0.03, 28.5);
                addBox(road, 0.35, 0.14, 42.0, mats.gold, -1.95, 0.07, 28.5);
                addBox(road, 0.35, 0.14, 42.0, mats.gold, 1.95, 0.07, 28.5);

                const gate = new THREE.Group();
                gate.position.set(0, 0, 33.0);
                const colL = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 4.8, 16), mats.column);
                colL.position.set(-2.3, 2.4, 0);
                colL.castShadow = true;
                gate.add(colL);
                const colR = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 4.8, 16), mats.column);
                colR.position.set(2.3, 2.4, 0);
                colR.castShadow = true;
                gate.add(colR);
                addBox(gate, 6.2, 0.35, 0.48, mats.charredTimber, 0, 4.95, 0);
                addBox(gate, 6.4, 0.18, 0.56, mats.gold, 0, 5.2, 0);
                addBox(gate, 5.4, 0.32, 0.38, mats.frieze, 0, 4.15, 0);
                road.add(gate);

                townGroup.add(road);
            }

            // ============================================================================
            // 5. CENTERPIECE: TWIN HOWLING WOLF SPIRAL WATERFALL FOUNTAIN (0, 0, 0)
            //    Faithfully rebuilt to match the reference image:
            //    - Individual chiseled stone block rings with mortar gaps & moss bushes
            //    - 4 Japanese pagoda stone-pedestal lanterns with glowing Wolf-Crest glass
            //    - Two-stage tiered waterfall shelves (Upper Shelf + Lower Curved Ledge)
            //    - Sculpted Alpha & Beta Howling Wolves with layered fur ruffs & open jaws
            //    - Tilted sweeping cyan-violet liquid-glass ribbons feeding the waterfalls
            // ============================================================================
            const fountainGroup = new THREE.Group();
            townGroup.add(fountainGroup);

            // 5.1 Stepped Chiseled-Block Circular Stone Basin & Emerald-Turquoise Pool
            function createChiseledStoneRing(radius, height, yPos, radialDepth, numBlocks, JitterScale = 1.0) {
                const ringGrp = new THREE.Group();
                ringGrp.position.y = yPos;
                const arcLen = (Math.PI * 2 * radius) / numBlocks;
                for (let i = 0; i < numBlocks; i++) {
                    const ang = (i / numBlocks) * Math.PI * 2;
                    const bw = arcLen * 0.92;
                    const bh = height + ((i % 3 === 0) ? 0.025 : -0.015) * JitterScale;
                    const bd = radialDepth + ((i % 2 === 0) ? 0.03 : -0.02) * JitterScale;
                    const matChoice = (i % 4 === 0) ? mats.sandstone : mats.stairBrick;
                    const block = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), matChoice);
                    block.position.set(Math.cos(ang) * radius, 0, Math.sin(ang) * radius);
                    block.rotation.y = -ang + Math.PI / 2;
                    block.castShadow = true;
                    block.receiveShadow = true;
                    ringGrp.add(block);
                }
                fountainGroup.add(ringGrp);
                stoneRingGroups.push(ringGrp);
                return ringGrp;
            }

            // Outer lower step ring + 2 courses of basin wall + chiseled bullnose coping ring
            createChiseledStoneRing(7.05, 0.32, 0.16, 0.95, 48, 1.0);
            createChiseledStoneRing(6.18, 0.44, 0.50, 0.72, 42, 1.0);
            createChiseledStoneRing(6.16, 0.44, 0.94, 0.72, 42, 1.0);
            createChiseledStoneRing(6.14, 0.24, 1.28, 0.86, 40, 0.8);

            // Dark basin interior liner & crystal-clear turquoise pool surface
            const basinFloor = new THREE.Mesh(new THREE.CylinderGeometry(5.85, 5.85, 0.2, 48), mats.cragRock);
            basinFloor.position.y = 0.25;
            fountainGroup.add(basinFloor);

            const poolSurface = new THREE.Mesh(new THREE.CylinderGeometry(5.82, 5.82, 0.12, 48), mats.poolWater);
            poolSurface.position.y = 1.12;
            fountainGroup.add(poolSurface);

            // 5.2 Four Japanese Pagoda Wolf-Crest Lanterns on Stepped Stone Plinths (Matching Reference)
            function createWolfBasinLantern(x, z, scale = 1.0) {
                const lGroup = new THREE.Group();
                lGroup.position.set(x, 1.18, z);
                lGroup.scale.setScalar(scale);

                // Stepped coursed stone pedestal sitting atop the basin wall
                addBox(lGroup, 1.38, 0.28, 1.38, mats.stairBrick, 0, 0.14, 0);
                addBox(lGroup, 1.18, 0.26, 1.18, mats.sandstone, 0, 0.41, 0);
                addBox(lGroup, 1.02, 0.12, 1.02, mats.charredTimber, 0, 0.60, 0);

                // Glowing 4-sided Wolf-Emblem lantern core & dark bronze corner posts
                addBox(lGroup, 0.76, 0.92, 0.76, mats.wolfLanternMat, 0, 1.12, 0);
                for (let cx = -1; cx <= 1; cx += 2) {
                    for (let cz = -1; cz <= 1; cz += 2) {
                        addBox(lGroup, 0.08, 0.96, 0.08, mats.charredTimber, cx * 0.39, 1.12, cz * 0.39);
                    }
                }
                // Horizontal window mullion bars
                addBox(lGroup, 0.82, 0.05, 0.82, mats.charredTimber, 0, 0.82, 0);
                addBox(lGroup, 0.82, 0.05, 0.82, mats.charredTimber, 0, 1.42, 0);

                // Tiered Japanese Pagoda Roof with upturned eaves & Giboshi ball finial
                const roofBase = new THREE.Mesh(new THREE.ConeGeometry(0.92, 0.38, 4), mats.kawaraTile);
                roofBase.rotation.y = Math.PI / 4;
                roofBase.position.y = 1.76;
                roofBase.castShadow = true;
                lGroup.add(roofBase);

                const roofUpper = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.28, 4), mats.kawaraTile);
                roofUpper.rotation.y = Math.PI / 4;
                roofUpper.position.y = 1.96;
                lGroup.add(roofUpper);

                const finial = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mats.gold);
                finial.position.y = 2.16;
                lGroup.add(finial);

                const ptLight = new THREE.PointLight(0xffa52a, 1.35, 8.5);
                ptLight.position.set(0, 1.15, 0);
                lGroup.add(ptLight);

                fountainGroup.add(lGroup);
            }

            // 2 larger foreground lanterns + 2 slightly smaller mid-back lanterns exactly as in the picture
            createWolfBasinLantern(-5.25, 3.35, 1.05);
            createWolfBasinLantern(5.25, 3.35, 1.05);
            createWolfBasinLantern(-4.85, -3.75, 0.86);
            createWolfBasinLantern(4.85, -3.75, 0.86);

            // Lush Moss & Fern Clusters growing along the front stone steps & crevices
            function createFernClump(x, y, z, scale = 1.0, addPurpleFlowers = false) {
                const fg = new THREE.Group();
                fg.position.set(x, y, z);
                fg.scale.setScalar(scale);
                for (let i = 0; i < 9; i++) {
                    const ang = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
                    const frond = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.55), mats.mossFoliage);
                    frond.position.set(Math.cos(ang) * 0.22, 0.08 + (i % 3) * 0.05, Math.sin(ang) * 0.22);
                    frond.rotation.y = -ang + Math.PI / 2;
                    frond.rotation.x = 0.35;
                    fg.add(frond);
                }
                if (addPurpleFlowers) {
                    for (let f = 0; f < 4; f++) {
                        const fl = new THREE.Mesh(new THREE.DodecahedronGeometry(0.075, 0), mats.gemPurple);
                        fl.position.set((Math.random() - 0.5) * 0.38, 0.22 + Math.random() * 0.12, (Math.random() - 0.5) * 0.38);
                        fg.add(fl);
                    }
                }
                fountainGroup.add(fg);
            }
            createFernClump(-4.35, 0.42, 4.95, 1.25, false);
            createFernClump(4.45, 0.42, 4.85, 1.25, false);
            createFernClump(-5.85, 0.42, 2.25, 0.95, false);
            createFernClump(5.85, 0.42, 2.25, 0.95, false);

            // 5.3 Two-Stage Tiered Craggy Rock Mound (Lower Curved Ledge + Upper Waterfall Shelf + Wolf Summit)
            // Lower wide curved rock shelf sitting in the turquoise pool
            for (let i = 0; i < 24; i++) {
                const ang = (i / 24) * Math.PI * 2;
                const rad = 3.15 + Math.sin(ang * 3) * 0.28;
                const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 1), mats.cragRock);
                rock.position.set(Math.cos(ang) * rad, 1.38, Math.sin(ang) * rad);
                rock.scale.set(1.25, 0.85, 1.15);
                rock.rotation.set(i * 0.4, ang, i * 0.2);
                rock.castShadow = true;
                rock.receiveShadow = true;
                fountainGroup.add(rock);
            }
            const lowerShelfPlateau = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.65, 0.85, 24), mats.cragRock);
            lowerShelfPlateau.position.set(0, 1.48, 0);
            lowerShelfPlateau.receiveShadow = true;
            fountainGroup.add(lowerShelfPlateau);

            // Upper-middle craggy rock cliff & side cascade shelf
            const upperCragConfigs = [
                [-0.2, 2.55, -0.2, 2.45, 1.35, 2.15],
                [-1.65, 2.35, 0.45, 1.45, 1.15, 1.35],
                [1.55, 2.25, 0.45, 1.55, 1.05, 1.45],
                [2.35, 1.95, 0.35, 1.35, 0.85, 1.25],
                [-0.35, 3.45, -0.25, 1.95, 1.15, 1.75],
                [-0.65, 4.15, -0.35, 1.35, 0.85, 1.25],
                [0.85, 3.25, 0.25, 1.25, 0.85, 1.15]
            ];
            upperCragConfigs.forEach(([rx, ry, rz, sx, sy, sz], idx) => {
                const crag = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 1), mats.cragRock);
                crag.position.set(rx, ry, rz);
                crag.scale.set(sx, sy, sz);
                crag.rotation.set(idx * 0.7, idx * 1.2, idx * 0.4);
                crag.castShadow = true;
                crag.receiveShadow = true;
                fountainGroup.add(crag);
            });

            // Moss & Purple Blossom Scrubs tucked into the rock ledges
            createFernClump(-2.35, 2.55, 1.15, 1.15, true);
            createFernClump(-0.45, 3.55, 1.25, 1.1, true);
            createFernClump(2.25, 2.75, 0.65, 1.15, true);
            createFernClump(-1.55, 3.85, 0.55, 1.0, true);
            createFernClump(1.45, 2.25, 1.65, 0.95, true);

            // 5.4 Multi-Stage Cascading Waterfall Sheets & Pool Foam Rings (Matching Reference)
            const foamRings = [];
            function addWaterfallSheet(x, yTop, yBot, z, widthTop, widthBot, rotY = 0, tiltForward = 0.18) {
                const h = yTop - yBot;
                const midY = (yTop + yBot) * 0.5;
                const sheet = new THREE.Mesh(
                    new THREE.CylinderGeometry(widthTop, widthBot, h, 12, 1, true, -Math.PI * 0.35, Math.PI * 0.7),
                    mats.waterfallStream
                );
                sheet.position.set(x, midY, z);
                sheet.rotation.y = rotY;
                sheet.rotation.x = tiltForward;
                fountainGroup.add(sheet);

                const foam = new THREE.Mesh(new THREE.RingGeometry(widthBot * 0.35, widthBot * 1.15, 20), mats.foamWhite);
                foam.rotation.x = -Math.PI / 2;
                foam.position.set(x + Math.sin(rotY) * 0.25, yBot + 0.04, z + Math.cos(rotY) * 0.25);
                fountainGroup.add(foam);
                foamRings.push({ mesh: foam, phase: Math.random() * Math.PI * 2 });
            }

            // Stage 1: Main Upper Twin Chutes + Right Terraced Chute (falling from upper shelf onto lower ledge)
            addWaterfallSheet(-1.15, 3.35, 1.92, 1.35, 0.48, 0.68, -0.15, 0.22);
            addWaterfallSheet(0.45, 3.35, 1.92, 1.48, 0.38, 0.54, 0.08, 0.18);
            addWaterfallSheet(1.85, 2.65, 1.85, 1.15, 0.46, 0.62, 0.45, 0.22);
            addWaterfallSheet(2.65, 2.45, 1.18, 0.45, 0.42, 0.64, 1.15, 0.26);

            // Stage 2: Lower Curved Ledge Curtain (7 wide chutes spilling into the main turquoise basin)
            const lowerCurtainAngles = [-1.15, -0.75, -0.38, 0.0, 0.38, 0.78, 1.18, 2.2, -2.2];
            lowerCurtainAngles.forEach((ang, i) => {
                const rad = 3.25;
                const wx = Math.sin(ang) * rad;
                const wz = Math.cos(ang) * rad;
                const wTop = (i < 7) ? 0.46 : 0.38;
                const wBot = (i < 7) ? 0.64 : 0.52;
                addWaterfallSheet(wx, 1.92, 1.14, wz, wTop, wBot, ang, 0.24);
            });

            // 5.5 Sculpted High-Detail Howling Stone Wolves (Alpha & Companion matching Reference Pose)
            function createHowlingWolfStatue(scale = 1.0) {
                const wolf = new THREE.Group();
                wolf.scale.setScalar(scale);

                // Hindquarters & Folded Seated Haunches
                const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.52, 16, 14), mats.wolfStone);
                pelvis.scale.set(0.95, 1.18, 1.15);
                pelvis.position.set(0, 0.52, -0.38);
                pelvis.castShadow = true;
                wolf.add(pelvis);

                for (let s = -1; s <= 1; s += 2) {
                    const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), mats.wolfStone);
                    thigh.scale.set(0.72, 1.25, 1.1);
                    thigh.position.set(s * 0.34, 0.48, -0.28);
                    thigh.rotation.x = 0.35;
                    wolf.add(thigh);

                    const hock = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.55, 10), mats.wolfStone);
                    hock.position.set(s * 0.34, 0.22, -0.05);
                    hock.rotation.x = -0.45;
                    wolf.add(hock);

                    const hindPaw = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mats.wolfStone);
                    hindPaw.scale.set(0.9, 0.55, 1.35);
                    hindPaw.position.set(s * 0.34, 0.08, 0.12);
                    wolf.add(hindPaw);
                }

                // Deep Muscular Spine, Ribcage & Proudly Arched Chest
                const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 1.25, 16), mats.wolfStone);
                spine.position.set(0, 1.02, -0.02);
                spine.rotation.x = 0.52;
                spine.castShadow = true;
                wolf.add(spine);

                const breast = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 14), mats.wolfStone);
                breast.scale.set(0.96, 1.22, 1.08);
                breast.position.set(0, 1.38, 0.28);
                breast.castShadow = true;
                wolf.add(breast);

                // Braced Straight Front Legs, Shoulders & Clawed Paws
                for (let s = -1; s <= 1; s += 2) {
                    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), mats.wolfStone);
                    shoulder.scale.set(0.75, 1.3, 0.95);
                    shoulder.position.set(s * 0.28, 1.22, 0.36);
                    wolf.add(shoulder);

                    const foreleg = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.095, 1.18, 12), mats.wolfStone);
                    foreleg.position.set(s * 0.25, 0.62, 0.42);
                    foreleg.rotation.x = -0.06;
                    foreleg.castShadow = true;
                    wolf.add(foreleg);

                    const forePaw = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mats.wolfStone);
                    forePaw.scale.set(0.95, 0.55, 1.4);
                    forePaw.position.set(s * 0.25, 0.08, 0.52);
                    wolf.add(forePaw);
                }

                // Thick Layered Sculpted Fur Ruff Collar around Neck & Shoulders (Signature Detail from Image)
                const neckCore = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.44, 0.92, 14), mats.wolfStone);
                neckCore.position.set(0, 1.88, 0.38);
                neckCore.rotation.x = 0.28;
                wolf.add(neckCore);

                for (let layer = 0; layer < 4; layer++) {
                    const numTufts = 9 - layer;
                    const ly = 1.48 + layer * 0.21;
                    const lz = 0.30 + layer * 0.05;
                    const ringRad = 0.40 - layer * 0.045;
                    for (let t = 0; t < numTufts; t++) {
                        const ang = ((t / (numTufts - 1)) - 0.5) * Math.PI * 1.45;
                        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 6), mats.wolfStone);
                        tuft.position.set(
                            Math.sin(ang) * ringRad,
                            ly,
                            lz + Math.cos(ang) * ringRad * 0.65
                        );
                        tuft.rotation.x = 2.35 + layer * 0.08;
                        tuft.rotation.z = -ang * 0.65;
                        tuft.castShadow = true;
                        wolf.add(tuft);
                    }
                }

                // Tilted-Back Howling Head, Open Maw, Fangs & Pinned Ears
                const headGroup = new THREE.Group();
                headGroup.position.set(0, 2.36, 0.48);
                headGroup.rotation.x = -0.88; // Pitched steeply skyward in a full howl
                wolf.add(headGroup);

                const skull = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), mats.wolfStone);
                skull.scale.set(0.92, 0.95, 1.15);
                headGroup.add(skull);

                // Cheek fur tufts
                for (let s = -1; s <= 1; s += 2) {
                    const cheek = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 6), mats.wolfStone);
                    cheek.position.set(s * 0.24, -0.06, -0.05);
                    cheek.rotation.z = s * 1.2;
                    cheek.rotation.x = -0.5;
                    headGroup.add(cheek);
                }

                // Upper Snout Bridge & Dark Nose Tip
                const upperSnout = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.20, 0.56, 12), mats.wolfStone);
                upperSnout.rotation.x = Math.PI / 2 - 0.08;
                upperSnout.position.set(0, 0.06, 0.34);
                headGroup.add(upperSnout);

                const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), mats.obsidian);
                noseTip.position.set(0, 0.10, 0.61);
                headGroup.add(noseTip);

                // Open Lower Jaw & Dark Mouth Cavity
                const lowerJaw = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.13, 0.46, 10), mats.wolfStone);
                lowerJaw.rotation.x = Math.PI / 2 + 0.42;
                lowerJaw.position.set(0, -0.12, 0.28);
                headGroup.add(lowerJaw);

                const mouthInside = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.36, 8), mats.crimsonLeather);
                mouthInside.rotation.x = Math.PI / 2 + 0.18;
                mouthInside.position.set(0, -0.03, 0.32);
                headGroup.add(mouthInside);

                // Swept-back Wolf Ears
                for (let s = -1; s <= 1; s += 2) {
                    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.34, 6), mats.wolfStone);
                    ear.position.set(s * 0.17, 0.18, -0.14);
                    ear.rotation.x = -0.55;
                    ear.rotation.z = -s * 0.22;
                    headGroup.add(ear);
                }

                // Bushy Layered Tail Draped Over the Rock Crag
                const tailGroup = new THREE.Group();
                tailGroup.position.set(-0.18, 0.38, -0.78);
                tailGroup.rotation.x = -1.15;
                tailGroup.rotation.z = 0.28;
                const tailMain = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.05, 10), mats.wolfStone);
                tailGroup.add(tailMain);
                wolf.add(tailGroup);

                return wolf;
            }

            // Large Alpha Wolf on Upper Center-Left Summit, howling up and to the right (matching picture)
            const alphaWolf = createHowlingWolfStatue(1.22);
            alphaWolf.position.set(-0.55, 4.12, -0.22);
            alphaWolf.rotation.y = 0.92;
            fountainGroup.add(alphaWolf);

            // Second Companion Wolf seated on Lower Right Crag, howling in parallel (matching picture)
            const betaWolf = createHowlingWolfStatue(0.86);
            betaWolf.position.set(1.12, 3.12, 0.35);
            betaWolf.rotation.y = 0.88;
            fountainGroup.add(betaWolf);

            // 5.6 Sweeping Tilted Cyan-Violet Liquid-Glass Ribbons Coiling Around the Wolves into the Waterfalls
            const spiralRibbons = [];
            const ribbonConfigs = [
                // Ribbon 1: Sweeps high behind the Alpha Wolf's back and arcs down into the center waterfall chute
                {
                    points: [
                        new THREE.Vector3(-1.35, 3.25, 1.15),
                        new THREE.Vector3(-2.65, 3.95, 0.25),
                        new THREE.Vector3(-2.45, 5.15, -1.15),
                        new THREE.Vector3(-0.65, 5.65, -1.45),
                        new THREE.Vector3(1.45, 4.75, -0.75),
                        new THREE.Vector3(2.05, 3.85, 0.65),
                        new THREE.Vector3(0.45, 3.35, 1.48)
                    ],
                    radius: 0.14
                },
                // Ribbon 2: Mid-level tilted arc wrapping from the left crag around both wolves
                {
                    points: [
                        new THREE.Vector3(-1.15, 3.35, 1.35),
                        new THREE.Vector3(-2.85, 4.45, -0.15),
                        new THREE.Vector3(-1.85, 5.35, -1.35),
                        new THREE.Vector3(0.45, 5.05, -1.25),
                        new THREE.Vector3(2.15, 4.15, -0.15),
                        new THREE.Vector3(1.65, 3.35, 1.15),
                        new THREE.Vector3(-0.25, 3.45, 1.25)
                    ],
                    radius: 0.115
                },
                // Ribbon 3: Lower sweeping loop cradling the rock base of the wolves
                {
                    points: [
                        new THREE.Vector3(1.85, 2.75, 1.15),
                        new THREE.Vector3(2.35, 3.55, 0.05),
                        new THREE.Vector3(1.15, 4.35, -1.15),
                        new THREE.Vector3(-1.25, 4.65, -1.15),
                        new THREE.Vector3(-2.75, 3.75, 0.15),
                        new THREE.Vector3(-1.95, 3.15, 1.15),
                        new THREE.Vector3(-1.15, 3.35, 1.35)
                    ],
                    radius: 0.105
                },
                // Ribbon 4: Fine inner violet-cyan energy filament
                {
                    points: [
                        new THREE.Vector3(-0.45, 3.45, 1.25),
                        new THREE.Vector3(-2.35, 4.15, 0.45),
                        new THREE.Vector3(-2.15, 4.95, -0.85),
                        new THREE.Vector3(-0.15, 5.25, -1.15),
                        new THREE.Vector3(1.75, 4.35, -0.45),
                        new THREE.Vector3(0.55, 3.38, 1.38)
                    ],
                    radius: 0.075
                }
            ];

            ribbonConfigs.forEach(cfg => {
                const curve = new THREE.CatmullRomCurve3(cfg.points);
                const tubeGeo = new THREE.TubeGeometry(curve, lowDetail ? 24 : 48, cfg.radius, lowDetail ? 6 : 8, false);
                // Flatten tube slightly so it looks like a sculpted flowing water ribbon
                tubeGeo.scale(1.0, 0.58, 1.0);
                const tubeMesh = new THREE.Mesh(tubeGeo, mats.spiralRibbon);
                fountainGroup.add(tubeMesh);
                spiralRibbons.push(tubeMesh);
            });

            // Rising Mist & Sparkle Particles around the Waterfall & Spiral Ribbons
            const mistParticles = [];
            for (let m = 0; m < 48; m++) {
                const pMat = (m % 2 === 0) ? mats.gemPurple : mats.foamWhite;
                const droplet = new THREE.Mesh(new THREE.DodecahedronGeometry(0.065, 0), pMat);
                const ang = Math.random() * Math.PI * 2;
                const rad = 1.6 + Math.random() * 2.8;
                droplet.position.set(Math.cos(ang) * rad, 1.2 + Math.random() * 4.5, Math.sin(ang) * rad);
                droplet.userData = {
                    ang,
                    rad,
                    speed: 0.7 + Math.random() * 1.1,
                    yStart: 1.2,
                    yMax: 5.8
                };
                fountainGroup.add(droplet);
                mistParticles.push(droplet);
            }

            const wolfSpiritLight = new THREE.PointLight(0x38bdf8, 3.1, 18);
            wolfSpiritLight.position.set(0, 5.6, 1.5);
            fountainGroup.add(wolfSpiritLight);

            const ribbonVioletLight = new THREE.PointLight(0xa855f7, 2.5, 16);
            ribbonVioletLight.position.set(-1.8, 4.6, -1.2);
            fountainGroup.add(ribbonVioletLight);

            // ============================================================================
            // 6. INNER RING: THE 4 EXACT FULL-SCALE UPLOADED HOUSES AROUND THE WATERFALL
            //    1. NW: House of Anubis-Masamune (3-Tier L-Shaped Blacksmith Residence)
            //    2. NE: Atelier of Isis-Nishijin (1F L-Shaped Clothing & Silk Boutique)
            //    3. SE: Sanctum of Thoth-Onmyo (1F L-Shaped Gem Augment & Spellbook Sanctum)
            //    4. SW: Royal Stables of Bastet-Kirin (1F L-Shaped Mount & Barding Sanctuary)
            // ============================================================================
            const innerShopsGroup = new THREE.Group();
            townGroup.add(innerShopsGroup);

            // Global animation registries for the 4 uploaded buildings
            const allSlidingDoors = [];
            const allSlidingShoji = [];
            const allNorenPanels = [];
            const allSwayingSilks = [];
            const allLanterns = [];
            const allEmberParticles = [];
            const allFloatingCrystals = [];
            const allFloatingSpellbooks = [];
            const allLapidaryWheels = [];
            const allAnimatedMounts = [];
            const allStallGates = [];
            let smithUpperFacadeGroup = null;
            let smithForgeFireLight = null;
            let augmentFloorRune = null;
            let augmentTopRune = null;
            let augmentMasterGem = null;
            let augmentCoreAssembly = null;
            let augmentRing1 = null;
            let augmentRing2 = null;
            const augmentOrbitingGems = [];
            let mountSuspendedBarding = null;

            // Shared Helper: Tiled Roof Slope with Exposed Rafters & Kawara Ribs (exact match to uploaded files)
            function createTiledRoofSlope(width, length, pitchAngle, x, y, z, isFrontSlope = true) {
                const slope = new THREE.Group();
                slope.position.set(x, y, z);
                slope.rotation.x = isFrontSlope ? pitchAngle : -pitchAngle;
                addBox(slope, width, 0.18, length, mats.charredTimber, 0, 0, 0);

                const rafterCount = Math.floor(width / (lowDetail ? 1.8 : 1.2));
                for (let r = -rafterCount / 2; r <= rafterCount / 2; r++) {
                    addBox(slope, 0.14, 0.18, length * 0.96, mats.warmWood, r * (lowDetail ? 1.76 : 1.16), -0.16, 0);
                }

                const ribGap = lowDetail ? 1.25 : 0.84;
                const tileCols = Math.floor(width / ribGap);
                for (let c = -tileCols / 2; c <= tileCols / 2; c++) {
                    const rib = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.11, 0.11, length * 0.98, 8),
                        mats.kawaraTile
                    );
                    rib.rotation.x = Math.PI / 2;
                    rib.position.set(c * ribGap, 0.14, 0);
                    rib.castShadow = true;
                    slope.add(rib);
                }
                addBox(slope, 0.22, 0.32, length * 1.01, mats.plaster, -width / 2 + 0.12, 0.06, 0);
                addBox(slope, 0.22, 0.32, length * 1.01, mats.plaster, width / 2 - 0.12, 0.06, 0);
                return slope;
            }

            // Shared Helper: Chochin Paper Lantern
            function createChochinLantern(parent, x, y, z) {
                const grp = new THREE.Group();
                grp.position.set(x, y, z);
                addBox(grp, 0.04, 0.45, 0.04, mats.charredTimber, 0, 0.55, 0);
                const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.08, 16), mats.charredTimber);
                capT.position.y = 0.34;
                grp.add(capT);
                const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.26, 0.65, 20), mats.lanternGlowMat);
                grp.add(body);
                const capB = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.08, 16), mats.charredTimber);
                capB.position.y = -0.34;
                grp.add(capB);
                allLanterns.push({ group: grp, phase: Math.random() * Math.PI * 2 });
                parent.add(grp);
            }

            // Shared Helper: Climbing Ivy Vines
            function createIvyCluster(parent, x, yStart, z, height = 3.0) {
                for (let i = 0; i < (lowDetail ? 6 : 12); i++) {
                    const leaf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.1, 0), mats.foliage);
                    leaf.position.set(
                        x + (Math.random() - 0.5) * 0.45,
                        yStart + Math.random() * height,
                        z + (Math.random() - 0.5) * 0.55
                    );
                    parent.add(leaf);
                }
            }

            // Shared Helper: Build the Single-Story L-Shaped Shop Shell used by Clothing, Augment & Mount Shops
            function buildSingleStoryLShopShell(shopGroup, capMat, norenMat, bollardFinialGeo, bollardFinialMat) {
                // Left Wing Stone Base
                addBox(shopGroup, 7.4, 0.46, 9.6, mats.flagstone, -5.8, 0.23, -0.6);
                addBox(shopGroup, 7.65, 0.24, 9.85, mats.stairBrick, -5.8, 0.12, -0.6);
                addBox(shopGroup, 7.6, 0.42, 0.32, mats.charredTimber, -5.8, 0.22, 4.15);
                addBox(shopGroup, 0.32, 0.42, 9.6, mats.charredTimber, -2.15, 0.22, -0.6);

                // Main Right Wing Elevated Showroom Floor
                addBox(shopGroup, 10.8, 0.52, 7.6, mats.warmWood, 3.2, 0.26, -1.6);
                addBox(shopGroup, 11.05, 0.32, 7.85, mats.stairBrick, 3.2, 0.16, -1.6);
                addBox(shopGroup, 9.8, 0.08, 6.4, mats.tatami, 3.0, 0.55, -1.9);
                addBox(shopGroup, 10.9, 0.54, 0.45, mats.charredTimber, 3.2, 0.27, 2.1);

                // Front Courtyard Flagstone Promenade & Multi-Brick Porch Steps
                addBox(shopGroup, 10.9, 0.18, 2.1, mats.flagstone, 3.2, 0.09, 3.35);
                addBox(shopGroup, 11.1, 0.14, 0.24, mats.stairBrick, 3.2, 0.07, 4.38);

                for (let st = 0; st < 2; st++) {
                    const sw = 3.6 - st * 0.3;
                    const sd = 0.85 - st * 0.38;
                    const sy = 0.18 + st * 0.18;
                    const sz = 2.68 - st * 0.2;
                    addBox(shopGroup, sw, 0.18, sd, mats.stairBrick, 2.4, sy, sz);
                    for (let t = 0; t < 5; t++) {
                        addBox(shopGroup, (sw - 0.15) / 5 - 0.03, 0.05, sd + 0.06, mats.sandstone, 2.4 - sw * 0.4 + t * (sw * 0.2), sy + 0.1, sz);
                    }
                }

                // Stone Quoin Blocks on Exterior Sandstone Corners
                for (let q = 0; q < 7; q++) {
                    const qy = 0.68 + q * 0.56;
                    const qw = (q % 2 === 0) ? 0.68 : 0.48;
                    addBox(shopGroup, qw, 0.24, 0.68, mats.stairBrick, -9.42, qy, 4.05);
                    addBox(shopGroup, qw, 0.24, 0.68, mats.stairBrick, -9.42, qy, -5.32);
                    addBox(shopGroup, qw, 0.24, 0.68, mats.stairBrick, 8.42, qy, 1.95);
                    addBox(shopGroup, qw, 0.24, 0.68, mats.stairBrick, 8.42, qy, -5.32);
                }

                // Left Wing Exterior Wall with Shoji Lattice Window
                addBox(shopGroup, 0.55, 4.1, 3.2, mats.sandstone, -9.4, 2.45, -3.8);
                addBox(shopGroup, 0.55, 4.1, 3.2, mats.sandstone, -9.4, 2.45, 2.6);
                addBox(shopGroup, 0.55, 1.3, 3.2, mats.sandstone, -9.4, 1.05, -0.6);
                addBox(shopGroup, 0.55, 0.9, 3.2, mats.sandstone, -9.4, 4.05, -0.6);
                addBox(shopGroup, 0.42, 1.9, 3.1, mats.shojiGlow, -9.4, 2.65, -0.6);
                for (let kz = -1.95; kz <= 0.75; kz += 0.27) {
                    addBox(shopGroup, 0.58, 1.92, 0.05, mats.charredTimber, -9.4, 2.65, kz);
                }
                addBox(shopGroup, 0.64, 0.56, 9.7, mats.frieze, -9.4, 4.45, -0.6);
                addBox(shopGroup, 0.44, 1.85, 6.2, mats.plaster, -9.4, 5.5, -0.6);
                addBox(shopGroup, 0.5, 1.85, 0.28, mats.charredTimber, -9.4, 5.5, -0.6);

                // Back Spine Wall
                addBox(shopGroup, 7.4, 4.2, 0.5, mats.sandstone, -5.7, 2.5, -5.4);
                addBox(shopGroup, 10.6, 4.2, 0.5, mats.plaster, 3.1, 2.5, -5.4);
                addBox(shopGroup, 18.0, 0.55, 0.58, mats.frieze, -0.6, 4.45, -5.4);

                // Right Wing Exterior Wall & Side Temple Portal
                addBox(shopGroup, 1.5, 4.1, 2.2, mats.sandstone, 7.85, 2.45, 0.98);
                addBox(shopGroup, 1.6, 0.55, 2.3, mats.frieze, 7.85, 4.45, 0.98);
                addBox(shopGroup, 0.55, 4.1, 2.4, mats.sandstone, 8.4, 2.45, -4.2);
                addBox(shopGroup, 0.62, 0.55, 2.5, mats.frieze, 8.4, 4.45, -4.2);
                addBox(shopGroup, 0.85, 0.85, 3.1, mats.sandstone, 8.4, 3.95, -1.65);
                addBox(shopGroup, 0.95, 0.55, 3.2, mats.frieze, 8.4, 4.45, -1.65);
                addBox(shopGroup, 0.44, 2.3, 7.4, mats.plaster, 8.4, 5.75, -1.6);
                addBox(shopGroup, 0.52, 1.25, 2.4, mats.shojiGlow, 8.4, 5.65, -1.6);

                // Egyptian Lotus Columns
                function addCol(x, y, z, height = 3.85) {
                    const col = new THREE.Group();
                    col.position.set(x, y, z);
                    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.25, 20), mats.flagstone);
                    plinth.position.y = 0.125;
                    col.add(plinth);
                    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.36, height - 0.8, 20), mats.column);
                    shaft.position.y = (height - 0.8) / 2 + 0.25;
                    shaft.castShadow = true;
                    shaft.receiveShadow = true;
                    col.add(shaft);
                    for (let r = 0; r < 3; r++) {
                        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 10, 24), mats.gold);
                        ring.rotation.x = Math.PI / 2;
                        ring.position.y = height - 0.65 + r * 0.07;
                        col.add(ring);
                    }
                    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.3, 0.48, 20), capMat);
                    cap.position.y = height - 0.3;
                    col.add(cap);
                    addBox(col, 0.85, 0.16, 0.85, mats.gold, 0, height - 0.04, 0);
                    shopGroup.add(col);
                }
                addCol(-0.8, 0.5, 1.95, 3.72);
                addCol(2.8, 0.5, 1.95, 3.72);
                addCol(6.4, 0.5, 1.95, 3.72);
                addCol(8.85, 0.4, -0.25, 3.8);
                addCol(8.85, 0.4, -3.05, 3.8);

                // Heavy Timber Posts around Left Wing
                [[-9.2, 4.05], [-5.6, 4.05], [-2.2, 4.05], [-2.2, 1.95]].forEach(([px, pz]) => {
                    addBox(shopGroup, 0.66, 0.34, 0.66, mats.sandstone, px, 0.4, pz);
                    addBox(shopGroup, 0.54, 0.09, 0.54, mats.gold, px, 0.6, pz);
                    addBox(shopGroup, 0.44, 3.5, 0.44, mats.charredTimber, px, 2.37, pz);
                });

                // Overhead Keta Lintel Beams & Hieroglyphic Friezes
                addBox(shopGroup, 11.0, 0.48, 0.58, mats.charredTimber, 3.1, 4.22, 1.95);
                addBox(shopGroup, 11.1, 0.52, 0.64, mats.frieze, 3.1, 4.62, 1.95);
                addBox(shopGroup, 7.5, 0.46, 0.54, mats.charredTimber, -5.75, 4.22, 4.05);
                addBox(shopGroup, 7.6, 0.5, 0.6, mats.frieze, -5.75, 4.6, 4.05);
                addBox(shopGroup, 0.52, 0.46, 2.2, mats.charredTimber, -2.2, 4.22, 3.0);

                // Noren Curtains along Front Eave
                function addNorenSpan(startX, endX, zPos, yTop, count) {
                    const span = endX - startX;
                    const w = (span / count) - 0.08;
                    addBox(shopGroup, span + 0.2, 0.06, 0.06, mats.gold, (startX + endX) / 2, yTop + 0.04, zPos);
                    for (let i = 0; i < count; i++) {
                        const px = startX + (i + 0.5) * (span / count);
                        const pivot = new THREE.Group();
                        pivot.position.set(px, yTop, zPos);
                        const flap = new THREE.Mesh(new THREE.BoxGeometry(w, 1.15, 0.025), norenMat);
                        flap.position.y = -0.575;
                        flap.castShadow = true;
                        pivot.add(flap);
                        shopGroup.add(pivot);
                        allNorenPanels.push({ pivot, flap, phase: i * 0.7 });
                    }
                }
                addNorenSpan(-8.8, -5.9, 4.18, 3.98, 3);
                addNorenSpan(-5.3, -2.5, 4.18, 3.98, 3);
                addNorenSpan(-0.3, 2.3, 2.08, 3.98, 3);
                addNorenSpan(3.3, 5.9, 2.08, 3.98, 3);

                // Right Exterior Multi-Course Brick & Stone Stairs
                for (let st = 0; st < 4; st++) {
                    const stepDepth = 1.95 - st * 0.38;
                    const stepHeight = 0.22;
                    const stepCenterX = 9.48 + st * 0.21;
                    const stepY = 0.11 + (3 - st) * 0.21;
                    addBox(shopGroup, stepDepth, stepHeight, 2.86, mats.stairBrick, stepCenterX, stepY, -1.65);
                    const treadCount = 5;
                    const treadWidth = 2.76 / treadCount;
                    for (let t = 0; t < treadCount; t++) {
                        const tz = -3.02 + (t + 0.5) * treadWidth;
                        addBox(shopGroup, stepDepth + 0.08, 0.06, treadWidth - 0.035, mats.sandstone, stepCenterX + 0.02, stepY + stepHeight * 0.5 + 0.025, tz);
                    }
                }
                for (let side = -1; side <= 1; side += 2) {
                    const cz = -1.65 + side * 1.52;
                    addBox(shopGroup, 2.25, 0.45, 0.26, mats.stairBrick, 9.52, 0.23, cz);
                    addBox(shopGroup, 1.45, 0.42, 0.26, mats.stairBrick, 9.15, 0.62, cz);
                    addBox(shopGroup, 2.32, 0.08, 0.32, mats.sandstone, 9.52, 0.48, cz);
                    addBox(shopGroup, 1.52, 0.08, 0.32, mats.sandstone, 9.15, 0.86, cz);
                    addBox(shopGroup, 0.34, 0.68, 0.34, mats.sandstone, 10.48, 0.34, cz);
                    addBox(shopGroup, 0.38, 0.12, 0.38, mats.frieze, 10.48, 0.68, cz);
                    const finial = new THREE.Mesh(bollardFinialGeo, bollardFinialMat);
                    finial.position.set(10.48, 0.84, cz);
                    shopGroup.add(finial);
                }

                // Operable Double Sliding Side Entrance Doors
                const genkanDoorLeft = new THREE.Group();
                genkanDoorLeft.position.set(8.42, 2.05, -1.08);
                addBox(genkanDoorLeft, 0.1, 2.95, 1.18, mats.charredTimber, 0, 0, 0);
                addBox(genkanDoorLeft, 0.12, 1.65, 0.95, mats.shojiGlow, 0, 0.45, 0);
                addBox(genkanDoorLeft, 0.13, 0.85, 0.95, mats.cabinet, 0, -0.9, 0);
                shopGroup.add(genkanDoorLeft);

                const genkanDoorRight = new THREE.Group();
                genkanDoorRight.position.set(8.36, 2.05, -2.22);
                addBox(genkanDoorRight, 0.1, 2.95, 1.18, mats.charredTimber, 0, 0, 0);
                addBox(genkanDoorRight, 0.12, 1.65, 0.95, mats.shojiGlow, 0, 0.45, 0);
                addBox(genkanDoorRight, 0.13, 0.85, 0.95, mats.cabinet, 0, -0.9, 0);
                shopGroup.add(genkanDoorRight);

                allSlidingDoors.push(
                    { mesh: genkanDoorLeft, axis: 'z', closed: -1.08, open: -0.25 },
                    { mesh: genkanDoorRight, axis: 'z', closed: -2.22, open: -3.05 }
                );

                // Single-Story Kawara Tiled Roof & Eaves
                const roofGroup = new THREE.Group();
                shopGroup.add(roofGroup);
                roofGroup.add(createTiledRoofSlope(11.8, 5.4, 0.44, 3.1, 5.75, 0.55, true));
                roofGroup.add(createTiledRoofSlope(11.8, 5.4, 0.44, 3.1, 5.75, -3.75, false));
                const mainRidge = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 12.0, 12), mats.kawaraTile);
                mainRidge.rotation.z = Math.PI / 2;
                mainRidge.position.set(3.1, 6.95, -1.6);
                roofGroup.add(mainRidge);
                addBox(roofGroup, 0.38, 0.58, 0.48, mats.gold, -2.8, 7.18, -1.6);
                addBox(roofGroup, 0.38, 0.58, 0.48, mats.gold, 9.0, 7.18, -1.6);

                roofGroup.add(createTiledRoofSlope(7.8, 5.6, 0.42, -5.75, 5.55, 1.65, true));
                roofGroup.add(createTiledRoofSlope(7.8, 5.6, 0.42, -5.75, 5.55, -2.85, false));
                const leftRidge = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8.0, 12), mats.kawaraTile);
                leftRidge.rotation.z = Math.PI / 2;
                leftRidge.position.set(-5.75, 6.68, -0.6);
                roofGroup.add(leftRidge);
                addBox(roofGroup, 0.34, 0.52, 0.44, mats.gold, -9.65, 6.88, -0.6);

                roofGroup.add(createTiledRoofSlope(11.4, 1.35, 0.34, 3.1, 4.45, 2.55, true));
                roofGroup.add(createTiledRoofSlope(7.8, 1.35, 0.34, -5.75, 4.45, 4.55, true));
                const rightDoorEave = createTiledRoofSlope(1.55, 6.8, 0.0, 9.15, 4.35, -1.65, true);
                rightDoorEave.rotation.z = -0.38;
                roofGroup.add(rightDoorEave);
                allRoofs.push(roofGroup);

                // Chochin Lanterns & Ivy
                createChochinLantern(shopGroup, -9.4, 3.45, 4.65);
                createChochinLantern(shopGroup, -2.2, 3.45, 4.65);
                createChochinLantern(shopGroup, 0.9, 3.45, 2.75);
                createChochinLantern(shopGroup, 4.5, 3.45, 2.75);
                createChochinLantern(shopGroup, 9.45, 3.45, 0.85);
                createChochinLantern(shopGroup, 9.45, 3.45, -4.05);
                createIvyCluster(shopGroup, -9.65, 0.4, 3.5, 3.2);
                createIvyCluster(shopGroup, 9.1, 0.4, -4.3, 3.2);
            }

            // ============================================================================
            // 6.1 NW QUADRANT: EXACT 3-TIER BLACKSMITH RESIDENCE (from uploaded index.html)
            // ============================================================================
            function buildExactBlacksmithResidence() {
                const houseGroup = new THREE.Group();
                houseGroup.position.set(-15.5, 0, -15.5);
                houseGroup.rotation.y = Math.PI * 0.25;
                houseGroup.scale.setScalar(0.75);
                innerShopsGroup.add(houseGroup);
                shopInteriors.push({ id: 'blacksmith', label: 'Blacksmith', group: houseGroup });

                // 4.1 FOUNDATION & FLOORS
                addBox(houseGroup, 7.6, 0.5, 9.8, mats.flagstone, -5.8, 0.25, -0.6);
                addBox(houseGroup, 7.85, 0.26, 10.05, mats.stairBrick, -5.8, 0.13, -0.6);
                addBox(houseGroup, 7.8, 0.45, 0.35, mats.charredTimber, -5.8, 0.23, 4.2);
                addBox(houseGroup, 0.35, 0.45, 9.8, mats.charredTimber, -2.05, 0.23, -0.6);

                for (let q = 0; q < 6; q++) {
                    const qy = 0.72 + q * 0.56;
                    const qw = (q % 2 === 0) ? 0.68 : 0.48;
                    addBox(houseGroup, qw, 0.24, 0.68, mats.stairBrick, -9.42, qy, 4.05);
                    addBox(houseGroup, qw, 0.24, 0.68, mats.stairBrick, 8.42, qy, 1.92);
                    addBox(houseGroup, qw, 0.24, 0.68, mats.stairBrick, 8.42, qy, -5.32);
                }

                addBox(houseGroup, 10.8, 0.22, 2.2, mats.flagstone, 3.2, 0.11, 3.1);
                addBox(houseGroup, 11.0, 0.16, 0.24, mats.stairBrick, 3.2, 0.08, 4.22);
                for (let s = 0; s < 5; s++) {
                    const sx = -0.8 + s * 2.0;
                    addBox(houseGroup, 1.25, 0.1, 0.78, mats.stairBrick, sx, 0.23, 3.1);
                    addBox(houseGroup, 1.15, 0.05, 0.68, mats.sandstone, sx, 0.29, 3.1);
                }

                addBox(houseGroup, 10.8, 0.4, 7.6, mats.warmWood, 3.2, 0.2, -1.7);
                addBox(houseGroup, 11.05, 0.28, 7.85, mats.stairBrick, 3.2, 0.14, -1.7);
                addBox(houseGroup, 11.0, 0.45, 0.35, mats.charredTimber, 3.2, 0.22, 2.05);

                addBox(houseGroup, 7.3, 0.32, 4.8, mats.warmWood, -5.6, 4.2, -3.1);
                addBox(houseGroup, 10.6, 0.32, 7.4, mats.tatami, 3.1, 4.2, -1.8);
                addBox(houseGroup, 11.2, 0.28, 0.75, mats.charredTimber, 3.1, 4.2, 2.15);

                addBox(houseGroup, 10.6, 0.3, 7.2, mats.warmWood, 3.1, 7.9, -1.8);
                addBox(houseGroup, 11.0, 0.36, 0.55, mats.charredTimber, 3.1, 7.9, 1.95);

                // 4.1B STRUCTURAL SUPPORT SYSTEM FOR OPEN 1F UNDER ENCLOSED 2F/3F
                const structuralSupportGroup = new THREE.Group();
                houseGroup.add(structuralSupportGroup);

                function createCorbelBracket(x, y, z) {
                    const b = new THREE.Group();
                    b.position.set(x, y, z);
                    addBox(b, 0.58, 0.22, 0.58, mats.charredTimber, 0, 0, 0);
                    addBox(b, 0.62, 0.08, 0.62, mats.gold, 0, 0.14, 0);
                    addBox(b, 0.96, 0.24, 0.52, mats.warmWood, 0, 0.28, 0);
                    addBox(b, 0.24, 0.18, 0.54, mats.charredTimber, -0.32, 0.46, 0);
                    addBox(b, 0.24, 0.18, 0.54, mats.charredTimber, 0, 0.46, 0);
                    addBox(b, 0.24, 0.18, 0.54, mats.charredTimber, 0.32, 0.46, 0);
                    structuralSupportGroup.add(b);
                }

                addBox(structuralSupportGroup, 11.0, 0.48, 0.58, mats.charredTimber, 3.1, 3.92, 1.85);
                addBox(structuralSupportGroup, 11.05, 0.28, 0.62, mats.frieze, 3.1, 4.22, 1.85);
                for (let bx = -1.8; bx <= 7.8; bx += 2.4) {
                    addBox(structuralSupportGroup, 0.35, 0.42, 0.62, mats.gold, bx, 3.92, 1.85);
                }

                addBox(structuralSupportGroup, 7.5, 0.48, 0.58, mats.charredTimber, -5.75, 3.92, -0.75);
                addBox(structuralSupportGroup, 7.55, 0.26, 0.62, mats.frieze, -5.75, 4.22, -0.75);

                addBox(structuralSupportGroup, 7.6, 0.42, 0.48, mats.charredTimber, -5.75, 3.85, 4.1);
                addBox(structuralSupportGroup, 7.65, 0.24, 0.52, mats.frieze, -5.75, 4.12, 4.1);
                addBox(structuralSupportGroup, 0.48, 0.42, 5.0, mats.charredTimber, -2.1, 3.85, 1.65);
                for (let rx = -8.6; rx <= -2.8; rx += 1.45) {
                    addBox(structuralSupportGroup, 0.24, 0.28, 4.9, mats.darkWood, rx, 4.02, 1.65);
                }
                const forgeFrontVisor = new THREE.Group();
                forgeFrontVisor.position.set(-5.75, 4.35, 4.35);
                forgeFrontVisor.rotation.x = 0.38;
                addBox(forgeFrontVisor, 7.9, 0.16, 1.35, mats.charredTimber, 0, 0, 0);
                for (let tc = -3.7; tc <= 3.7; tc += 0.42) {
                    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.38, 8), mats.kawaraTile);
                    rib.rotation.x = Math.PI / 2;
                    rib.position.set(tc, 0.12, 0);
                    forgeFrontVisor.add(rib);
                }
                structuralSupportGroup.add(forgeFrontVisor);

                [[-9.2, 4.1], [-5.6, 4.1], [-2.1, 4.1], [-2.1, 1.85]].forEach(([x, z]) => {
                    const height = 3.65;
                    addBox(structuralSupportGroup, 0.68, 0.35, 0.68, mats.sandstone, x, 0.42, z);
                    addBox(structuralSupportGroup, 0.56, 0.1, 0.56, mats.gold, x, 0.62, z);
                    addBox(structuralSupportGroup, 0.46, height - 0.5, 0.46, mats.charredTimber, x, 0.65 + (height - 0.5) / 2, z);
                    addBox(structuralSupportGroup, 0.9, 0.18, 0.18, mats.warmWood, x - 0.35, height - 0.35, z, 0, 0, 0.65);
                    addBox(structuralSupportGroup, 0.9, 0.18, 0.18, mats.warmWood, x + 0.35, height - 0.35, z, 0, 0, -0.65);
                    createCorbelBracket(x, height - 0.2, z);
                });

                // 4.2 STRUCTURAL WALLS, EXTERIOR MASONRY & FRIEZES
                addBox(houseGroup, 0.55, 3.6, 9.6, mats.sandstone, -9.4, 2.2, -0.6);
                addBox(houseGroup, 0.62, 0.55, 9.7, mats.frieze, -9.4, 3.85, -0.6);
                addBox(houseGroup, 0.45, 3.6, 4.8, mats.darkWood, -9.4, 6.0, -3.1);
                addBox(houseGroup, 0.52, 0.48, 4.9, mats.frieze, -9.4, 7.65, -3.1);
                addBox(houseGroup, 0.42, 2.3, 3.2, mats.plaster, -9.4, 8.9, -3.1);
                addBox(houseGroup, 0.48, 2.3, 0.28, mats.charredTimber, -9.4, 8.9, -3.1);

                addBox(houseGroup, 7.2, 3.6, 0.35, mats.plaster, -5.7, 6.0, -0.85);
                addBox(houseGroup, 3.2, 1.25, 0.38, mats.shojiGlow, -6.2, 6.2, -0.85);
                addBox(houseGroup, 3.4, 1.4, 0.45, mats.charredTimber, -6.2, 6.2, -0.85);
                for (let s = -7.6; s <= -4.8; s += 0.25) {
                    addBox(houseGroup, 0.06, 1.3, 0.5, mats.warmWood, s, 6.2, -0.85);
                }
                for (let x = -8.2; x <= -3.5; x += 1.4) {
                    addBox(houseGroup, 0.16, 3.6, 0.42, mats.charredTimber, x, 6.0, -0.85);
                }
                addBox(houseGroup, 7.2, 2.2, 0.35, mats.plaster, -5.7, 8.9, -0.95);
                addBox(houseGroup, 7.3, 0.32, 0.45, mats.frieze, -5.7, 7.85, -0.85);

                addBox(houseGroup, 7.4, 4.0, 0.45, mats.sandstone, -5.7, 2.2, -5.4);
                addBox(houseGroup, 10.6, 4.0, 0.45, mats.plaster, 3.1, 2.2, -5.4);
                addBox(houseGroup, 18.0, 3.7, 0.4, mats.plaster, -0.6, 6.0, -5.4);
                addBox(houseGroup, 10.6, 3.4, 0.4, mats.plaster, 3.1, 9.6, -5.4);

                addBox(houseGroup, 0.35, 3.8, 1.8, mats.plaster, -2.1, 6.0, -4.5);
                addBox(houseGroup, 0.35, 3.8, 1.4, mats.plaster, -2.1, 6.0, -1.5);
                addBox(houseGroup, 0.38, 1.1, 1.6, mats.charredTimber, -2.1, 7.35, -2.9);
                addBox(houseGroup, 0.38, 3.5, 7.3, mats.plaster, -2.1, 9.6, -1.8);
                addBox(houseGroup, 0.44, 0.42, 7.4, mats.frieze, -2.1, 8.1, -1.8);
                addBox(houseGroup, 0.45, 1.35, 2.2, mats.shojiGlow, -2.1, 9.3, -1.8);

                addBox(houseGroup, 1.6, 3.7, 2.3, mats.sandstone, 7.8, 2.25, 0.95);
                addBox(houseGroup, 1.7, 0.5, 2.4, mats.frieze, 7.8, 3.95, 0.95);
                addBox(houseGroup, 0.55, 3.7, 2.5, mats.sandstone, 8.4, 2.25, -4.25);
                addBox(houseGroup, 0.62, 0.5, 2.6, mats.frieze, 8.4, 3.95, -4.25);
                addBox(houseGroup, 0.85, 0.75, 3.1, mats.sandstone, 8.4, 3.55, -1.75);
                addBox(houseGroup, 0.95, 0.5, 3.2, mats.frieze, 8.4, 3.95, -1.75);

                addBox(houseGroup, 0.4, 3.6, 7.4, mats.plaster, 8.4, 6.0, -1.8);
                addBox(houseGroup, 0.5, 0.48, 7.5, mats.frieze, 8.4, 7.6, -1.8);
                addBox(houseGroup, 0.48, 1.9, 2.8, mats.shojiGlow, 8.4, 5.8, -1.5);
                addBox(houseGroup, 0.4, 3.3, 7.2, mats.plaster, 8.4, 9.5, -1.8);
                addBox(houseGroup, 0.48, 1.2, 2.0, mats.shojiGlow, 8.4, 9.2, -1.8);

                [
                    [-9.4, 5.2, -5.4, 10.2],
                    [-9.4, 5.2, -0.8, 10.2],
                    [-2.1, 5.8, -0.8, 11.2],
                    [-2.1, 5.8, -5.4, 11.2],
                    [-2.1, 7.5, 1.85, 7.8],
                    [8.4, 5.8, 1.9, 11.2],
                    [8.4, 5.8, -5.4, 11.2]
                ].forEach(([x, y, z, h]) => {
                    addBox(houseGroup, 0.42, h, 0.42, mats.charredTimber, x, y, z);
                });

                // 4.2B ENCLOSED 2F & 3F FRONT FACADE
                const upperFrontFacadeGroup = new THREE.Group();
                houseGroup.add(upperFrontFacadeGroup);
                smithUpperFacadeGroup = upperFrontFacadeGroup;

                addBox(upperFrontFacadeGroup, 10.5, 1.05, 0.32, mats.darkWood, 3.15, 4.88, 1.85);
                addBox(upperFrontFacadeGroup, 10.6, 0.14, 0.38, mats.gold, 3.15, 5.42, 1.85);
                addBox(upperFrontFacadeGroup, 10.5, 0.72, 0.32, mats.plaster, 3.15, 7.38, 1.85);
                addBox(upperFrontFacadeGroup, 10.7, 0.42, 0.42, mats.frieze, 3.15, 7.78, 1.85);

                addBox(upperFrontFacadeGroup, 1.85, 1.65, 0.32, mats.plaster, -1.1, 6.22, 1.85);
                addBox(upperFrontFacadeGroup, 1.5, 1.65, 0.32, mats.plaster, 3.15, 6.22, 1.85);
                addBox(upperFrontFacadeGroup, 1.85, 1.65, 0.32, mats.plaster, 7.4, 6.22, 1.85);
                addBox(upperFrontFacadeGroup, 0.95, 1.68, 0.42, mats.cabinet, -1.45, 6.22, 1.9);
                addBox(upperFrontFacadeGroup, 0.95, 1.68, 0.42, mats.cabinet, 7.75, 6.22, 1.9);

                [-0.18, 2.4, 3.9, 6.48].forEach(px => {
                    addBox(upperFrontFacadeGroup, 0.22, 3.3, 0.38, mats.charredTimber, px, 6.05, 1.85);
                });
                addBox(upperFrontFacadeGroup, 10.6, 0.18, 0.4, mats.charredTimber, 3.15, 7.02, 1.85);

                const shojiLeft1 = addBox(upperFrontFacadeGroup, 1.32, 1.55, 0.1, mats.shojiGlow, 0.48, 6.22, 1.82);
                const shojiLeft2 = addBox(upperFrontFacadeGroup, 1.32, 1.55, 0.1, mats.shojiGlow, 1.74, 6.22, 1.88);
                const shojiRight1 = addBox(upperFrontFacadeGroup, 1.32, 1.55, 0.1, mats.shojiGlow, 4.55, 6.22, 1.82);
                const shojiRight2 = addBox(upperFrontFacadeGroup, 1.32, 1.55, 0.1, mats.shojiGlow, 5.82, 6.22, 1.88);
                allSlidingShoji.push(
                    { mesh: shojiLeft1, closedX: 0.48, openX: -0.35 },
                    { mesh: shojiLeft2, closedX: 1.74, openX: 2.55 },
                    { mesh: shojiRight1, closedX: 4.55, openX: 3.72 },
                    { mesh: shojiRight2, closedX: 5.82, openX: 6.65 }
                );
                for (let kx = 4.05; kx <= 6.35; kx += 0.23) {
                    addBox(upperFrontFacadeGroup, 0.05, 1.55, 0.06, mats.warmWood, kx, 6.22, 2.02);
                }

                addBox(upperFrontFacadeGroup, 11.0, 0.12, 0.16, mats.charredTimber, 3.15, 5.05, 2.42);
                addBox(upperFrontFacadeGroup, 11.0, 0.08, 0.12, mats.gold, 3.15, 4.72, 2.42);
                for (let rx = -2.1; rx <= 8.4; rx += 0.75) {
                    addBox(upperFrontFacadeGroup, 0.12, 0.75, 0.12, mats.charredTimber, rx, 4.68, 2.42);
                }

                const midEave = new THREE.Group();
                midEave.position.set(3.15, 7.82, 2.38);
                midEave.rotation.x = 0.35;
                addBox(midEave, 11.4, 0.14, 1.05, mats.charredTimber, 0, 0, 0);
                for (let tc = -5.4; tc <= 5.4; tc += (lowDetail ? 1.2 : 0.84)) {
                    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.08, 8), mats.kawaraTile);
                    rib.rotation.x = Math.PI / 2;
                    rib.position.set(tc, 0.1, 0);
                    midEave.add(rib);
                }
                upperFrontFacadeGroup.add(midEave);

                addBox(upperFrontFacadeGroup, 10.5, 0.75, 0.3, mats.darkWood, 3.15, 8.42, 1.8);
                addBox(upperFrontFacadeGroup, 2.8, 1.45, 0.3, mats.plaster, -0.7, 9.35, 1.8);
                addBox(upperFrontFacadeGroup, 2.2, 1.45, 0.3, mats.plaster, 3.15, 9.35, 1.8);
                addBox(upperFrontFacadeGroup, 2.8, 1.45, 0.3, mats.plaster, 7.0, 9.35, 1.8);
                addBox(upperFrontFacadeGroup, 10.6, 0.22, 0.36, mats.charredTimber, 3.15, 10.0, 1.8);

                const shojiAtticL = addBox(upperFrontFacadeGroup, 1.8, 1.15, 0.1, mats.shojiGlow, 1.35, 9.35, 1.78);
                const shojiAtticR = addBox(upperFrontFacadeGroup, 1.8, 1.15, 0.1, mats.shojiGlow, 4.95, 9.35, 1.78);
                allSlidingShoji.push(
                    { mesh: shojiAtticL, closedX: 1.35, openX: 2.35 },
                    { mesh: shojiAtticR, closedX: 4.95, openX: 3.95 }
                );

                // 4.3 EGYPTIAN LOTUS COLUMNS & GENKAN ENTRANCE
                function createLotusColumn(x, y, z, height = 3.65) {
                    const col = new THREE.Group();
                    col.position.set(x, y, z);
                    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.25, 20), mats.flagstone);
                    plinth.position.y = 0.125;
                    col.add(plinth);
                    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.36, height - 0.8, 20), mats.column);
                    shaft.position.y = (height - 0.8) / 2 + 0.25;
                    shaft.castShadow = true;
                    shaft.receiveShadow = true;
                    col.add(shaft);
                    for (let r = 0; r < 3; r++) {
                        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 10, 24), mats.gold);
                        ring.rotation.x = Math.PI / 2;
                        ring.position.y = height - 0.65 + r * 0.07;
                        col.add(ring);
                    }
                    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.3, 0.48, 20), mats.turquoise);
                    cap.position.y = height - 0.3;
                    col.add(cap);
                    addBox(col, 0.85, 0.16, 0.85, mats.gold, 0, height - 0.04, 0);
                    houseGroup.add(col);
                }
                createLotusColumn(-0.8, 0.4, 1.85, 3.52);
                createLotusColumn(3.15, 0.4, 1.85, 3.52);
                createLotusColumn(6.6, 0.4, 1.85, 3.52);
                createLotusColumn(8.85, 0.4, -0.35, 3.5);
                createLotusColumn(8.85, 0.4, -3.15, 3.5);

                // Brick & Chiseled Stone Entrance Stairs
                for (let st = 0; st < 4; st++) {
                    const stepDepth = 1.95 - st * 0.38;
                    const stepHeight = 0.22;
                    const stepCenterX = 9.48 + st * 0.21;
                    const stepY = 0.11 + (3 - st) * 0.21;
                    addBox(houseGroup, stepDepth, stepHeight, 2.86, mats.stairBrick, stepCenterX, stepY, -1.75);
                    const treadCount = 5;
                    const treadWidth = 2.76 / treadCount;
                    for (let t = 0; t < treadCount; t++) {
                        const tz = -3.12 + (t + 0.5) * treadWidth;
                        addBox(houseGroup, stepDepth + 0.08, 0.06, treadWidth - 0.035, mats.sandstone, stepCenterX + 0.02, stepY + stepHeight * 0.5 + 0.025, tz);
                    }
                }
                for (let side = -1; side <= 1; side += 2) {
                    const cz = -1.75 + side * 1.52;
                    addBox(houseGroup, 2.25, 0.45, 0.26, mats.stairBrick, 9.52, 0.23, cz);
                    addBox(houseGroup, 1.45, 0.42, 0.26, mats.stairBrick, 9.15, 0.62, cz);
                    addBox(houseGroup, 2.32, 0.08, 0.32, mats.sandstone, 9.52, 0.48, cz);
                    addBox(houseGroup, 1.52, 0.08, 0.32, mats.sandstone, 9.15, 0.86, cz);
                    addBox(houseGroup, 0.34, 0.68, 0.34, mats.sandstone, 10.48, 0.34, cz);
                    addBox(houseGroup, 0.38, 0.12, 0.38, mats.frieze, 10.48, 0.68, cz);
                    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mats.gold);
                    finial.position.set(10.48, 0.82, cz);
                    houseGroup.add(finial);
                }

                // Genkan Doors
                const genkanDoorLeft = new THREE.Group();
                genkanDoorLeft.position.set(8.42, 1.85, -1.18);
                addBox(genkanDoorLeft, 0.1, 2.75, 1.18, mats.charredTimber, 0, 0, 0);
                addBox(genkanDoorLeft, 0.12, 1.45, 0.95, mats.shojiGlow, 0, 0.45, 0);
                addBox(genkanDoorLeft, 0.13, 0.85, 0.95, mats.cabinet, 0, -0.8, 0);
                houseGroup.add(genkanDoorLeft);

                const genkanDoorRight = new THREE.Group();
                genkanDoorRight.position.set(8.36, 1.85, -2.32);
                addBox(genkanDoorRight, 0.1, 2.75, 1.18, mats.charredTimber, 0, 0, 0);
                addBox(genkanDoorRight, 0.12, 1.45, 0.95, mats.shojiGlow, 0, 0.45, 0);
                addBox(genkanDoorRight, 0.13, 0.85, 0.95, mats.cabinet, 0, -0.8, 0);
                houseGroup.add(genkanDoorRight);

                allSlidingDoors.push(
                    { mesh: genkanDoorLeft, axis: 'z', closed: -1.18, open: -0.35 },
                    { mesh: genkanDoorRight, axis: 'z', closed: -2.32, open: -3.15 }
                );

                // 5. ROOM INTERIORS (Forge, Kitchen, 2F Study, 2F Tatami Hall, 3F Attic Sanctuary)
                function createKatana(length = 1.25, isKhopesh = false) {
                    const sword = new THREE.Group();
                    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), mats.crimsonSilk);
                    hilt.rotation.z = Math.PI / 2;
                    hilt.position.x = -length * 0.38;
                    sword.add(hilt);
                    const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02, 12), mats.gold);
                    tsuba.rotation.z = Math.PI / 2;
                    tsuba.position.x = -length * 0.22;
                    sword.add(tsuba);
                    if (!isKhopesh) {
                        const blade = new THREE.Mesh(new THREE.BoxGeometry(length * 0.78, 0.04, 0.012), mats.steelBlade);
                        blade.position.x = length * 0.18;
                        sword.add(blade);
                    } else {
                        const b1 = new THREE.Mesh(new THREE.BoxGeometry(length * 0.35, 0.045, 0.015), mats.gold);
                        b1.position.x = -0.02;
                        sword.add(b1);
                        const sickle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.022, 8, 18, Math.PI * 1.15), mats.steelBlade);
                        sickle.position.set(0.28, 0.12, 0);
                        sword.add(sickle);
                    }
                    return sword;
                }

                function createWallSwordRack(parent, x, y, z, rotY = 0, count = 4) {
                    const rack = new THREE.Group();
                    rack.position.set(x, y, z);
                    rack.rotation.y = rotY;
                    addBox(rack, 1.5, 1.35, 0.06, mats.warmWood, 0, 0, -0.06);
                    addBox(rack, 0.08, 1.4, 0.14, mats.charredTimber, -0.55, 0, 0);
                    addBox(rack, 0.08, 1.4, 0.14, mats.charredTimber, 0.55, 0, 0);
                    for (let i = 0; i < count; i++) {
                        const wp = createKatana(1.2, i === 1);
                        wp.position.set(0, -0.45 + i * 0.3, 0.06);
                        rack.add(wp);
                    }
                    parent.add(rack);
                }

                // 1F Open Forge Workshop
                addBox(houseGroup, 2.75, 1.28, 2.35, mats.stairBrick, -4.3, 0.9, -4.1);
                addBox(houseGroup, 2.88, 0.12, 2.48, mats.sandstone, -4.3, 1.52, -4.1);
                addBox(houseGroup, 2.2, 0.85, 1.8, mats.charredTimber, -4.3, 1.35, -4.0);
                const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.55, 1.85, 4), mats.darkIron);
                hood.rotation.y = Math.PI / 4;
                hood.position.set(-4.3, 2.85, -4.1);
                houseGroup.add(hood);

                const emberBed = new THREE.Mesh(new THREE.SphereGeometry(0.68, 16, 12), mats.emberMat);
                emberBed.scale.set(1.2, 0.45, 0.9);
                emberBed.position.set(-4.3, 1.42, -3.95);
                houseGroup.add(emberBed);

                for (let i = 0; i < 16; i++) {
                    const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05, 0), mats.emberMat);
                    p.position.set(-4.3 + (Math.random() - 0.5) * 1.1, 1.45 + Math.random() * 0.9, -3.9 + (Math.random() - 0.5) * 0.8);
                    p.userData = { baseX: p.position.x, speed: 0.6 + Math.random() * 1.2, phase: Math.random() * Math.PI * 2 };
                    houseGroup.add(p);
                    allEmberParticles.push(p);
                }

                const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.72, 16), mats.darkWood);
                stump.position.set(-4.8, 0.86, -1.7);
                houseGroup.add(stump);
                addBox(houseGroup, 0.85, 0.28, 0.36, mats.darkIron, -4.8, 1.36, -1.7);
                const anvilHorn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 12), mats.darkIron);
                anvilHorn.rotation.z = Math.PI / 2;
                anvilHorn.position.set(-5.42, 1.38, -1.7);
                houseGroup.add(anvilHorn);

                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.82, 16), mats.warmWood);
                barrel.position.set(-6.2, 0.9, -2.3);
                houseGroup.add(barrel);
                addBox(houseGroup, 1.8, 0.85, 0.75, mats.cabinet, -2.8, 0.92, -1.8);

                createWallSwordRack(houseGroup, -9.05, 2.35, -2.2, Math.PI / 2, 5);
                createWallSwordRack(houseGroup, -2.35, 2.35, -3.5, -Math.PI / 2, 4);

                for (let s = 0; s < 5; s++) {
                    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 2.5, 8), mats.warmWood);
                    pole.position.set(-8.85, 1.75, 0.2 + s * 0.35);
                    houseGroup.add(pole);
                    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 6), mats.steelBlade);
                    tip.position.set(-8.85, 3.1, 0.2 + s * 0.35);
                    houseGroup.add(tip);
                }

                // Exterior Freestanding Katana Display Racks
                [[-10.1, 0.2, 2.3, 0.35], [7.8, 0.2, 2.55, -0.35]].forEach(([sx, sy, sz, ry]) => {
                    const st = new THREE.Group();
                    st.position.set(sx, sy, sz);
                    st.rotation.y = ry;
                    addBox(st, 0.1, 1.25, 0.6, mats.charredTimber, -0.55, 0.62, 0);
                    addBox(st, 0.1, 1.25, 0.6, mats.charredTimber, 0.55, 0.62, 0);
                    for (let i = 0; i < 3; i++) {
                        const k = createKatana(1.25, i === 2);
                        k.position.set(0, 0.35 + i * 0.34, 0);
                        st.add(k);
                    }
                    houseGroup.add(st);
                });

                // 1F Lotus Kitchen & Kaidan-Dansu Stairs
                addBox(houseGroup, 5.4, 0.95, 0.9, mats.cabinet, 2.3, 0.88, -4.65);
                addBox(houseGroup, 5.5, 0.08, 0.96, mats.charredTimber, 2.3, 1.38, -4.65);
                addBox(houseGroup, 0.9, 0.95, 3.6, mats.cabinet, -0.1, 0.88, -2.8);
                addBox(houseGroup, 0.96, 0.08, 3.7, mats.charredTimber, -0.1, 1.38, -2.8);
                addBox(houseGroup, 1.25, 0.98, 0.95, mats.darkIron, 4.3, 0.9, -4.62);
                addBox(houseGroup, 4.6, 0.85, 0.55, mats.cabinet, 2.6, 2.95, -4.85);
                for (let s = 0; s < 8; s++) {
                    const stepH = 0.46;
                    addBox(houseGroup, 0.95, stepH * (s + 1), 0.42, mats.cabinet, 6.55, 0.4 + (stepH * (s + 1)) / 2, -1.65 - s * 0.42);
                }

                // 2F Crafting Study & 2F Tatami Hall
                addBox(houseGroup, 1.9, 0.75, 1.35, mats.cabinet, -5.2, 4.72, -2.8);
                addBox(houseGroup, 2.1, 0.1, 1.55, mats.warmWood, -5.2, 5.12, -2.8);
                addBox(houseGroup, 4.2, 2.1, 0.12, mats.shojiGlow, 4.5, 5.95, -5.12);
                addBox(houseGroup, 1.65, 0.1, 1.15, mats.charredTimber, 4.2, 4.72, -2.4);

                // 3F Sanctuary Loft Bedroom
                addBox(houseGroup, 3.2, 0.35, 2.4, mats.charredTimber, 5.6, 8.22, -3.1);
                addBox(houseGroup, 2.95, 0.28, 2.2, mats.crimsonSilk, 5.6, 8.52, -3.1);
                addBox(houseGroup, 1.8, 0.32, 2.25, mats.frieze, 5.1, 8.54, -3.1);

                // 3-Tier Kawara Roofs
                const roofGroup = new THREE.Group();
                houseGroup.add(roofGroup);
                roofGroup.add(createTiledRoofSlope(11.6, 5.2, 0.46, 3.1, 10.65, 0.35, true));
                roofGroup.add(createTiledRoofSlope(11.6, 5.2, 0.46, 3.1, 10.65, -3.95, false));
                const mainRidge = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 11.8, 12), mats.kawaraTile);
                mainRidge.rotation.z = Math.PI / 2;
                mainRidge.position.set(3.1, 11.82, -1.8);
                roofGroup.add(mainRidge);
                addBox(roofGroup, 0.35, 0.55, 0.45, mats.gold, -2.75, 12.0, -1.8);
                addBox(roofGroup, 0.35, 0.55, 0.45, mats.gold, 8.95, 12.0, -1.8);

                roofGroup.add(createTiledRoofSlope(7.6, 3.6, 0.48, -5.7, 9.2, -1.65, true));
                roofGroup.add(createTiledRoofSlope(7.6, 3.6, 0.48, -5.7, 9.2, -4.55, false));
                const leftRidge = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 7.8, 12), mats.kawaraTile);
                leftRidge.rotation.z = Math.PI / 2;
                leftRidge.position.set(-5.7, 10.05, -3.1);
                roofGroup.add(leftRidge);

                const leftLowerEave = createTiledRoofSlope(1.4, 9.8, 0.0, -10.0, 4.15, -0.6, true);
                leftLowerEave.rotation.z = 0.38;
                roofGroup.add(leftLowerEave);
                const leftUpperEave = createTiledRoofSlope(1.3, 5.2, 0.0, -10.0, 7.85, -3.1, true);
                leftUpperEave.rotation.z = 0.38;
                roofGroup.add(leftUpperEave);
                const rightDoorEave = createTiledRoofSlope(1.6, 6.8, 0.0, 9.15, 4.15, -1.7, true);
                rightDoorEave.rotation.z = -0.38;
                roofGroup.add(rightDoorEave);
                allRoofs.push(roofGroup);

                createChochinLantern(houseGroup, -10.35, 3.25, 3.6);
                createChochinLantern(houseGroup, -8.55, 3.25, 4.45);
                createChochinLantern(houseGroup, -10.35, 6.95, -1.2);
                createChochinLantern(houseGroup, 9.45, 3.25, 0.85);
                createChochinLantern(houseGroup, 9.45, 3.25, -4.1);
                createIvyCluster(houseGroup, -9.65, 0.4, 3.2, 3.1);
                createIvyCluster(houseGroup, 9.1, 0.4, -4.4, 3.1);

                smithForgeFireLight = new THREE.PointLight(0xff5e1a, 2.8, 14);
                smithForgeFireLight.position.set(-4.3, 1.85, -3.4);
                houseGroup.add(smithForgeFireLight);
            }
            buildExactBlacksmithResidence();

            // ============================================================================
            // 6.2 NE QUADRANT: EXACT CLOTHING & SILK ATELIER (from uploaded clothing_shop.html)
            // ============================================================================
            function buildExactClothingShop() {
                const shopGroup = new THREE.Group();
                shopGroup.position.set(15.5, 0, -15.5);
                shopGroup.rotation.y = -Math.PI * 0.25;
                shopGroup.scale.setScalar(0.75);
                innerShopsGroup.add(shopGroup);
                shopInteriors.push({ id: 'tailor', label: 'Tailor Atelier', group: shopGroup });

                buildSingleStoryLShopShell(
                    shopGroup,
                    mats.turquoise,
                    mats.norenClothMat,
                    new THREE.SphereGeometry(0.13, 12, 10),
                    mats.gold
                );

                function createKimonoStand(parent, x, y, z, rotY, mainFabricMat, obiMat) {
                    const stand = new THREE.Group();
                    stand.position.set(x, y, z);
                    stand.rotation.y = rotY;
                    addBox(stand, 0.55, 0.08, 0.18, mats.charredTimber, -0.82, 0.04, 0, 0, Math.PI / 2, 0);
                    addBox(stand, 0.55, 0.08, 0.18, mats.charredTimber, 0.82, 0.04, 0, 0, Math.PI / 2, 0);
                    addBox(stand, 0.07, 2.15, 0.07, mats.lacquerRed, -0.82, 1.1, 0);
                    addBox(stand, 0.07, 2.15, 0.07, mats.lacquerRed, 0.82, 1.1, 0);
                    addBox(stand, 2.15, 0.08, 0.08, mats.lacquerRed, 0, 2.15, 0);
                    addBox(stand, 0.14, 0.1, 0.1, mats.gold, -1.06, 2.15, 0);
                    addBox(stand, 0.14, 0.1, 0.1, mats.gold, 1.06, 2.15, 0);

                    const garmentPivot = new THREE.Group();
                    garmentPivot.position.set(0, 2.12, 0);
                    stand.add(garmentPivot);
                    addBox(garmentPivot, 0.78, 1.78, 0.12, mainFabricMat, 0, -0.92, 0);
                    addBox(garmentPivot, 0.56, 1.18, 0.08, mainFabricMat, -0.68, -0.62, 0);
                    addBox(garmentPivot, 0.56, 1.18, 0.08, mainFabricMat, 0.68, -0.62, 0);
                    addBox(garmentPivot, 0.84, 0.34, 0.16, obiMat, 0, -0.82, 0);
                    addBox(garmentPivot, 0.84, 0.1, 0.16, mats.gold, 0, -1.78, 0);
                    allSwayingSilks.push({ mesh: garmentPivot, phase: Math.random() * Math.PI * 2, amp: 0.025 });
                    parent.add(stand);
                }

                function createTailorMannequin(parent, x, y, z, rotY, coatMat, sashMat) {
                    const m = new THREE.Group();
                    m.position.set(x, y, z);
                    m.rotation.y = rotY;
                    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.78, 18), mats.silkLinen);
                    skirt.position.y = 0.72;
                    m.add(skirt);
                    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.21, 0.65, 16), coatMat);
                    torso.position.y = 1.38;
                    m.add(torso);
                    const neckCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.29, 0.14, 18), mats.frieze);
                    neckCollar.position.y = 1.68;
                    m.add(neckCollar);
                    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.18, 16), sashMat);
                    belt.position.y = 1.06;
                    m.add(belt);
                    parent.add(m);
                }

                // Zone 1: Left Wing Takahata Floor Loom, 3 Dye Vats & Overhead Silk Banners
                const loom = new THREE.Group();
                loom.position.set(-5.8, 0.46, -2.5);
                loom.rotation.y = 0.25;
                addBox(loom, 1.85, 0.14, 2.3, mats.charredTimber, 0, 0.07, 0);
                addBox(loom, 0.14, 1.85, 0.14, mats.charredTimber, -0.85, 0.95, -0.95);
                addBox(loom, 0.14, 1.85, 0.14, mats.charredTimber, 0.85, 0.95, -0.95);
                addBox(loom, 0.14, 1.45, 0.14, mats.charredTimber, -0.85, 0.75, 0.95);
                addBox(loom, 0.14, 1.45, 0.14, mats.charredTimber, 0.85, 0.75, 0.95);
                addBox(loom, 1.95, 0.14, 0.14, mats.warmWood, 0, 1.82, -0.95);
                addBox(loom, 1.48, 0.02, 1.78, mats.silkTurquoise, 0, 0.8, 0, 0.13, 0, 0);
                addBox(loom, 1.56, 0.55, 0.05, mats.gold, 0, 1.15, -0.15);
                shopGroup.add(loom);

                const vatColors = [mats.indigoVatLiquid, mats.silkCrimson, mats.saffronVatLiquid];
                for (let v = 0; v < 3; v++) {
                    const vx = -7.8 + v * 1.45;
                    const vz = 1.55;
                    const vatOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.48, 0.72, 20), mats.stairBrick);
                    vatOuter.position.set(vx, 0.82, vz);
                    shopGroup.add(vatOuter);
                    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 18), vatColors[v]);
                    liquid.position.set(vx, 1.12, vz);
                    shopGroup.add(liquid);
                }

                for (let b = 0; b < 4; b++) {
                    const bx = -8.1 + b * 1.15;
                    const silkPivot = new THREE.Group();
                    silkPivot.position.set(bx, 3.52, 1.55);
                    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.95, 0.85), fabricPalette[b % fabricPalette.length]);
                    banner.position.y = -0.98;
                    silkPivot.add(banner);
                    shopGroup.add(silkPivot);
                    allSwayingSilks.push({ mesh: silkPivot, phase: b * 0.9, amp: 0.055 });
                }

                // Zone 2: Main Showroom Gallery, Bolt Wall, 3 Ikō Kimono Racks & Tailor Counter
                const boltShelf = new THREE.Group();
                boltShelf.position.set(1.8, 2.35, -4.95);
                addBox(boltShelf, 6.4, 3.2, 0.55, mats.cabinet, 0, 0, 0);
                for (let row = -2; row <= 2; row++) {
                    addBox(boltShelf, 6.2, 0.06, 0.56, mats.warmWood, 0, row * 0.58, 0.02);
                    for (let col = -5; col <= 5; col += 2) {
                        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.48, 12), fabricPalette[Math.abs(row + col) % fabricPalette.length]);
                        bolt.rotation.x = Math.PI / 2;
                        bolt.position.set(col * 0.48, row * 0.58 + 0.16, 0.08);
                        boltShelf.add(bolt);
                    }
                }
                shopGroup.add(boltShelf);

                createKimonoStand(shopGroup, 0.4, 0.58, -2.2, 0.25, mats.silkCrimson, mats.silkGold);
                createKimonoStand(shopGroup, 3.2, 0.58, -2.5, 0.0, mats.silkTurquoise, mats.silkCrimson);
                createKimonoStand(shopGroup, 1.6, 0.58, 0.45, -0.18, mats.silkIndigo, mats.silkGold);
                createTailorMannequin(shopGroup, -0.1, 0.58, 0.95, 0.35, mats.silkGold, mats.silkTurquoise);
                createTailorMannequin(shopGroup, 4.4, 0.58, 0.95, -0.35, mats.silkCrimson, mats.silkGold);

                addBox(shopGroup, 1.15, 0.82, 2.85, mats.cabinet, -0.85, 0.99, -1.65);
                addBox(shopGroup, 0.84, 0.025, 1.35, mats.silkCrimson, -0.85, 1.48, -1.77);

                // Zone 3: VIP Fitting Sanctuary, Operable Shoji Partition, Byobu Screen & Bronze Mirror
                addBox(shopGroup, 2.9, 0.16, 3.8, mats.charredTimber, 6.5, 0.64, -3.1);
                addBox(shopGroup, 2.75, 0.06, 3.65, mats.tatami, 6.5, 0.74, -3.1);
                const fittingShojiDoor = new THREE.Group();
                fittingShojiDoor.position.set(5.05, 2.15, -2.1);
                addBox(fittingShojiDoor, 0.09, 2.75, 1.85, mats.charredTimber, 0, 0, 0);
                addBox(fittingShojiDoor, 0.11, 1.85, 1.65, mats.shojiGlow, 0, 0.32, 0);
                shopGroup.add(fittingShojiDoor);
                allSlidingDoors.push({ mesh: fittingShojiDoor, axis: 'z', closed: -2.1, open: -3.75 });

                addBox(shopGroup, 0.76, 1.85, 0.08, mats.gold, 7.25, 1.8, -3.2, 0, -0.55, 0);
                addBox(shopGroup, 0.64, 1.68, 0.1, mats.bronzeMirror, 7.25, 1.8, -3.19, 0, -0.55, 0);

                const galleryLight = new THREE.PointLight(0xffc978, 2.0, 12);
                galleryLight.position.set(2.2, 3.7, -1.6);
                shopGroup.add(galleryLight);
            }
            buildExactClothingShop();

            // ============================================================================
            // 6.3 SE QUADRANT: EXACT GEM AUGMENT & SPELLBOOK SANCTUM (from augment_shop.html)
            // ============================================================================
            function buildExactAugmentShop() {
                const shopGroup = new THREE.Group();
                shopGroup.position.set(15.5, 0, 15.5);
                shopGroup.rotation.y = -Math.PI * 0.75;
                shopGroup.scale.setScalar(0.75);
                innerShopsGroup.add(shopGroup);
                shopInteriors.push({ id: 'potion', label: 'Potion Apothecary', group: shopGroup });

                buildSingleStoryLShopShell(
                    shopGroup,
                    mats.obsidian,
                    mats.norenAugmentMat,
                    new THREE.OctahedronGeometry(0.16, 0),
                    mats.gemVoid
                );

                function createCrystalCluster(parent, x, y, z, scale = 1.0, gemMat = mats.gemVoid) {
                    const cluster = new THREE.Group();
                    cluster.position.set(x, y, z);
                    cluster.scale.setScalar(scale);
                    const rockBase = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), mats.obsidian);
                    rockBase.scale.set(1.2, 0.55, 1.1);
                    cluster.add(rockBase);
                    [
                        [0, 0.45, 0, 0.18, 0.9, 0.05, 0.05],
                        [-0.22, 0.35, 0.12, 0.13, 0.68, 0.2, 0.35],
                        [0.24, 0.38, -0.1, 0.14, 0.74, -0.18, -0.32],
                        [0.08, 0.3, 0.24, 0.11, 0.55, 0.38, -0.1]
                    ].forEach(([sx, sy, sz, rad, h, rx, rz]) => {
                        const shard = new THREE.Mesh(new THREE.CylinderGeometry(0.02, rad, h, 6), gemMat);
                        shard.position.set(sx, sy, sz);
                        shard.rotation.set(rx, Math.random() * Math.PI, rz);
                        cluster.add(shard);
                    });
                    parent.add(cluster);
                }

                // Zone 1: Left Wing Gem-Cutting Lapidary & Raw Crystal Geode Clusters
                const grinderTable = new THREE.Group();
                grinderTable.position.set(-5.8, 0.46, -1.8);
                addBox(grinderTable, 2.4, 0.85, 1.35, mats.cabinet, 0, 0.425, 0);
                addBox(grinderTable, 2.55, 0.08, 1.48, mats.charredTimber, 0, 0.88, 0);
                for (let w = -1; w <= 1; w += 2) {
                    const wx = w * 0.58;
                    addBox(grinderTable, 0.42, 0.22, 0.65, mats.obsidian, wx, 0.96, 0);
                    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 24), mats.gold);
                    wheel.rotation.z = Math.PI / 2;
                    wheel.position.set(wx, 1.12, 0);
                    grinderTable.add(wheel);
                    allLapidaryWheels.push(wheel);
                }
                shopGroup.add(grinderTable);

                createCrystalCluster(shopGroup, -8.1, 0.55, -3.8, 1.45, mats.gemVoid);
                createCrystalCluster(shopGroup, -3.5, 0.55, -4.1, 1.25, mats.gemFrost);
                createCrystalCluster(shopGroup, -8.2, 0.55, 2.4, 1.3, mats.gemSolar);
                createCrystalCluster(shopGroup, -3.3, 0.55, 2.6, 1.15, mats.gemJade);

                // Zone 2: Octagonal Ability-Infusion Matrix & Levitating Grimoire Lecterns
                const altar = new THREE.Group();
                altar.position.set(2.1, 0.58, -1.65);
                const altarBase = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.55, 0.36, 8), mats.obsidian);
                altarBase.position.y = 0.18;
                altar.add(altarBase);
                const altarMid = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.52, 8), mats.frieze);
                altarMid.position.y = 0.62;
                altar.add(altarMid);
                const altarTop = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.0, 0.14, 8), mats.gold);
                altarTop.position.y = 0.95;
                altar.add(altarTop);

                augmentFloorRune = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8), mats.magicCircle);
                augmentFloorRune.rotation.x = -Math.PI / 2;
                augmentFloorRune.position.y = 0.03;
                altar.add(augmentFloorRune);

                augmentTopRune = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), mats.magicCircle);
                augmentTopRune.rotation.x = -Math.PI / 2;
                augmentTopRune.position.y = 1.04;
                altar.add(augmentTopRune);

                augmentCoreAssembly = new THREE.Group();
                augmentCoreAssembly.position.set(0, 2.05, 0);
                altar.add(augmentCoreAssembly);

                augmentMasterGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), mats.gemVoid);
                augmentMasterGem.scale.set(1, 1.45, 1);
                augmentCoreAssembly.add(augmentMasterGem);

                augmentRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.025, 12, 36), mats.gold);
                augmentRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.02, 12, 36), mats.gold);
                augmentCoreAssembly.add(augmentRing1);
                augmentCoreAssembly.add(augmentRing2);

                for (let i = 0; i < 5; i++) {
                    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), gemPalette[i]);
                    augmentCoreAssembly.add(orb);
                    augmentOrbitingGems.push({ mesh: orb, index: i });
                }
                shopGroup.add(altar);

                // Back-Wall Grimoire Archive & 3 Spellbook Lecterns
                const bookcase = new THREE.Group();
                bookcase.position.set(1.8, 2.35, -4.95);
                addBox(bookcase, 6.4, 3.2, 0.55, mats.cabinet, 0, 0, 0);
                for (let row = -2; row <= 2; row++) {
                    addBox(bookcase, 6.2, 0.06, 0.56, mats.warmWood, 0, row * 0.58, 0.02);
                    for (let col = -5; col <= 5; col += 2) {
                        addBox(bookcase, 0.14, 0.42, 0.36, mats.obsidian, col * 0.48, row * 0.58 + 0.24, 0.06);
                    }
                }
                shopGroup.add(bookcase);

                [[-0.55, -0.35, 0.45, mats.gemSolar], [-0.55, -2.85, 0.85, mats.gemFrost], [4.35, -0.35, -0.45, mats.gemCrimson]].forEach(([lx, lz, ry, gMat]) => {
                    const lec = new THREE.Group();
                    lec.position.set(lx, 0.58, lz);
                    lec.rotation.y = ry;
                    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 1.05, 8), mats.charredTimber);
                    ped.position.y = 0.525;
                    lec.add(ped);
                    addBox(lec, 0.72, 0.06, 0.55, mats.gold, 0, 1.08, 0, 0.32, 0, 0);

                    const book = new THREE.Group();
                    book.position.set(0, 1.24, 0);
                    addBox(book, 0.32, 0.035, 0.44, mats.spellPage, -0.16, 0.025, 0, 0, 0, 0.22);
                    addBox(book, 0.32, 0.035, 0.44, mats.spellPage, 0.16, 0.025, 0, 0, 0, -0.22);
                    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), gMat);
                    gem.position.set(0, 0.22, 0);
                    book.add(gem);
                    allFloatingCrystals.push({ mesh: gem, baseY: 0.22, phase: Math.random() * Math.PI * 2 });
                    allFloatingSpellbooks.push({ mesh: book, baseY: 1.24, phase: Math.random() * Math.PI * 2 });
                    lec.add(book);
                    shopGroup.add(lec);
                });

                // Zone 3: Forbidden Relic Socket Vault
                addBox(shopGroup, 2.9, 0.16, 3.8, mats.obsidian, 6.5, 0.64, -3.1);
                const vaultShojiDoor = new THREE.Group();
                vaultShojiDoor.position.set(5.05, 2.15, -2.1);
                addBox(vaultShojiDoor, 0.09, 2.75, 1.85, mats.charredTimber, 0, 0, 0);
                addBox(vaultShojiDoor, 0.11, 1.85, 1.65, mats.shojiGlow, 0, 0.32, 0);
                shopGroup.add(vaultShojiDoor);
                allSlidingDoors.push({ mesh: vaultShojiDoor, axis: 'z', closed: -2.1, open: -3.75 });

                for (let p = 0; p < 3; p++) {
                    const pz = -4.3 + p * 1.15;
                    addBox(shopGroup, 0.55, 1.1, 0.55, mats.obsidian, 6.85, 1.32, pz);
                    const relicGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), gemPalette[(p + 1) % gemPalette.length]);
                    relicGem.position.set(6.85, 2.28, pz);
                    shopGroup.add(relicGem);
                    allFloatingCrystals.push({ mesh: relicGem, baseY: 2.28, phase: p * 1.3 });
                }

                const matrixLight = new THREE.PointLight(0xc084fc, 2.6, 13.0);
                matrixLight.position.set(2.1, 3.1, -1.65);
                shopGroup.add(matrixLight);
            }
            buildExactAugmentShop();

            // ============================================================================
            // 6.4 SW QUADRANT: EXACT MOUNT & BARDING STABLES (from uploaded mount_shop.html)
            // ============================================================================
            function buildExactMountShop() {
                const shopGroup = new THREE.Group();
                shopGroup.position.set(-15.5, 0, 15.5);
                shopGroup.rotation.y = Math.PI * 0.75;
                shopGroup.scale.setScalar(0.75);
                innerShopsGroup.add(shopGroup);
                shopInteriors.push({ id: 'models', label: 'Model Showroom', group: shopGroup });

                buildSingleStoryLShopShell(
                    shopGroup,
                    mats.emeraldArmor,
                    mats.norenMountMat,
                    new THREE.SphereGeometry(0.13, 12, 10),
                    mats.gold
                );

                function createSacredMount(parent, x, y, z, rotY, coatMat, armorMat, hasKirinAntlers = true, hasSaddle = true) {
                    const mount = new THREE.Group();
                    mount.position.set(x, y, z);
                    mount.rotation.y = rotY;
                    [[-0.24, 0.55, 0.56], [0.24, 0.55, 0.56], [-0.24, 0.55, -0.56], [0.24, 0.55, -0.56]].forEach(([lx, ly, lz]) => {
                        addBox(mount, 0.16, 0.95, 0.16, coatMat, lx, ly, lz);
                        addBox(mount, 0.18, 0.32, 0.18, mats.gold, lx, 0.25, lz);
                    });
                    addBox(mount, 0.72, 0.68, 1.55, coatMat, 0, 1.18, 0);
                    addBox(mount, 0.78, 0.42, 0.28, mats.frieze, 0, 1.16, 0.72);
                    if (hasSaddle) {
                        addBox(mount, 0.82, 0.45, 0.82, armorMat, 0, 1.32, -0.05);
                        addBox(mount, 0.68, 0.18, 0.65, mats.crimsonLeather, 0, 1.56, -0.05);
                    }
                    const neckPivot = new THREE.Group();
                    neckPivot.position.set(0, 1.38, 0.62);
                    mount.add(neckPivot);
                    addBox(neckPivot, 0.36, 0.78, 0.42, coatMat, 0, 0.32, 0.15, 0.42, 0, 0);
                    addBox(neckPivot, 0.34, 0.32, 0.62, coatMat, 0, 0.68, 0.44, 0.25, 0, 0);
                    addBox(neckPivot, 0.36, 0.14, 0.56, mats.gold, 0, 0.76, 0.46, 0.25, 0, 0);
                    if (hasKirinAntlers) {
                        addBox(neckPivot, 0.05, 0.42, 0.05, mats.gold, -0.12, 0.98, 0.24, -0.35, 0, 0.22);
                        addBox(neckPivot, 0.05, 0.42, 0.05, mats.gold, 0.12, 0.98, 0.24, -0.35, 0, -0.22);
                    }
                    const tailPivot = new THREE.Group();
                    tailPivot.position.set(0, 1.35, -0.78);
                    mount.add(tailPivot);
                    addBox(tailPivot, 0.16, 0.75, 0.18, mats.gold, 0, -0.32, -0.15, 0.35, 0, 0);

                    allAnimatedMounts.push({ root: mount, neck: neckPivot, tail: tailPivot, phase: Math.random() * Math.PI * 2 });
                    parent.add(mount);
                }

                // Zone 1: Left Wing Oasis Trough, Solar Strider Steed & Farrier Bench
                addBox(shopGroup, 2.2, 0.62, 1.25, mats.stairBrick, -6.8, 0.77, 1.65);
                addBox(shopGroup, 1.92, 0.06, 0.98, mats.oasisWater, -6.8, 1.04, 1.65);
                createSacredMount(shopGroup, -4.6, 0.46, 1.35, -0.85, mats.duneCoat, mats.emeraldArmor, false, true);
                addBox(shopGroup, 3.6, 0.08, 2.8, mats.strawBed, -6.9, 0.5, -3.5);
                addBox(shopGroup, 1.65, 0.82, 0.95, mats.cabinet, -3.4, 0.87, -3.6);

                // Zone 2: Center Barding Turntable, Ivory Kirin War-Steed & Overhead Hoist Gantry
                const turntable = new THREE.Group();
                turntable.position.set(1.35, 0.54, -0.85);
                const tableDisc = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.75, 0.14, 32), mats.obsidianCoat);
                tableDisc.position.y = 0.07;
                turntable.add(tableDisc);
                createSacredMount(turntable, 0, 0.14, 0, 0.35, mats.ivoryCoat, mats.emeraldArmor, true, false);
                shopGroup.add(turntable);

                const hoistGantry = new THREE.Group();
                hoistGantry.position.set(1.35, 0.54, -0.85);
                addBox(hoistGantry, 0.22, 3.25, 0.22, mats.charredTimber, -1.65, 1.62, 0);
                addBox(hoistGantry, 0.22, 3.25, 0.22, mats.charredTimber, 1.65, 1.62, 0);
                addBox(hoistGantry, 3.65, 0.24, 0.28, mats.charredTimber, 0, 3.22, 0);

                mountSuspendedBarding = new THREE.Group();
                mountSuspendedBarding.position.set(0, 2.48, 0);
                hoistGantry.add(mountSuspendedBarding);
                addBox(mountSuspendedBarding, 0.88, 0.42, 0.88, mats.emeraldArmor, 0, 0, 0);
                addBox(mountSuspendedBarding, 0.72, 0.2, 0.7, mats.crimsonLeather, 0, 0.24, 0);
                addBox(mountSuspendedBarding, 0.94, 0.14, 0.94, mats.gold, 0, -0.18, 0);
                shopGroup.add(hoistGantry);

                // Twin Back-Wall Mount Stalls with Swinging Gates & Obsidian Night-Stalker
                for (let s = 0; s < 2; s++) {
                    const sx = 0.2 + s * 3.2;
                    const sz = -3.85;
                    addBox(shopGroup, 2.85, 0.07, 2.45, mats.strawBed, sx, 0.58, sz);
                    addBox(shopGroup, 0.18, 2.35, 2.55, mats.charredTimber, sx - 1.48, 1.72, sz);
                    const gatePivot = new THREE.Group();
                    gatePivot.position.set(sx - 1.4, 1.25, -2.6);
                    addBox(gatePivot, 2.75, 1.15, 0.1, mats.warmWood, 1.38, 0, 0);
                    addBox(gatePivot, 2.78, 0.12, 0.14, mats.gold, 1.38, 0.55, 0);
                    shopGroup.add(gatePivot);
                    allStallGates.push(gatePivot);
                }
                createSacredMount(shopGroup, 3.4, 0.6, -3.85, 0.0, mats.obsidianCoat, mats.crimsonLeather, false, true);

                // Zone 3: Right Bay Saddle Trestles
                for (let t = 0; t < 3; t++) {
                    const tz = -4.1 + t * 1.45;
                    addBox(shopGroup, 0.95, 0.85, 0.75, mats.charredTimber, 6.65, 1.0, tz);
                    addBox(shopGroup, 0.82, 0.42, 0.82, mats.emeraldArmor, 6.65, 1.5, tz);
                }

                const rigLight = new THREE.PointLight(0x34d399, 2.1, 12.0);
                rigLight.position.set(1.35, 3.6, -0.85);
                shopGroup.add(rigLight);
            }
            buildExactMountShop();

            // ============================================================================
            // 7. OUTER RING: 8 HIGH-DETAIL JAPANESE-EGYPTIAN TOWNHOUSES ENCIRCLING THE SHOPS
            // ============================================================================
            const outerRingGroup = new THREE.Group();
            townGroup.add(outerRingGroup);

            // Helper: Create Tiled Gable Roof for Outer Ring Townhouses
            function createBuildingRoof(width, depth, pitch, yPos, ridgeColorMat = mats.gold) {
                const rg = new THREE.Group();
                rg.position.y = yPos;
                const frontSlope = new THREE.Group();
                frontSlope.position.set(0, 0, depth * 0.26);
                frontSlope.rotation.x = pitch;
                addBox(frontSlope, width, 0.18, depth * 0.62, mats.charredTimber, 0, 0, 0);
                for (let c = -width * 0.46; c <= width * 0.46; c += (lowDetail ? 1.25 : 0.9)) {
                    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, depth * 0.64, 8), mats.kawaraTile);
                    rib.rotation.x = Math.PI / 2;
                    rib.position.set(c, 0.12, 0);
                    frontSlope.add(rib);
                }
                rg.add(frontSlope);

                const backSlope = new THREE.Group();
                backSlope.position.set(0, 0, -depth * 0.26);
                backSlope.rotation.x = -pitch;
                addBox(backSlope, width, 0.18, depth * 0.62, mats.charredTimber, 0, 0, 0);
                for (let c = -width * 0.46; c <= width * 0.46; c += (lowDetail ? 1.25 : 0.9)) {
                    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, depth * 0.64, 8), mats.kawaraTile);
                    rib.rotation.x = Math.PI / 2;
                    rib.position.set(c, 0.12, 0);
                    backSlope.add(rib);
                }
                rg.add(backSlope);

                const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, width + 0.3, 12), mats.kawaraTile);
                ridge.rotation.z = Math.PI / 2;
                ridge.position.y = Math.sin(pitch) * (depth * 0.3);
                rg.add(ridge);

                addBox(rg, 0.34, 0.52, 0.42, ridgeColorMat, -width * 0.48, ridge.position.y + 0.22, 0);
                addBox(rg, 0.34, 0.52, 0.42, ridgeColorMat, width * 0.48, ridge.position.y + 0.22, 0);

                allRoofs.push(rg);
                return rg;
            }

            const numOuterHouses = 8;
            const outerRadius = 42.5;
            for (let h = 0; h < numOuterHouses; h++) {
                // Offset by 22.5 degrees so townhouses sit neatly around the avenues and inner shops
                const angle = (h / numOuterHouses) * Math.PI * 2 + Math.PI / 8;
                const hx = Math.cos(angle) * outerRadius;
                const hz = Math.sin(angle) * outerRadius;
                const isTwoStory = (h % 2 === 0);

                const house = new THREE.Group();
                house.position.set(hx, 0, hz);
                house.rotation.y = -angle - Math.PI / 2;

                // Stone Foundation Plinth & Brick Steps
                addBox(house, 9.6, 0.45, 6.4, mats.stairBrick, 0, 0.225, 0);
                addBox(house, 2.6, 0.22, 0.85, mats.stairBrick, 0, 0.14, 3.55);
                addBox(house, 2.65, 0.06, 0.9, mats.sandstone, 0, 0.26, 3.55);

                // 1F Coursed Sandstone & Timber Frame
                // Hollow room on the existing foundation: a 2.7m entrance replaces the solid block.
                addBox(house, 9.2, 0.14, 6.0, mats.flagstone, 0, 0.52, 0);
                addBox(house, 0.28, 3.2, 6.0, mats.sandstone, -4.46, 2.05, 0);
                addBox(house, 0.28, 3.2, 6.0, mats.sandstone, 4.46, 2.05, 0);
                addBox(house, 9.2, 3.2, 0.28, mats.sandstone, 0, 2.05, -2.92);
                addBox(house, 3.25, 3.2, 0.28, mats.sandstone, -2.975, 2.05, 2.92);
                addBox(house, 3.25, 3.2, 0.28, mats.sandstone, 2.975, 2.05, 2.92);
                addBox(house, 2.7, 0.62, 0.28, mats.charredTimber, 0, 3.32, 2.92);
                addBox(house, 1.3, 0.12, 0.9, mats.warmWood, -2.1, 0.87, -0.7);
                addBox(house, 1.0, 0.38, 0.65, mats.tatami, 2.3, 0.73, -1.45);
                addBox(house, 9.4, 0.45, 6.2, mats.frieze, 0, 3.75, 0);
                // Glowing Front Shoji Windows & Genkan Lattice Door
                // Open genkan panels are parked to either side of the entrance.
                addBox(house, 0.16, 2.8, 0.18, mats.charredTimber, -1.4, 1.9, 3.04);
                addBox(house, 0.16, 2.8, 0.18, mats.charredTimber, 1.4, 1.9, 3.04);
                addBox(house, 0.62, 1.65, 0.12, mats.shojiGlow, -1.75, 1.75, 3.04);
                addBox(house, 0.62, 1.65, 0.12, mats.shojiGlow, 1.75, 1.75, 3.04);
                addBox(house, 2.1, 1.4, 0.12, mats.shojiGlow, -2.8, 2.1, 3.02);
                addBox(house, 2.1, 1.4, 0.12, mats.shojiGlow, 2.8, 2.1, 3.02);

                // Twin Front Lotus Pillars
                [-1.35, 1.35].forEach(px => {
                    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.1, 12), mats.column);
                    p.position.set(px, 2.0, 3.25);
                    house.add(p);
                });

                if (isTwoStory) {
                    // Upper level is an actual room shell, not an opaque solid slab.
                    addBox(house, 8.8, 0.18, 5.6, mats.warmWood, 0, 4.02, 0);
                    addBox(house, 0.26, 2.7, 5.6, mats.plaster, -4.25, 5.2, 0);
                    addBox(house, 0.26, 2.7, 5.6, mats.plaster, 4.25, 5.2, 0);
                    addBox(house, 8.8, 2.7, 0.26, mats.plaster, 0, 5.2, -2.72);
                    addBox(house, 8.8, 2.7, 0.26, mats.plaster, 0, 5.2, 2.72);
                    addBox(house, 9.0, 0.38, 5.8, mats.frieze, 0, 6.6, 0);
                    addBox(house, 2.6, 1.35, 0.14, mats.shojiGlow, -2.1, 5.2, 2.82);
                    addBox(house, 2.6, 1.35, 0.14, mats.shojiGlow, 2.1, 5.2, 2.82);
                    // 2F Wooden Balcony Railing
                    addBox(house, 9.2, 0.12, 0.14, mats.charredTimber, 0, 4.45, 3.15);
                    house.add(createBuildingRoof(9.8, 6.8, 0.42, 7.35, mats.gold));
                } else {
                    house.add(createBuildingRoof(9.8, 6.8, 0.42, 4.5, mats.turquoise));
                }

                // Warm Lantern Point Light at each Townhouse Porch
                const porchLight = new THREE.PointLight(0xffb357, 0.95, 8);
                porchLight.position.set(0, 2.8, 4.0);
                house.add(porchLight);

                // Cypress & Palm Trees flanking each Outer Residence
                for (let side = -1; side <= 1; side += 2) {
                    const tree = new THREE.Group();
                    tree.position.set(side * 5.8, 0, 1.2);
                    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 8), mats.charredTimber);
                    trunk.position.y = 1.2;
                    tree.add(trunk);
                    const crown1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 1), mats.mossFoliage);
                    crown1.position.y = 2.6;
                    tree.add(crown1);
                    const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 1), mats.mossFoliage);
                    crown2.position.y = 3.6;
                    tree.add(crown2);
                    house.add(tree);
                }

                outerRingGroup.add(house);
                houseEntries.push({ id: 'residence-' + (h + 1), group: house });
            }

            // ============================================================================
            // 8. SCENE LIGHTING
            // ============================================================================
            const ambientLight = new THREE.AmbientLight(0xcbd5e1, 0.52);
            if (includeLighting) townGroup.add(ambientLight);

            const keyDirLight = new THREE.DirectionalLight(0xfff1d6, 1.35);
            keyDirLight.position.set(28, 42, 32);
            keyDirLight.castShadow = true;
            keyDirLight.shadow.mapSize.width = 2048;
            keyDirLight.shadow.mapSize.height = 2048;
            const d = 46;
            keyDirLight.shadow.camera.left = -d;
            keyDirLight.shadow.camera.right = d;
            keyDirLight.shadow.camera.top = d;
            keyDirLight.shadow.camera.bottom = -d;
            keyDirLight.shadow.camera.near = 2;
            keyDirLight.shadow.camera.far = 120;
            keyDirLight.shadow.bias = -0.0005;
            if (includeLighting) townGroup.add(keyDirLight);



    // Merge only genuinely static render geometry. Buildings retain their
    // separate rooms, doors, mount animations and model-showcase controls.
    // This lowers draw calls without changing the collision/walk-through shells.
    function batchStaticDirect(group) {
        const buckets = new Map();
        for (const child of group.children) {
            if (!child.isMesh || !child.geometry || Array.isArray(child.material)) continue;
            const key = child.material;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(child);
        }
        for (const [material, objects] of buckets) {
            for (const indexed of [true, false]) {
                const compatible = objects.filter(mesh => Boolean(mesh.geometry.index) === indexed);
                for (let start = 0; start < compatible.length; start += 48) {
                    const slice = compatible.slice(start, start + 48);
                    if (slice.length < 4) continue;
                    // Three's merge requires the same vertex attributes.
                    const bySignature = new Map();
                    for (const mesh of slice) {
                        const key = Object.keys(mesh.geometry.attributes).sort().join(',');
                        if (!bySignature.has(key)) bySignature.set(key, []);
                        bySignature.get(key).push(mesh);
                    }
                    for (const meshes of bySignature.values()) {
                        if (meshes.length < 4) continue;
                        const geometries = meshes.map(mesh => {
                            mesh.updateMatrix();
                            const transformed = mesh.geometry.clone();
                            transformed.applyMatrix4(mesh.matrix);
                            return transformed;
                        });
                        const joined = mergeGeometries(geometries, false);
                        geometries.forEach(geometry => geometry.dispose());
                        if (!joined) continue;
                        const mesh = new THREE.Mesh(joined, material);
                        mesh.castShadow = meshes.some(item => item.castShadow);
                        mesh.receiveShadow = meshes.some(item => item.receiveShadow);
                        mesh.name = 'AXE_StaticTownBatch';
                        group.add(mesh);
                        meshes.forEach(item => {
                            group.remove(item);
                            item.geometry.dispose();
                        });
                    }
                }
            }
        }
    }
    function batchRoofs(group) {
        for (const child of [...group.children]) if (child.isGroup) batchRoofs(child);
        batchStaticDirect(group);
    }
    function geometryStats() {
        let meshes = 0, triangles = 0;
        townGroup.traverse(object => {
            if (!object.isMesh || !object.geometry) return;
            meshes++;
            const geometry = object.geometry;
            triangles += (geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3;
        });
        return { meshes, triangles: Math.round(triangles) };
    }
    const beforeOptimization = geometryStats();
    stoneRingGroups.forEach(batchStaticDirect);
    outerRingGroup.children.forEach(batchStaticDirect);
    allRoofs.forEach(batchRoofs);
    const afterOptimization = geometryStats();
    const performanceStats = Object.freeze({
        quality: lowDetail ? 'low' : 'balanced',
        before: beforeOptimization, after: afterOptimization,
        savedDrawCalls: Math.max(0, beforeOptimization.meshes - afterOptimization.meshes),
    });

    // Host controls replace standalone demo HTML buttons.
    let surgeTimer = 0;
    let allDoorsAndHoistOpen = true; // permit entry at genkan side doors
    outerRingGroup.visible = Boolean(showOuterHomes);
    innerShopsGroup.visible = Boolean(showInnerShops);
    townGroup.scale.setScalar(worldScale);
    townGroup.name = 'AXE_Wolfveil_Town_Plaza_Replacement';
    townGroup.userData.axeTownReplacement = true;
    fountainGroup.name = 'TwinWolfWaterfallFountain';
    innerShopsGroup.name = 'ArtisanShops';
    outerRingGroup.name = 'ResidentialRing';
    const townAnchors = Object.freeze({
        fountain: [0, 0, 0],
        blacksmith: [-16.2, 0, -16.2],
        clothing: [16.2, 0, -16.2],
        augment: [16.2, 0, 16.2],
        mounts: [-16.2, 0, 16.2],
        northGate: [0, 0, -33],
        eastGate: [33, 0, 0],
        southGate: [0, 0, 33],
        westGate: [-33, 0, 0],
    });
    const state = { active: true, lowEffects: false };

    /** Call once per host game frame with deltaSeconds and totalElapsedSeconds. */
    function update(dt, elapsed) {
        if (!state.active || !townGroup.visible) return;
        dt = Math.max(0, Math.min(0.1, Number(dt) || 0));
        elapsed = Number(elapsed) || 0;
        if (surgeTimer > 0) surgeTimer = Math.max(0, surgeTimer - dt);
        const flowMult = surgeTimer > 0 ? 3.2 : 1;
                // Animate Flowing Waterfall UV Scroll & Spiral Energy Ribbons
                waterfallTex.offset.y += dt * 1.35 * flowMult;
                spiralRibbonTex.offset.x -= dt * 1.15 * flowMult;

                spiralRibbons.forEach((tube, idx) => {
                    // Subtle breathing pulse while keeping the signature tilted silhouette locked to the wolves
                    tube.position.y = Math.sin(elapsed * 2.2 + idx * 0.9) * 0.045 * flowMult;
                    tube.rotation.z = Math.sin(elapsed * 1.6 + idx) * 0.018 * flowMult;
                });

                // Pulse Splash Foam Rings at the base of the waterfalls
                foamRings.forEach(f => {
                    const s = 1.0 + Math.sin(elapsed * 4.5 + f.phase) * 0.14 * flowMult;
                    f.mesh.scale.set(s, s, 1);
                });

                // Animate Rising Mist & Magic Droplets around the Wolves
                mistParticles.forEach(p => {
                    p.position.y += dt * p.userData.speed * flowMult;
                    if (p.position.y > p.userData.yMax) {
                        p.position.y = p.userData.yStart;
                    }
                });

                // ------------------------------------------------------------------------
                // ANIMATE ALL 4 FULL-DETAIL UPLOADED HOUSES IN THE INNER PLAZA RING
                // ------------------------------------------------------------------------
                // 1. Slide Genkan Doors, VIP Fitting Room Shoji & Relic Vault Shoji
                allSlidingDoors.forEach(d => {
                    const target = allDoorsAndHoistOpen ? d.open : d.closed;
                    d.mesh.position[d.axis] += (target - d.mesh.position[d.axis]) * Math.min(1, dt * 6);
                });
                allSlidingShoji.forEach(s => {
                    const targetX = allDoorsAndHoistOpen ? s.openX : s.closedX;
                    s.mesh.position.x += (targetX - s.mesh.position.x) * Math.min(1, dt * 6);
                });

                // 2. NW Blacksmith Residence: Forge Fire & Rising Embers
                if (smithForgeFireLight) {
                    smithForgeFireLight.intensity = (2.7 + Math.sin(elapsed * 11) * 0.45) * (surgeTimer > 0 ? 1.8 : 1.0);
                }
                allEmberParticles.forEach(p => {
                    p.position.y += dt * p.userData.speed * flowMult;
                    p.position.x = p.userData.baseX + Math.sin(elapsed * 3 + p.userData.phase) * 0.12;
                    if (p.position.y > 2.65) p.position.y = 1.42;
                });

                // 3. NE Clothing Atelier: Swaying Dyed Silk Banners, Kimonos & Noren Curtains
                allSwayingSilks.forEach(s => {
                    s.mesh.rotation.z = Math.sin(elapsed * 2.1 + s.phase) * s.amp * flowMult;
                    s.mesh.rotation.x = Math.cos(elapsed * 1.7 + s.phase) * (s.amp * 0.5) * flowMult;
                });
                allNorenPanels.forEach(n => {
                    n.pivot.rotation.x = Math.sin(elapsed * 2.3 + n.phase) * 0.055 * flowMult;
                });

                // 4. SE Gem Augment & Spellbook Sanctum: Matrix Core, Runes, Wheels & Levitating Tomes
                if (augmentFloorRune && augmentTopRune) {
                    augmentFloorRune.rotation.z = elapsed * 0.45 * flowMult;
                    augmentTopRune.rotation.z = -elapsed * 0.85 * flowMult;
                }
                if (augmentMasterGem && augmentCoreAssembly) {
                    augmentMasterGem.rotation.y = elapsed * 1.4 * flowMult;
                    augmentCoreAssembly.position.y = 2.05 + Math.sin(elapsed * 2.5) * 0.12;
                    augmentRing1.rotation.x = elapsed * 1.1 * flowMult;
                    augmentRing1.rotation.y = elapsed * 0.7 * flowMult;
                    augmentRing2.rotation.y = -elapsed * 1.3 * flowMult;
                    augmentRing2.rotation.z = elapsed * 0.9 * flowMult;
                }
                augmentOrbitingGems.forEach(({ mesh, index }) => {
                    const ang = elapsed * 1.6 * flowMult + (index / 5) * Math.PI * 2;
                    mesh.position.set(Math.cos(ang) * 1.12, Math.sin(elapsed * 3.0 + index) * 0.18, Math.sin(ang) * 1.12);
                    mesh.rotation.y = elapsed * 2.5;
                });
                allLapidaryWheels.forEach(w => { w.rotation.x = elapsed * 5.0 * flowMult; });
                allFloatingSpellbooks.forEach(b => { b.mesh.position.y = b.baseY + Math.sin(elapsed * 2.2 + b.phase) * 0.06; });
                allFloatingCrystals.forEach(c => {
                    c.mesh.position.y = c.baseY + Math.sin(elapsed * 3.0 + c.phase) * 0.05;
                    c.mesh.rotation.y = elapsed * 2.2 * flowMult;
                });

                // 5. SW Mount Stables: Overhead Barding Hoist, Stall Gates & Mount Idle Animations
                if (mountSuspendedBarding) {
                    const targetHoistY = allDoorsAndHoistOpen ? 1.52 : 2.48;
                    mountSuspendedBarding.position.y += (targetHoistY - mountSuspendedBarding.position.y) * Math.min(1, dt * 4.5);
                }
                const targetGateRot = allDoorsAndHoistOpen ? -1.25 : 0.0;
                allStallGates.forEach(g => {
                    g.rotation.y += (targetGateRot - g.rotation.y) * Math.min(1, dt * 5);
                });
                allAnimatedMounts.forEach(m => {
                    m.neck.rotation.x = Math.sin(elapsed * 1.8 + m.phase) * 0.06;
                    m.tail.rotation.z = Math.sin(elapsed * 2.4 + m.phase) * 0.08;
                });

                // 6. Chochin Lantern Sway across all 4 Shops
                allLanterns.forEach(l => {
                    l.group.rotation.z = Math.sin(elapsed * 1.6 + l.phase) * 0.035;
                });


    }

    // Exposes coarse static collider shapes, so the game's own collision system can
    // register barriers without using every detailed mesh as an expensive collider.
    // Local coordinates relative to the town group; apply group matrix before use.
    const collisionZones = [
        { id: 'fountain-basin', type: 'circle', x: 0, z: 0, radius: 6.55, minY: 0, maxY: 2.2 }
    ];
    // Door-aware house/shop wall segments are registered by WolfveilArtisanTownScene.

    // Avoid double-disposing shared geometries, materials and textures.
    function dispose() {
        townGroup.parent?.remove(townGroup);
        const geometries = new Set(), materials = new Set(), textures = new Set();
        townGroup.traverse(obj => {
            if (obj.geometry) geometries.add(obj.geometry);
            if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m));
        });
        materials.forEach(m => {
            for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
            m.dispose();
        });
        textures.forEach(t => t.dispose());
        geometries.forEach(g => g.dispose());
        state.active = false;
    }

    return {
        group: townGroup,
        update,
        dispose,
        refs: { fountain: fountainGroup, shops: innerShopsGroup, homes: outerRingGroup, roofs: allRoofs },
        anchors: townAnchors,
        rooms: { shops: shopInteriors, homes: houseEntries },
        performanceStats,
        collisionZones,
        setShowroomModel(index = 0) {
            const chosen = Math.max(0, Math.min(allAnimatedMounts.length - 1, Math.floor(index)));
            allAnimatedMounts.forEach((m, i) => { m.root.visible = i === chosen; });
            return chosen;
        },
        surgeWaterfall(seconds = 3.5) { surgeTimer = Math.max(0, seconds); },
        setDoorsOpen(open) { allDoorsAndHoistOpen = Boolean(open); },
        setOuterHomesVisible(visible) { outerRingGroup.visible = Boolean(visible); },
        setInnerShopsVisible(visible) { innerShopsGroup.visible = Boolean(visible); },
        setRoofsVisible(visible) { allRoofs.forEach(r => { r.visible = Boolean(visible); }); },
        setBlacksmithCutaway(open) { if (smithUpperFacadeGroup) smithUpperFacadeGroup.visible = !open; },
        setLightingEnabled(on) { ambientLight.visible = keyDirLight.visible = Boolean(on); },
        setActive(on) { state.active = Boolean(on); townGroup.visible = Boolean(on); },
    };
}
