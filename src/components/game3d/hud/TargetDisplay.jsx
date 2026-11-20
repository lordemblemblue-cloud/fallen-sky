import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAbilityState, subscribeAbilities } from '../abilityStore';

// Live lock-on status is anchored directly under the upper-right navigation map.
// Intentionally no large HUD card, tier badge, or duplicate player HP tank.
export default function TargetDisplay() {
  const [target,setTarget] = useState(() => getAbilityState().target);
  useEffect(() => subscribeAbilities(s => {
    const next = s.target;
    setTarget(previous => (
      previous?.id === next?.id &&
      previous?.hp === next?.hp &&
      previous?.maxHp === next?.maxHp &&
      previous?.name === next?.name &&
      previous?.level === next?.level
    ) ? previous : next);
  }), []);

  const currentHP=Number(target?.hp);
  const maxHP=Number(target?.maxHp);
  const knownHP=target && Number.isFinite(currentHP) && Number.isFinite(maxHP) && maxHP>0
    && target.hp != null && target.maxHp != null;
  const percent=knownHP?Math.max(0,Math.min(100,currentHP/maxHP*100)):0;
  const name=target?.bossName||target?.name||'Enemy';
  const title=knownHP
    ? name+' — '+Math.round(currentHP)+' / '+Math.round(maxHP)+' HP'
    : name+' — target locked, HP unavailable';

  return <AnimatePresence initial={false}>
    {target && <motion.div key={target.id || 'target'} className="axe-target-lock"
      initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}}
      exit={{opacity:0,y:-6,transition:{duration:0}}} transition={{duration:.18}}
      role="group" aria-label={title} title={title}>
      <div className="axe-target-lock-label">
        <span className="axe-target-lock-name">{name}</span>
        {Number.isFinite(Number(target.level)) && target.level!=null &&
          <small className="axe-target-lock-level">Lv {target.level}</small>}
      </div>
      <div className={'axe-target-lock-track'+(!knownHP?' is-unknown':'')}
        role={knownHP?'progressbar':'presentation'}
        aria-label={knownHP?name+' health':undefined}
        aria-valuemin={knownHP?0:undefined}
        aria-valuemax={knownHP?100:undefined}
        aria-valuenow={knownHP?Math.round(percent):undefined}>
        {knownHP && <motion.div className="axe-target-lock-fill"
          animate={{width:percent+'%'}}
          transition={{duration:.22,ease:'easeOut'}} />}
      </div>
    </motion.div>}
  </AnimatePresence>;
}
