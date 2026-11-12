// Shape of the constellation the Echo Chronicle renders.
//
// Presentation only: the projected view is built from the authenticated read
// model, never from local progress, and it carries no rewards.
/**
 * @typedef {Object} ConstellationView
 * @property {string} id
 * @property {boolean} available
 * @property {Array<{id: string, title: string, lit: boolean, x: number, y: number}>} stars
 * @property {Array<[string, string]>} illuminatedEdges
 * @property {boolean} readOnly
 * @property {boolean} rewardsIssued
 */
export const CONSTELLATION_VIEW_VERSION = 1;