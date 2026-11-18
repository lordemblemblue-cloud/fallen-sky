import {
  axeStatLabel, axeStatSourceParts, formatAXEStatBonus, formatAXEStatValue,
} from './AXEItemStatBreakdown.mjs';
import './AXEItemStatBreakdownList.css';

// One presentation of the per-item stat breakdown (Blacksmith v2) for every screen:
// `Attack 1,000 (+150)`, the effective total, and colour-coded Combine / Enchant / Ascend
// parts. With `projected` (the same item after a successful operation), each row also shows
// the increase and total that operation would give.
export default function AXEItemStatBreakdownList({
  rows = [], projected = null, compare = null, compareLabel = 'Equipped', showSources = true,
  empty = 'No stat modifiers on this piece.', label = 'Item stats', className = '',
}) {
  const projectedByStat = new Map((projected || []).map((row) => [row.stat, row]));
  const compareByStat = new Map((compare || []).map((row) => [row.stat, row]));
  const stats = [...new Set([...rows.map((row) => row.stat), ...(compare || []).map((row) => row.stat)])];
  if (!stats.length) return <p className={'axe-stat-breakdown-empty ' + className}>{empty}</p>;
  return <ul className={'axe-stat-breakdown ' + className} aria-label={label}>
    {stats.map((stat) => {
      const row = rows.find((entry) => entry.stat === stat) || null;
      const next = projectedByStat.get(stat) || null;
      const other = compareByStat.get(stat) || null;
      const rate = row?.rate ?? other?.rate ?? false;
      const changed = next && Math.abs((next.total || 0) - (row?.total || 0)) > 1e-9;
      // a stat the compared item lacks counts as 0 there
      const comparing = Array.isArray(compare);
      const delta = comparing ? (row?.total || 0) - (other?.total || 0) : 0;
      return <li key={stat} className="axe-stat-breakdown-row" data-stat={stat}>
        <span className="axe-stat-breakdown-name">{axeStatLabel(stat)}</span>
        <span className="axe-stat-breakdown-value">
          {row ? <>
            <b>{formatAXEStatValue(row.original, rate)}</b>
            {(Math.abs(row.bonus) > 1e-9 || changed) && <em className="axe-stat-breakdown-bonus">({formatAXEStatBonus(row.bonus, rate)}{changed
              ? <> → {formatAXEStatBonus(next.bonus, rate)}</> : null})</em>}
          </> : <b>—</b>}
        </span>
        <span className="axe-stat-breakdown-total" title="Effective value">
          {row ? <>= {formatAXEStatValue(row.total, rate)}{changed ? <> → <strong>{formatAXEStatValue(next.total, rate)}</strong></> : null}</> : null}
          {comparing && <small className={delta > 1e-9 ? 'is-better' : delta < -1e-9 ? 'is-worse' : ''}
            title={compareLabel + ': ' + formatAXEStatValue(other?.total || 0, rate)}>
            {Math.abs(delta) > 1e-9 ? formatAXEStatBonus(delta, rate) : '±0'} vs {compareLabel.toLowerCase()}
          </small>}
        </span>
        {showSources && row && axeStatSourceParts(row).length > 0 && <span className="axe-stat-breakdown-sources">
          {axeStatSourceParts(row).map((part) => <i key={part.id} data-source={part.id}>{part.label} {part.text}</i>)}
        </span>}
      </li>;
    })}
  </ul>;
}
