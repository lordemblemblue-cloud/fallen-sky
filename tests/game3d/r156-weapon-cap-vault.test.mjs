import test from 'node:test';
import assert from 'node:assert/strict';
import {AXE_LEVEL_CAP} from '../../base44/shared/axePowerBudget.ts';
import {WEAPON_SKILL_CAP,WEAPON_SKILL_POINTS_KEY,blankWeaponSkillPoints,WEAPON_SKILL_TIERS} from '../../base44/shared/weaponSkillPoints.mjs';
import {checkCharacterSave} from '../../base44/shared/characterSaveRules.ts';
const full=blankWeaponSkillPoints();for(const path of ['damage','range','defense'])full.nodes[path]=[...WEAPON_SKILL_TIERS];
const save=level=>({wwm_player_progression_v1:JSON.stringify({level,xp:0,baseStats:{strength:0,dexterity:0,constitution:0,focus:0},unspentPoints:0}),[WEAPON_SKILL_POINTS_KEY]:JSON.stringify(full)});
test('shared hero and weapon caps agree',()=>{assert.equal(WEAPON_SKILL_CAP,AXE_LEVEL_CAP);assert.equal(AXE_LEVEL_CAP,155);});
test('actual vault validates 600 spent points at 113 and 155, not 112 or 156',()=>{assert.equal(checkCharacterSave(save(112)).ok,false);assert.equal(checkCharacterSave(save(113)).ok,true);assert.equal(checkCharacterSave(save(155)).ok,true);assert.equal(checkCharacterSave(save(156)).ok,false);});
