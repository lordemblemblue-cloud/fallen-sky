import { Eye, RefreshCw } from 'lucide-react';
import './AXECompanionModelViewControl.css';

// One small preview switch directly above the 3D model, not buried in a
// scrollable details panel or duplicated on the inventory surface.
export default function AXECompanionModelViewControl({owner='wardrobe',onChange}) {
  const showingPlayer=owner==='wardrobe';
  const nextOwner=showingPlayer?'companion':'wardrobe';
  return <button type="button" className="axe-comp-model-view-switch"
    data-model-view={owner}
    aria-label={'Switch 3D preview to '+(showingPlayer?'Companion':'Player')}
    title={'Switch to '+(showingPlayer?'Companion':'Player')+' 3D preview'}
    onClick={()=>onChange?.(nextOwner)}>
    <Eye size={15} aria-hidden="true"/>
    <span>View: {showingPlayer?'Player':'Companion'}</span>
    <RefreshCw size={13} aria-hidden="true"/>
  </button>;
}
