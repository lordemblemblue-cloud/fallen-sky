import { useEffect, useState } from 'react';
import { Activity, Check, Heart, Shield, Sparkles, Swords } from 'lucide-react';
import { getAXEMountBonuses, getAXEMountDefinition } from '../progression/AXEMountSystem';
import { getCompanionGrowthView, applyCompanionGrowthBonus } from '../progression/AXECompanionGrowthView.mjs';
import { applyCompanionRoleBonus } from '../progression/AXECompanionRoleMastery.mjs';
import { getActiveWeaponPath, subscribeWeaponBuffs } from '../../weaponClassBuffStore';
import { CompanionAttributesPanel, CompanionGrowthPanel } from './AXECompanionInsights';

// Real, selected owned mount data only: no separate XP progression or skill
// transaction exists here. This is the *rendered* Equipment → Stats & Growth view.
const fmt = value => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const METRICS = Object.freeze([
  { label: 'HP', key: 'hp', Icon: Heart },
  { label: 'Attack', key: 'damage', Icon: Swords },
  { label: 'Defense', key: 'defense', Icon: Shield },
]);

export default function AXECompanionUnifiedInsights({ mount, snapshot }) {
  const [weaponRole, setWeaponRole] = useState(getActiveWeaponPath);
  useEffect(() => subscribeWeaponBuffs(() => setWeaponRole(getActiveWeaponPath())), []);

  const definition = mount ? getAXEMountDefinition(mount.definitionId) : null;
  const growth = getCompanionGrowthView(mount?.totalXp || 0);
  const role = weaponRole === 'ranged' ? 'range' : weaponRole;
  const base = mount ? getAXEMountBonuses(mount) : {};
  const stats = mount
    ? applyCompanionRoleBonus(applyCompanionGrowthBonus(base, mount.totalXp || 0), mount, role)
    : {};
  const active = Boolean(mount && snapshot?.activeMountId === mount.instanceId);
  const registered = Boolean(mount && snapshot?.registeredMountId === mount.instanceId);

  return <section className="axe-app-card axe-comp-unified-card"
    data-companion-insight="unified" aria-label="Companion overview, attributes, and growth">
    <header className="axe-app-card-heading axe-comp-unified-heading">
      <Sparkles size={20} aria-hidden="true"/>
      <h3>Companion Overview</h3>
      <small>Stats &amp; Growth</small>
    </header>
    {!mount ? <div className="axe-comp-unified-empty">
      Select a companion from the owned list to inspect its stats and experience.
    </div> : <div className="axe-comp-unified-scroll">
      <div className="axe-comp-unified-intro" aria-label="Selected companion summary">
        <div className="axe-comp-unified-identity">
          <div><small>SELECTED COMPANION</small><h4>{definition?.name || mount.definitionId}</h4>
            <p>{definition?.rarity || mount.rarity || 'Companion'} ·
              {active ? ' Active mount' : ' Preview mount'} ·
              {registered ? ' Registered bonus' : ' Not registered'}</p></div>
          <div className="axe-comp-unified-level">
            <small>LEVEL</small><strong>{growth.level}<span> / {growth.maxLevel}</span></strong>
            <small>Growth cycle {growth.cycle} / 4</small>
          </div>
        </div>
        <div className="axe-comp-unified-xp-row">
          <span>Experience</span>
          <strong>{fmt(growth.currentLevelXP)} / {fmt(growth.levelXPRequired)} XP</strong>
        </div>
        <div className="axe-comp-unified-xp-track" role="progressbar"
          aria-label="Companion level progress" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(growth.percent)}>
          <span style={{ width: growth.percent + '%' }}/>
        </div>
        <div className="axe-comp-unified-metrics" aria-label="Current stat contribution">
          {METRICS.map(({ label, key, Icon }) => <div key={key}>
            <Icon size={15} aria-hidden="true"/><span>{label}</span>
            <strong>+{fmt(stats[key])}</strong>
          </div>)}
        </div>
      </div>
      <div className="axe-comp-unified-detail-groups">
        <CompanionAttributesPanel mount={mount} snapshot={snapshot}/>
        <CompanionGrowthPanel mount={mount} snapshot={snapshot}/>
      </div>
    </div>}
  </section>;
}
