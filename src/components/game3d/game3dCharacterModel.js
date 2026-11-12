// Game 3D can play a locally-created Eve/Adam body without replacing the
// account avatar's canonical Artemis/Getsuga model used by other games/cards.
// Only approved creator bodies are resolved; never load a saved arbitrary URL.
import {creatorBody} from '@/components/onboarding/avatarCustomization';
import {companionModel} from '@/components/onboarding/genesisAssets';
import {FUSED_FEMALE_CHARACTER_MODEL_URL,FUSED_MALE_CHARACTER_MODEL_URL} from '@/lib/characterModelOverrides';

export function game3dCharacterModel(appearance={}) {
  const body=creatorBody(appearance);
  if (!body) return companionModel(appearance);
  // v1 is the editor/sculpt preview. Game 3D uses the animated v2 GLB,
  // with Idle / Walk / Run / Dodge and authored ability clips.
  return body.gender==='female'?FUSED_FEMALE_CHARACTER_MODEL_URL:FUSED_MALE_CHARACTER_MODEL_URL;
}
