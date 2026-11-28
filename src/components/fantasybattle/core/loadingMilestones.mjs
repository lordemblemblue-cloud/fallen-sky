// Report completed setup milestones, not estimated bytes or a simulated timer.
// Stage 1: a validated local profile / encounter has been selected.
// Stage 2: world ready / arena ready acknowledgement.
// Stage 3: restored acknowledgement / initialized combat HUD.
const WORLD=Object.freeze(['Adventure selected','3D renderer ready','Saved world and position restored']);
const BATTLE=Object.freeze(['Encounter selected','Battleground ready','Combat renderer and fighters ready']);
export function loadingMilestones(battle,stage){
  const steps=battle?BATTLE:WORLD;
  const completed=Number.isInteger(stage)?Math.min(steps.length,Math.max(0,stage)):0;
  const message=completed===steps.length?'Ready to enter':completed===0?'Preparing your journey':battle?(completed===1?'Preparing battleground…':'Loading fighters and combat renderer…'):(completed===1?'Initializing the 3D world…':'Restoring your saved position…');
  return {steps,completed,total:steps.length,message};
}
