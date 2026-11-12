import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import {
  checkGame3DAction, checkGame3DCharacterId, checkGame3DTarget,
  canRespondToCompetition,
} from '../../shared/game3dInteractionRules.mjs';

// Only backend operations can write these records. Competition results and
// mount rewards are deliberately NOT accepted from the client.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...headers, 'Content-Type': 'application/json' },
});
const reject = (error: string, status = 400, code = 'invalid') => json({ error, code }, status);
const safeRegion = (raw: unknown) => String(raw || 'wolfveil').slice(0, 40);
const no = (rows: any[]) => !(rows || []).length;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reject('Unsupported method', 405);
  try {
    const app = createClientFromRequest(req);
    const user = await app.auth.me();
    if (!user?.id) return reject('Sign in first', 401, 'unauthorized');
    const svc = app.asServiceRole.entities;
    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action || '');
    const data = payload?.data || {};
    const me = String(user.id);
    const target = String(data.targetUserId || '').trim();
    const iso = new Date().toISOString();
    const targetExists = async id => !!(await svc.User.get(id).catch(()=>null));
    const relation = async (other: string) => {
      const [iBlocked, theyBlocked] = await Promise.all([
        svc.Game3DSocialBlock.filter({owner_id:me,blocked_user_id:other},'-created_date',1),
        svc.Game3DSocialBlock.filter({owner_id:other,blocked_user_id:me},'-created_date',1),
      ]);
      return Boolean(iBlocked?.length || theyBlocked?.length);
    };
    if (action === 'blocked_list') {
      const rows = await svc.Game3DSocialBlock.filter({owner_id:me},'-created_date',250);
      return json({ success:true, blockedUserIds:(rows || []).map((r:any)=>r.blocked_user_id) });
    }
    if (action === 'block' || action === 'unblock') {
      if (!checkGame3DTarget(me,target)) return reject('Invalid player');
      const rows = await svc.Game3DSocialBlock.filter({owner_id:me,blocked_user_id:target},'-created_date',20);
      if (action === 'block' && no(rows))
        await svc.Game3DSocialBlock.create({owner_id:me,blocked_user_id:target,created_at:iso});
      if (action === 'unblock')
        for (const row of rows || []) await svc.Game3DSocialBlock.delete(row.id);
      return json({success:true,blocked:action === 'block',targetUserId:target});
    }
    if (action === 'report') {
      if (!checkGame3DTarget(me,target) || !(await targetExists(target))) return reject('Invalid player');
      const reason = String(data.reason || '');
      if (!checkGame3DAction('report', reason)) return reject('Select a report reason');
      const prior = await svc.Game3DSocialReport.filter({reporter_id:me,reported_user_id:target},'-created_date',10);
      if ((prior || []).some((r:any)=>Date.now()-Date.parse(r.created_at || r.created_date || 0)<60000))
        return reject('You recently reported this player',429,'cooldown');
      await svc.Game3DSocialReport.create({
        reporter_id:me,reported_user_id:target,reason,
        details:String(data.details||'').slice(0,1000),
        region:safeRegion(data.region),status:'submitted',created_at:iso,
      });
      return json({success:true,submitted:true});
    }
    if (action === 'clan_invite') {
      if (!checkGame3DTarget(me,target) || !(await targetExists(target))) return reject('Invalid player');
      if (await relation(target)) return reject('Cannot invite a blocked player',403,'blocked');
      const members = await svc.ClanMember.filter({user_id:me});
      const officers = (members || []).filter((m:any)=>['leader','officer'].includes(m.role));
      const requested = String(data.clanId || '').trim();
      const membership = requested ? officers.find((m:any)=>String(m.clan_id) === requested) : officers[0];
      if (!membership) return reject('Only a clan leader or officer can invite players',403,'forbidden');
      const clanId = String(membership.clan_id);
      const joined = await svc.ClanMember.filter({user_id:target,clan_id:clanId});
      if (joined?.length) return reject('Player already belongs to this clan',409,'already_member');
      const existing = await svc.ClanInvite.filter({divisionId:clanId,inviteeId:target,status:'pending'},'-created_date',20);
      if (existing?.length) return reject('Clan invitation is already pending',409,'pending');
      const invite = await svc.ClanInvite.create({
        divisionId:clanId,inviterId:me,inviteeId:target,
        status:'pending',createdAt:iso,
      });
      return json({success:true,inviteId:invite.id});
    }
    if (action === 'compete_invite') {
      if (!checkGame3DTarget(me,target) || !(await targetExists(target))) return reject('Invalid player');
      const kind = String(data.kind || '');
      if (!checkGame3DAction('competition',kind)) return reject('Unknown competition');
      if (await relation(target)) return reject('Cannot compete with a blocked player',403,'blocked');
      const recent = await svc.Game3DCompetition.filter({challenger_id:me,opponent_id:target,status:'pending'},'-created_date',30);
      if ((recent || []).some((r:any)=>r.kind===kind && Date.parse(r.expires_at)>Date.now()))
        return reject('A challenge is already pending',409,'pending');
      const challenge = await svc.Game3DCompetition.create({
        challenger_id:me,opponent_id:target,kind,status:'pending',
        arena_id:'',region:safeRegion(data.region),
        created_at:iso,expires_at:new Date(Date.now()+120000).toISOString(),
      });
      return json({success:true,challengeId:challenge.id,status:'pending'});
    }
    if (action === 'compete_respond') {
      const id = String(data.challengeId || '');
      if (!id || id.length>128) return reject('Invalid challenge');
      const challenge = await svc.Game3DCompetition.get(id).catch(()=>null);
      if (!challenge || challenge.opponent_id!==me) return reject('Challenge not found',404,'not_found');
      if (!canRespondToCompetition(challenge,me)) return reject('Challenge expired or already answered',409,'conflict');
      const accepted = data.accept === true;
      if (accepted && await relation(String(challenge.challenger_id)))
        return reject('Cannot accept a blocked player',403,'blocked');
      // Both parties consenting is not evidence of a finished contest.
      // Scene-specific table, route, conditions and scoring require a trusted host.
      const status = accepted ? 'awaiting_setup' : 'declined';
      await svc.Game3DCompetition.update(id,{status,responded_at:iso});
      return json({success:true,status,challengeId:id});
    }
    if (action === 'compete_list') {
      const [sent,received] = await Promise.all([
        svc.Game3DCompetition.filter({challenger_id:me},'-created_date',50),
        svc.Game3DCompetition.filter({opponent_id:me},'-created_date',50),
      ]);
      return json({success:true,challenges:[...(sent||[]),...(received||[])]
        .sort((a:any,b:any)=>Date.parse(b.created_at||b.created_date||0)-Date.parse(a.created_at||a.created_date||0))
        .slice(0,80)});
    }
    if (action === 'mount_command') {
      const characterId = String(data.characterId || '');
      const companionId = String(data.companionId || '');
      const mountAction = String(data.mountAction || '');
      if (!checkGame3DCharacterId(characterId) ||
          !checkGame3DCharacterId(companionId) ||
          !checkGame3DAction('mount',mountAction)) return reject('Invalid mount action');
      const characters = await svc.Game3DCharacterSave.filter({owner_id:me,character_id:characterId},'-created_date',2);
      if (no(characters) || characters[0].deleted_at)
        return reject('Character must be cloud-synced before mount activities',409,'not_synced');
      const recent = await svc.Game3DMountActivity.filter({owner_id:me,character_id:characterId},'-created_date',5);
      if ((recent || []).some((r:any)=>Date.now()-Date.parse(r.requested_at||r.created_date||0)<2500))
        return reject('Mount needs a moment',429,'cooldown');
      const activity = await svc.Game3DMountActivity.create({
        owner_id:me,character_id:characterId,companion_id:companionId,
        action:mountAction,status:'pending_animation',region:safeRegion(data.region),
        requested_at:iso,animation_id:'',quest_id:'',
      });
      return json({success:true,activityId:activity.id,status:'pending_animation'});
    }
    if (action === 'mount_list') {
      const characterId = String(data.characterId || '');
      if (!checkGame3DCharacterId(characterId)) return reject('Invalid character');
      const rows = await svc.Game3DMountActivity.filter({owner_id:me,character_id:characterId},'-created_date',50);
      return json({success:true,activities:rows || []});
    }
    return reject('Unknown action');
  } catch (error) {
    console.error('[game3dWorldInteraction]',error);
    return reject('Unable to complete this request',500,'server');
  }
});
