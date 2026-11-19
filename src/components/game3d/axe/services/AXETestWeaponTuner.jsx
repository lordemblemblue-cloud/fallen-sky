import { useEffect, useState } from 'react';
import {
  AXE_TEST_WEAPON_FIELDS, AXE_TEST_WEAPON_ZERO, clearAXETestWeaponTuning,
  getAXETestWeaponTuning, isAXETestWeaponTunerEnabled,
  projectAXETestWeaponRecords, setAXETestWeaponTuning,
  subscribeAXETestWeaponTuning,
} from '../equipment/AXETestWeaponTuner.mjs';
import { getAXEOwnedItemRecords } from '../equipment/AXEEquipmentRuntimeStats';
import { axeBreakdownAttack, computeAXEItemStatBreakdown, formatAXEFlatNumber } from '../equipment/AXEItemStatBreakdown.mjs';
import { getAXEReinforcementCap, AXE_OVER_ENCHANT_CONFIG, AXE_ENCHANTMENT_CONFIG } from '../equipment/AXEItemEnhancementSystem';
import {
  AXE_COMBINE_CONFIG, AXE_EQUIPMENT_ASCENSION_CONFIG, AXE_REFINE_CONFIG,
  AXE_ULTIMATE_CONFIG, isAXEAscensionRarity,
} from '../equipment/AXEItemAdvancementSystem';
import './AXETestWeaponTuner.css';

const titles = Object.freeze({
  reinforcement: 'Enchant %',
  slots: 'Four enchant slots',
  overEnchant: 'Over-Enchant',
  combine: 'Combine',
  ascend: 'Ascension',
  refine: 'Refine',
  ultimate: 'Ultimate',
});
const zero = () => ({...AXE_TEST_WEAPON_ZERO});
const pct = value => Math.max(0, Math.min(100, Number(value) || 0));
const maxAll = () => Object.fromEntries(AXE_TEST_WEAPON_FIELDS.map(key => [key, 100]));

export default function AXETestWeaponTuner({item}) {
  const [draft, setDraft] = useState(() => getAXETestWeaponTuning(item?.instanceId) || zero());
  const [appliedRevision, setAppliedRevision] = useState(0);
  const [message, setMessage] = useState('');
  const [allPercent, setAllPercent] = useState(0);
  useEffect(() => subscribeAXETestWeaponTuning(() => setAppliedRevision(n => n+1)), []);
  useEffect(() => {
    setDraft(getAXETestWeaponTuning(item?.instanceId) || zero());
    setAllPercent(0);
    setMessage('');
  }, [item?.instanceId]);
  void appliedRevision;

  // The test environment check is also repeated inside the store's write path.
  if (!isAXETestWeaponTunerEnabled() || !item ||
      !(item.slot === 'weapon' || item.category === 'weapon')) return null;

  const real = getAXEOwnedItemRecords(item, {includeTestTuning:false});
  const preview = projectAXETestWeaponRecords(item, real, draft);
  const realAttack = axeBreakdownAttack(computeAXEItemStatBreakdown(item, real));
  const previewAttack = axeBreakdownAttack(computeAXEItemStatBreakdown(item, preview));
  const applied = getAXETestWeaponTuning(item.instanceId);
  const rarity = String(item.rarity || '').toLowerCase();
  const caps = {
    reinforcement: String(getAXEReinforcementCap(item)) + '%',
    slots: String(AXE_ENCHANTMENT_CONFIG.slots) + ' × +' + String(AXE_ENCHANTMENT_CONFIG.maxLevelPerSlot),
    overEnchant: '+' + String(AXE_OVER_ENCHANT_CONFIG.maxLevel),
    combine: '+' + String(AXE_COMBINE_CONFIG.maxCombines),
    ascend: '+' + String(AXE_EQUIPMENT_ASCENSION_CONFIG.maxAscensions),
    refine: '+' + String(AXE_REFINE_CONFIG.maxLevel),
    ultimate: '+' + String(AXE_ULTIMATE_CONFIG.maxLevel),
  };
  const eligible = key => key === 'ascend' ? isAXEAscensionRarity(item)
    : key === 'ultimate' ? AXE_ULTIMATE_CONFIG.eligibleRarities.includes(rarity) : true;
  const apply = values => {
    const result = setAXETestWeaponTuning(item, values);
    setMessage(result.ok ? 'Temporary weapon test values applied to local combat stats.'
      : 'This control is available only on the configured test server.');
  };
  const reset = () => {
    clearAXETestWeaponTuning(item.instanceId);
    setDraft(zero()); setAllPercent(0);
    setMessage('Restored the real weapon stats. No saved upgrades were modified.');
  };
  return <details className="axe-test-weapon-tuner" data-testid="weapon-test-tuner">
    <summary>Test server · Weapon Max Tuner {applied ? '(active)' : ''}</summary>
    <p className="axe-test-weapon-warning">
      TEST ONLY — temporary combat-stat simulation. No permanent item upgrade,
      inventory change, material cost, server write or reward.
      0% uses your weapon's real current level; 100% reaches that category's legal cap.
    </p>
    <label className="axe-test-weapon-master">
      <span>Set all upgrade bars <output>{allPercent}%</output></span>
      <input type="range" min="0" max="100" step="5" value={allPercent}
        aria-label="Set all weapon upgrade percentages"
        onChange={event => {
          const value = pct(event.target.value);
          setAllPercent(value);
          setDraft(Object.fromEntries(AXE_TEST_WEAPON_FIELDS.map(key => [key, value])));
        }}/>
    </label>
    <div className="axe-test-weapon-bars">
      {AXE_TEST_WEAPON_FIELDS.map(key => <label key={key}
          className={!eligible(key) ? 'is-disabled' : ''}>
        <span>{titles[key]} <small>Max {caps[key]}</small>
          <output>{eligible(key) ? draft[key] : 'N/A'}{eligible(key) ? '%' : ''}</output></span>
        <input type="range" min="0" max="100" step="5"
          aria-label={titles[key] + ' test percentage'}
          disabled={!eligible(key)}
          value={draft[key] ?? 0}
          onChange={event => setDraft(previous => ({...previous,[key]:pct(event.target.value)}))}/>
      </label>)}
    </div>
    <p className="axe-test-weapon-preview">
      Weapon attack: <b>{realAttack == null ? '—' : formatAXEFlatNumber(realAttack)}</b>
      <span aria-hidden="true"> → </span>
      <b>{previewAttack == null ? '—' : formatAXEFlatNumber(previewAttack)}</b>
      <small> based on chosen test percentages</small>
    </p>
    <div className="axe-test-weapon-actions">
      <button type="button" onClick={() => apply(draft)}>Apply percentages</button>
      <button type="button" onClick={() => {
        const all = maxAll(); setDraft(all); setAllPercent(100); apply(all);
      }}>Max Out (100%)</button>
      <button type="button" onClick={reset}>Reset</button>
    </div>
    <p role="status" aria-live="polite">{message || (applied ?
      'Test boost active. Equipping this weapon uses its simulated stats until reset or reload.'
      : 'No test boost applied. Select a percentage, then Apply.')}</p>
  </details>;
}
