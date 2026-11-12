import { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, Gauge, Sparkles, Swords } from 'lucide-react';
import { getSkillMastery, subscribeSkillMastery } from '../../skills/skillMasteryStore';
import { scaleStat } from '../../skills/skillRegistry';

function statLabel(name) {return name.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}
function displayStat(name,value) {
  if (value===null) return '—';
  return (name.includes('pct') || name.includes('chance') || name.includes('reflect'))
    ? (value*100).toFixed(1)+'%' : Number(value).toFixed(2);
}
export default function AXESkillMasteryDetail({skill,companion=false}) {
  const [revision,setRevision]=useState(0);
  const [showNext,setShowNext]=useState(false);
  useEffect(()=>subscribeSkillMastery(()=>setRevision(v=>v+1)),[]);
  useEffect(()=>setShowNext(false),[skill?.skill_id]);
  if (!skill) return <div className="axe-book-inspector-empty">
    <BookOpen size={39}/><h3>Select a Skill</h3>
    <p>Choose an original combat skill or buff to inspect its description, mastery and next advancement.</p>
  </div>;
  void revision;
  // Companion skills currently have no persisted mastery store. Never invent XP.
  const mastery=companion?null:getSkillMastery(skill.skill_id);
  const progress=mastery?Math.min(100,Math.max(0,Number(mastery.progress)||0)*100):0;
  const next=mastery?Math.min(mastery.maxLevel,mastery.level+1):null;
  const scalings=Object.entries(skill.scaling||{});
  return <article className="axe-book-inspector" aria-label={skill.skill_name+' progression'}>
    <header className="axe-book-inspector-head">
      <span className="axe-book-inspector-icon" aria-hidden="true">{skill.icon||'✧'}</span>
      <div><small>SKILL PROGRESSION</small><h3>{skill.skill_name}</h3>
        <span>{companion?'Companion '+(skill.category||'ability'):skill.skill_type?.replaceAll('_',' ')}</span></div>
    </header>
    <section className="axe-book-inspector-description"><h4><BookOpen size={16}/> Description</h4>
      <p>{skill.description || 'No description provided in the game skill registry.'}</p></section>
    <section className="axe-book-inspector-stats">
      <div><span><Gauge size={15}/> Skill Level</span><b>{mastery?mastery.level+' / '+mastery.maxLevel:'Not configured'}</b></div>
      {mastery&&<div><span>Mastery Rank</span><b>{mastery.rank?.label||'Base'}</b></div>}
      {Number.isFinite(Number(skill.cooldown))&&<div><span>Cooldown</span><b>{Number(skill.cooldown)}s</b></div>}
      {Number(skill.duration)>0&&<div><span>Duration</span><b>{Number(skill.duration)}s</b></div>}
    </section>
    {mastery?<section className="axe-book-inspector-progression">
      <h4><Sparkles size={15}/> Mastery Progress <b>{progress.toFixed(1)}%</b></h4>
      <div className="axe-book-mastery-meter" role="progressbar" aria-label="Skill mastery to next level"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <span style={{width:progress+'%'}}/></div>
      <div className="axe-book-xp-details">
        <span>{Math.round(mastery.xp-mastery.levelStartXp).toLocaleString()} XP earned this level</span>
        <span>{mastery.nextLevelXp===null?'Maximum mastery':(Math.max(0,Math.round(mastery.nextLevelXp-mastery.xp))).toLocaleString()+' XP remaining'}</span>
      </div>
    </section>:<p className="axe-book-mastery-unavailable">Companion abilities have no configured mastery XP system yet. Their real skill effects and equipment remain available.</p>}
    {scalings.length>0&&<section className="axe-book-next-stat">
      <h4>{showNext?'Current → Next Level':'Current Skill Effects'}</h4>
      {scalings.map(([name,range])=>{
        const current=scaleStat(skill,name,mastery?.level||1);
        const upgraded=scaleStat(skill,name,next||1);
        return <div key={name}><span>{statLabel(name)}</span>
          <b>{displayStat(name,current)}{showNext&&mastery&&next!==mastery.level&&' → '+displayStat(name,upgraded)}</b></div>;
      })}
    </section>}
    {mastery&&<div className="axe-book-inspector-actions">
      <button type="button" onClick={()=>setShowNext(v=>!v)}
        disabled={mastery.level>=mastery.maxLevel}>
        <ArrowUpRight size={17}/>{showNext?'Show Current':'Preview Upgrade'}</button>
      <p>{mastery.level>=mastery.maxLevel?'This skill has reached maximum mastery.'
        :'Upgrade by using this skill successfully in combat. XP is awarded for confirmed combat use, and the next level unlocks automatically.'}</p>
    </div>}
  </article>;
}