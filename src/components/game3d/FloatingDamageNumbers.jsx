import React, { useEffect, useState } from 'react';

// Presentation-only combat text. Each strike still has one damage resolver;
// nearby same-kind hits may be added together for legibility.
const LIFETIME = 1.1;
const COLORS = {
  normal: '#f5fbff',
  critical: '#ffe1a1',
  lethal: '#ffd08a',
  miss: '#b8c8d8',
  xp: '#fde68a',
};

export default function FloatingDamageNumbers({ entries }) {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    let raf;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {entries.map((e) => {
        const age = Math.max(0, (now - e.born) / 1000);
        if (age >= LIFETIME) return null;
        const t = age / LIFETIME;
        const opacity = Math.min(1, t / 0.12, (1 - t) / 0.44);
        const kind = e.type === 'xp' ? 'xp' : e.kind || 'normal';
        const critical = kind === 'critical', lethal = kind === 'lethal';
        const dramatic = critical || lethal;
        const text = kind === 'xp' ? `+${e.value} XP`
          : kind === 'miss' ? 'MISS'
          : `${lethal ? 'LETHAL ' : critical ? 'CRIT ' : ''}${e.value}${e.hits > 1 ? ` ×${e.hits}` : ''}`;
        const driftY = -t * (dramatic ? 54 : 40);
        const scale = t < 0.12 ? 0.8 + t / 0.12 * 0.35 : 1.15 - t * 0.14;

        return (
          <div
            key={e.id}
            className="absolute font-bold tabular-nums select-none whitespace-nowrap"
            style={{
              left: e.x,
              top: e.y,
              transform: `translate(-50%, calc(-100% + ${driftY}px)) scale(${scale})`,
              opacity,
              color: COLORS[kind] || COLORS.normal,
              fontSize: dramatic ? '26px' : kind === 'miss' ? '17px' : kind === 'xp' ? '18px' : '21px',
              fontWeight: dramatic ? 900 : 700,
              textShadow: dramatic
                ? '0 0 10px rgba(252,196,104,.85), 0 2px 6px rgba(0,0,0,.95)'
                : '0 0 8px rgba(120,197,242,.48), 0 2px 5px rgba(0,0,0,.95)',
              letterSpacing: dramatic ? '0.075em' : '0.02em',
            }}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}
