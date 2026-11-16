import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CLONE_SKILL_TREE_CATEGORIES, createCloneSkillTreePaths, resolveCloneSkillTreeTier,
  cloneSkillTreeIsAvailable,
} from '../src/components/game3d/axe/skills/AXECloneSkillTreeModel.mjs';

const read = name => readFileSync('src/components/game3d/axe/services/'+name,'utf8');
test('approved reference structure: three real attack paths, linked T1–T3 and two passive markers',()=>{
  assert.deepEqual(CLONE_SKILL_TREE_CATEGORIES.map(c=>c.label),
    ['Damage','Range','Defense','Universal','Passive']);
  for(const category of ['damage','range','defense']){
    const paths=createCloneSkillTreePaths(category);
    assert.deepEqual(paths.map(p=>p.id),['single','three','aerial']);
    for(const path of paths){
      assert.equal(path.active.length,3);
      assert.equal(path.passives.length,2);
      assert.equal(path.passives[0].tier,2);
      assert.equal(path.passives[1].tier,3);
      assert(path.active.every(id=>typeof id==='string'&&id.length>0));
    }
  }
  const damage=createCloneSkillTreePaths('damage');
  assert.equal(damage[0].active[0],'sword_heavy_strike');
  assert.equal(damage[1].active[0],'sword_triple_slash');
  assert.equal(damage[1].active[1],'axe_offensive_skill_5');
  assert.equal(damage[2].active[1],'axe_offensive_a_skill');
});
test('tree unlocks are read from the canonical weapon point store, not made up by UI',()=>{
  const path=createCloneSkillTreePaths('damage')[1];
  const unlocked=id=>id==='sword_triple_slash';
  assert.equal(resolveCloneSkillTreeTier(path,1,unlocked).unlocked,true);
  assert.equal(resolveCloneSkillTreeTier(path,2,unlocked).unlocked,false);
  assert.equal(cloneSkillTreeIsAvailable('axe_offensive_skill_5',unlocked),false);
  assert.equal(cloneSkillTreeIsAvailable('axe_offensive_skill_5',()=>true),true);
});
test('Game 3D clone route renders approved tree by default and keeps classic QA fallback',()=>{
  const route=read('AXESkillBookWorkspace.jsx');
  const tree=read('AXECloneSkillTreeWorkspace.jsx');
  const css=read('AXECloneSkillTree.css');
  assert.match(route,/cloneClassic = false/);
  assert.match(route,/if \(!cloneClassic\) return <AXECloneSkillTreeWorkspace/);
  for(const term of ['Combat Skill Tree','Equipped Skills','TierConnector','Three branch combat skill tree',
    'SkillDetails','Search Skill','Previous skill set','Next skill set','AXEWeaponSkillPointsPanel',
    'subscribeSkillMastery','subscribeWeaponSkillPoints','isWeaponSkillUnlocked']){
    assert(tree.includes(term),'missing '+term);
  }
  assert.match(css,/\.axe-ct-lanes/);
  assert.match(css,/\.axe-ct-node--selected/);
  assert.match(css,/\.jade-services-navigation/);
  assert.doesNotMatch(css,/background-image:\s*url\(/);
  assert.doesNotMatch(tree,/<img/);
  assert.doesNotMatch(tree,/awardSkillXp|award\(/);
});
