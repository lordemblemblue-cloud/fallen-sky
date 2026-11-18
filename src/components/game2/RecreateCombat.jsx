import { useCallback, useState } from 'react';

// Independent, deterministic combat prototype. No legacy saber/Force modules are imported.
// This is a test harness, not a claim of full animation or collision parity.
const MAX_HP = 100;
const initial = () => ({ player: MAX_HP, opponent: MAX_HP, stamina: 100, guard: false, combo: 0, log: 'Ready to spar.', rounds: 0 });
export function resolveRecreateAction(state, action) {
  if (action === 'reset') return initial();
  if (state.player <= 0 || state.opponent <= 0) return state;
  if (action === 'guard') return { ...state, guard: !state.guard, stamina: Math.min(100, state.stamina + 8), log: state.guard ? 'Guard lowered.' : 'Guard raised.' };
  if (action === 'recover') return { ...state, stamina: Math.min(100, state.stamina + 24), guard: false, log: 'Recovered stamina.' };
  const costs = { light: 12, heavy: 28, parry: 18 };
  if (!(action in costs)) return state;
  if (state.stamina < costs[action]) return { ...state, log: 'Not enough stamina.' };
  const next = { ...state, guard: false, stamina: state.stamina - costs[action], rounds: state.rounds + 1 };
  const incoming = next.rounds % 3 === 0 ? 18 : 10;
  if (action === 'parry') {
    next.player = Math.max(0, state.player - (state.guard ? 0 : 3));
    next.opponent = Math.max(0, state.opponent - (state.guard ? 17 : 8));
    next.combo = 0;
    next.log = state.guard ? 'Perfect parry and counter!' : 'Counter landed; imperfect timing.';
  } else {
    const damage = action === 'heavy' ? 25 : 10 + Math.min(3, state.combo) * 3;
    next.opponent = Math.max(0, state.opponent - damage);
    next.player = Math.max(0, state.player - (state.guard ? Math.ceil(incoming / 4) : incoming));
    next.combo = action === 'light' ? state.combo + 1 : 0;
    next.log = (action === 'heavy' ? 'Heavy strike' : 'Quick strike') + ' dealt ' + damage + ' damage.';
  }
  if (!next.opponent) next.log += ' Victory!';
  else if (!next.player) next.log += ' Defeated.';
  return next;
}
export default function RecreateCombat() {
  const [state, setState] = useState(initial);
  const act = useCallback(action => setState(previous => resolveRecreateAction(previous, action)), []);
  return <div className="space-y-4" data-testid="game2-recreate-combat">
    <p className="text-sm text-white/70">Isolated original combat prototype. The existing Game 2 engine is unchanged. Test attack, guard, counter, and stamina rules here before integrating animation and real hit detection.</p>
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="rounded-lg border border-white/20 p-3">Player HP: <strong>{state.player}/{MAX_HP}</strong><div>Stamina: {state.stamina}/100</div></div>
      <div className="rounded-lg border border-white/20 p-3">Opponent HP: <strong>{state.opponent}/{MAX_HP}</strong><div>Combo: {state.combo}</div></div>
    </div>
    <p role="status" className="min-h-10 text-sm text-cyan-200">{state.log}</p>
    <div className="flex flex-wrap gap-2">{[
      ['light','Quick attack'],['heavy','Heavy attack'],['guard',state.guard ? 'Lower guard' : 'Raise guard'],
      ['parry','Counter'],['recover','Recover'],['reset','Reset']
    ].map(([id,label]) => <button key={id} type="button" onClick={() => act(id)}
      className="rounded-lg border border-cyan-200/30 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-200/10">{label}</button>)}</div>
    <p className="text-xs text-amber-100/70">Prototype only: no character animation, 3D collision, AI movement, or network combat yet.</p>
  </div>;
}
