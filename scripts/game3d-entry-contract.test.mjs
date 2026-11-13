import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = path => readFileSync(new URL('../' + path, import.meta.url),'utf8');

test('Game 3D host provides legacy navigation context inside TanStack client boundary',()=>{
  const host=source('src/components/game3d/Game3DHost.jsx');
  const game=source('src/pages/GameView.jsx');
  assert.match(game,/useNavigate.*from ['"]react-router-dom['"]/);
  assert.match(host,/import\s*\{\s*MemoryRouter\s*\}\s*from\s*['"]react-router-dom['"]/);
  assert.match(host,/<MemoryRouter>[\s\S]*<GameView\s*\/>[\s\S]*<\/MemoryRouter>/);
});

test('Eve and Adam are the canonical local Game 3D creator choices',()=>{
  const creator=source('src/components/onboarding/avatarCustomization.js');
  const options=source('src/components/onboarding/creatorOptions.js');
  const dialog=source('src/components/onboarding/AvatarAppearanceDialog.jsx');
  assert.match(creator,/'fused-female-v1':[\s\S]*?Female_Fused_v2\.glb/);
  assert.match(creator,/'fused-male-v1':[\s\S]*?Male_Fused_v2\.glb/);
  assert.match(options,/\.\.\.Object\.values\(CREATOR_BODIES\)/);
  assert.match(dialog,/localOnly\?\{gender:'male',creator_body:'fused-male-v1'\}/);
});

test('selected avatar loading and world entry use matching canonical models',()=>{
  const game=source('src/components/game3d/game3dCharacterModel.js');
  const viewer=source('src/components/onboarding/creatorStageScene.js');
  const world=source('src/components/game3d/GameWorld3D.jsx');
  const entry=source('src/pages/GameView.jsx');
  assert.match(game,/FUSED_FEMALE_CHARACTER_MODEL_URL/);
  assert.match(game,/FUSED_MALE_CHARACTER_MODEL_URL/);
  // The fused bodies use the original independent Three.js renderer,
  // not the generic post-migration preview that dropped the character stage.
  assert.match(viewer,/new THREE\\.WebGLRenderer/);
  assert.match(viewer,/new GLTFLoader\\(\\)\\.load\\(url/);
  assert.match(viewer,/prepareFusedCreatorGeometry/);
  assert.match(viewer,/featherFusedNeckTone/);
  const css=source('src/components/onboarding/creator-viewport-fix.css');
  assert.match(css,/\\.creator-studio \\.creator-stage\\s*\\{[\\s\\S]*position: absolute/);
  assert.match(css,/\\.axe-login--arcane \\.axe-login-avatar-stage \\.creator-canvas/);

  assert.match(world,/game3dWorldAvatarReady/);
  assert.match(entry,/game3dWorldAvatarReady/);
  assert.match(entry,/onPrepareWorld=/);
});
