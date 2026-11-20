// Image-backed translucent HUD. SVGs contain ONLY original ornament and glass
// shapes; game data (HP, cooldowns, objective ownership) is dynamic and accessible.
import { useRef, useState } from 'react';
import { ChevronRight, Focus, Hand, Magnet, MoveUpRight, Shield, Sparkles, Waves, Wind } from 'lucide-react';
import { BODIES } from './assets.mjs';
import { ABILITY_PAGES, canPressAbility, healthNumbers, pageSwitchCommands, specialPercent } from './glassHud.mjs';

const ICONS = { push: Waves, pull: Magnet, grip: Hand, breach: Focus, dash: Wind, resist: Shield };
const FULL = 2 * Math.PI * 62;

export default function GlassHud({ hud, fighter = 'maskedWarrior', onPower }) {
  const [page, setPage] = useState(0);
  const gripping = useRef(false);
  if (!hud?.you) return null;
  const v = hud.you;
  const special = specialPercent(v.special);
  const fighterName = BODIES[fighter]?.name || 'Duelist';
  const powers = ABILITY_PAGES[page].map(id => (hud.powers || []).find(p => p.id === id))
    .filter(Boolean);
  const activate = id => {
    const power = powers.find(p => p.id === id);
    if (!canPressAbility(power, v.dead)) return;
    if (id === 'grip') {
      onPower?.(gripping.current ? 'release' : 'grip');
      gripping.current = !gripping.current;
    } else {
      gripping.current = false;
      onPower?.(id);
    }
  };
  const nextPage = () => {
    for (const command of pageSwitchCommands(gripping.current)) onPower?.(command);
    gripping.current = false;
    setPage(x => (x + 1) % ABILITY_PAGES.length);
  };
  return (
    <div className="duelist-glass-hud" data-testid="duelist-glass-hud">
      <section className="duelist-player-glass" aria-label="Player portrait and health">
        <div className="duelist-player-portrait" role="img"
          aria-label={`${fighterName} portrait emblem`}>
          <img src="/ui/duelist/glass-portrait.svg" alt="" />
        </div>
        <div className="duelist-player-readout">
          <div className="duelist-player-name">{fighterName}</div>
          <div className="duelist-player-hp-number">
            <span>HP</span> <strong>{healthNumbers(v.hpValue, v.hpMax)}</strong>
          </div>
          <div className="duelist-player-hp-rail" role="progressbar"
            aria-label="Health" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(v.hp * 100)}>
            <span style={{ width: `${Math.max(0, Math.min(100, v.hp * 100))}%` }} />
          </div>
          <div className="duelist-player-secondary">
            <span>SHIELD {Math.round(v.shield * 100)}%</span>
            {!v.noVeil && <span>WILL {Math.round(v.will * 100)}%</span>}
            {v.dead && <span>DEFEATED</span>}
          </div>
        </div>
      </section>

      <section className="duelist-special-glass" aria-label="Class special ability">
        <img className="duelist-special-template" src="/ui/duelist/glass-special.svg" alt="" />
        <svg className="duelist-special-progress" viewBox="0 0 190 190" aria-hidden="true">
          <circle cx="95" cy="94" r="62" fill="none" stroke="#ffc369" strokeWidth="9"
            strokeDasharray={`${(special ?? 0) / 100 * FULL} ${FULL}`}
            transform="rotate(-90 95 94)" strokeLinecap="round" />
        </svg>
        <Sparkles className="duelist-special-emblem" aria-hidden="true" />
        <span className="duelist-special-value">{special === null ? '—' : `${special}%`}</span>
        <span className="duelist-special-hint">{special === null ? 'SPECIAL PENDING' : 'SPECIAL'}</span>
      </section>

      <nav className="duelist-ability-bank" aria-label="Three active abilities">
        <div className="duelist-ability-page">
          <span>ABILITIES {page + 1}/2</span>
          <button type="button" onClick={nextPage}
            title="Show other abilities" aria-label="Show other three abilities">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <div className="duelist-ability-slots">
          {powers.map(p => {
            const Icon = ICONS[p.id] || MoveUpRight;
            return (
              <button type="button" key={p.id} className="duelist-ability-glass"
                data-testid={`duelist-ability-${p.id}`} onClick={() => activate(p.id)}
                aria-label={`${p.id}, key ${p.key}${p.ready > 0 ? `, ${p.ready.toFixed(1)} seconds cooldown` : ''}`}
                disabled={!canPressAbility(p, v.dead)}>
                <Icon aria-hidden="true" className="duelist-ability-symbol" />
                <span className="duelist-ability-key">{p.key}</span>
                <span className="duelist-ability-label">{p.id === 'grip' ? 'Grip / Throw' : p.id}</span>
                {p.ready > 0 && <span className="duelist-ability-cooldown">{p.ready.toFixed(1)}</span>}
              </button>
            );
          })}
        </div>
      </nav>
      {hud.lockOn && <div className="duelist-lock">Locked on</div>}
    </div>
  );
}
