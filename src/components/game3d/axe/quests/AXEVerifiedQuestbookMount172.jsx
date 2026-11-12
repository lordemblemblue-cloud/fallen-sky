// Mount once within the real Game 3D world, never outside authenticated play.
// No visuals: the existing Jade HUD consumes this read-only presentation.
import {useEffect} from 'react';
import {verifiedQuestbookSession172} from './AXEVerifiedQuestbookRuntime172';

export default function AXEVerifiedQuestbookMount172() {
  useEffect(() => {
    if (!verifiedQuestbookSession172.enabled) return undefined;
    const stop = verifiedQuestbookSession172.start();
    const onFocus = () => { void verifiedQuestbookSession172.refresh(); };
    const onVisible = () => { if (!document.hidden) onFocus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      stop();
    };
  }, []);
  return null;
}
