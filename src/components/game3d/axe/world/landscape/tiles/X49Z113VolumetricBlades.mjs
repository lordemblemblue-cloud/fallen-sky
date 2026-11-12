/**
 * X49-Z113 exclusively: geometry recipe for short root-anchored lawn blades.
 * Volumetric three-sided leaves, not two intersecting '+' billboard planes.
 * Normalized local Y is scaled per instance to the 7.5-13cm authored height.
 * Pure geometry; no THREE import, world writes, collisions or new textures.
 */
export function makeX49Z113VolumetricGrassClump() {
  const positions = [], indices = [];
  const bladeCount = 9;
  for (let i = 0; i < bladeCount; i++) {
    const base = positions.length / 3;
    const rootX = (i - 4) * .068;
    const rootZ = ((i * 7) % 5 - 2) * .051;
    const angle = i * 2.399963229728653;
    const radius = .013 + (i % 3) * .0015;
    const height = .83 + (i % 4) * .055;
    // Small leaning tips, never disconnected from root or dragged by wind.
    const leanX = Math.sin(i * 1.73) * .026;
    const leanZ = Math.cos(i * 1.21) * .027;
    for (let ring = 0; ring < 2; ring++) {
      const y = ring ? height * .58 : 0;
      const taper = ring ? .54 : 1;
      for (let face = 0; face < 3; face++) {
        const theta = angle + face * Math.PI * 2 / 3;
        positions.push(rootX + leanX * (ring ? .44 : 0) + Math.cos(theta) * radius * taper,
          y, rootZ + leanZ * (ring ? .44 : 0) + Math.sin(theta) * radius * taper);
      }
    }
    positions.push(rootX + leanX, height, rootZ + leanZ);
    for (let face = 0; face < 3; face++) {
      const next = (face + 1) % 3;
      indices.push(base + face, base + next, base + 3 + face,
        base + next, base + 3 + next, base + 3 + face,
        base + 3 + face, base + 3 + next, base + 6);
    }
  }
  return Object.freeze({
    positions: Object.freeze(positions), indices: Object.freeze(indices),
    bladeCount, facesPerBlade: 9, verticesPerBlade: 7,
    doubleSided: true, vertical: true, heightNormalized: true,
    noCrossCards: true, rootAnchored: true, purelyDecorative: true,
  });
}
