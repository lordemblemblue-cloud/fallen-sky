import * as THREE from 'three';

// Real floor-space warning, aimed once when an attack starts. Geometry is
// shared per arc category, so a crowd does not allocate new mesh per frame.
const MAX_WARNINGS = 30;
function buildSector(arcDeg) {
  const vertices = [0, 0.0, 0];
  const triangles = [];
  const count = 20;
  for (let i = 0; i <= count; i++) {
    const angle = ((i / count - 0.5) * arcDeg) * Math.PI / 180;
    vertices.push(Math.sin(angle), 0, Math.cos(angle));
    if (i > 0) triangles.push(0, i, i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

export function createEnemyAttackTelegraphs(scene, { maxWarnings = MAX_WARNINGS } = {}) {
  const warnings = new Map();
  const geometryCache = new Map();
  const limited = Math.max(1, Math.min(50, maxWarnings));

  const clear = (enemy) => {
    const info = warnings.get(enemy);
    if (!info) return;
    scene.remove(info.mesh);
    info.mesh.material.dispose();
    warnings.delete(enemy);
  };
  const begin = (enemy, plan) => {
    clear(enemy);
    if (!enemy?.group?.position || !plan || enemy.group.visible === false) return;
    if (warnings.size >= limited) clear(warnings.keys().next().value);
    const arc = Math.round(plan.arcDegrees);
    if (!geometryCache.has(arc)) geometryCache.set(arc, buildSector(arc));
    const material = new THREE.MeshBasicMaterial({
      color: plan.variant === 'sweep' ? 0xf5b865 : 0xffd799,
      transparent: true, opacity: 0.23, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(geometryCache.get(arc), material);
    mesh.name = 'AXEEnemyAttackWarning';
    mesh.renderOrder = 3;
    mesh.position.set(enemy.group.position.x, enemy.group.position.y + 0.06, enemy.group.position.z);
    mesh.rotation.y = plan.facingYaw;
    mesh.scale.setScalar(plan.range);
    scene.add(mesh);
    warnings.set(enemy, { mesh, remaining: plan.windup, total: plan.windup });
  };
  const update = (delta) => {
    const dt = Math.max(0, Math.min(0.1, Number(delta) || 0));
    for (const [enemy, warning] of warnings) {
      if (!enemy?.alive || enemy.dying || enemy.defeated || !enemy.attacking ||
          !enemy.group?.parent || enemy.group.visible === false) {
        clear(enemy);
        continue;
      }
      warning.remaining -= dt;
      if (warning.remaining <= 0) { clear(enemy); continue; }
      warning.mesh.position.set(
        enemy.group.position.x, enemy.group.position.y + 0.06, enemy.group.position.z,
      );
      const progress = 1 - warning.remaining / Math.max(0.01, warning.total);
      warning.mesh.material.opacity = 0.17 + progress * 0.20;
    }
  };
  const dispose = () => {
    [...warnings.keys()].forEach(clear);
    for (const geometry of geometryCache.values()) geometry.dispose();
    geometryCache.clear();
  };
  return { begin, clear, update, dispose };
}
