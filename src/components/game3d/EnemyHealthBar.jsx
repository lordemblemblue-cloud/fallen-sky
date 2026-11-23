import { enemyHpPresentation } from './enemyHpPresentation.mjs';

/**
 * Readable enemy health tank projected above the actor's head in screen space.
 * Shared by regular hostile creatures and rogue-AI players. The head projection
 * is supplied by the existing world renderer; this is presentation only.
 */
export default function EnemyHealthBar({ x, y, hp, maxHp, level, name, visible }) {
  if (!visible || !Number.isFinite(x) || !Number.isFinite(y)) return null;

  const { current, maximum, percent, readout } = enemyHpPresentation(hp, maxHp);

  return (
    <div
      data-testid="enemy-overhead-hp"
      className="pointer-events-none absolute z-20 select-none"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -100%)',
        width: 'clamp(148px, 13vw, 180px)',
        maxWidth: 'min(180px, 46vw)',
        filter: 'drop-shadow(0 3px 7px rgba(0,0,0,0.75))',
      }}
    >
      {/* Larger, high-contrast name and level label without an oversized panel. */}
      <div className="mb-1 flex items-center justify-center gap-1.5 text-center">
        {Number.isFinite(level) && (
          <span
            className="shrink-0 rounded border border-red-200/35 bg-slate-950/85 px-1.5 py-0.5 text-[11px] font-bold leading-tight text-red-100"
          >
            LV {level}
          </span>
        )}
        <span
          className="max-w-full truncate rounded border border-white/15 bg-slate-950/85 px-2 py-0.5 text-[12px] font-bold leading-tight text-white"
          title={name || 'Enemy'}
        >
          {name || 'Enemy'}
        </span>
      </div>
      {/* 16px high instead of the old 10px bar; current HP stays legible during fights. */}
      <div
        role="progressbar"
        aria-label={`${name || 'Enemy'} health`}
        aria-valuemin={0}
        aria-valuemax={Math.ceil(maximum)}
        aria-valuenow={Math.ceil(current)}
        aria-valuetext={readout}
        className="relative h-4 overflow-hidden rounded-md border border-red-200/45 bg-slate-950/90"
        style={{
          boxShadow: '0 2px 10px rgba(0,0,0,0.6), inset 0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-150"
          style={{
            width: `${percent}%`,
            background: 'linear-gradient(180deg, #ff8e8e 0%, #ee4343 47%, #a61124 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.33), 0 0 8px rgba(239,68,68,.45)',
          }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold leading-none tracking-wide text-white"
          style={{ textShadow: '0 1px 3px #000, 0 0 3px #000' }}
        >
          {readout}
        </span>
      </div>
    </div>
  );
}
