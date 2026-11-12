/**
 * Conservative browser travel margin matching the authenticated worker's
 * playable Wolfveil envelope (530m local half-span before body radius).
 * This is PRESENTATION safety; server ownership of position is unchanged.
 */
export const WOLFVEIL_CLIENT_EDGE=Object.freeze({
  halfSpan:528,originOffsetZ:70,
});
export function insideWolfveilClientGround(x,z,margin=0){
  if(!Number.isFinite(x)||!Number.isFinite(z)||
    !Number.isFinite(margin)||margin<0||margin>=WOLFVEIL_CLIENT_EDGE.halfSpan)
    return false;
  const max=WOLFVEIL_CLIENT_EDGE.halfSpan-margin;
  return Math.abs(x)<=max&&Math.abs(z-WOLFVEIL_CLIENT_EDGE.originOffsetZ)<=max;
}
