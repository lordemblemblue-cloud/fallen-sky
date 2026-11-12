import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { getAXEPetState, subscribeAXEPets } from '../progression/AXEPetStore';
import {
  getAXESoulRegaliaState, subscribeAXESoulRegalia, setAXESoulFusion,
} from '../progression/AXESoulRegaliaStore';
import { isSoulCompanionMastered } from '../progression/AXESoulRegaliaSystem';
import './AXECompanionFusionButton.css';

// Reuse the existing, validated soul-fusion transaction wherever the Companion
// viewer appears. This is not the separate Mounts absorption mechanic.
export default function AXECompanionFusionButton({ onNotice = () => {} }) {
  const [pets, setPets] = useState(getAXEPetState);
  const [soul, setSoul] = useState(getAXESoulRegaliaState);

  useEffect(() => subscribeAXEPets(setPets), []);
  useEffect(() => subscribeAXESoulRegalia(setSoul), []);

  const registered = pets.pets?.find(pet => pet.instanceId === pets.activeRegisteredPetId);
  const mastered = isSoulCompanionMastered(registered);
  const fused = !!soul.fused;
  const disabled = !fused && !mastered;

  const toggleFusion = () => {
    const result = setAXESoulFusion(!fused);
    if (result?.ok === false) {
      onNotice(result.reason === 'MAX_COMPANION_REQUIRED'
        ? 'Register and fully master your companion before fusion.'
        : result.reason === 'SAVE_FAILED'
          ? 'Could not save companion fusion.'
          : 'Companion fusion could not be changed.');
      return;
    }
    onNotice(fused ? 'Companion soul fusion separated.' : 'Companion soul fusion activated.');
  };

  return <button type="button" className="axe-comp-fusion-control"
    onClick={toggleFusion} disabled={disabled} aria-pressed={fused}
    aria-label={fused ? 'Separate companion fusion' : 'Fuse with registered companion'}
    title={disabled ? 'Requires a registered companion at Level 200 and 200% Over-Enchantment'
      : fused ? 'Separate the current soul bond' : 'Fuse with your fully mastered companion'}>
    <Link2 size={17} aria-hidden="true"/>
    <span>{fused ? 'Fusion · Active' : 'Fusion'}</span>
  </button>;
}
