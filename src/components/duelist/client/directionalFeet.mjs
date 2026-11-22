// Turn the authored stride toward travel while keeping the torso and knees facing the duel.
// Solve to each foot's new position; never move the actor root or the simulation body.
import { Quaternion, Vector3 } from 'three';

export function createDirectionalFeet(model) {
  const legs = [];
  for (const side of ['Left', 'Right']) {
    const bones = ['UpLeg', 'Leg', 'Foot'].map(name => model.getObjectByName('mixamorig' + side + name));
    if (bones.some(bone => !bone)) return null;
    const [hip, knee, foot] = bones;
    const offset = model.worldToLocal(foot.getWorldPosition(new Vector3()))
      .sub(model.worldToLocal(hip.getWorldPosition(new Vector3())));
    legs.push({ hip, knee, foot, offset, saved: bones.map(() => new Quaternion()) });
  }
  const hipPosition = new Vector3(), kneePosition = new Vector3(), ankle = new Vector3(), goal = new Vector3();
  const axis = new Vector3(), pole = new Vector3(), joint = new Vector3();
  const from = new Vector3(), to = new Vector3(), restOffset = new Vector3();
  const turn = new Quaternion(), local = new Quaternion(), footWorld = new Quaternion();
  let applied = false;
  function pointBone(bone, child, target) {
    bone.getWorldPosition(from);
    to.copy(target).sub(from).normalize();
    child.getWorldPosition(axis).sub(from).normalize();
    turn.setFromUnitVectors(axis, to);
    bone.getWorldQuaternion(local).premultiply(turn);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(turn).invert().multiply(local));
  }
  return {
    restore() {
      if (!applied) return;
      for (const { hip, knee, foot, saved } of legs) {
        hip.quaternion.copy(saved[0]); knee.quaternion.copy(saved[1]); foot.quaternion.copy(saved[2]);
      }
      applied = false;
    },
    pose(lateral, forward, weight) {
      if (weight < 0.005 || Math.abs(lateral) + Math.abs(1 - forward) < 0.02) return;
      applied = true;
      for (const { hip, knee, foot, offset, saved } of legs) {
        saved[0].copy(hip.quaternion); saved[1].copy(knee.quaternion); saved[2].copy(foot.quaternion);
        hip.getWorldPosition(hipPosition); knee.getWorldPosition(kneePosition); foot.getWorldPosition(ankle);
        foot.getWorldQuaternion(footWorld);
        restOffset.copy(model.worldToLocal(to.copy(ankle))).sub(model.worldToLocal(from.copy(hipPosition))).sub(offset);
        // Limit cross-steps: a strafe has a shorter step width than a forward lunge.
        const swing = restOffset.z;
        goal.copy(model.worldToLocal(to.copy(ankle)));
        goal.x += lateral * swing * weight * 0.58;
        goal.z += (forward - 1) * swing * weight;
        model.localToWorld(goal);
        const thigh = hipPosition.distanceTo(kneePosition), shin = kneePosition.distanceTo(ankle);
        axis.copy(goal).sub(hipPosition);
        const reach = Math.min(axis.length(), thigh + shin - 1e-5);
        if (reach <= Math.abs(thigh - shin) + 1e-5) continue;
        axis.normalize();
        pole.copy(kneePosition).sub(hipPosition).addScaledVector(axis, -to.copy(kneePosition).sub(hipPosition).dot(axis));
        if (pole.lengthSq() < 1e-9) continue;
        const along = (reach * reach + thigh * thigh - shin * shin) / (2 * reach);
        joint.copy(hipPosition).addScaledVector(axis, along)
          .addScaledVector(pole.normalize(), Math.sqrt(Math.max(0, thigh * thigh - along * along)));
        goal.copy(hipPosition).addScaledVector(axis, reach);
        pointBone(hip, knee, joint);
        pointBone(knee, foot, goal);
        foot.quaternion.copy(knee.getWorldQuaternion(local).invert().multiply(footWorld));
      }
    },
  };
}
