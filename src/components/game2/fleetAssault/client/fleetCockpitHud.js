// Original Atom X Eve Fleet Assault cockpit instruments, inspired by the placement of modern space-dogfight HUDs.
// Everything displayed here comes from authoritative/predicted FleetClient state; this does not simulate gameplay.
const CYAN = '#4de8e5';
const ICE = '#d8fffe';
const MUTED = 'rgba(196,244,245,.57)';
const LOW = '#ff796f';
const clamp = v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

export function cockpitReadout(client) {
  const ship = client?.predCls, flight = client?.pred, you = client?.you;
  const lock = Array.isArray(you?.lock) ? you.lock : null;
  const lockTime = (ship?.missiles?.lockTime || 1) * 1000;
  return {
    active: !!(ship && flight),
    speed: Math.round(flight?.speed || 0),
    hull: clamp((you?.hp ?? ship?.hull ?? 0) / (ship?.hull || 1)),
    hullValue: Math.ceil(you?.hp ?? ship?.hull ?? 0),
    shield: clamp((you?.sh ?? ship?.shieldMax ?? 0) / (ship?.shieldMax || 1)),
    shieldValue: Math.ceil(you?.sh ?? ship?.shieldMax ?? 0),
    shieldCooldown: Math.ceil((you?.shcd ?? 0) / 1000),
    engineOff: !!flight?.engineOff,
    barrelCooldown: Math.max(0, flight?.barrelCooldown || 0),
    boost: clamp((flight?.energy ?? 0) / (ship?.boostMax || 1)),
    boosting: !!flight?.boosting,
    heat: clamp((flight?.heat ?? 0) / (ship?.lasers?.overheat || 1)),
    overheated: (flight?.lockout || 0) > 0,
    missiles: Math.max(0, Math.floor(you?.ms ?? 0)),
    hasMissiles: !!ship?.missiles,
    hasLasers: !!ship?.lasers,
    locked: !!(lock?.[0] && Number(lock?.[1]) >= lockTime && ship?.missiles),
    lockFraction: lock?.[0] && ship?.missiles ? clamp(Number(lock[1]) / lockTime) : 0,
    className: ship?.id || '',
  };
}

function curve(x, anchor, top, bottom, side, start = 0, end = 1) {
  const N = 52;
  x.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = start + (end - start) * i / N;
    const px = anchor + side * (24 * Math.sin(t * Math.PI) + 5 * Math.sin(t * Math.PI * 2));
    const py = top + (bottom - top) * t;
    if (!i) x.moveTo(px, py); else x.lineTo(px, py);
  }
}
function gauge(x, anchor, top, bottom, side, fraction, title, color = CYAN) {
  x.save();
  x.lineCap = 'round';
  curve(x, anchor, top, bottom, side);
  x.lineWidth = 14; x.strokeStyle = 'rgba(0,14,25,.7)'; x.stroke();
  x.lineWidth = 7; x.strokeStyle = 'rgba(61,157,169,.22)'; x.stroke();
  if (fraction > 0) {
    curve(x, anchor, top, bottom, side, 1 - fraction, 1);
    x.lineWidth = 6; x.strokeStyle = color; x.shadowColor = color; x.shadowBlur = 10; x.stroke();
    x.shadowBlur = 0;
    x.lineWidth = 2; x.strokeStyle = ICE; x.globalAlpha = .8; x.stroke();
  }
  x.globalAlpha = 1;
  x.textAlign = 'center';
  x.font = '700 12px ui-sans-serif,system-ui,sans-serif';
  x.fillStyle = ICE;
  x.fillText(title, anchor + side * 18, bottom + 25);
  x.fillStyle = MUTED;
  x.font = '600 11px ui-sans-serif,system-ui,sans-serif';
  x.fillText(Math.round(fraction * 100) + '%', anchor + side * 18, bottom + 41);
  // Short notched endcaps instead of large opaque widgets.
  x.strokeStyle = color; x.lineWidth = 2;
  for (const [y, shift] of [[top, -1], [bottom, 1]]) {
    x.beginPath(); x.moveTo(anchor - 7, y); x.lineTo(anchor + 7, y + shift * 7); x.stroke();
  }
  x.restore();
}
function glyph(x, px, py, type, color = CYAN) {
  x.save(); x.translate(px, py); x.strokeStyle = color; x.lineWidth = 2.3; x.lineJoin = 'round'; x.lineCap = 'round';
  x.beginPath();
  if (type === 'shield') {
    x.moveTo(0, -10); x.lineTo(10, -6); x.lineTo(8, 3); x.quadraticCurveTo(6, 9, 0, 13); x.quadraticCurveTo(-6, 9, -8, 3); x.lineTo(-10, -6); x.closePath();
  } else if (type === 'thrust') {
    x.moveTo(-8, -10); x.lineTo(0, 0); x.lineTo(-8, 10);
    x.moveTo(0, -10); x.lineTo(8, 0); x.lineTo(0, 10);
  } else if (type === 'lock') {
    x.arc(0, 0, 9, 0, Math.PI * 2); x.moveTo(-15, 0); x.lineTo(-6, 0); x.moveTo(6, 0); x.lineTo(15, 0); x.moveTo(0, -15); x.lineTo(0, -6); x.moveTo(0, 6); x.lineTo(0, 15);
  }
  x.stroke(); x.restore();
}
export function drawFleetCockpit(x, client, W, H) {
  const d = cockpitReadout(client);
  if (!d.active || W < 360 || H < 280) return;
  const center = W / 2, top = Math.max(82, H * .35), bottom = Math.min(H - 110, H * .68);
  const spread = Math.min(W * .234, 355);
  const left = center - spread, right = center + spread;
  x.save();
  x.textBaseline = 'middle';
  gauge(x, left, top, bottom, -1, d.hull, 'HULL', d.hull < .25 ? LOW : CYAN);
  gauge(x, right, top, bottom, 1, d.boost, 'BOOST', d.boost < .16 ? LOW : CYAN);
  glyph(x, left - 5, top - 20, 'shield');
  glyph(x, right + 5, top - 20, 'thrust');
  // A distinct cyan shield bar prevents confusing ship shields with hull HP.
  const shieldWidth = Math.min(225, W * .31), shieldY = Math.min(H - 112, top + 16);
  x.fillStyle = 'rgba(5,25,40,.55)';
  x.fillRect(center - shieldWidth / 2, shieldY, shieldWidth, 7);
  if (d.shield > 0) {
    x.fillStyle = '#83deff';
    x.fillRect(center - shieldWidth / 2, shieldY, shieldWidth * d.shield, 7);
  }
  x.font = '700 10px ui-sans-serif,system-ui,sans-serif';
  x.textAlign = 'center'; x.fillStyle = d.shield > .25 ? '#a9edff' : LOW;
  x.fillText('SHIELDS ' + d.shieldValue + ' · ' +
    (d.shieldCooldown ? 'REBUFF ' + d.shieldCooldown + 's' : 'G TO RESTORE'),
    center, shieldY - 10);
  if (d.engineOff || d.barrelCooldown > 0.1) {
    x.fillStyle = d.engineOff ? '#ffd38c' : CYAN;
    x.fillText(d.engineOff ? 'ENGINE OFF · INERTIAL DRIFT · X TO IGNITE'
      : 'ROLL RECHARGE ' + d.barrelCooldown.toFixed(1) + 's', center, shieldY + 25);
  }
  // Subtle symmetric navigation ticks. Keep the middle transparent: the player must see the enemy.
  x.strokeStyle = 'rgba(92,234,231,.58)';
  x.lineWidth = 1.6;
  const reticleY = H * .5;
  for (const s of [-1, 1]) {
    const a = center + s * 29;
    x.beginPath(); x.arc(center, reticleY, 28, s === -1 ? .65 * Math.PI : -.34 * Math.PI, s === -1 ? 1.35 * Math.PI : .34 * Math.PI); x.stroke();
    x.beginPath(); x.moveTo(a, reticleY); x.lineTo(a + s * 8, reticleY); x.stroke();
  }
  x.textAlign = 'center';
  x.font = '700 12px ui-sans-serif,system-ui,sans-serif';
  if (d.hasMissiles && d.lockFraction > 0) {
    x.fillStyle = d.locked ? LOW : '#ffd889';
    x.fillText(d.locked ? 'TARGET ACQUIRED' : 'TARGET SCANNING ' + Math.round(d.lockFraction * 100) + '%', center, reticleY + 49);
  }
  // Minimal bottom-centre telemetry, with weapon status left to the actionable React controls.
  const baseY = H - 48;
  x.fillStyle = 'rgba(2,15,25,.24)'; x.fillRect(center - 92, baseY - 19, 184, 36);
  x.font = '800 23px ui-sans-serif,system-ui,sans-serif'; x.fillStyle = ICE;
  x.fillText(String(d.speed), center, baseY - 2);
  x.font = '700 10px ui-sans-serif,system-ui,sans-serif'; x.fillStyle = MUTED;
  x.fillText('SPEED  ·  M/S', center, baseY + 23);
  x.font = '600 11px ui-sans-serif,system-ui,sans-serif';
  x.textAlign = 'left';
  x.fillStyle = d.overheated ? LOW : MUTED;
  x.fillText(d.hasLasers ? 'LASER HEAT  ' + Math.round(d.heat * 100) + '%' : 'BOARDING CRAFT', Math.max(22, left - 88), H - 27);
  x.fillStyle = MUTED;
  x.textAlign = 'right'; x.fillText('MISSILES  ' + (d.hasMissiles ? d.missiles : '—'), Math.min(W - 18, right + 88), H - 27);
  x.restore();
}
