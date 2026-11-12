// Game 3D / Quest 17.2 — the single opted-in verified HUD session.
// This module is inert unless the authenticated Base44 17.0 reader is enabled.
import {createAXEVerifiedQuestbookSession172}
  from './AXEVerifiedQuestbookSession172';
import {createAXEQuestbookReadModel169}
  from './AXEQuestbookReadModel169';
import {verifiedQuestbookReader170} from './AXEQuestbookRemoteReader170';
import {getActiveId,getStorageUser,subscribeCharacterChange}
  from '../../characterStorage';

const valid = x => typeof x === 'string' &&
  /^[A-Za-z0-9_-]{1,128}$/.test(x) &&
  !['__anon__','__default__','__dev_test__'].includes(x);

export const verifiedQuestbookSession172 = createAXEVerifiedQuestbookSession172({
  reader: verifiedQuestbookReader170,
  createModel: createAXEQuestbookReadModel169,
  getIdentity: () => {
    const owner = getStorageUser(), character = getActiveId();
    // Presentation fence only. The backend independently authorizes owner
    // and character; this client namespace cannot grant gameplay progress.
    return valid(owner) && valid(character) ? owner + '\0' + character : null;
  },
  subscribeIdentityChange: subscribeCharacterChange,
  pollMs: 20000,
});
