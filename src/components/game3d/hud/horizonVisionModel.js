// Horizon Vision: deterministic route-intelligence data; no invented world entities.
// The primary target stays pinned until the player changes it in the Questbook.
export const HORIZON_SCAN_DISTANCE = 80;
export const HORIZON_FAR_DISTANCE = 160;
const finite = n => Number.isFinite(Number(n)) ? Number(n) : 0;
const distance = (a, b) => Math.hypot(finite(a?.x)-finite(b?.x), finite(a?.z)-finite(b?.z));
const unique = list => [...new Set(list || [])];

export function buildHorizonQuestPlan({ questState, position, region, resolveTarget, questDefinitions = [] }) {
  const ids = unique(questState?.acceptedIds);
  const pinnedId = ids.includes(questState?.lastAcceptedId)
    ? questState.lastAcceptedId : ids[0] || null;
  const definitions = new Map(questDefinitions.map(q => [q.id, q]));
  const pinnedDefinition = definitions.get(pinnedId);
  const candidates = ids.map(id => {
    const quest = definitions.get(id);
    const target = resolveTarget(region, { ...questState, lastAcceptedId: id }, position);
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return null;
    const related = id !== pinnedId && !!pinnedDefinition && !!quest && (
      quest.requires === pinnedId || pinnedDefinition.requires === id ||
      (quest.campaignId && quest.campaignId === pinnedDefinition.campaignId) ||
      (quest.relatedQuestIds || []).includes(pinnedId) ||
      (pinnedDefinition.relatedQuestIds || []).includes(id)
    );
    return {
      questId: id,
      title: quest?.title || target.navLabel || id,
      target,
      distance: Math.round(distance(position, target)),
      related,
      primary: id === pinnedId,
      available: target.live !== false,
    };
  }).filter(Boolean);
  const primary = candidates.find(c => c.primary) || null;
  // Suggestions are advisory, only from accepted quests with verified map targets.
  const suggestions = candidates.filter(c => !c.primary && c.available)
    .map(c => {
      if (!primary || !primary.available) return { ...c, onWay: false };
      const vx = primary.target.x-position.x, vz = primary.target.z-position.z;
      const wx = c.target.x-position.x, wz = c.target.z-position.z;
      const magnitude = vx*vx+vz*vz;
      const progress = magnitude ? (vx*wx+vz*wz)/magnitude : 0;
      const lateral = magnitude ? Math.abs(vx*wz-vz*wx)/Math.sqrt(magnitude) : Infinity;
      return { ...c, onWay: progress >= 0 && progress <= 1 && lateral <= 80 };
    })
    .sort((a,b) => Number(b.related)-Number(a.related) ||
      Number(b.onWay)-Number(a.onWay) || a.distance-b.distance);
  return { pinnedId, primary, candidates, suggestions };
}

export function getHorizonScanPose({ position, target, mode = 'forward', scan = 'ahead' }) {
  const x = finite(position?.x), z = finite(position?.z), y = finite(position?.y);
  const yaw = finite(position?.yaw);
  if (mode === 'quest') {
    if (!target || target.live === false ||
        !Number.isFinite(target.x) || !Number.isFinite(target.z)) return null;
    const dx = target.x-x, dz = target.z-z, length = Math.hypot(dx,dz);
    const ux = length > .01 ? dx/length : Math.sin(yaw);
    const uz = length > .01 ? dz/length : Math.cos(yaw);
    return {
      x: target.x-ux*Math.min(22, Math.max(8,length*.25)),
      z: target.z-uz*Math.min(22, Math.max(8,length*.25)),
      y, lookX:target.x, lookZ:target.z,
      label: target.navLabel || 'Quest destination', distance:Math.round(length),
    };
  }
  const heading = yaw+(scan === 'left' ? -Math.PI/2 : scan === 'right' ? Math.PI/2 : 0);
  const ux = Math.sin(heading), uz = Math.cos(heading);
  const step = scan === 'far' ? HORIZON_FAR_DISTANCE : HORIZON_SCAN_DISTANCE;
  return {
    x:x+ux*step, z:z+uz*step, y,
    lookX:x+ux*(step+32), lookZ:z+uz*(step+32),
    label:scan === 'left' ? 'Left approach' : scan === 'right' ? 'Right approach'
      : scan === 'far' ? 'Far horizon' : 'Ahead',
    distance:step,
  };
}
