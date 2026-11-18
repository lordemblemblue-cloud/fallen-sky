// Node graph of a GLB as three.js objects (no loaders, no DOM), plus a cached sampler for its animations. Used by the
// offline retargeter: it poses a skeleton from a clip and reads world transforms without a browser.
import * as THREE from 'three';
import { readAccessor } from './glb-io.mjs';

export function buildNodeGraph(glb) {
  const J = glb.json;
  const objects = J.nodes.map((n, i) => {
    const o = new THREE.Object3D();
    o.name = n.name || `node_${i}`;
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    o.userData.index = i;
    return o;
  });
  J.nodes.forEach((n, i) => (n.children || []).forEach((c) => objects[i].add(objects[c])));
  const root = new THREE.Object3D();
  for (const i of J.scenes[J.scene || 0].nodes) root.add(objects[i]);
  const rest = objects.map((o) => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));
  const byName = new Map(objects.map((o) => [o.name, o]));
  const reset = () => objects.forEach((o, i) => { o.position.copy(rest[i].p); o.quaternion.copy(rest[i].q); o.scale.copy(rest[i].s); });
  const update = () => root.updateMatrixWorld(true);
  update();
  return { root, objects, byName, rest, reset, update };
}

// Linear / step sampler over an animation's transform channels, with accessors read once.
export function animationSampler(glb, anim) {
  const channels = anim.channels.filter((ch) => ch.target.path !== 'weights').map((ch) => {
    const s = anim.samplers[ch.sampler];
    return { node: ch.target.node, path: ch.target.path, step: s.interpolation === 'STEP', times: readAccessor(glb, s.input).map((r) => r[0]), values: readAccessor(glb, s.output) };
  });
  const duration = Math.max(0, ...channels.map((c) => c.times[c.times.length - 1] || 0));
  function apply(graph, t) {
    for (const c of channels) {
      const { times, values } = c;
      let v;
      if (t <= times[0] || times.length === 1) v = values[0];
      else if (t >= times[times.length - 1]) v = values[times.length - 1];
      else {
        let lo = 0, hi = times.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid; else hi = mid; }
        const k = c.step ? 0 : (t - times[lo]) / (times[hi] - times[lo]);
        const a = values[lo], b = values[hi];
        if (c.path === 'rotation') {
          const qa = new THREE.Quaternion().fromArray(a), qb = new THREE.Quaternion().fromArray(b);
          v = qa.slerp(qb, k).toArray();
        } else v = a.map((x, j) => x + (b[j] - x) * k);
      }
      const o = graph.objects[c.node];
      if (c.path === 'rotation') o.quaternion.fromArray(v);
      else if (c.path === 'translation') o.position.fromArray(v);
      else if (c.path === 'scale') o.scale.fromArray(v);
    }
  }
  return { duration, apply };
}
