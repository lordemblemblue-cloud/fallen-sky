// Lakeside manor world builder.
//
// The authored house (rooms, floors, roof, colliders) was not part of the
// migrated source, so this builder reports the failure instead of inventing a
// house. Callers already handle that: WolfveilLunaPalace catches the error and
// mounts its palace scaffold rather than rendering a half-built mansion.
export class ManorSourcesUnavailable extends Error {
  constructor(stage) {
    super(`Lakeside manor sources are not available in this build (stage: ${stage}).`);
    this.name = 'ManorSourcesUnavailable';
    this.stage = stage;
  }
}

export function buildLakesideManorWorld() {
  throw new ManorSourcesUnavailable('build');
}

export function canWalkManor() {
  return true;
}

export function getLunaManorConstructionStage() {
  return 'sources_unavailable';
}

export default buildLakesideManorWorld;