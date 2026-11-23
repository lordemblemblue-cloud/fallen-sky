// Inline SVG ability artwork keeps each bubble sharp on high-DPI phone screens.
import {
  ArrowUpRight, Cross, EyeOff, Feather, Flame, Focus, Hand, HeartPulse,
  Magnet, Radar, RotateCw, ShieldCheck, ShieldPlus, Shuffle, Skull,
  Sparkles, Swords, Waves, Zap,
} from 'lucide-react';

const ART = Object.freeze({
  leapStrike: ArrowUpRight, grip: Hand, repulse: Radar,
  bladeThrow: RotateCw, pull: Magnet, quickstep: Zap,
  quickstepAura: Zap, counter: ShieldCheck, cloak: EyeOff,
  push: Waves, empower: Flame, dominate: Shuffle,
  mend: HeartPulse, levitate: Feather, rage: Flame,
  execution: Swords, shadowExecution: Skull, sanctuary: ShieldPlus,
});

export default function DuelistTouchArtwork({ skillId }) {
  const Icon = ART[skillId] || Sparkles;
  return <Icon className="mobile-duelist-ability-art" aria-hidden="true" strokeWidth={2.2}/>;
}
