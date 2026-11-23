/* global FB_DATA, buildRig, createPuppetState, stepPuppet, faceState, socketPosition, setLookTarget, triggerExpression, SkillPlayer */
// Fantasy Battle standalone player. Inlined into the downloadable HTML after the puppet core and the skill timeline
// (the same code as the game), and drawn with Canvas 2D: each deformed grid triangle is an affine-mapped, clipped image.
(function startPlayer() {
  const data = FB_DATA;
  const canvas = document.getElementById('fb-canvas');
  const ctx = canvas.getContext('2d');
  const rig = buildRig(data.rig, data.parts);
  const state = createPuppetState(rig, { seed: 7 });
  state.life.combatTarget = 1;
  const skills = new SkillPlayer(data.skills);
  const images = {};
  const arrows = [];
  let mouse = null;
  let view = { k: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const k = Math.min(h / 700, w / 1000);
    view = { k, ox: w * 0.32, oy: h * 0.93, w, h, dpr };
  }
  const toScreen = (x, y) => [view.ox + x * view.k, view.oy - y * view.k];

  function drawTriangle(img, p, t) {
    const [x0, y0] = p[0]; const [x1, y1] = p[1]; const [x2, y2] = p[2];
    const [u0, v0] = t[0]; const [u1, v1] = t[1]; const [u2, v2] = t[2];
    const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (Math.abs(det) < 1e-9) return;
    const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det;
    const b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / det;
    const c = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / det;
    const d = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / det;
    const e = x0 - a * u0 - c * v0;
    const f = y0 - b * u0 - d * v0;
    const cx = (x0 + x1 + x2) / 3; const cy = (y0 + y1 + y2) / 3;
    ctx.save();
    ctx.beginPath();
    for (const [x, y] of p) {
      const dx = x - cx; const dy = y - cy; const len = Math.hypot(dx, dy) || 1;
      ctx.lineTo(x + (dx / len) * 0.7, y + (dy / len) * 0.7);
    }
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  function drawLayer(li, part, alpha) {
    const img = images[part];
    if (!img || alpha <= 0.003) return;
    const l = rig.layers[li];
    const pos = state.positions[li]; const uv = l.grid.uvs; const idx = l.grid.indices;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < idx.length; i += 3) {
      const p = []; const t = [];
      for (let j = 0; j < 3; j += 1) {
        const v = idx[i + j];
        p.push(toScreen(pos[v * 2], pos[v * 2 + 1]));
        t.push([uv[v * 2] * img.width, uv[v * 2 + 1] * img.height]);
      }
      drawTriangle(img, p, t);
    }
    ctx.globalAlpha = 1;
  }

  function nockPoint() {
    const top = socketPosition(rig, state, 'bowTop'); const bottom = socketPosition(rig, state, 'bowBottom');
    const draw = Math.max(0, Math.min(1, state.params.draw || 0));
    const rest = [(top[0] + bottom[0]) / 2, (top[1] + bottom[1]) / 2];
    const hand = socketPosition(rig, state, 'nock');
    return { top, bottom, nock: [rest[0] + (hand[0] - rest[0]) * draw, rest[1] + (hand[1] - rest[1]) * draw] };
  }

  function drawArrowAt(x, y, angle, length) {
    const img = images.arrow;
    if (!img) return;
    const [sx, sy] = toScreen(x, y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-angle);
    ctx.drawImage(img, 0, -length * view.k * (18 / 168) / 2, length * view.k, length * view.k * (18 / 168));
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, view.h);
    sky.addColorStop(0, '#1b1838'); sky.addColorStop(0.7, '#6b4a70'); sky.addColorStop(1, '#2a2030');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, view.w, view.h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(view.ox, view.oy, 180 * view.k, 26 * view.k, 0, 0, Math.PI * 2); ctx.fill();
    const face = faceState(rig, state.life);
    const { top, bottom, nock } = nockPoint();
    const bowLayer = rig.layerOf('bow');
    for (const li of state.order) {
      const l = rig.layers[li];
      if (l.role === 'face') drawLayer(li, face.face, 1);
      else if (l.role === 'faceFade') { if (face.fadeFrom) drawLayer(li, face.fadeFrom, face.fadeOpacity); }
      else if (l.role === 'blink') drawLayer(li, l.part, face.blink);
      else drawLayer(li, l.part, 1);
      if (li === bowLayer) {
        ctx.strokeStyle = 'rgba(243,234,214,0.9)'; ctx.lineWidth = Math.max(1, 2 * view.k);
        ctx.beginPath(); ctx.moveTo(...toScreen(...top)); ctx.lineTo(...toScreen(...nock)); ctx.lineTo(...toScreen(...bottom)); ctx.stroke();
        if ((state.params.nocked || 0) > 0.5) {
          const grip = socketPosition(rig, state, 'bowGrip');
          drawArrowAt(nock[0], nock[1], Math.atan2(grip[1] - nock[1], grip[0] - nock[0]), 292);
        }
      }
    }
    for (const a of arrows) {
      const [hx, hy] = toScreen(a.x, a.y);
      const grad = ctx.createLinearGradient(hx - a.vx * 0.12 * view.k, hy, hx, hy);
      grad.addColorStop(0, 'rgba(255,210,120,0)'); grad.addColorStop(1, 'rgba(255,220,140,0.85)');
      ctx.strokeStyle = grad; ctx.lineWidth = 6 * view.k;
      ctx.beginPath(); ctx.moveTo(hx - a.vx * 0.12 * view.k, hy + a.vy * 0.12 * view.k); ctx.lineTo(hx, hy); ctx.stroke();
      drawArrowAt(a.x - Math.cos(a.angle) * 292, a.y - Math.sin(a.angle) * 292, a.angle, 292);
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (mouse) {
      const head = socketPosition(rig, state, 'headTop');
      setLookTarget(state.life, ((mouse[0] - view.ox) / view.k - head[0]) / 320, ((view.oy - mouse[1]) / view.k - head[1] + 50) / 320);
    }
    const { events } = skills.update(dt);
    stepPuppet(rig, state, dt, skills.evaluate());
    for (const e of events) {
      if (e.type === 'spawnArrow') {
        const { nock } = nockPoint();
        const grip = socketPosition(rig, state, 'bowGrip');
        const angle = Math.atan2(grip[1] - nock[1], grip[0] - nock[0]) + ((e.arrow && e.arrow.spread) || 0) * Math.PI / 180;
        const speed = (e.arrow && e.arrow.speed) || 2300;
        arrows.push({ x: nock[0] + Math.cos(angle) * 292, y: nock[1] + Math.sin(angle) * 292, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, angle, age: 0 });
      }
    }
    for (const a of arrows) { a.x += a.vx * dt; a.y += a.vy * dt; a.age += dt; }
    for (let i = arrows.length - 1; i >= 0; i -= 1) if (arrows[i].age > 1.2) arrows.splice(i, 1);
    draw();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); mouse = [e.clientX - r.left, e.clientY - r.top]; });
  const play = (id) => skills.play(id);
  window.addEventListener('keydown', (e) => {
    const s = data.skills.find((x) => x.hotkey === e.key);
    if (s) play(s.id);
  });
  const ui = document.getElementById('fb-ui');
  for (const s of data.skills.filter((x) => x.hotkey)) {
    const b = document.createElement('button');
    b.textContent = `${s.hotkey}  ${s.name}`;
    b.onclick = () => play(s.id);
    ui.appendChild(b);
  }
  for (const name of ['neutral', 'focused', 'attackShout', 'hurt']) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => triggerExpression(state.life, name, 1.5);
    ui.appendChild(b);
  }
  window.addEventListener('resize', resize);
  resize();
  Promise.all(Object.entries(data.images).map(([name, src]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { images[name] = img; resolve(); };
    img.onerror = resolve;
    img.src = src;
  }))).then(() => requestAnimationFrame(frame));
}());
