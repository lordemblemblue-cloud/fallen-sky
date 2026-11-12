import AvatarAppearanceDialog from '@/components/onboarding/AvatarAppearanceDialog';
import {createCharacter} from './characterStore';
// Game 3D-only creator. Embedded mode keeps the character creation controls
// in the SAME live Wolfveil menu, without touching the shared account avatar.
export default function CharacterCreationModal({onClose,onCreated,factionId,embedded=false}){
  return <AvatarAppearanceDialog create localOnly embedded={embedded}
    onClose={onClose}
    onSaved={(avatar,name)=>onCreated?.(createCharacter({name,avatarConfig:avatar,factionId}))}/>;
}
