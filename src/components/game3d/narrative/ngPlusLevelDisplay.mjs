// WP-FS-S6 / R76D. Presentation only. No live import or save-state authority.
// The caller must supply an already validated actual level and active cycle.
// Decimal string cycle indices support exact large values without converting
// them to floating point. This is a display input, not a save schema.
function cycleText(cycle){
  if(typeof cycle==='number'&&Number.isSafeInteger(cycle)&&cycle>=0)return String(cycle);
  if(typeof cycle==='string'&&/^(0|[1-9][0-9]*)$/.test(cycle)&&cycle.length<=128)return cycle;
  throw new RangeError('INVALID_CAMPAIGN_CYCLE');
}

export function formatNgPlusLevel(actualLevel,cycle){
  if(!Number.isSafeInteger(actualLevel)||actualLevel<1)throw new RangeError('INVALID_ACTUAL_LEVEL');
  const index=cycleText(cycle),ngPlus=index!=='0';
  // Deliberately no cap/clamping, default level, arithmetic, XP or entitlement.
  // The semantic style token is mapped to approved blue by a future UI caller.
  return Object.freeze({
    text:String(actualLevel)+(ngPlus?'+':''),
    styleToken:ngPlus?'character-level-ngplus':'character-level-default',
    accessibleLabel:'Level '+actualLevel+(ngPlus?', New Game Plus, cycle '+index:''),
    cycleLabel:ngPlus?'New Game +'+index:null,
    isNgPlus:ngPlus
  });
}
