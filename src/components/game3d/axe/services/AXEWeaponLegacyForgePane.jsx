import { useEffect, useMemo, useState } from 'react';
import { getPlayerHUD, subscribePlayerHUD } from '../../playerHUDStore';
import {
  AXE_WEAPON_LEGACY_CONFIG,
  canUseAXEWeaponLegacyDonor,
  getAXEWeaponLegacyMode,
  previewAXEWeaponLegacyForge,
} from '../equipment/AXEWeaponLegacyForge';
import { executeAXEServiceTransaction } from './AXEServiceTransactionGateway';
import './AXEWeaponLegacyForgePane.css';

const LABELS = {
  COMBINE_STAGE_12_REQUIRED: 'Reach Combine Stage 12 using the existing Combine Station first.',
  REINFORCEMENT_120_REQUIRED: 'Reinforce this weapon to at least 120% first.',
  MATCHING_DONORS_REQUIRED: 'Choose the required number of matching, unprotected owned items.',
  LEVEL_UPGRADE_ALREADY_PREPARED: 'This weapon already has a prepared level. Claim that level first.',
  PLAYER_LEVEL_REQUIRED: 'Reach the listed character level to claim this upgrade.',
  ECHO_ALREADY_UNLOCKED: 'The separate endgame echo attack is already unlocked.',
  NO_PREPARED_LEVEL: 'Prepare the next weapon level first.',
  MAX_WEAPON_LEVEL: 'This weapon is at the supported level ceiling.',
  SAVE_FAILED: 'Could not securely save the recipe. No donors were consumed.',
};

export default function AXEWeaponLegacyForgePane({
  target, items = [], combineCount = 0, reinforcementPercent = 0, onTransaction,
}) {
  const [level, setLevel] = useState(() => Number(getPlayerHUD()?.level || 1));
  const [chosen, setChosen] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const mode = getAXEWeaponLegacyMode(target);
  const itemId = target?.instanceId || '';
  useEffect(() => subscribePlayerHUD(snapshot => setLevel(Number(snapshot?.level || 1))), []);
  useEffect(() => {
    setChosen([]); setConfirm(false); setNotice('');
  }, [itemId, mode]);
  const eligible = useMemo(() => target
    ? items.filter(donor => canUseAXEWeaponLegacyDonor(target, donor))
    : [], [target, items]);
  const selected = chosen.map(id => eligible.find(item => item.instanceId === id)).filter(Boolean);
  const state = previewAXEWeaponLegacyForge({
    item: target, donors: selected, combineCount, reinforcementPercent, playerLevel: level,
  });
  const claim = mode === 'level_legacy' && !!state.pendingLevel;
  const preview = claim ? previewAXEWeaponLegacyForge({
    item: target, donors: [], combineCount, reinforcementPercent,
    playerLevel: level, operation: 'claim',
  }) : state;
  const required = state.required || 0;
  const choose = id => {
    if (busy) return;
    setChosen(previous => previous.includes(id) ? previous.filter(value => value !== id)
      : previous.length < required ? [...previous, id] : previous);
    setConfirm(false); setNotice('');
  };
  const execute = async () => {
    if (busy || !preview.ok) return;
    if (!confirm) {
      setConfirm(true);
      setNotice(claim ? 'Confirm the level claim. Your weapon identity and original combine progress remain intact.'
        : 'Confirm permanently consuming ' + required + ' owned donor items. Your original weapon is retained.');
      return;
    }
    setBusy(true);
    try {
      const result = await executeAXEServiceTransaction('weapon_legacy', {
        itemId, operation: claim ? 'claim' : 'prepare',
        donorIds: claim ? [] : selected.map(item => item.instanceId),
      });
      onTransaction?.(result);
      if (result.ok) {
        setChosen([]);
        setNotice(result.outcome === 'echo_unlocked'
          ? 'Set Echo unlocked! Successful strikes can produce a separate 12% follow-up hit.'
          : result.outcome === 'level_claimed'
            ? 'Your favorite weapon has advanced to Level ' + result.itemLevel + '.'
            : 'Weapon prepared for Level ' + result.legacyForge.pendingLevel +
              '. A small +2% weapon-damage gain is active; claim the level once eligible.');
      } else {
        setNotice(LABELS[result.reason] || String(result.reason || 'Forge attempt failed.').replaceAll('_',' '));
      }
    } catch {
      setNotice('Forge connection failed. Check the character inventory before retrying.');
    } finally {
      setConfirm(false); setBusy(false);
    }
  };
  return <details className="axe-weapon-legacy-pane" open>
    <summary>Weapon Legacy <span>Separate from Combine Stage 1–12</span></summary>
    {!target ? <p>Choose a Rare, Elite, or endgame-set weapon to see its Legacy recipe.</p>
      : !mode ? <p>This upgrade is for Rare or Elite weapons and eligible endgame-set weapons.</p>
      : <>
        <div className="axe-legacy-metrics">
          <span>Combine Stage <b>{combineCount} / {AXE_WEAPON_LEGACY_CONFIG.requiredCombineStage}</b></span>
          <span>Reinforcement <b>{reinforcementPercent}% / 120%</b></span>
          {mode === 'level_legacy' ? <>
            <span>Weapon Level <b>{state.currentLevel}</b></span>
            <span>Next Tier <b>{state.pendingLevel || state.nextLevel || 'MAX'}</b></span>
            <span>Legacy attack <b>+{state.damageBonusPct}%</b></span>
          </> : <span>Separate Set Echo <b>{state.echoDamagePct}%</b></span>}
        </div>
        <p>{mode === 'level_legacy'
          ? 'Preserve this weapon and its original enchantments. Four weapons of the same family and rarity prepare the next 10-level band, granting +2% to this weapon’s own damage (maximum +10%). Claim when your character reaches that band.'
          : 'Consume twelve different owned pieces of this exact endgame set to awaken a one-time 12% follow-up attack. It is a separate hit, not a bonus to the character damage stat.'}</p>
        {!claim && !state.echoDamagePct && <div className="axe-legacy-donors">
          <strong>Forge donor selection: {selected.length} / {required}</strong>
          <div className="axe-legacy-donor-list">
            {eligible.length ? eligible.map(item => <label key={item.instanceId}>
              <input type="checkbox" disabled={busy || (!chosen.includes(item.instanceId) && chosen.length >= required)}
                checked={chosen.includes(item.instanceId)} onChange={() => choose(item.instanceId)} />
              <span>{item.name} <small>Lv. {item.itemLevel ?? item.level ?? 1} · {item.rarity}</small></span>
            </label>) : <small>No eligible owned donors. Locked, favorited and equipped equipment cannot be consumed.</small>}
          </div>
        </div>}
        {claim && <p>Your character level: <b>{level}</b>. Required to claim: <b>{state.pendingLevel}</b>.</p>}
        <p className="axe-legacy-requirement" role="status">
          {!preview.ok ? (LABELS[preview.reason] || preview.reason?.replaceAll('_', ' '))
            : claim ? 'Level claim ready.' : 'Recipe ready. The target weapon will not be consumed.'}
        </p>
        <button type="button" onClick={execute} disabled={!preview.ok || busy}>
          {busy ? 'Processing…' : confirm ? 'Confirm irreversible forge'
            : claim ? 'Claim Level ' + state.pendingLevel
              : mode === 'set_echo' ? 'Awaken 12% Set Echo' : 'Prepare Weapon Level ' + state.nextLevel}
        </button>
        {confirm && <button type="button" className="axe-legacy-cancel" disabled={busy}
          onClick={() => { setConfirm(false); setNotice(''); }}>Cancel</button>}
        {notice && <p className="axe-legacy-notice" role="status" aria-live="polite">{notice}</p>}
      </>}
  </details>;
}
