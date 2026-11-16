import { useEffect, useState } from 'react';
import { getSkillById } from '../../skills/skillRegistry';
import {
  getWeaponSkillPoints, investWeaponSkillPoint, subscribeWeaponSkillPoints,
} from '../../skills/weaponSkillPointsStore';
import {
  WEAPON_SKILL_PATHS, WEAPON_SKILL_TIERS, WEAPON_SKILL_PATH_COST, weaponTierUnlocked,
} from '../../../../../base44/shared/weaponSkillPoints.mjs';
import './AXEWeaponSkillPointsPanel.css';

export default function AXEWeaponSkillPointsPanel() {
  const [progress, setProgress] = useState(getWeaponSkillPoints);
  const [pathId, setPathId] = useState('damage');
  const [message, setMessage] = useState('');
  useEffect(() => subscribeWeaponSkillPoints(setProgress), []);
  const path = WEAPON_SKILL_PATHS.find(p => p.id === pathId) || WEAPON_SKILL_PATHS[0];
  const ranks = progress.save.nodes[path.id] || WEAPON_SKILL_TIERS.map(() => 0);
  const pathSpent = ranks.reduce((a, b) => a + b, 0);
  const invest = (tier, amount) => {
    const result = investWeaponSkillPoint(path.id, tier, amount);
    setMessage(result.ok ? 'Skill point investment saved to character progression.' :
      ({ NOT_ENOUGH_SKILL_POINTS: 'Earn more skill points by gaining character levels.',
        PREVIOUS_TIER_LOCKED: 'Complete the previous stage first.',
        TIER_CAPPED: 'This stage is already full.' })[result.reason] || 'Cannot invest here.');
  };
  return <section className="axe-wsp" aria-label="Weapon skill point tree">
    <header className="axe-wsp-heading"><div><small>WEAPON PROGRESSION</small>
      <h3>Skill Point Tree</h3><p>Level {progress.level} · Spend points without affecting attributes or mastery XP.</p></div>
      <div className="axe-wsp-wallet"><span>AVAILABLE</span><strong>{progress.available}</strong>
        <small>{progress.spent} / {progress.earned} spent</small></div>
    </header>
    <div className="axe-wsp-tabs" role="group" aria-label="Weapon paths">
      {WEAPON_SKILL_PATHS.map(entry=><button type="button" key={entry.id}
        aria-pressed={path.id===entry.id} onClick={()=>{setPathId(entry.id);setMessage('');}}>
        {entry.label}</button>)}
    </div>
    <div className="axe-wsp-summary"><strong>{path.label} · {pathSpent}/{WEAPON_SKILL_PATH_COST}</strong>
      <span>{(pathSpent/WEAPON_SKILL_PATH_COST*100).toFixed(1)}% complete</span></div>
    <div className="axe-wsp-progress" role="progressbar" aria-label="Weapon path completion"
      aria-valuemin={0} aria-valuemax={WEAPON_SKILL_PATH_COST} aria-valuenow={pathSpent}>
      <i style={{width:(pathSpent/WEAPON_SKILL_PATH_COST*100)+'%'}}/></div>
    <div className="axe-wsp-stages">
      {WEAPON_SKILL_TIERS.map((cost, i)=>{
        const unlocked=weaponTierUnlocked(progress.save,path.id,i);
        const current=ranks[i];
        const percent=100*current/cost;
        const skills=[i*2+1,i*2+2].map(n=>getSkillById('axe_'+path.role+'_skill_'+n))
          .filter(Boolean);
        return <article className="axe-wsp-stage" key={i} data-locked={!unlocked}>
          <div className="axe-wsp-stage-main"><div><small>STAGE {i+1} · {unlocked?'AVAILABLE':'LOCKED'}</small>
            <strong>{skills.map(s=>s.skill_name).join(' / ') || 'Registered weapon arts'}</strong>
            <p>{unlocked?'Free passive: Charge Focus '+(i+1)+' (+1% charged strike damage)':
              'Complete stage '+i+' to receive these skills and their free passive.'}</p></div>
            <b>{current} / {cost}</b></div>
          <div className="axe-wsp-progress" role="progressbar" aria-label={'Stage '+(i+1)+' points'}
            aria-valuemin={0} aria-valuemax={cost} aria-valuenow={current}>
            <i style={{width:percent+'%'}}/></div>
          <div className="axe-wsp-stage-actions"><span>Charged skill investment bonus: +{percent.toFixed(1)}%</span>
            <button type="button" disabled={!unlocked||current===cost||!progress.available}
              onClick={()=>invest(i,1)}>+1</button>
            <button type="button" disabled={!unlocked||current===cost||!progress.available}
              onClick={()=>invest(i,Math.min(5,progress.available,cost-current))}>+5</button>
          </div>
        </article>;
      })}
    </div>
    <p className="axe-wsp-note" role="status">{message||'Each 1% invested adds 1% charged damage to that stage’s registered skills. Full paths stop at 100%; no extra capstone reward.'}</p>
  </section>;
}
