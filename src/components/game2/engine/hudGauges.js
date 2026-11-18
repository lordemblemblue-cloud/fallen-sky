// Game 2 holographic four-resource HUD. Canvas vectors render at native HUD
// resolution; the player-projected arcs and interactive DOM orbs share geometry.
// Force/Special: two parallel inward-facing C curves to the RIGHT of the model.
// HP and stamina: a separate floating lower-RIGHT telemetry pane, stamina below.
// Only presentation changes here. Game 2 owns the actual resource costs.
const clamp01 = n => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
export const gaugePercentage = (value, max = 100) =>
  Math.round(clamp01(Number(value) / (Number(max) > 0 ? Number(max) : 1)) * 100);

const cap = (n, a, b) => Math.max(a, Math.min(b, n));
const point = (x, y) => [x, y];
const cubic = (p, t) => {
  const q = 1 - t;
  return [
    q*q*q*p[0][0] + 3*q*q*t*p[1][0] + 3*q*t*t*p[2][0] + t*t*t*p[3][0],
    q*q*q*p[0][1] + 3*q*q*t*p[1][1] + 3*q*t*t*p[2][1] + t*t*t*p[3][1],
  ];
};
function trace(ctx, points, fraction = 1) {
  const n = Math.max(1, Math.ceil(fraction * 36));
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i <= n; i++) ctx.lineTo(...cubic(points, fraction * i / n));
}
function stroke(ctx, points, width, color, alpha = 1, fraction = 1, blur = 0) {
  if (fraction <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  if (blur) {
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
  }
  trace(ctx, points, fraction);
  ctx.stroke();
  ctx.restore();
}

// Keep the touch controls and strokes on exactly the same coordinates.
// Both crescents bend/open LEFT, toward the model, instead of mirroring.
export function layoutGame2Gauges(width, height, avatar = null) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const scale = cap(Math.min(w / 1380, h / 780), .65, 1.1);
  const margin = cap(18 * scale, 12, 24);
  const barW = cap(w * .21, 108 * scale, 240 * scale);
  const barH = 10 * scale;
  const panelW = barW + 32 * scale;
  const panelH = 65 * scale;
  const panelX = Math.max(1, w - margin - panelW);
  const panelY = Math.max(1, h - margin - panelH);
  const bottomRight = {
    x: panelX, y: panelY, panelW, panelH,
    barX: panelX + 17 * scale, barW, barH,
    hpY: panelY + 18 * scale,
    staminaY: panelY + 43 * scale,
  };

  const heroX = cap(Number.isFinite(avatar?.x) ? avatar.x : w * .50, w * .35, w * .65);
  const heroTop = cap(Number.isFinite(avatar?.top) ? avatar.top : h * .34, h * .24, h * .52);
  const heroBottom = cap(Number.isFinite(avatar?.bottom) ? avatar.bottom : h * .79,
    heroTop + 85 * scale, h * .92);
  const heroY = (heroTop + heroBottom) / 2;
  const span = cap((heroBottom - heroTop) * .92, 115 * scale, 420 * scale);
  const topY = Math.max(10 * scale, heroY - span / 2);
  const bottomY = Math.min(h - 10 * scale, heroY + span / 2);
  const curveSpan = bottomY - topY;
  const midway = (topY + bottomY) / 2;

  const sideDistance = cap(w * .085, 53 * scale, 138 * scale);
  // 38+ px between the orb centers avoids overlapping 36-px touch targets.
  const arcGap = cap(47 * scale, 39, 54);
  const innerX = Math.min(heroX + sideDistance, w - margin - arcGap - 12 * scale);
  const outerX = innerX + arcGap;
  const arcBulge = cap(w * .025, 13 * scale, 35 * scale);
  const buildRightC = midX => {
    const endX = midX - arcBulge;
    const upper = [
      point(midX, midway),
      point(midX + arcBulge * .08, midway - curveSpan * .28),
      point(endX + arcBulge * .25, topY + curveSpan * .055),
      point(endX, topY),
    ];
    const lower = [
      point(midX, midway),
      point(midX + arcBulge * .08, midway + curveSpan * .28),
      point(endX + arcBulge * .25, bottomY - curveSpan * .055),
      point(endX, bottomY),
    ];
    return { upper, lower, button: { x: midX, y: midway }, side: 1 };
  };
  return {
    scale, bottomRight,
    force: buildRightC(innerX),
    special: buildRightC(outerX),
  };
}

function slimTrack(ctx, x, y, w, h, value, colors, broken = false) {
  if (![x, y, w, h, x + w].every(Number.isFinite) || w <= 0 || h <= 0) return;
  const pct = clamp01(value);
  ctx.save();
  ctx.fillStyle = 'rgba(2,12,25,.62)';
  ctx.strokeStyle = 'rgba(162,220,244,.4)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h * .5);
  ctx.fill(); ctx.stroke();
  if (pct > 0) {
    const fillW = Math.max(1, (w - 4) * pct);
    const gradient = ctx.createLinearGradient(x, y, x + fillW, y);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(.56, colors[1]);
    gradient.addColorStop(1, colors[2]);
    ctx.fillStyle = gradient;
    ctx.shadowColor = colors[1];
    ctx.shadowBlur = broken ? 10 : 8;
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, fillW, h - 4, Math.min((h - 4) / 2, fillW / 2));
    ctx.fill();
  }
  ctx.restore();
}

// A translucent projected panel, angled glass edges, luminous rails, and a
// slight offset ghost plate give the fixed bottom-right tank a floating depth.
function drawFloatingPanel(ctx, q, scale) {
  const { x, y, panelW: w, panelH: h } = q;
  const cut = 11 * scale;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - 3 * scale, y);
  ctx.lineTo(x + w, y + 3 * scale);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + 3 * scale, y + h);
  ctx.lineTo(x, y + h - 3 * scale);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
  ctx.fillStyle = 'rgba(4,20,34,.46)';
  ctx.strokeStyle = 'rgba(121,220,255,.48)';
  ctx.lineWidth = 1.1;
  ctx.shadowColor = '#3bc9ff';
  ctx.shadowBlur = 13 * scale;
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;

  // A narrow upper light rail and projected lower edge, no solid HUD box.
  ctx.beginPath();
  ctx.moveTo(x + cut + 2 * scale, y + 2 * scale);
  ctx.lineTo(x + w - 7 * scale, y + 2 * scale);
  ctx.strokeStyle = 'rgba(206,248,255,.84)';
  ctx.lineWidth = 1.4 * scale;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 7 * scale, y + h + 3 * scale);
  ctx.lineTo(x + w - cut, y + h + 3 * scale);
  ctx.strokeStyle = 'rgba(38,173,233,.2)';
  ctx.stroke();

  // Two luminous reticle pips: vitality / exertion, no bulky text overlays.
  for (const [cy, color] of [
    [q.hpY + q.barH / 2, '#fb6271'],
    [q.staminaY + q.barH / 2, '#58edc9'],
  ]) {
    const cx = x + 9 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.1 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 1 * scale, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

function drawCrescent(ctx, arc, fill, color) {
  const frac = clamp01(fill);
  // Identical thickness, direction, and length on Force and Special.
  for (const path of [arc.upper, arc.lower]) {
    stroke(ctx, path, 14, 'rgba(0,8,20,.48)', .7);
    stroke(ctx, path, 9, 'rgba(54,100,126,.37)', .8);
    stroke(ctx, path, 5, 'rgba(182,235,255,.34)', .9);
    stroke(ctx, path, 5.4, color, frac > 0 ? .94 : .05, frac, 12);
    stroke(ctx, path, 1.6, '#f2fbff', frac > 0 ? .36 : 0, frac);
  }
  // Small separated end contacts make the arcs read as hovering instruments.
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  for (const path of [arc.upper, arc.lower]) {
    ctx.beginPath();
    ctx.arc(path[3][0], path[3][1], 2.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawGame2ResourceGauges(ctx, {
  width, height, hp, hpMax, force, forceMax, special, specialMax = 100,
  stamina = 100, staminaMax = 100, staminaBroken = false, specialReady = false,
  avatar = null,
}) {
  const values = {
    hp: gaugePercentage(hp, hpMax),
    special: gaugePercentage(special, specialMax),
    force: gaugePercentage(force, forceMax),
    stamina: gaugePercentage(stamina, staminaMax),
  };
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)))
    return values;
  const layout = layoutGame2Gauges(width, height, avatar);
  const { bottomRight: q, scale } = layout;
  ctx.save();
  drawFloatingPanel(ctx, q, scale);
  const x = q.barX;
  const w = Math.min(q.barW, width - x - 2);
  if (w > 20) {
    slimTrack(ctx, x, q.hpY, w, q.barH, values.hp / 100,
      ['#8c182e', '#f04459', '#ff9ca9']);
    slimTrack(ctx, x, q.staminaY, w, q.barH, values.stamina / 100,
      staminaBroken
        ? ['#963321', '#f57359', '#ffba8b']
        : ['#0a7876', '#31d7bd', '#b2fff0'], staminaBroken);
  }
  drawCrescent(ctx, layout.force, values.force / 100, '#21c7ff');
  if (Number(forceMax) > 0)
    drawCrescent(ctx, layout.special, values.special / 100,
      specialReady ? '#ffe481' : '#f8b34c');
  ctx.restore();
  return values;
}
