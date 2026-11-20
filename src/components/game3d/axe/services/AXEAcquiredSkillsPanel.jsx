import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import {
  getLearnedSkillIds, subscribeLearnedSkills, getLootInventory,
  subscribeLootInventory, LOOT_TABLE,
} from '../../lootStore';
import { getGame3DStorage, subscribeGame3DStorage } from '../../storage/game3dStorageStore';
import { SKILLS_DATABASE } from '../../equipment/skillData';
import { ABILITY_DEFINITIONS } from '../../abilityStore';
import { getAllSkills } from '../../skills/skillRegistry';
import { buildAcquiredSkillEntries } from './AXEAcquiredSkillsModel.mjs';
import './AXEAcquiredSkillsPanel.css';

function readAcquiredSkills() {
  return buildAcquiredSkillEntries({
    learnedIds: getLearnedSkillIds(),
    inventory: getLootInventory(),
    storedItems: getGame3DStorage().items,
    lootDefinitions: LOOT_TABLE,
    skillDefinitions: SKILLS_DATABASE,
    abilities: ABILITY_DEFINITIONS,
    registry: getAllSkills(),
  });
}

// Both Skill Book layouts share this listener. Collected drops are shown as
// owned scrolls; they are not equippable until legitimately learned.
export default function AXEAcquiredSkillsPanel() {
  const [entries, setEntries] = useState(readAcquiredSkills);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const refresh = () => setEntries(readAcquiredSkills());
    const unsubscribes = [
      subscribeLearnedSkills(refresh),
      subscribeLootInventory(refresh),
      subscribeGame3DStorage(refresh),
    ];
    refresh();
    return () => unsubscribes.forEach(unsubscribe => unsubscribe?.());
  }, []);

  const learned = useMemo(() => entries.filter(item => item.learned).length, [entries]);
  const scrolls = useMemo(() => entries.reduce((count, item) =>
    count + (item.collectedCount || 0), 0), [entries]);
  const visible = expanded ? entries : entries.slice(0, 4);

  return (
    <section className="axe-acquired-skills" aria-label="Acquired skills and abilities">
      <div className="axe-acquired-heading">
        <BookOpen size={16} aria-hidden="true" />
        <strong>Acquired Skills &amp; Abilities</strong>
        <small aria-live="polite">{learned} learned · {scrolls} collected scrolls</small>
        {entries.length > 4 && <button type="button" aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Less' : 'All ' + entries.length}
          {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
        </button>}
      </div>
      {entries.length ? <div className="axe-acquired-items" role="list">
        {visible.map(item => <div className="axe-acquired-item" role="listitem" key={item.id}
          title={item.learned ? 'Learned skill or ability' : 'Collected scroll — learn it before equipping'}>
          <span aria-hidden="true">{item.icon}</span>
          <strong>{item.name}</strong>
          <small>{item.learned ? 'Learned' : 'Scroll collected'}
            {item.collectedCount > 1 ? ' ×' + item.collectedCount : ''}</small>
        </div>)}
      </div> : <p className="axe-acquired-empty">
        Skills and ability scrolls appear here when earned through quests or drops.
      </p>}
    </section>
  );
}
