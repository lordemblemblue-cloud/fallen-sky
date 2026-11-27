// Training catalogue: class kits and move data are the source of truth.
import { CLASSES } from './classes.mjs';
import { MOVES, FLOW, BINDINGS, POWER_BINDINGS } from './moves.mjs';
import { CLASS_MODE } from './cuts.mjs';

const title = id => id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const sharedText = {
  roll: 'Evade with directional travel and a brief invulnerability window.',
  dash: 'Burst forward or sideways. In midair, Dash becomes an air dash.',
  jump: 'Jump, then press Jump again in the air for a double jump.',
  breach: 'Expose an enemy through its Veil.',
  resist: 'Escape a grip or clear a breach.',
  taunt: 'Play the class taunt.',
};
export function demonstrationCatalog(classId) {
  const kit = CLASSES[classId];
  if (!kit) return [];
  const rows = [
    { id:'spar', name:'Bot sparring', group:'Combat', text:'Watch two automated fighters exchange attacks and defenses.', command:'spar' },
    ...kit.abilities.map((a,i) => ({ ...a, group:'Abilities', command:i < 4 && a.implemented && MOVES[a.id] ? 'ability'+(i+1) : null, moveId:a.id })),
    { ...kit.special, group:'Ultimate / finisher', command:'special', moveId:kit.special.id },
    { id:'lightCombo', name:'Light attack combo', group:'Combat', command:'combo', text:'Chain light attacks inside their timing windows.' },
    { id:'heavy', name:'Heavy attack', group:'Combat', command:'heavy', moveId:BINDINGS[kit.weapon]?.heavy, text:'A heavier weapon strike with a longer wind-up.' },
    { id:'guard', name:'Guard / parry', group:'Defense', command:'guard', text:'Raise your guard just before an incoming strike to demonstrate defense.' },
    ...Object.entries(POWER_BINDINGS).filter(([id])=>!['push','pull','grip'].includes(id)).map(([id,moveId])=>({
      id, moveId, name:id==='roll'?'Dodge / roll':title(id), group:MOVES[moveId]?.kind==='movement'?'Movement':'Defense / utility', command:id, text:sharedText[id]||title(id)
    })),
    { id:'doubleJump', name:'Double jump', group:'Movement', command:'doubleJump', text:'Jump a second time before landing.' },
    { id:'airDash', name:'Air dash', group:'Movement', command:'airDash', moveId:'airDash', text:'Jump, then dash in midair.' },
    { id:'sprint', name:'Sprint', group:'Movement', command:'sprint', text:'Run forward at sprint speed.' },
  ];
  const directions = FLOW[kit.weapon]?.modes?.[CLASS_MODE[classId] || 'balanced'] || {};
  for (const [direction,moveId] of Object.entries(directions)) {
    if (direction==='chain'||!MOVES[moveId]) continue;
    rows.push({id:'cut-'+direction, name:title(direction)+' cut', group:'Directional attacks', command:'directional', direction, moveId, text:'Light attack with the '+direction+' movement direction.'});
  }
  rows.push({id:kit.passive.id,name:kit.passive.name,group:'Passive',text:kit.passive.text,command:null});
  return rows.map(row=>({...row,move:MOVES[row.moveId]||null}));
}
export const demonstrationClasses = Object.values(CLASSES);
