import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Eye, AlertCircle } from 'lucide-react';
import { subscribeAdvancedClass } from './advancedClassStore';
import { WEAPON_TYPES, getClassById } from './advancedClassRegistry';
import { SKILL_MOD_DESCRIPTIONS } from './advancedClassSkills';
import { buildClassModifierPreview } from './classModifierPreview.mjs';
import AdvancedClassSelector from './AdvancedClassSelector';
import { getActiveEquippedAXEWeapon, subscribeAXEEquipmentInventory } from '../axe/equipment/AXEEquipmentInventoryStore';
import { resolveAXEWeaponIdentity } from '../axe/weapons/AXEWeaponIdentity';

const WEAPON_TABS = [
  { type: WEAPON_TYPES.SWORD,    label: 'Sword',    icon: '⚔️' },
  { type: WEAPON_TYPES.RANGED,   label: 'Archery',  icon: '🏹' },
  { type: WEAPON_TYPES.GUARDIAN, label: 'Guardian', icon: '🛡️' },
];

export default function AdvancedClassPanel() {
  const [advancedState, setAdvancedState] = useState(null);
  const [activeWeapon, setActiveWeapon] = useState(() => getActiveEquippedAXEWeapon());
  const [manualTab, setManualTab] = useState(null);
  const [previewClassId, setPreviewClassId] = useState(null);

  useEffect(() => subscribeAdvancedClass(setAdvancedState), []);
  useEffect(() => subscribeAXEEquipmentInventory(() => {
    setActiveWeapon(getActiveEquippedAXEWeapon());
  }), []);

  if (!advancedState) return null;

  // The inventory loadout owns the active weapon. Mastery follows it; it does
  // not get to invent a second active weapon.
  const activeIdentity = resolveAXEWeaponIdentity(activeWeapon);
  const activeAdvancedType = activeIdentity.advancedWeaponType || null;

  // Match the equipped weapon on first open, while respecting manual tab
  // browsing until the player closes this panel.
  const activeTab = manualTab || activeAdvancedType || WEAPON_TYPES.SWORD;
  const selectedClassId = advancedState.selectedClasses[activeTab];
  const selectedClassDef = selectedClassId ? getClassById(selectedClassId) : null;
  const previewCandidate = previewClassId ? getClassById(previewClassId) : null;
  const previewing = !!previewCandidate && previewCandidate.weapon_type === activeTab
    && previewCandidate.class_id !== selectedClassId;
  const detailClassDef = previewing ? previewCandidate : selectedClassDef;
  const modifierPreview = buildClassModifierPreview(detailClassDef, SKILL_MOD_DESCRIPTIONS);

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Panel Header ── */}
      <div
        className="flex-shrink-0 px-6 pt-5 pb-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3 mb-1">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-white/90">
            Advanced Weapon Classes · Modifier Lens
          </h2>
        </div>
        <p className="text-[10px] text-white/40 leading-relaxed">
          Inspect bonuses, drawbacks, and abilities before choosing a specialization. Switching remains restricted during combat.
          {activeAdvancedType && (
            <span className="text-amber-400/70 ml-1">
              Active weapon: {WEAPON_TABS.find(t => t.type === activeAdvancedType)?.label || activeAdvancedType}
            </span>
          )}
        </p>
      </div>

      {/* ── Weapon Type Tabs ── */}
      <div
        className="flex-shrink-0 flex gap-0 px-4 pt-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {WEAPON_TABS.map((tab) => {
          const isActive = activeTab === tab.type;
          const hasClass = !!advancedState.selectedClasses[tab.type];
          const isCurrentWeapon = activeAdvancedType === tab.type;
          return (
            <button
              key={tab.type}
              onClick={() => { setManualTab(tab.type); setPreviewClassId(null); }}
              aria-pressed={isActive}
              className="relative flex items-center gap-1.5 px-4 pb-2.5 text-xs transition-all"
              style={{
                color: isActive ? '#ffffff' : 'rgba(255,255,255,0.40)',
                borderBottom: isActive ? '2px solid #f59e0b' : '2px solid transparent',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              <span>{tab.icon}</span>
              <span className="tracking-[0.1em]">{tab.label}</span>
              {hasClass && (
                <span
                  className="w-1.5 h-1.5 rounded-full ml-0.5"
                  style={{ background: isCurrentWeapon ? '#f59e0b' : '#6ee7b7' }}
                />
              )}
              {isCurrentWeapon && (
                <span
                  className="text-[8px] tracking-[0.2em] uppercase px-1 py-px rounded ml-0.5"
                  style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
                >
                  Equipped
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content Area ── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
            className="flex min-h-full flex-col gap-0 lg:flex-row"
          >
            {/* LEFT: class selector */}
            <div className="min-w-0 flex-1 px-5 py-4">
              <AdvancedClassSelector
                weaponType={activeTab}
                selectedClassId={advancedState.selectedClasses[activeTab]}
                unlockedClasses={advancedState.unlockedClasses}
                previewClassId={previewing ? previewClassId : null}
                onPreviewClass={(cls) => setPreviewClassId(cls.class_id)}
              />
            </div>

            {/* RIGHT: active class detail */}
            {detailClassDef ? (
              <div
                className="w-full flex-shrink-0 border-t border-white/[0.07] bg-[#09121b]/75 px-4 py-4 lg:w-80 lg:border-l lg:border-t-0"
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="text-[9px] uppercase tracking-[0.25em] text-cyan-100/60">
                    {previewing ? 'Class preview · no changes saved' : 'Selected specialization'}
                  </div>
                  {previewing && <button type="button" onClick={() => setPreviewClassId(null)}
                    className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/65 hover:bg-white/10">
                    Back to selected
                  </button>}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"
                  style={{ borderColor: `${detailClassDef.color}55` }}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-lg text-2xl"
                      style={{ background: `${detailClassDef.color}20` }}>{detailClassDef.icon}</span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white">{detailClassDef.display_name}</h3>
                      <p className="mt-0.5 text-[10px] text-white/50">{detailClassDef.tagline}</p>
                      <p className="mt-1 text-[9px] text-cyan-200/70">
                        {previewing ? 'Preview only' : activeAdvancedType === activeTab ? 'Selected for equipped weapon' : 'Saved for this weapon family'}
                      </p>
                    </div>
                  </div>
                  {detailClassDef.playstyle_tags?.length > 0 && <div className="mt-3 flex flex-wrap gap-1">
                    {detailClassDef.playstyle_tags.map(tag => <span key={tag}
                      className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] text-white/55">{tag}</span>)}
                  </div>}
                </div>
                <div className="my-4 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg border border-emerald-400/15 bg-emerald-300/[0.05] py-2">
                    <strong className="block text-lg font-semibold tabular-nums text-emerald-200">{modifierPreview.benefits}</strong>
                    <span className="text-[9px] uppercase tracking-wider text-white/45">Bonuses & abilities</span>
                  </div>
                  <div className="rounded-lg border border-rose-400/15 bg-rose-300/[0.05] py-2">
                    <strong className="block text-lg font-semibold tabular-nums text-rose-200">{modifierPreview.tradeoffs}</strong>
                    <span className="text-[9px] uppercase tracking-wider text-white/45">Trade-offs</span>
                  </div>
                </div>
                <div className="space-y-4">
                  {['Offense', 'Defense', 'Utility', 'Trade-offs'].map((group) => {
                    const entries = modifierPreview.passives.filter((entry) => entry.group === group);
                    return entries.length > 0 && <section key={group} aria-label={group + ' passive modifiers'}>
                      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.19em] text-white/45">{group}</h4>
                      <div className="divide-y divide-white/[0.045] rounded-lg border border-white/[0.07] bg-white/[0.025]">
                        {entries.map((entry) => <div key={entry.key} className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="text-[11px] text-white/65">{entry.label}</span>
                          <strong className={`shrink-0 text-xs tabular-nums ${entry.isTradeoff ? 'text-rose-200' : 'text-emerald-200'}`}>{entry.display}</strong>
                        </div>)}
                      </div>
                    </section>;
                  })}
                  {modifierPreview.skills.length > 0 && <section aria-label="Skill modifiers and signature abilities">
                    <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-white/45">Skill modifiers & abilities</h4>
                    <div className="space-y-2">
                      {modifierPreview.skills.map((entry) => <div key={entry.key}
                        className={`rounded-lg border px-3 py-2.5 ${entry.isTradeoff ? 'border-rose-300/15 bg-rose-300/[0.04]' : 'border-cyan-300/15 bg-cyan-300/[0.04]'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-[11px] font-semibold text-white/80">{entry.label}</strong>
                          <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${entry.isTradeoff ? 'text-rose-200' : 'text-cyan-200'}`}>{entry.display}</span>
                        </div>
                        {entry.description && <p className="mt-1.5 text-[10px] leading-relaxed text-white/45">{entry.description}</p>}
                      </div>)}
                    </div>
                  </section>}
                </div>
                <p className="mt-4 flex items-start gap-2 border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-white/35">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                  Values are configured class modifiers. Effective combat stats may be capped or adjusted by other systems.
                </p>
                {/* Flavor */}
                {detailClassDef.flavor_text && (
                  <div
                    className="px-3 py-2 rounded-lg text-[9px] text-white/30 italic"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    {detailClassDef.flavor_text}
                  </div>
                )}

                {/* VFX indicator */}
                {detailClassDef.unlock_effects?.aura && (
                  <div>
                    <div className="text-[8px] tracking-[0.35em] uppercase text-white/35 mb-1.5">Visual Effect</div>
                    <div
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[9px]"
                      style={{ background: `${detailClassDef.color}12`, border: `1px solid ${detailClassDef.color}28` }}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse"
                        style={{ background: detailClassDef.color }}
                      />
                      <span className="text-white/60">
                        {detailClassDef.unlock_effects.aura.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} {previewing ? '· Preview only' : activeAdvancedType === activeTab ? '· Equipped' : '· Selected'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : <aside className="w-full shrink-0 border-t border-white/[0.07] bg-white/[0.02] p-5 text-center lg:w-80 lg:border-l lg:border-t-0">
              <Eye className="mx-auto mb-3 h-7 w-7 text-cyan-200/50"/>
              <h3 className="text-sm font-semibold text-white/70">Explore class modifiers</h3>
              <p className="mt-2 text-xs leading-5 text-white/45">Choose “Preview modifiers” on any class to inspect its strengths and trade-offs without changing your current class.</p>
            </aside>}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Footer ── */}
      <div
        className="flex-shrink-0 px-5 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <p className="text-[9px] text-white/25 text-center leading-relaxed">
          Previews never activate a class. Selecting a class still requires eligibility and confirmation; Weapon Mastery is unchanged.
        </p>
      </div>
    </div>
  );
}