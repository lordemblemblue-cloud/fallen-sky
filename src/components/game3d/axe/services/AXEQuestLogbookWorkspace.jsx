import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight,
  Circle, Compass, Flag, Gift, Globe2, List, MapPin, RotateCcw,
  ScrollText, Search, Shield, Sparkles, Target, Users, X,
} from 'lucide-react';
import { QUESTS, QUEST_NPCS } from '../../questData';
import {
  abandonQuest, getQuestState, isQuestComplete, setTrackedQuest, subscribeQuests,
} from '../../useQuestStore';
import { getAXECampaign, getAXEQuestObjectives } from '../quests/AXEQuestFramework';
import { createAXEQuestbookReadModel169 } from '../quests/AXEQuestbookReadModel169';
import AXEQuestbookSocialLeads173 from './AXEQuestbookSocialLeads173';
import AXEConstellationsWorkspace from './AXEConstellationsWorkspace';
import { subscribeCharacterChange,getActiveId,getStorageUser } from '../../characterStorage';
import {axeQuestActionEnabled174,commitVerifiedQuestIntent174}
  from '../quests/AXEQuestIntent174';
import './AXEQuestLogbookWorkspace.css';

/**
 * Atom X Eve quest journal. The three-panel layout follows the approved MMO
 * concept, while every quest, status, objective and reward is sourced from the
 * existing character-scoped quest store. No screenshot is used as the UI.
 */
const SIDEBAR = [
  { id: 'quests', label: 'Quests', icon: List },
  { id: 'story', label: 'Story', icon: BookOpen },
  { id: 'constellations', label: 'Constellations', icon: Sparkles },
  { id: 'world', label: 'World', icon: Globe2 },
  { id: 'faction', label: 'Faction', icon: Shield },
  { id: 'repeatable', label: 'Repeatable', icon: RotateCcw },
  { id: 'event', label: 'Event', icon: CalendarDays },
];
const TABS = [
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
];
const ORDER = ['story', 'chapter', 'side', 'world', 'faction', 'repeatable', 'event'];
const CATEGORY_NAMES = {
  story: 'Main Story',
  chapter: 'Chapter Quests',
  side: 'Side Quests',
  world: 'World Quests',
  faction: 'Faction Quests',
  repeatable: 'Repeatable Quests',
  event: 'Event Quests',
};
const CATEGORY_ICONS = {
  story: BookOpen,
  chapter: Compass,
  side: ScrollText,
  world: Globe2,
  faction: Shield,
  repeatable: RotateCcw,
  event: CalendarDays,
};
const sentence = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
const limit = (number, low, high) => Math.max(low, Math.min(high, number));
const requiredCount = objective => Math.max(1, Number(objective.count) || 1);

function classify(quest) {
  if (quest.eventId || quest.category === 'event') return 'event';
  if (quest.repeatable) return 'repeatable';
  // Respect the Echo story / optional-branch classification even when the
  // objective is an exploration discovery.
  if (quest.category === 'chapter') return 'chapter';
  if (quest.category === 'side') return 'side';
  if (quest.category === 'world' || quest.objective?.type === 'discover_location' ||
      quest.objectives?.some(o => ['discover_location', 'explore', 'enter_cave'].includes(o.type))) return 'world';
  if (quest.factionId && quest.factionId !== 'AXE_Faction_Unassigned') return 'faction';
  const campaign = quest.campaignId ? getAXECampaign(quest.campaignId) : null;
  if (campaign?.type === 'faction') return 'faction';
  if (quest.campaignId || quest.category === 'story') return quest.requires ? 'chapter' : 'story';
  return quest.requires ? 'chapter' : 'side';
}

function objectiveName(objective) {
  if (objective.description || objective.label) return objective.description || objective.label;
  const count = requiredCount(objective);
  switch (objective.type) {
    case 'kill': return 'Defeat ' + count + ' enemies';
    case 'kill_tier': return 'Defeat ' + count + ' ' + (objective.tier || 'elite') + ' enemies';
    case 'defeat_boss': return 'Defeat ' + sentence(objective.targetId || 'the boss');
    case 'discover_location': return 'Discover ' + sentence(objective.targetId || 'the location');
    case 'collect_item': return 'Collect ' + count + ' ' + sentence(objective.itemId || 'items');
    case 'talk': return 'Speak with ' + sentence(objective.targetId || 'the quest giver');
    case 'interact': return 'Interact with ' + sentence(objective.targetId || 'the objective');
    case 'enter_cave': return 'Enter the cave';
    default: return sentence(objective.type || 'Complete objective');
  }
}

function objectiveRows(quest, state) {
  const required = getAXEQuestObjectives(quest);
  return [...required, ...(quest.optionalObjectives || [])].map((objective, index) => {
    const count = requiredCount(objective);
    const stored = state.objectiveProgress?.[quest.id]?.[objective.id || 'objective_' + index];
    const fallback = index === 0 ? state.progress?.[quest.id] : 0;
    const current = limit(Number(stored ?? fallback) || 0, 0, count);
    const done = state.completedIds.includes(quest.id) || current >= count;
    return { ...objective, id: objective.id || 'objective_' + index,
      label: objectiveName(objective), current, count, done,
      optional: !!objective.optional || index >= required.length };
  });
}

function questProgress(quest, state) {
  if (state.completedIds.includes(quest.id)) return 100;
  const rows = objectiveRows(quest, state).filter(row => !row.optional);
  return rows.length
    ? Math.round(rows.reduce((total, row) => total + row.current / row.count, 0) / rows.length * 100)
    : 0;
}

function questStatus(quest, state) {
  if (state.completedIds.includes(quest.id)) return 'Completed';
  if (isQuestComplete(quest, state)) return 'Ready to turn in';
  return 'In Progress';
}

function rewardItems(quest) {
  const reward = quest.reward || {};
  const results = [
    { id: 'xp', label: 'Experience', value: reward.xp, icon: Sparkles },
    { id: 'points', label: 'Points', value: reward.points, icon: Target },
    { id: 'contribution', label: 'Contribution', value: reward.contribution, icon: Users },
    { id: 'reputation', label: 'Reputation', value: reward.reputation, icon: Shield },
  ].filter(row => Number(row.value) > 0);
  if (reward.unlock?.name) results.push({
    id: 'unlock', label: 'Unlock', value: reward.unlock.name, icon: Gift,
  });
  return results;
}

function QuestListRow({ quest, state, selected, onSelect }) {
  const kind = classify(quest);
  const Icon = CATEGORY_ICONS[kind] || ScrollText;
  const progress = questProgress(quest, state);
  const status = questStatus(quest, state);
  const rows = objectiveRows(quest, state).filter(row => !row.optional);
  const current = rows.reduce((sum, row) => sum + (row.done ? row.count : row.current), 0);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const tracked = state.lastAcceptedId === quest.id && state.acceptedIds.includes(quest.id);
  return <button type="button" className="axe-quest-entry" aria-pressed={selected}
    onClick={() => onSelect(quest.id)}>
    <span className="axe-quest-entry-badge"><Icon size={24} aria-hidden="true" /></span>
    <span className="axe-quest-entry-content">
      <strong>{quest.title}</strong>
      <small>{CATEGORY_NAMES[kind]} <span aria-hidden="true">·</span> {status}{tracked ? ' · Tracked' : ''}</small>
    </span>
    <span className="axe-quest-entry-metric">
      <b>{current}/{total || 1}</b>
      <span className="axe-quest-meter" role="progressbar"
        aria-label={quest.title + ' progress'} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={progress}><i style={{ width: progress + '%' }} /></span>
    </span>
  </button>;
}

const EMPTY_VERIFIED_STATE = Object.freeze({
  acceptedIds: [], completedIds: [], progress: {}, objectiveProgress: {},
  lastAcceptedId: null, storyFlags: {}, choices: {}, abandonedIds: [], completionCounts: {},
});

export default function AXEQuestLogbookWorkspace({ onClose, verifiedQuestbookReader = null }) {
  const [localState, setLocalState] = useState(getQuestState);
  const [verifiedView, setVerifiedView] = useState(null);
  const [verifiedError, setVerifiedError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestFence = useRef(0);
  const trustedModel = useMemo(() => createAXEQuestbookReadModel169(), []);
  const wantsVerified = typeof verifiedQuestbookReader === 'function';
  const verified = wantsVerified && !!verifiedView;
  // Missing server reads never fall back to LOCAL progress as "verified".
  const state = verified ? verifiedView.questState :
    wantsVerified ? EMPTY_VERIFIED_STATE : localState;
  const [section, setSection] = useState('quests');
  const [tab, setTab] = useState('active');
  const [sortBy, setSortBy] = useState('type');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [notice, setNotice] = useState('');
  const [abandonPending, setAbandonPending] = useState(null);
  const [socialOpen, setSocialOpen] = useState(false);

  useEffect(() => subscribeQuests(setLocalState), []);
  // Swapping a trusted reader (login or transport owner) invalidates all
  // in-memory presentation from the prior server identity immediately.
  useEffect(() => {
    requestFence.current++;
    trustedModel.reset();
    setVerifiedView(null);
    setVerifiedError(null);
  }, [verifiedQuestbookReader, trustedModel]);
  useEffect(() => {
    if (!wantsVerified) {
      trustedModel.reset();
      setVerifiedView(null);
      setVerifiedError(null);
      return undefined;
    }
    const fence = ++requestFence.current;
    Promise.resolve().then(() => verifiedQuestbookReader(trustedModel.getQuery()))
      .then(envelope => {
        if (fence !== requestFence.current) return;
        const result = trustedModel.apply(envelope, getQuestState());
        if (!result.ok) {
          setVerifiedView(null);
          setVerifiedError('Verified Questbook is unavailable.');
        } else {
          setVerifiedView(result.view);
          setVerifiedError(null);
        }
      })
      .catch(() => {
        if (fence !== requestFence.current) return;
        trustedModel.reset();
        setVerifiedView(null);
        setVerifiedError('Verified Questbook is unavailable.');
      });
    return () => { requestFence.current++; };
  }, [wantsVerified, verifiedQuestbookReader, refreshKey, trustedModel]);
  useEffect(() => subscribeCharacterChange(() => {
    requestFence.current++;
    trustedModel.reset();
    setVerifiedView(null);
    setVerifiedError(null);
    if (wantsVerified) setRefreshKey(previous => previous + 1);
  }), [trustedModel, wantsVerified]);
  const byId = useMemo(() => {
    const localDefinitions = new Map(QUESTS.map(quest => [quest.id, quest]));
    if (!verified) return localDefinitions;
    // Server title, status, objective definitions and counts are canonical.
    // Local static quest metadata may supply story descriptions ONLY.
    return new Map(verifiedView.entries.map(entry => {
      const local = localDefinitions.get(entry.id);
      return [entry.id, {
        ...(local ? {
          description: local.description, campaignId: local.campaignId,
          chapter: local.chapter, branchOf: local.branchOf,
          recommendedLevel: local.recommendedLevel,
        } : {}),
        ...entry,
      }];
    }));
  }, [verified, verifiedView]);

  const active = state.acceptedIds.map(id => byId.get(id)).filter(Boolean);
  const completed = state.completedIds.map(id => byId.get(id)).filter(Boolean);
  const allIds = [...new Set([...state.acceptedIds, ...state.completedIds])];
  const all = allIds.map(id => byId.get(id)).filter(Boolean);
  const tabQuests = tab === 'active' ? active : tab === 'completed' ? completed : all;
  const term = search.trim().toLowerCase();
  const matches = tabQuests.filter(quest => {
    const category = classify(quest);
    const allowed = section === 'quests' ||
      (section === 'story' && (category === 'story' || category === 'chapter' ||
        quest.campaignId === 'axe_campaign_echo_branches')) ||
      section === category;
    if (!allowed) return false;
    if (!term) return true;
    const npc = QUEST_NPCS.find(entry => entry.id === quest.npcId);
    const campaign = quest.campaignId && getAXECampaign(quest.campaignId);
    return [quest.title, quest.description, npc?.name, campaign?.name]
      .some(text => String(text || '').toLowerCase().includes(term));
  });
  const sorted = [...matches].sort((a, b) => {
    if (sortBy === 'name') return a.title.localeCompare(b.title);
    if (sortBy === 'progress') return questProgress(b, state) - questProgress(a, state);
    return ORDER.indexOf(classify(a)) - ORDER.indexOf(classify(b));
  });
  const groups = ORDER.map(kind => ({
    kind, name: CATEGORY_NAMES[kind], items: sorted.filter(quest => classify(quest) === kind),
  })).filter(group => group.items.length);
  const selection = sorted.some(quest => quest.id === chosen)
    ? chosen : sorted.some(quest => quest.id === state.lastAcceptedId)
      ? state.lastAcceptedId : sorted[0]?.id;
  const quest = byId.get(selection);
  const objectives = quest ? objectiveRows(quest, state).filter(row => !verified || !row.optional) : [];
  const progress = quest ? questProgress(quest, state) : 0;
  const isActive = !!quest && state.acceptedIds.includes(quest.id);
  const tracked = isActive && state.lastAcceptedId === quest.id;
  const status = quest ? questStatus(quest, state) : '';
  const npc = quest && QUEST_NPCS.find(entry => entry.id === quest.npcId);
  const campaign = quest?.campaignId && getAXECampaign(quest.campaignId);
  const rewards = quest ? rewardItems(quest) : [];

  const commitVerifiedIntent = async request => {
    if(!wantsVerified||!verified||!axeQuestActionEnabled174)
      throw Error('Verified actions are disabled');
    // Browser state is an ephemeral presentation gate, not authentication.
    // The Base44 signer independently verifies ownership and intent, and the
    // private PostgreSQL services recheck catalog prerequisites and consent.
    const account=getStorageUser(),character=getActiveId();
    const permitted=request?.intent==='accept_quest'
      ? verifiedView.npcInteractionLeads.some(x=>x.questId===request.questId&&
          x.requiresExplicitAccept===true)
      : request?.intent==='choose_rival'
        ? verifiedView.rivalInvitations.some(x=>x.leadId===request.leadId&&
           x.requiresExplicitConsent===true&&x.ownChoice===null&&
           ['rival','friendly_rival','decline'].includes(request.choice))
        : false;
    if(!permitted)throw Error('This verified invitation is no longer eligible');
    const result=await commitVerifiedQuestIntent174({...request,confirmed:true});
    if(account!==getStorageUser()||character!==getActiveId())
      throw Error('Character changed before intent response');
    setRefreshKey(previous=>previous+1);
    return result;
  };
  const selectQuest = id => { setChosen(id); setNotice(''); setAbandonPending(null); };
  const chooseSection = id => { setSection(id); setChosen(null); setAbandonPending(null); };
  const chooseTab = id => { setTab(id); setChosen(null); setAbandonPending(null); };
  const toggleGroup = id => setCollapsed(previous =>
    previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]);
  const track = () => {
    if (wantsVerified) { setNotice('Server-verified quests are read-only. Tracking changes are not connected.'); return; }
    if (!quest || !isActive) return;
    setNotice(setTrackedQuest(quest.id)
      ? 'Quest tracked on your Game 3D HUD.' : 'Only active quests can be tracked.');
  };
  const abandon = () => {
    if (wantsVerified) { setAbandonPending(null); return; }
    if (!quest || abandonPending !== quest.id) return;
    const result = abandonQuest(quest.id);
    setNotice(result.ok ? 'Quest abandoned. You can accept it again from its giver.'
      : 'This quest could not be abandoned.');
    setAbandonPending(null);
    setChosen(null);
  };

  return <div className="axe-quest-logbook-root" data-progression-panel="quest_logbook"
    data-quest-section={section}
    aria-label="Quest Logbook">
    <div className="axe-quest-topbar">
      <span className="axe-quest-topbar-wing" aria-hidden="true" />
      <span className="axe-quest-topbar-crest" aria-hidden="true"><Compass size={25} /></span>
      <h1>Quest Logbook</h1>
      {wantsVerified && <div className="axe-quest-trust-status" role="status">
        <Shield size={15} aria-hidden="true" />
        <span>{verified
          ? 'Server-verified · Read-only · ' + verifiedView.npcInteractionLeads.length +
            ' NPC invitations · ' + verifiedView.rivalInvitations.length + ' Rival leads'
          : verifiedError || 'Loading verified Questbook…'}</span>
        <button type="button" onClick={() => setRefreshKey(previous => previous + 1)}
          aria-label="Refresh verified Questbook">Refresh</button>
      </div>}
      {onClose && <button className="axe-quest-close" type="button"
        onClick={onClose} data-service-close aria-label="Close Quest Logbook"><X size={24} /></button>}
    </div>

    <div className={'axe-quest-book' + (section === 'constellations' ? ' has-constellations' : '')}>
      <nav className="axe-quest-sidebar" aria-label="Quest log categories">
        <div className="axe-quest-sidebar-crest" aria-hidden="true"><Compass size={34} /></div>
        {SIDEBAR.map(({ id, label, icon: Icon }) => <button
          type="button" key={id} aria-pressed={section === id} onClick={() => chooseSection(id)}
          className="axe-quest-sidebar-link">
          <Icon size={22} aria-hidden="true" /><span>{label}</span>
        </button>)}
        {wantsVerified && <button type="button" className="axe-quest-sidebar-link axe-quest-social-nav"
          onClick={() => setSocialOpen(true)} aria-haspopup="dialog"
          aria-label="View verified NPC invitations and Rival statuses">
          <Users size={22} aria-hidden="true" /><span>Invitations &amp; Rivals</span>
        </button>}
        <div className="axe-quest-sidebar-end" aria-hidden="true"><Sparkles size={26}/></div>
      </nav>

      {section === 'constellations' ? <AXEConstellationsWorkspace
        narrative={verified ? verifiedView.chronicleNarrative : null}
        constellation={verified ? verifiedView.constellations[0] : null} /> : <>
      <section className="axe-quest-journal" aria-label="Quest list">
        <div className="axe-quest-journal-tabs" role="group" aria-label="Quest status">
          {TABS.map(item => <button type="button" key={item.id}
            aria-pressed={tab === item.id} onClick={() => chooseTab(item.id)}>
            {item.label}{item.id === 'active' ? ' (' + active.length + ')' : ''}
          </button>)}
        </div>
        <div className="axe-quest-journal-tools">
          <label className="axe-quest-sort">Sort:
            <select value={sortBy} onChange={event => setSortBy(event.target.value)}
              aria-label="Sort quests">
              <option value="type">By Type</option>
              <option value="name">Name A–Z</option>
              <option value="progress">Progress</option>
            </select><ChevronDown size={13} aria-hidden="true" />
          </label>
          <label className="axe-quest-search">
            <Search size={17} aria-hidden="true"/>
            <input type="search" value={search} onChange={event => setSearch(event.target.value)}
              aria-label="Search quests" placeholder="Search Quests..." />
          </label>
        </div>

        <div className="axe-quest-list-scroll">
          {groups.length ? groups.map(group => {
            const isCollapsed = collapsed.includes(group.kind);
            return <section className="axe-quest-list-group" key={group.kind}>
              <button type="button" className="axe-quest-group-toggle"
                aria-expanded={!isCollapsed} onClick={() => toggleGroup(group.kind)}>
                {isCollapsed ? <ChevronRight size={17}/> : <ChevronDown size={17}/>}
                {group.name} ({group.items.length})
              </button>
              {!isCollapsed && <div className="axe-quest-group-entries">
                {group.items.map(entry => <QuestListRow key={entry.id}
                  quest={entry} state={state} selected={selection === entry.id}
                  onSelect={selectQuest} />)}
              </div>}
            </section>;
          }) : <div className="axe-quest-empty">
            <ScrollText size={34}/><strong>No quests found</strong>
            <p>{term ? 'Try a different search.' :
              tab === 'completed' ? 'Your completed quests will appear here.' :
                'Visit a quest giver in Game 3D to start your journal.'}</p>
          </div>}
        </div>
      </section>

      <section className="axe-quest-detail" aria-label="Selected quest details">
        {quest ? <>
          <header className="axe-quest-detail-hero">
            <div className="axe-quest-hero-landscape" aria-hidden="true">
              <span className="axe-quest-hero-mountain" /><span className="axe-quest-hero-spire" />
            </div>
            <span className="axe-quest-hero-symbol" aria-hidden="true">
              {(() => { const Icon = CATEGORY_ICONS[classify(quest)] || ScrollText; return <Icon size={36}/>; })()}
            </span>
            <div className="axe-quest-hero-copy">
              <h2>{quest.title}</h2>
              {quest.chapter && <small>Echo Chronicle · Chapter {quest.chapter}</small>}
              {quest.branchOf && <small>Optional path from Chapter {quest.branchOf}</small>}
              <span className={'axe-quest-status-pill' + (status === 'Completed' ? ' is-complete' : '')}>
                {status}
              </span>
            </div>
          </header>
          <div className="axe-quest-detail-scroll">
            <div className="axe-quest-meta-row">
              <div><Users size={20} aria-hidden="true"/>
                <span>Quest Giver:</span><strong>{npc?.name || sentence(quest.npcId || 'Unknown')}</strong></div>
              <div><BookOpen size={20} aria-hidden="true" />
                <span>Campaign:</span><strong>{campaign?.name || CATEGORY_NAMES[classify(quest)]}</strong>
                {(quest.requires || quest.campaignId) && <small>{quest.requires ? 'Chapter Quest' : 'Quest Chapter'} · Level {quest.recommendedLevel || quest.unlockLevel || 1}</small>}
              </div>
            </div>
            <p className="axe-quest-description">{quest.description || 'The next chapter of your journey is waiting.'}</p>
            <section className="axe-quest-objectives" aria-label="Quest objectives">
              <h3><Target size={23} aria-hidden="true"/> Objectives</h3>
              {objectives.map(row => <div className="axe-quest-objective" key={row.id}>
                <span className={'axe-quest-check' + (row.done ? ' is-done' : '')} aria-hidden="true">
                  {row.done && <Check size={16}/>}
                </span>
                <div className="axe-quest-objective-name">
                  <span>{row.label}{row.optional ? ' (Optional)' : ''}</span>
                  {row.count > 1 && <span className="axe-quest-meter"
                    role="progressbar" aria-label={row.label + ' progress'}
                    aria-valuemin={0} aria-valuemax={row.count}
                    aria-valuenow={row.done ? row.count : row.current}>
                    <i style={{width:(row.done ? 100 : row.current / row.count * 100) + '%'}}/>
                  </span>}
                </div>
                <b>{row.done ? row.count : row.current} / {row.count}</b>
              </div>)}
              {!objectives.length && <p className="axe-quest-void">No objectives recorded.</p>}
              <div className="axe-quest-overall-progress">
                <span>Overall progress</span><strong>{progress}%</strong>
                <div className="axe-quest-meter"><i style={{width:progress + '%'}}/></div>
              </div>
            </section>
            <section className="axe-quest-rewards" aria-label="Quest rewards">
              <h3><Gift size={22} aria-hidden="true"/> Rewards</h3>
              <div className="axe-quest-reward-tiles">
                {!wantsVerified && rewards.length ? rewards.map(({id,label,value,icon:Icon}) =>
                  <div className="axe-quest-reward" key={id}>
                    <span className="axe-quest-reward-icon"><Icon size={24}/></span>
                    <span><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong>
                      <small>{label}</small></span>
                  </div>) : <p className="axe-quest-void">{wantsVerified
                    ? 'Read-only quest verification does not authorize or issue rewards.'
                    : 'No rewards listed.'}</p>}
              </div>
            </section>
          </div>
          <footer className="axe-quest-actions">
            {!wantsVerified && abandonPending === quest.id ? <>
              <span className="axe-quest-confirm-text">Abandon this quest? Your current progress will be lost.</span>
              <button type="button" className="axe-quest-cancel" onClick={() => setAbandonPending(null)}>Cancel</button>
              <button type="button" className="axe-quest-abandon-confirm" onClick={abandon}>Confirm Abandon</button>
            </> : <>
              <button type="button" className="axe-quest-track" onClick={track}
                disabled={wantsVerified || !isActive || tracked}><Target size={22}/>
                {wantsVerified ? 'Server Read-only' : tracked ? 'Currently Tracked' : isActive ? 'Track Quest' : 'Quest Completed'}</button>
              {!wantsVerified && isActive && <button type="button" className="axe-quest-abandon"
                onClick={() => setAbandonPending(quest.id)}><X size={18}/> Abandon</button>}
            </>}
          </footer>
        </> : <div className="axe-quest-no-selection">
          <ScrollText size={49}/><h2>Quest Logbook</h2>
          <p>Choose an active or completed quest to read its story, objectives and rewards.</p>
        </div>}
      </section>
      </>}
    </div>
    {socialOpen && wantsVerified && <AXEQuestbookSocialLeads173
      view={verified ? verifiedView : null}
      onCommit={axeQuestActionEnabled174 && verified ? commitVerifiedIntent : null}
      error={verifiedError}
      onRefresh={() => setRefreshKey(previous => previous + 1)}
      onClose={() => setSocialOpen(false)} />}
    <div className="axe-quest-notice" role="status">{notice}</div>
  </div>;
}

