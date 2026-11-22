// Live Duelist Adventure menu UI. The two vector frames contain NO embedded words or character imagery.
// Everything interactive is accessible React, driven by the actual game catalog / stored class progression.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  Home, Play, UserRound, BookOpen, Settings, X, Swords, Flag, Truck,
  Users, Target, Zap, CircleDot, Shield, Trophy, Search, Eye, LockKeyhole, Check,
  ArrowRight, Sparkles
} from 'lucide-react';
import { BODIES } from '../client/assets.mjs';
import { usePrefs, classProgressOf } from '../client/prefs.mjs';
import { CLASSES, CLASS_IDS } from '../core/classes.mjs';
import { LEVEL_CAP, XP_CAP, levelFromXp, masteryAt, masteryReward } from '../core/progression.mjs';
import { MENU_MODES, LEVELS } from './modes.js';
import { MODE_TABS, TEMPLATE_MODES, templateTab, templateMode, firstTemplateMode, templateLaunch } from './templateCatalog.mjs';
import { useLobby } from './useLobby.js';
import DuelistHangarStage from './DuelistHangarStage.jsx';
import { SettingsContent } from './MenuPages.jsx';
import { SettingsReferenceMenu } from './DuelistReferenceMenus.jsx';
import DuelistCharacterMenu from './DuelistCharacterMenu.jsx';
import DuelistStoryMenu from './DuelistStoryMenu.jsx';
import './duelistTemplateUI.css';
import './duelistDarkBlueTheme.css';

const MODE_ICONS = { swords: Swords, flag: Flag, truck: Truck, users: Users, target: Target,
  zap: Zap, circle: CircleDot, shield: Shield, trophy: Trophy, search: Search, eye: Eye, settings: Settings };
const TAB_ICONS = { normal: Target, ranked: Trophy, practice: Shield, custom: Settings };
const NAV = [
  { id: 'home', label: 'HOME', Icon: Home },
  { id: 'play', label: 'PLAY', Icon: Swords },
  { id: 'character', label: 'CHARACTER', Icon: UserRound },
  { id: 'story', label: 'STORY', Icon: BookOpen },
  { id: 'settings', label: 'SETTINGS', Icon: Settings },
];
const CHARACTER_NOTES = {
  maskedWarrior: 'A close-range fighter built around decisive strikes.',
  huntress: 'A fast, precise arena combatant.',
  female: 'Eve — original Fallen Sky fighter model.',
  male: 'Adam — original Fallen Sky fighter model.',
};
const number = n => Math.max(0, Number.isFinite(n) ? Math.floor(n) : 0).toLocaleString();

function ModeIcon({ symbol, ...props }) {
  const Icon = MODE_ICONS[symbol] || Target;
  return <Icon aria-hidden="true" {...props} />;
}
function TemplateSurface({ kind = 'mode', id, title, eyebrow, subtitle, close, children }) {
  return (
    <section id={id} className={'dxt-surface dxt-surface--' + kind} aria-label={title}>
      <div className="dxt-surface-top">
        <div><span className="dxt-eyebrow">{eyebrow}</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button type="button" className="dxt-close" onClick={close} aria-label={'Close ' + title}><X size={20}/></button>
      </div>
      {children}
    </section>
  );
}
function ModeSelector({ category, selected, onCategory, onSelect, lobby, prefs, onPrefs, launch, close }) {
  const tab = templateTab(category);
  const options = TEMPLATE_MODES[category];
  const mode = templateMode(category, selected);
  const supported = Boolean(mode.route && MENU_MODES[mode.route]);
  const startSolo = templateLaunch(category, mode.id);
  const canOnline = category === 'normal' && supported && MENU_MODES[mode.route]?.online && lobby.online;
  const selectedIcon = mode.symbol;

  return (
    <TemplateSurface id="duelist-play-drawer" kind="mode" title="Choose your game mode"
      eyebrow="DUELIST ADVENTURE" subtitle="Select a category, then choose a battle." close={close}>
      <div className="dxt-mode-layout">
        <nav className="dxt-mode-categories" aria-label="Play category">
          {MODE_TABS.map(item => {
            const Icon = TAB_ICONS[item.id];
            return <button key={item.id} type="button" className="dxt-category" data-active={category === item.id}
              aria-pressed={category === item.id} onClick={() => onCategory(item.id)}>
              <Icon aria-hidden="true"/><span>{item.title}</span>
            </button>;
          })}
        </nav>
        <div className="dxt-mode-center">
          <div className="dxt-section-lead"><h3>{tab.title} MODES</h3><p>{tab.description}</p></div>
          <div className="dxt-mode-grid" role="group" aria-label={tab.title + ' game modes'}>
            {options.map(item => <button key={item.id} type="button"
              className="dxt-tile" data-active={selected === item.id} aria-pressed={selected === item.id}
              onClick={() => onSelect(item.id)}>
                <ModeIcon symbol={item.symbol}/><span>{item.title}</span>
                {!item.route && <small>PLANNED</small>}
              </button>)}
          </div>
        </div>
        <aside className="dxt-mode-detail" aria-label="Selected game mode information">
          <div className="dxt-detail-art" aria-hidden="true"><ModeIcon symbol={selectedIcon}/></div>
          <div className="dxt-detail-copy">
            <span className="dxt-eyebrow">{tab.title} / {mode.count || 'MODE'}</span>
            <h3>{mode.title}</h3><p>{mode.description}</p>
            <div className="dxt-detail-metadata">
              <span><Users aria-hidden="true"/> {mode.count || 'Mode'}</span>
              <span><Shield aria-hidden="true"/> {category === 'ranked' ? 'Ranked planned' : category === 'practice' ? 'Bot training' : category === 'custom' ? 'Private planned' : 'Casual'}</span>
            </div>
            {startSolo && <div className="dxt-detail-settings">
              <label>Bot difficulty<select value={prefs.level} onChange={e => onPrefs({ level: e.target.value })}>
                {LEVELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select></label>
              <label>Opponent<select value={prefs.foe} onChange={e => onPrefs({ foe: e.target.value })}>
                {Object.entries(BODIES).map(([id, character]) => <option key={id} value={id}>{character.name}</option>)}
              </select></label>
            </div>}
            {!supported || category === 'ranked' || category === 'custom' ?
              <p className="dxt-unavailable" role="status">This option is a visual preview. Its matchmaking or lobby backend is not available yet.</p>
              : null}
            <div className="dxt-detail-actions">
              {startSolo ? <button type="button" className="dxt-action dxt-action--secondary"
                onClick={() => launch(mode.id, false)}><Target aria-hidden="true"/> {category === 'practice' ? 'START TRAINING' : 'PRACTICE'}</button>
                : <button type="button" className="dxt-action dxt-action--secondary" disabled><LockKeyhole aria-hidden="true"/> UNAVAILABLE</button>}
              <button type="button" className="dxt-action dxt-action--primary" onClick={() => launch(mode.id, true)}
                disabled={!canOnline} title={!canOnline ? 'No active online matchmaking for this category' : 'Join online'}>
                <Play aria-hidden="true"/> {category === 'custom' ? 'CREATE' : category === 'practice' ? 'ONLINE OFF' : 'QUEUE'}
              </button>
            </div>
            {supported && category === 'normal' &&
              <Link className="dxt-mode-help" to="/duelist-next/$page" params={{ page: mode.route }}>
                Rules &amp; game mode details <ArrowRight size={15} aria-hidden="true"/>
              </Link>}
          </div>
        </aside>
      </div>
    </TemplateSurface>
  );
}

function CharacterSelector({ prefs, onPrefs, close }) {
  const [tab, setTab] = useState('progression');
  const fighter = BODIES[prefs.fighter] || BODIES.maskedWarrior;
  const classId = CLASS_IDS.includes(prefs.classId) ? prefs.classId : 'duelist';
  const combat = CLASSES[classId];
  const xp = Math.min(XP_CAP, numberValue(classProgressOf(prefs)[classId]));
  const mastery = levelFromXp(xp);
  const rewards = masteryAt(mastery.level);
  const upcoming = mastery.capped ? null : masteryReward(mastery.level + 1);
  return (
    <TemplateSurface id="duelist-character-panel" kind="character" title="Select a character"
      eyebrow="FIGHTER ROSTER" subtitle="Choose a model and inspect your saved class mastery." close={close}>
      <div className="dxt-character-layout">
        <aside className="dxt-roster" aria-label="Available fighter models">
          <h3>FIGHTERS</h3>
          <div className="dxt-roster-grid">
            {Object.entries(BODIES).map(([id, f]) =>
              <button type="button" key={id} className="dxt-roster-button" data-active={prefs.fighter === id}
                aria-pressed={prefs.fighter === id} title={f.name} onClick={() => onPrefs({ fighter: id })}>
                <UserRound size={34} aria-hidden="true"/><span>{f.name}</span>
              </button>)}
          </div>
          <label className="dxt-class-select">COMBAT CLASS
            <select value={classId} onChange={e => onPrefs({ classId: e.target.value })}>
              {CLASS_IDS.map(id => <option key={id} value={id}>{CLASSES[id].name}</option>)}
            </select>
          </label>
          <p className="dxt-roster-note">Appearance and class are separate choices. Your class EXP is saved independently.</p>
        </aside>
        <div className="dxt-character-showcase">
          <div className="dxt-character-stage"><DuelistHangarStage fighter={prefs.fighter} classId={prefs.classId}/></div>
          <div className="dxt-character-identity">
            <span className="dxt-eyebrow">{combat.role.toUpperCase()} / {combat.name.toUpperCase()}</span>
            <h3>{fighter.name}</h3><p>{CHARACTER_NOTES[prefs.fighter] || combat.description}</p>
          </div>
          <div className="dxt-character-stage-caption"><Sparkles aria-hidden="true" size={16}/> LIVE FIGHTER PREVIEW</div>
        </div>
        <aside className="dxt-character-stats">
          <div className="dxt-character-tabs" role="group" aria-label="Character information">
            {['progression', 'abilities', 'customize'].map(id => <button type="button" key={id}
              data-active={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{id.toUpperCase()}</button>)}
          </div>
          {tab === 'progression' && <>
            <div className="dxt-character-level">
              <span>CLASS MASTERY</span><h3>LV. <b>{mastery.level}</b><small> / {LEVEL_CAP}</small></h3>
              <div className="dxt-character-xp-caption">
                <span>{mastery.capped ? 'MAX LEVEL' : number(mastery.into) + ' / ' + number(mastery.need) + ' XP'}</span>
                <span>{number(xp)} TOTAL XP</span>
              </div>
              <div className="dxt-character-xp" role="progressbar" aria-label="Class XP to next level"
                aria-valuemin={0} aria-valuemax={mastery.need || 1} aria-valuenow={mastery.capped ? 1 : mastery.into}>
                <span style={{ width: Math.round(mastery.progress * 100) + '%' }}/>
              </div>
            </div>
            <div className="dxt-reward-next"><span>NEXT LEVEL REWARD</span>
              <p>{upcoming ? upcoming.kind === 'ultimate' ? 'LV. ' + upcoming.level + ' · ULTIMATE +1'
                : 'LV. ' + upcoming.level + ' · ABILITY ' + (upcoming.abilityIndex + 1) + ' +1'
                : 'All mastery upgrades earned'}
                {upcoming?.kind === 'ability' && <small>{combat.abilities[upcoming.abilityIndex]?.name}</small>}
              </p>
            </div>
            <h4>ULTIMATE MILESTONES / EVERY 5 LEVELS</h4>
            <div className="dxt-milestone-grid">
              {[5,10,15,20,25].map(lvl => <div key={lvl} className="dxt-milestone" data-earned={mastery.level >= lvl}>
                <span>LV. {lvl}</span><Trophy aria-hidden="true" size={20}/><strong>ULT +1</strong>
                {mastery.level >= lvl && <Check size={13} aria-label="Reached"/>}
              </div>)}
            </div>
            <div className="dxt-ability-list">
              <h4>ABILITY PROGRESSION</h4>
              {combat.abilities.map((ab, i) => <div key={ab.id} className="dxt-ability-row">
                <Swords size={17} aria-hidden="true"/><span>{ab.name}</span><strong>LV. {rewards.abilityRanks[i]}</strong>
              </div>)}
              <div className="dxt-ability-row dxt-ability-row--ultimate">
                <Zap size={17} aria-hidden="true"/><span>{combat.special.name}</span><strong>ULT {rewards.ultimateRank}</strong>
              </div>
            </div>
            <p className="dxt-fineprint">Rewards are derived from earned class XP automatically; no paid pass or manual level-up purchase.</p>
          </>}
          {tab === 'abilities' && <div className="dxt-ability-list dxt-ability-list--full">
            <h3>{combat.name} ability kit</h3><p>{combat.description}</p>
            {combat.abilities.map((ab, i) => <div key={ab.id} className="dxt-ability-explain">
              <strong>{ab.name} <span>LV. {rewards.abilityRanks[i]}</span></strong><p>{ab.text}</p>
            </div>)}
            <div className="dxt-ability-explain"><strong>{combat.special.name}<span>ULT {rewards.ultimateRank}</span></strong><p>{combat.special.text}</p></div>
          </div>}
          {tab === 'customize' && <div className="dxt-customize"><h3>Fighter appearance</h3>
            <p>Choose one of the existing game models in the roster. The model selection updates the live 3D preview and your next match.</p>
            <span>Selected: {fighter.name}</span><p>Additional skins are not currently available.</p>
          </div>}
        </aside>
      </div>
    </TemplateSurface>
  );
}
const numberValue = n => Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;

export default function DuelistTemplateHub({ initialPanel = null }) {
  const navigate = useNavigate();
  const lobby = useLobby();
  const [prefs, onPrefs] = usePrefs();
  const [panel, setPanel] = useState(initialPanel);
  const [category, setCategory] = useState('normal');
  const [mode, setMode] = useState(firstTemplateMode('normal'));
  const fighter = BODIES[prefs.fighter]?.name || 'Duelist';
  const isReferencePanel = ['character', 'story', 'settings'].includes(panel);
  const close = () => { setPanel(null); if (initialPanel) navigate({ to: '/duelist-next', replace: true }); };
  const navigatePanel = id => {
    if (id === 'home') return close();
    setPanel(id);
  };
  const changeCategory = id => { setCategory(id); setMode(firstTemplateMode(id)); };
  const launch = (id, online) => {
    const search = templateLaunch(category, id, online, lobby.online);
    if (!search || (online && !MENU_MODES[search.mode]?.online)) return;
    navigate({ to: '/duelist-next/play', search: { ...search, from: 'duelist' } });
  };
  useEffect(() => {
    if (!panel) return undefined;
    const keydown = event => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        setPanel(null);
        if (initialPanel) navigate({ to: '/duelist-next', replace: true });
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [panel, initialPanel, navigate]);
  return (
    <main className={'dxt-page' + (isReferencePanel ? ' dxt-page--reference' : '')}>
      {!isReferencePanel && <DuelistHangarStage fighter={prefs.fighter} classId={prefs.classId}/>}
      {panel && !isReferencePanel && <button type="button" className="dxt-stage-scrim" tabIndex={-1} onClick={close} aria-label="Close menu"/>}
      {!isReferencePanel && <header className="dxt-header">
        <div className="dxt-header-player"><span className="dxt-player-symbol"><UserRound size={20}/></span>
          <div><strong>GUEST DUELIST</strong><small>{fighter}</small></div></div>
        <h1><span>EMBLEM BLUE</span> DUELIST ADVENTURE</h1>
        <span className="dxt-header-network">{lobby.online ? String(lobby.players) + ' PLAYING' : 'OFFLINE / SOLO'}</span>
      </header>}
      {!panel && <section className="dxt-home" aria-label="Duelist Adventure home">
        <div className="dxt-home-intro"><span>ENTER THE ARENA</span><h2>MASTER THE BLADE. SHAPE THE VEIL.</h2>
          <p>Choose a character and enter a match.</p>
          <button type="button" className="dxt-action dxt-action--primary" onClick={() => setPanel('play')}>
            <Play aria-hidden="true"/> CHOOSE GAME MODE
          </button>
        </div>
      </section>}
      {panel === 'play' && <ModeSelector category={category} selected={mode} onCategory={changeCategory}
        onSelect={setMode} lobby={lobby} prefs={prefs} onPrefs={onPrefs} launch={launch} close={close}/>}
      {panel === 'character' && <DuelistCharacterMenu prefs={prefs} onPrefs={onPrefs} close={close}/>}
      {panel === 'story' && <DuelistStoryMenu lobby={lobby} prefs={prefs} close={close}/>}
      {panel === 'settings' && <SettingsReferenceMenu prefs={prefs} onPrefs={onPrefs} close={close}/>}
      <footer className="dxt-footer" aria-label="Duelist main navigation">
        {NAV.map(({ id, label, Icon }) => <button type="button" key={id}
          className="dxt-footer-link" data-active={(panel || 'home') === id}
          aria-pressed={(panel || 'home') === id} onClick={() => navigatePanel(id)}>
          <Icon aria-hidden="true"/><span>{label}</span>
        </button>)}
      </footer>
    </main>
  );
}
