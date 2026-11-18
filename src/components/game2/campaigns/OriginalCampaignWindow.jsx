import { useAuth } from '@/components/auth/AuthContext';
import { CampaignPlayer } from './OriginalCampaigns';

export default function OriginalCampaignWindow({ gameKey }) {
  const { user } = useAuth();
  const leave = () => {
    window.close();
    if (!window.closed) window.location.assign('/Game2');
  };
  if (!user) return <main className="grid h-dvh place-items-center bg-[#080c13] text-white">Checking campaign access…</main>;
  if (user.role !== 'admin') return <main className="grid h-dvh place-items-center bg-[#080c13] text-white"><div><p>Original campaign archives require administrator access.</p><button onClick={leave}>Back to Game 2</button></div></main>;
  return <main className="relative h-dvh w-full overflow-hidden bg-black"><CampaignPlayer gameKey={gameKey} onBack={leave} standalone /></main>;
}
