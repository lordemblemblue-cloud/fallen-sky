// PREVIEW-ONLY SOURCE SNAPSHOT from PR #1037 (unmerged WIP), 808fb082118e3f385d1e7b36061adf8c4756a005.
// Visual staging does not establish collision or production approval.
/**
 * Scene 08 of Wolfveil Batch 01: South Gate.
 * Coordinates below are authored Game 3D WORLD millimetres from the separate
 * 08_gate_detail.xlsx / .docx / .png references (2026-11-05).
 * They are design targets, NOT a surveyed live scene or collision authority.
 */
import { tileAtWorldMm } from '../../../terrain/precisionTerrainBlueprint.mjs';

export const SCENE08_REFERENCE = Object.freeze({
  id: 'wolfveil-b01-scene08-south-gate',
  camera: 'southern-gate-ground-eye',
  image: '08_gate_detail.png',
  workbook: '08_gate_detail.xlsx',
  specification: '08_gate_detail.docx',
  anchorXMm: 0,
  anchorZMm: -155000,
  tileId: 'T41-26',
  originAtMarketOffsetZM: 70,
  phase: 'visual-only-draft',
});

export const SCENE08_PROPS = Object.freeze([
  Object.freeze({id:'P_GATE_L',assetId:'WV-B01-S08-GUARDIAN-L',kind:'guardian',
    xMm:-16000,zMm:-153000,widthMm:4200,depthMm:4500,heightMm:7600,tileId:'T41-24',change:'ADD'}),
  Object.freeze({id:'P_GATE_R',assetId:'WV-B01-S08-GUARDIAN-R',kind:'guardian',
    xMm:16000,zMm:-153000,widthMm:4200,depthMm:4500,heightMm:7600,tileId:'T41-27',change:'ADD'}),
  Object.freeze({id:'P_GATE_BEAM',assetId:'WV-B01-S08-GATE-BEAM',kind:'existing-lintel',
    xMm:0,zMm:-155000,widthMm:19000,depthMm:3800,heightMm:10000,tileId:'T41-26',
    change:'VISUAL-UPGRADE',status:'blocked_pending_existing_mesh_survey'}),
  Object.freeze({id:'P_ENTRANCE_TORII',assetId:'WV-B01-S08-OUTER-TORII',kind:'torii',
    xMm:0,zMm:-203000,widthMm:11000,depthMm:2500,heightMm:7000,tileId:'T46-26',change:'ADD'}),
]);

export function validateScene08Source(plan=SCENE08_PROPS) {
  const ids=new Set(), assets=new Set();
  if (!Array.isArray(plan) || plan.length!==4) throw new Error('Scene 08 requires all four design records');
  for (const p of plan) {
    if (!p.id || ids.has(p.id) || !p.assetId || assets.has(p.assetId)) throw new Error('Duplicate or missing Scene 08 ID');
    ids.add(p.id);assets.add(p.assetId);
    for (const k of ['xMm','zMm','widthMm','depthMm','heightMm']) {
      if (!Number.isSafeInteger(p[k])) throw new TypeError('Scene 08 '+k+' must be integer millimetres');
    }
    if (p.widthMm<=0 || p.depthMm<=0 || p.heightMm<=0) throw new RangeError('Invalid Scene 08 bounds');
    const actual=tileAtWorldMm(p.xMm,p.zMm);
    if (!actual || actual.id!==p.tileId) throw new Error('Scene 08 tile mismatch: '+p.id);
    if (p.change!=='ADD' && p.status!=='blocked_pending_existing_mesh_survey')
      throw new Error('Do not replace existing architecture without a mesh survey');
  }
  return true;
}

/** Convert precise Game 3D world targets to the existing Wolfveil local scene.
 * The live Game 3D caller uses originAtMarket:true (+70m along world Z).
 * This only returns ADD objects; the existing gate lintel is retained.
 */
export function getScene08LocalAdditions(originOffsetZM=70) {
  if (!Number.isSafeInteger(originOffsetZM)) throw new TypeError('Expected integer metre scene offset');
  validateScene08Source();
  return SCENE08_PROPS.filter(p=>p.change==='ADD').map(p=>({
    ...p,localX:p.xMm/1000,localZ:p.zMm/1000-originOffsetZM,
    widthM:p.widthMm/1000,depthM:p.depthMm/1000,heightM:p.heightMm/1000,
  }));
}
