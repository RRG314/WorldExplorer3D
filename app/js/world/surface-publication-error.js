// Missing physical surfaces cannot be recovered as a playable partial world.
// Provider failures may use recorded data; a compiler failure must stay visible.
import {finishFailedWorldLoad} from './load-failure.js';
export class SurfacePublicationError extends Error {
  constructor(stage,cause) {
    super(`Street surfaces could not be published (${stage}): ${cause?.message || cause}`,{cause});
    this.name='SurfacePublicationError';
    this.code='STREET_SURFACE_PUBLICATION_FAILED';
    this.stage=stage;
  }
}
export const isSurfacePublicationError = error => error?.code==='STREET_SURFACE_PUBLICATION_FAILED';

export function finishFailedSurfaceLoad(session = {},error) {
  return finishFailedWorldLoad(session, error, {
    reason: 'street-surface-publication-failed',
    message: 'Street surfaces could not finish loading. This location has not been published. Return to the menu to try again.'
  });
}
