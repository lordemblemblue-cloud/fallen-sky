import test from 'node:test';
import assert from 'node:assert/strict';
import { createOTSCameraColliders } from '../src/components/game3d/player/otsCameraColliders.mjs';

test('OTS camera ignores meshes hidden by an interior ceiling group',()=>{
  const roof={isMesh:true,visible:true,userData:{},children:[],parent:null};
  const shell={visible:true,children:[roof],parent:null};
  roof.parent=shell;
  const root={visible:true,children:[shell],userData:{otsCameraRevision:0},
    traverse(callback){callback(this);callback(shell);callback(roof);}};
  shell.parent=root;
  const resolve=createOTSCameraColliders({groundMeshes:[],roots:()=>[root]});
  assert.deepEqual(resolve(),[roof]);
  shell.visible=false;
  root.userData.otsCameraRevision++;
  assert.deepEqual(resolve(),[],'cutaway ceiling must no longer obstruct the camera');
  shell.visible=true;
  root.userData.otsCameraRevision++;
  assert.deepEqual(resolve(),[roof],'exiting restores camera collisions');
});
