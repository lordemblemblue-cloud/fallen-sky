// Camera composition for the live Game 2 deployment screen.
// The selected character is already being rendered by the actual game; this
// only moves the CINEMATIC camera so it appears within the transparent left
// preview area, not behind the right-side loadout panel.
export function game2DeploymentCamera(playerPos,viewportWidth,viewportHeight){
  const width=Math.max(1,viewportWidth||1280);
  const height=Math.max(1,viewportHeight||720);
  const compact=width<800;
  const fov=56*Math.PI/180;
  const distance=compact?5:4.7;
  const visibleWidth=2*distance*Math.tan(fov/2)*(width/height);
  const fraction=compact?0.5:0.225; // center of left 44.75% column
  const centerX=playerPos[0]+(0.5-fraction)*visibleWidth;
  return {
    eye:[centerX,playerPos[1]+1.65,playerPos[2]+distance],
    target:[centerX,playerPos[1]+(compact?0.2:1.08),playerPos[2]],
    fov,
  };
}
