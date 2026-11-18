// Blacksmith / inventory preview of an item's enchantment light: current stage, the proposed
// stage before confirming, and an animated swatch drawn from the SAME palette and rarity rules
// the 3D renderers use (enchantVisualRules.mjs), so the panel and the worn item never disagree.
import { describeEnchantChange, nextEnchantStage } from './enchantVisualRules.mjs';
import { enchantCategoryOf, getItemEnchantPercent, useEnchantRevision } from './enchantVisualState.js';
import './EnchantLightPreview.css';

const fmt = (value) => {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
};

function Swatch({ style }) {
  if (!style?.active) {
    return <span className="axe-enchant-swatch is-off" aria-hidden="true"><i /></span>;
  }
  const { primary, secondary, tertiary } = style.palette;
  const accent = style.accent || secondary;
  const speed = (6 - style.motion * 4.2).toFixed(2);
  return (
    <span className={`axe-enchant-swatch rank-${style.detailRank}${style.category === 'weapon' ? ' is-weapon' : ''}`}
      aria-hidden="true"
      style={{
        '--axe-ench-a': primary, '--axe-ench-b': secondary, '--axe-ench-c': tertiary, '--axe-ench-accent': accent,
        '--axe-ench-gain': (0.25 + style.emissiveGain * 0.75).toFixed(3), '--axe-ench-speed': `${speed}s`,
      }}>
      <i />
    </span>
  );
}

function StageLine({ label, style }) {
  return (
    <div className="axe-enchant-stage-line">
      <span className="axe-enchant-stage-label">{label}</span>
      <Swatch style={style} />
      <b>{style.active ? style.stageLabel : 'No enchant light'}</b>
      <small>{fmt(style.percent)}%</small>
    </div>
  );
}

/**
 * item: the owned item instance. proposedPercent: the percentage after the operation being
 * previewed (null = show the current light only).
 */
export default function EnchantLightPreview({ item, proposedPercent = null, compact = false }) {
  useEnchantRevision(); // re-read after every Blacksmith result
  if (!item?.instanceId) return null;
  const category = enchantCategoryOf(item);
  const current = getItemEnchantPercent(item);
  const after = proposedPercent == null ? current : Math.max(current, Number(proposedPercent) || 0);
  const change = describeEnchantChange({ rarity: item.rarity, before: current, after, category });
  const upcoming = nextEnchantStage(after);
  const showAfter = proposedPercent != null && after !== current;
  return (
    <section className={`axe-enchant-preview${compact ? ' is-compact' : ''}`} aria-label="Enchantment light preview"
      data-enchant-stage={change.from.stageId} data-enchant-rarity={change.from.rarity}>
      <header>
        <span>Enchantment light</span>
        <em>{change.from.rarityLabel} · {category === 'weapon' ? 'inlay + close aura' : 'inside the armor surface'}</em>
      </header>
      <StageLine label={showAfter ? 'Now' : 'Current'} style={change.from} />
      {showAfter && <StageLine label="After" style={change.to} />}
      {showAfter && change.stageChanges && <p className="axe-enchant-stage-up" role="status">
        Success lights {change.to.stageLabel}.
      </p>}
      {!compact && <p className="axe-enchant-note">
        {upcoming ? `${upcoming.label} lights at ${upcoming.min}%.` : 'Highest light reached (200%).'}
        {' '}Enchantment % = reinforcement % + 1 per enchant level + 2.5 per over-enchant level.
      </p>}
    </section>
  );
}
