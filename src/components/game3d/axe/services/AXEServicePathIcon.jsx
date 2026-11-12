import { CircleDot, Crosshair, Feather, Shield, Sparkles, Swords } from 'lucide-react';

const PATH_ICONS = { strength: Swords, vitality: Shield, endurance: Shield,
  dexterity: Crosshair, precision: Crosshair, spirit: Sparkles, harmony: CircleDot };

export default function AXEServicePathIcon({ pathId, className = 'h-5 w-5' }) {
  const Icon = PATH_ICONS[pathId] || Feather;
  return <Icon className={className} aria-hidden="true" />;
}
