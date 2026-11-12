import { useEffect, useState } from 'react';
import { QUESTS } from '../questData';
import { getQuestState, subscribeQuests } from '../useQuestStore';
import { getJadeQuestTrackerEntries } from './questTrackerViewModel';
import {verifiedQuestbookSession172} from '../axe/quests/AXEVerifiedQuestbookRuntime172';
import {verifiedQuestTrackerEntries172} from '../axe/quests/AXEVerifiedQuestbookSession172';
import './JadeQuestTracker.css';

// The currently visible Game 3D HUD uses JadeSoulHUD. Its predecessor
// HUDMinimapQuest is not mounted, so the real Quest Logbook tracking action
// needs this small read-only HUD surface to become visible in play.
export default function JadeQuestTracker({ onOpenLogbook }) {
  const [questState, setQuestState] = useState(getQuestState);
  const [server, setServer] = useState(verifiedQuestbookSession172.getSnapshot);
  useEffect(() => subscribeQuests(setQuestState), []);
  useEffect(() => verifiedQuestbookSession172.subscribe(setServer), []);
  // When verified reads are enabled, never show localStorage quests as if
  // they were server-confirmed. A failed read shows no quest progress.
  const serverMode = server.enabled;
  const entries = serverMode
    ? (server.status === 'verified'
      ? verifiedQuestTrackerEntries172(server.view, 3) : [])
    : getJadeQuestTrackerEntries(QUESTS, questState, 3);
  if (!entries.length && !serverMode) return null;

  return (
    <section className="jade-quest-tracker" aria-label="Active quest tracker">
      <button className="jade-quest-tracker-open" type="button"
        aria-label="Open Quest Logbook" title="Open Quest Logbook"
        disabled={!onOpenLogbook} onClick={onOpenLogbook}>
        <span>Quest Logbook{serverMode ? ' · Verified' : ''}</span><span aria-hidden="true">↗</span>
      </button>
      <div className="jade-quest-tracker-entries">
        {serverMode && server.status !== 'verified' && (
          <div className="jade-quest-tracker-status" role="status">
            {server.status === 'loading'
              ? 'Checking verified quests…'
              : 'Verified quests unavailable. Open the Quest Logbook to retry.'}
          </div>
        )}
        {serverMode && server.status === 'verified' && !entries.length && (
          <div className="jade-quest-tracker-status" role="status">
            No server-verified active quests.
          </div>
        )}
        {entries.map(entry => (
          <div key={entry.id} className="jade-quest-tracker-entry" data-tracked={entry.tracked}>
            <div className="jade-quest-tracker-title">
              <span title={entry.title}>{entry.title}</span>
              <span>{entry.current}/{entry.total || 1}</span>
            </div>
            <div className="jade-quest-tracker-objective">
              {entry.readyToTurnIn ? 'Ready to turn in' : entry.objective}
            </div>
            <div className="jade-quest-tracker-meter" role="progressbar"
              aria-label={entry.title + ' progress'} aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={entry.percent}>
              <span style={{ width: entry.percent + '%' }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
