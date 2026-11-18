// Optional Academy motion data. Names/timing follow OpenJK codemp/game/{bg_saber,bg_pmove,bg_panimate}.c.
// This is metadata/selection logic, not replacement animation frames.
export const ACADEMY_STANCES = Object.freeze({ 6: 'BOTH_SABERDUAL_STANCE', 7: 'BOTH_SABERSTAFF_STANCE' });
export const ACADEMY_KATAS = Object.freeze({ 1: 'BOTH_A1_SPECIAL', 2: 'BOTH_A2_SPECIAL', 3: 'BOTH_A3_SPECIAL', dual: 'BOTH_A6_SABERPROTECT', staff: 'BOTH_A7_SOULCAL' });
export const ACADEMY_KATA_MOVES = Object.freeze({
  1: 'LS_A1_SPECIAL', 2: 'LS_A2_SPECIAL', 3: 'LS_A3_SPECIAL',
  dual: 'LS_DUAL_SPIN_PROTECT', staff: 'LS_STAFF_SOULCAL',
});
export const ACADEMY_KATA_SPEED = 250 / 40;

// Preserve the shipped JO numeric IDs and add the native Academy actions.
// These are the bg_saber.c move-table rows, not aliases for an overhead chop.
export function withAcademyKataMoves(moves) {
  const out = moves.slice(), ready = moves.find(m => m.ls === 'LS_READY').id;
  for (const [key, ls] of Object.entries(ACADEMY_KATA_MOVES)) {
    if (out.some(m => m.ls === ls)) continue;
    out.push({ id: out.length, ls, name: ls.slice(3), anim: ACADEMY_KATAS[key],
      startQuad: 1, endQuad: 1, flag: 'AFLAG_ACTIVE', blend: 100,
      blocking: 'BLK_TIGHT', chainIdle: ready, chainAttack: ready,
      trail: key === 'dual' || key === 'staff' ? 500 : 2000, kata: true });
  }
  return out;
}

export function academyFamily(name, level) {
  return name.replace(/^BOTH_([ATSRPKVHDB])1_/, 'BOTH_$1' + level + '_').replace(/S1(?=_|$)/g, 'S' + level);
}

// A single overhead clip does not prove that the rest of a kit is available. Require the complete directional
// attack/transition/defence family used by this engine, its stance and its kata before selecting Academy mode.
export function requiredAcademyKit(moves, level) {
  if (!ACADEMY_STANCES[level]) return [];
  return [...new Set([
    ...moves.filter(m => !m.kata).map(m => m.anim).filter(n => /^BOTH_[ATSRPKVHDB]1_/.test(n)).map(n => academyFamily(n, level)),
    ACADEMY_STANCES[level], ACADEMY_KATAS[level === 6 ? 'dual' : 'staff'],
  ])];
}

export function validAnimationClip(a, frames, loopFrames = false) {
  return !!a && typeof a.name === 'string' && /^[A-Z][A-Z0-9_]*$/.test(a.name)
    && Number.isSafeInteger(a.first) && a.first >= 0 && Number.isSafeInteger(a.n) && a.n > 0
    && a.first + a.n <= frames && Number.isFinite(a.fps) && a.fps !== 0
    && Number.isInteger(a.loop) && a.loop >= -1 && a.loop <= a.n - (loopFrames ? 0 : 1);
}

export function validateAcademyBank(meta, rig) {
  if (meta?.bones !== rig.rig.nBones || !Number.isSafeInteger(meta.frames) || meta.frames <= 0
      || !Array.isArray(meta.anims) || !meta.anims.length) throw new Error('invalid Academy bank dimensions');
  const seen = new Set(rig.anims.map(a => a.name));
  for (const a of meta.anims) {
    if (!validAnimationClip(a, meta.frames)) throw new Error('invalid Academy clip: ' + a?.name);
    if (seen.has(a.name)) throw new Error('duplicate Academy clip: ' + a.name);
    seen.add(a.name);
  }
}

// PM_MoveForKata: remaining animation time in milliseconds. Forward is a fraction of the normal run command;
// the existing controller still handles acceleration, collision and gravity. 250 Quake units/s = 6.25 m/s here.
export function academyKataMotion(anim, remainingMs) {
  let forward = 0, jump = 0;
  if (anim === ACADEMY_KATAS.staff) {
    forward = remainingMs >= 2750 ? 64 / 127 : 0;
    jump = remainingMs >= 2650 && remainingMs < 2850 ? 6.25 : 0;
  } else if (anim === ACADEMY_KATAS[2]) {
    forward = (remainingMs < 2700 && remainingMs > 2300) || (remainingMs < 900 && remainingMs > 500) ? 1 : 0;
  } else if (anim === ACADEMY_KATAS[3]) {
    forward = remainingMs < 1700 && remainingMs > 1000 ? 1 : 0;
  }
  return { forward, jump };
}
