import React, { useEffect, useState } from 'react';
import { Sparkles, Sword, PawPrint, LockKeyhole } from 'lucide-react';
import { getAXESoulRegaliaState, getAXESoulRegaliaBonuses, getAXESoulSkillGate,
  setAXESoulAspect, setAXESoulFusion, subscribeAXESoulRegalia } from '../../axe/progression/AXESoulRegaliaStore';
import { getRegisteredAXEPet, subscribeAXEPets } from '../../axe/progression/AXEPetStore';
import { subscribeAXEEquipmentInventory } from '../../axe/equipment/AXEEquipmentInventoryStore';
import { SOUL_ASPECTS, SOUL_SKILLS, SOUL_INFUSION_SLOTS, SOUL_PET_GEAR_SLOTS,
  SOUL_REGALIA_GRADES, isSoulCompanionMastered } from '../../axe/progression/AXESoulRegaliaSystem';

const titleClass = 'text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80';
const sectionClass = 'rounded-xl border border-white/10 bg-black/20 p-4';
const percent = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });

export default function SoulRegaliaPanel({ focus = 'all', onOpenService } = {}) {
  const [soul, setSoul] = useState(getAXESoulRegaliaState);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => subscribeAXESoulRegalia(setSoul), []);
  useEffect(() => {
    const changed = () => setTick(t => t + 1);
    const unsubPet = subscribeAXEPets(changed);
    const unsubGear = subscribeAXEEquipmentInventory(changed);
    return () => { unsubPet(); unsubGear(); };
  }, []);
  void tick;
  const pet = getRegisteredAXEPet();
  const bonuses = getAXESoulRegaliaBonuses();
  const mastered = isSoulCompanionMastered(pet);
  const active = bonuses.set;
  const onFuse = () => {
    const result = setAXESoulFusion(!bonuses.fused);
    setError(result.ok ? '' : result.reason.replaceAll('_', ' '));
  };
  return (
    <div className="h-full overflow-y-auto px-6 py-5 text-white/75">
      <div className="mb-4 flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-sky-300" />
        <div>
          <h2 className="text-base font-semibold tracking-wider text-white">{focus === 'companion' ? 'Companion Mastery & Imbuement' : 'Soul Regalia'}</h2>
          <p className="text-[11px] text-white/50">{focus === 'companion' ? 'Companion mastery · Soul fusion · Body equipment imbuement' : 'Spiritual cape · Set completion · Ascension · Chosen skills'}</p>
        </div>
        <div className="ml-auto text-sm font-semibold text-sky-200">
          +{percent(bonuses.allStatsPct)}% combined active bonuses
        </div>
      </div>
      {focus === 'companion' && onOpenService && <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="mr-1 text-white/50">Related companion services:</span>
        <button type="button" onClick={() => onOpenService('pet')} className="rounded-lg border border-white/20 px-3 py-2 text-white/80 hover:bg-white/10">Pet registration & progression</button>
        <button type="button" onClick={() => onOpenService('mount')} className="rounded-lg border border-white/20 px-3 py-2 text-white/80 hover:bg-white/10">Mount management</button>
        <span className="text-white/40">Both use existing service handlers; fusion and imbuement remain here. Existing companion gear is under the Equipment menu (I) → Companion.</span>
      </div>}
      {focus === 'regalia' && onOpenService && <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => onOpenService('cape')} className="rounded-lg border border-white/20 px-3 py-2 text-white/80 hover:bg-white/10">Cape progression</button>
        <button type="button" onClick={() => onOpenService('halo')} className="rounded-lg border border-white/20 px-3 py-2 text-white/80 hover:bg-white/10">Halo progression</button>
        <button type="button" onClick={() => onOpenService('ascension')} className="rounded-lg border border-white/20 px-3 py-2 text-white/80 hover:bg-white/10">Ascension service</button>
      </div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {focus !== 'companion' && <section className={sectionClass}>
          <h3 className={titleClass}>Set completion</h3>
          <p className="mt-2 text-sm text-white/90">{active.grade ? SOUL_REGALIA_GRADES[active.grade].label + ' · ' + active.family : 'No Soul Regalia set equipped'}</p>
          <p className="mt-1 text-xs text-white/60">{active.code || 'S0'} · {active.pieceCount}/10 equipped pieces · +{percent(active.setPct)}% all stats</p>
          <div className="mt-3 flex gap-1">
            {[1, 2, 3, 4, 5].map(stage => <div key={stage}
              className={`h-2 flex-1 rounded ${active.stage >= stage ? 'bg-sky-400/80' : 'bg-white/10'}`} />)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
            {Object.entries(SOUL_REGALIA_GRADES).map(([grade, entry]) =>
              <div key={grade} className={`rounded border p-2 ${grade === active.grade ? 'border-sky-400/50 bg-sky-400/10' : 'border-white/10'}`}>
                <div className="font-semibold">{entry.label}</div>
                <div className="text-white/60">S5 +{entry.maxSetPct}%</div>
                <div className="text-white/45">Ascension V +{entry.maxAscensionPct}%</div>
                <div>Ascension {soul.ascension[grade]}/5</div>
              </div>)}
          </div>
          <p className="mt-3 text-[10px] text-white/45">Two matching pieces per stage. Complete S5 before ascending. Quest and loot rewards grant progression.</p>
        </section>}
        {focus !== 'regalia' && <section className={sectionClass}>
          <h3 className={titleClass}><PawPrint className="mr-2 inline h-3 w-3" />Soul companion</h3>
          <p className="mt-2 text-sm">{pet?.definitionId || 'No registered companion'}</p>
          <p className="mt-1 text-xs text-white/60">Level {pet?.level || 0}/200 · Over-enchant {pet?.overEnchantPercent || 0}/200%</p>
          <button type="button" disabled={!mastered} onClick={onFuse}
            className="mt-3 rounded-lg border border-sky-300/40 bg-sky-400/10 px-4 py-2 text-xs text-sky-200 disabled:cursor-not-allowed disabled:opacity-40">
            {bonuses.fused ? 'Separate soul bond' : 'Fuse companion soul'}
          </button>
          <p className="mt-2 text-xs text-white/60">
            {mastered ? 'Full mastery grants +25% stats. Fusion enables the equipment infusion; the pet’s existing passive stats are not counted twice.'
              : 'Max the registered companion level and over-enchantment before soul fusion.'}
          </p>
          {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
          <p className="mt-3 text-xs">Companion armor enchantment — {SOUL_PET_GEAR_SLOTS.filter(s => soul.petGear[s]?.enchantLevel >= 20).length}/5 mastered</p>
          <div className="mt-2 grid grid-cols-5 gap-1 text-[10px]">
            {SOUL_PET_GEAR_SLOTS.map(s => <div key={s} className="rounded border border-white/10 p-1 text-center">
              <div className="capitalize">{s}</div><div className="text-sky-200">{soul.petGear[s]?.enchantLevel || 0}/20</div>
            </div>)}
          </div>
          <p className="mt-2 text-[10px] text-white/45">All five enchanted + active fusion: additional +5% stats (provisional value).</p>
        </section>}
        {focus !== 'regalia' && <section className={sectionClass}>
          <h3 className={titleClass}>{focus === 'companion' ? 'Equipment imbuement' : 'Soul infusion & cape'}</h3>
          <p className="mt-2 text-xs text-white/60">At 100% mastery, infused equipped gear gains +20% effective stats; completed ascended Chosen gear gains +50% instead.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {SOUL_INFUSION_SLOTS.map(s => <div key={s}>
              <div className="mb-1 flex justify-between text-xs capitalize"><span>{s}</span><span>{soul.infusion[s]}%</span></div>
              <div className="h-2 rounded bg-white/10"><div className="h-2 rounded bg-sky-400" style={{ width: soul.infusion[s] + '%' }}/></div>
            </div>)}
          </div>
          {focus !== 'companion' && <>
            <div className="mt-4 text-xs">Spiritual cape: {bonuses.capeActive ? 'Equipped · +5 raw core stats and +5% all stats' : 'Locked or not equipped'}</div>
            <p className="mt-1 text-[10px] text-white/45">Cape energy patterns fade with the Will tank. The 3D cloth, soul glow and halo decorations require renderer assets.</p>
          </>}
        </section>}
        {focus === 'regalia' && <section className={sectionClass}>
          <h3 className={titleClass}>Spiritual cape</h3>
          <p className="mt-2 text-xs">Status: {bonuses.capeActive ? 'Equipped · +5 raw core stats and +5% all stats' : 'Locked or not equipped'}</p>
          <p className="mt-2 text-xs text-white/45">Cape progression and cosmetics have their own existing service. Chosen equipment and cape rules are not being recalculated here.</p>
        </section>}
        {focus !== 'companion' && <section className={sectionClass}>
          <h3 className={titleClass}>Halo aspect & chosen skills</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(SOUL_ASPECTS).map(([id, a]) =>
              <button key={id} type="button" onClick={() => setAXESoulAspect(id)}
                className={`rounded-md border px-3 py-1.5 text-xs ${soul.aspect === id ? 'border-white/60 bg-white/15' : 'border-white/10 bg-white/5'}`}
                style={{ color: a.color }}>{a.label}</button>)}
          </div>
          <p className="mt-2 text-[10px] text-white/45">Halo: one ring, two small angel wings, with the selected aspect symbol at the center.</p>
          <div className="mt-4 space-y-2">
            {SOUL_SKILLS.map(s => {
              const gate = getAXESoulSkillGate(s.id);
              return <div key={s.id} className="flex items-center justify-between rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="flex items-center gap-2 text-xs">{gate.ok ? <Sword size={13} /> : <LockKeyhole size={13} />} {s.label} <span className="text-white/35">({s.type})</span></span>
                <span className="text-[10px] text-white/50">{gate.ok ? 'Ready' : gate.reason.replaceAll('_', ' ')}</span>
              </div>;
            })}
          </div>
          <p className="mt-2 text-[10px] text-white/45">Skill cards can drop before they are usable. Complete Chosen S5, ascend, master all four infused body slots and equip matching gear.</p>
        </section>}
      </div>
    </div>
  );
}
