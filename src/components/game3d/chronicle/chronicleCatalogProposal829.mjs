import { cleanBlueprint, slotIndex } from './chronicleBlueprintModel.mjs';

export const CHRONICLE_REVIEW_PROPOSAL_SCHEMA_829 = 'axe-game3d-creator-proposal-829-v1';

export function createChronicleReviewProposal829({ boxId, index, blueprint } = {}) {
  if (typeof boxId !== 'string' ||
      !/^[A-Za-z0-9_.:-]{1,100}$/.test(boxId)) {
    throw Error('Save this draft in a valid Chronicle collection first');
  }
  const position = slotIndex(index);
  if (!blueprint || typeof blueprint !== 'object' ||
      Array.isArray(blueprint) ||
      typeof blueprint.id !== 'string' ||
      !/^[A-Za-z0-9_.:-]{1,100}$/.test(blueprint.id)) {
    throw Error('Save a valid blueprint before exporting a review proposal');
  }
  const prepared = cleanBlueprint(blueprint);
  return Object.freeze({
    schema: CHRONICLE_REVIEW_PROPOSAL_SCHEMA_829,
    source: Object.freeze({ boxId, slotIndex: position }),
    blueprint: Object.freeze({
      ...prepared,
      stats: Object.freeze({ ...prepared.stats }),
    }),
  });
}
