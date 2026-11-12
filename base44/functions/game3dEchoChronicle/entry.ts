// Game 3D — first multiplayer Echo Chronicle slice.
// Real, mutually accepted player conversations. Only an authenticated participant
// may read or change a session; all writes use service-role behind those checks.
// Quest completion, loot and relationship labels are deliberately NOT inferred here.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const expired = (date: string) => !!date && Date.parse(date) <= Date.now();
const displayName = (user: any) => String(user?.full_name || user?.username || 'Player').slice(0, 80);
const when = (row: any) => Date.parse(row?.created_date || row?.updated_date || 0) || 0;
const contextKind = (value: unknown) => ['boss', 'exploration'].includes(String(value)) ? String(value) : 'chance';
// Only known Game 3D region identifiers are accepted as display hints.
const cleanRegion = (value: unknown) => ['wolfveil', 'forest'].includes(String(value)) ? String(value) : '';
const WORLD_CHANNEL = 'game_world_main';
const MAX_TALK_DISTANCE = 35;
// Server chooses the only two supported story branches. A client may suggest
// a quest, but cannot claim an event, reward, quest completion or a relationship.
const ADVENTURES: Record<string, string> = Object.freeze({
  echo_branch_hidden_echo: 'The Hidden Echo',
  echo_branch_broken_road: 'The Broken Road',
});
const freshWorldPresence = (rows: any[]) => (rows || []).find((row: any) => {
  const stamp = Number(row.last_update) || Date.parse(row.last_update) || 0;
  return row.channel_id === WORLD_CHANNEL && row.status !== 'offline' &&
    stamp > Date.now() - 30_000 && Number.isFinite(Number(row.x)) && Number.isFinite(Number(row.z));
});
const cleanLine = (value: unknown) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
// Server-authoritative gesture phrases. No client-supplied gesture text or fake
// animation is accepted. Gestures are voluntary social acts, not relationship XP.
const GESTURES: Record<string, string> = Object.freeze({
  nod: 'nods in acknowledgement',
  wave: 'gives a small wave',
  bow: 'bows respectfully',
  thanks: 'offers a gesture of thanks',
  farewell: 'raises a hand in farewell',
});
const canAddLine = (session: any, myId: string): { error: string | null; status: number; lines: any[] } => {
  if (session.status !== 'active') return { error: 'Conversation is not active', status: 409, lines: [] };
  // Freeze after the first consent, so both players agree to exactly the same words/gestures.
  if (session.consent_initiator || session.consent_recipient) {
    return { error: 'The shared memory is awaiting consent; start another talk to continue', status: 409, lines: [] };
  }
  const lines = Array.isArray(session.lines) ? session.lines : [];
  if (lines.length >= 24) return { error: 'This exchange is complete. You can talk again another time.', status: 409, lines: [] };
  const lastMine = [...lines].reverse().find((item: any) => item.speaker_id === myId);
  if (lastMine && Date.now() - Date.parse(lastMine.at || 0) < 2_000) {
    return { error: 'Please slow down', status: 429, lines: [] };
  }
  return { error: null, status: 200, lines };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.id) return json({ error: 'Sign in to speak to another player' }, 401);
    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || '');
    const data = payload.data || {};
    const svc = base44.asServiceRole.entities;
    const myId = String(me.id);

    const mySessions = async () => {
      const [sent, received] = await Promise.all([
        svc.Game3DEchoEncounter.filter({ initiator_id: myId }, '-created_date', 60),
        svc.Game3DEchoEncounter.filter({ recipient_id: myId }, '-created_date', 60),
      ]);
      return [...new Map([...(sent || []), ...(received || [])].map((r: any) => [r.id, r])).values()]
        .sort((a: any, b: any) => when(b) - when(a));
    };

    const loadSession = async (id: unknown) => {
      const row = String(id || '') ? await svc.Game3DEchoEncounter.get(String(id)).catch(() => null) : null;
      return row && (row.initiator_id === myId || row.recipient_id === myId) ? row : null;
    };

    if (action === 'get_state') {
      const rows = await mySessions();
      const visible = [];
      for (const row of rows) {
        if (row.status === 'pending' && expired(row.expires_at)) {
          await svc.Game3DEchoEncounter.update(row.id, { status: 'expired', ended_at: new Date().toISOString() });
          continue;
        }
        if (row.status === 'declined' || row.status === 'expired') continue;
        // A declined/unrecorded conversation does not stay in the player's book.
        if (row.status === 'finished' && !row.remembered_at && Date.now() - Date.parse(row.ended_at || row.created_date) > 24 * 60 * 60_000) continue;
        visible.push(row);
      }
      return json({ success: true, sessions: visible.slice(0, 35) });
    }

    if (action === 'start') {
      const otherId = String(data.playerId || '').trim();
      if (!otherId || otherId === myId || otherId.length > 128) return json({ error: 'Select another player' }, 400);
      const rows = await mySessions();
      const existing = rows.find((row: any) =>
        ((row.initiator_id === myId && row.recipient_id === otherId) ||
         (row.recipient_id === myId && row.initiator_id === otherId)) &&
        (row.status === 'active' || (row.status === 'pending' && !expired(row.expires_at)))
      );
      if (existing) return json({ success: true, session: existing, existing: true });
      if (rows.some((row: any) => when(row) > Date.now() - 3_000)) {
        return json({ error: 'Give the other player a moment before starting another conversation' }, 429);
      }
      if (rows.filter((row: any) => row.status === 'pending' && !expired(row.expires_at)).length >= 3) {
        return json({ error: 'Too many unanswered invitations' }, 429);
      }
      // A browser-chosen account ID is not proof of a nearby encounter.
      // Both active players must have recent presence in the same Game 3D world
      // and be within interaction range, before creating an invitation.
      const [mine, theirs] = await Promise.all([
        svc.PlayerState.filter({ player_id: myId }, '-last_update', 5),
        svc.PlayerState.filter({ player_id: otherId }, '-last_update', 5),
      ]);
      const meHere = freshWorldPresence(mine);
      const otherHere = freshWorldPresence(theirs);
      if (!meHere || !otherHere ||
          Math.hypot(Number(meHere.x) - Number(otherHere.x),
                     Number(meHere.z) - Number(otherHere.z)) > MAX_TALK_DISTANCE) {
        return json({ error: 'The other player must be nearby in the same world to talk' }, 409);
      }
      // Previous history is only acknowledged when BOTH players saved it.
      // Unanswered, declined, or one-sided encounters never become 'we met' evidence.
      const savedTogether = rows.filter((row: any) =>
        ((row.initiator_id === myId && row.recipient_id === otherId) ||
         (row.recipient_id === myId && row.initiator_id === otherId)) &&
        row.remembered_at && row.consent_initiator && row.consent_recipient
      ).sort((a: any, b: any) => when(b) - when(a));
      const previous = savedTogether[0] || null;
      const other = await svc.User.get(otherId).catch(() => null);
      if (!other) return json({ error: 'Player is unavailable' }, 404);
      const session = await svc.Game3DEchoEncounter.create({
        initiator_id: myId,
        initiator_name: displayName(me),
        recipient_id: otherId,
        recipient_name: displayName(other),
        status: 'pending',
        context_type: contextKind(data.contextType),
        region: cleanRegion(data.region),
        // A neutral factual snapshot; NOT a rescue, loot, relationship or quest claim.
        meeting_distance_m: Math.round(Math.hypot(Number(meHere.x) - Number(otherHere.x), Number(meHere.z) - Number(otherHere.z))),
        previous_encounters: savedTogether.length,
        previous_met_at: previous?.remembered_at || null,
        previous_region: previous?.region || '',
        expires_at: minutesFromNow(2),
        consent_initiator: false,
        consent_recipient: false,
        lines: [],
      });
      return json({ success: true, session });
    }

    const session = await loadSession(data.sessionId);
    if (!session) return json({ error: 'Conversation not found' }, 404);
    const isRecipient = session.recipient_id === myId;

    // A living-encounter invitation is separate from conversation lines and
    // the mutual agreement to save them. No quest or rewards are granted here.
    if (action === 'propose_adventure') {
      if (session.status !== 'active' || session.consent_initiator || session.consent_recipient) {
        return json({ error: 'The conversation must be active and not awaiting a memory decision' }, 409);
      }
      const questId = String(data.questId || '');
      if (!Object.prototype.hasOwnProperty.call(ADVENTURES, questId)) {
        return json({ error: 'Choose an available adventure' }, 400);
      }
      const previous = session.adventure_proposal;
      if (previous?.status === 'agreed') {
        return json({ error: 'You already agreed on an adventure in this encounter' }, 409);
      }
      if (previous?.status === 'proposed' && !expired(previous.expires_at)) {
        return json({ error: 'There is already an adventure suggestion awaiting a response' }, 409);
      }
      // Confirm a shared world presence, not a claimed kill, rescue, quest flag,
      // or discovery event. Those require separate authoritative evidence.
      const otherId = isRecipient ? session.initiator_id : session.recipient_id;
      const [mine, theirs] = await Promise.all([
        svc.PlayerState.filter({ player_id: myId }, '-last_update', 5),
        svc.PlayerState.filter({ player_id: otherId }, '-last_update', 5),
      ]);
      const meHere = freshWorldPresence(mine);
      const otherHere = freshWorldPresence(theirs);
      if (!meHere || !otherHere ||
          Math.hypot(Number(meHere.x) - Number(otherHere.x),
                     Number(meHere.z) - Number(otherHere.z)) > MAX_TALK_DISTANCE) {
        return json({ error: 'Meet nearby in the same world before proposing an adventure' }, 409);
      }
      const updated = await svc.Game3DEchoEncounter.update(session.id, {
        adventure_proposal: {
          quest_id: questId, status: 'proposed', proposed_by: myId,
          proposed_at: new Date().toISOString(), expires_at: minutesFromNow(5),
          accepted_initiator: !isRecipient, accepted_recipient: isRecipient,
        },
      });
      return json({ success: true, session: updated });
    }
    if (action === 'respond_adventure') {
      if (session.status !== 'active' || session.consent_initiator || session.consent_recipient) {
        return json({ error: 'The conversation is unavailable for adventure choices' }, 409);
      }
      const proposal = session.adventure_proposal;
      if (proposal?.status !== 'proposed' || expired(proposal.expires_at)) {
        return json({ error: 'The adventure suggestion is no longer open' }, 409);
      }
      const choice = String(data.choice || '');
      if (choice !== 'accept' && choice !== 'decline') {
        return json({ error: 'Choose accept or decline' }, 400);
      }
      if (choice === 'accept' && proposal.proposed_by === myId) {
        return json({ error: 'The other traveler must accept your proposal' }, 409);
      }
      const updated = await svc.Game3DEchoEncounter.update(session.id, {
        adventure_proposal: {
          ...proposal,
          status: choice === 'accept' ? 'agreed'
            : proposal.proposed_by === myId ? 'withdrawn' : 'declined',
          accepted_initiator: choice === 'accept' ? true : !!proposal.accepted_initiator,
          accepted_recipient: choice === 'accept' ? true : !!proposal.accepted_recipient,
        },
      });
      return json({ success: true, session: updated });
    }

    if (action === 'accept') {
      if (!isRecipient) return json({ error: 'Only the invited player can accept' }, 403);
      if (session.status !== 'pending' || expired(session.expires_at)) return json({ error: 'This invitation has expired' }, 409);
      const updated = await svc.Game3DEchoEncounter.update(session.id, { status: 'active' });
      return json({ success: true, session: updated });
    }
    if (action === 'decline') {
      if (session.status !== 'pending') return json({ error: 'Invitation already resolved' }, 409);
      if (!isRecipient && session.initiator_id !== myId) return json({ error: 'Not a participant' }, 403);
      await svc.Game3DEchoEncounter.update(session.id, { status: 'declined', ended_at: new Date().toISOString() });
      return json({ success: true });
    }
    if (action === 'speak' || action === 'gesture') {
      const gate = canAddLine(session, myId);
      if (gate.error) return json({ error: gate.error }, gate.status);
      const at = new Date().toISOString();
      let item: any;
      if (action === 'gesture') {
        const gestureId = String(data.gestureId || '');
        if (!Object.prototype.hasOwnProperty.call(GESTURES, gestureId)) {
          return json({ error: 'Choose an available gesture' }, 400);
        }
        item = {
          speaker_id: myId, speaker_name: displayName(me),
          kind: 'gesture', gesture_id: gestureId, text: GESTURES[gestureId], at,
        };
      } else {
        const line = cleanLine(data.text);
        if (!line) return json({ error: 'Write a response first' }, 400);
        item = { speaker_id: myId, speaker_name: displayName(me), kind: 'speech', text: line, at };
      }
      const updated = await svc.Game3DEchoEncounter.update(session.id, { lines: [...gate.lines, item] });
      return json({ success: true, session: updated });
    }
    if (action === 'finish') {
      if (session.status !== 'active' && session.status !== 'pending') return json({ success: true, session });
      const updated = await svc.Game3DEchoEncounter.update(session.id, {
        status: session.status === 'pending' ? 'declined' : 'finished', ended_at: new Date().toISOString(),
      });
      return json({ success: true, session: updated });
    }
    if (action === 'remember') {
      if (!['active', 'finished'].includes(session.status)) return json({ error: 'No shared encounter to remember' }, 409);
      const hasSharedExchange = (session.lines || []).length > 0 ||
        session.adventure_proposal?.status === 'agreed';
      if (!hasSharedExchange) return json({ error: 'Share a real exchange before saving a shared memory' }, 409);
      const patch = isRecipient ? { consent_recipient: true } : { consent_initiator: true };
      const together = isRecipient ? !!session.consent_initiator : !!session.consent_recipient;
      const updated = await svc.Game3DEchoEncounter.update(session.id, {
        ...patch, ...(together ? { remembered_at: session.remembered_at || new Date().toISOString() } : {}),
      });
      return json({ success: true, session: updated, waiting_for_partner: !together });
    }
    // Until both parties agree, either may withdraw their consent and resume
    // talking. After mutual agreement the shared entry remains an immutable snapshot.
    if (action === 'decline_remember') {
      if (!['active', 'finished'].includes(session.status) || session.remembered_at) {
        return json({ error: 'Cannot decline a memory that was already saved' }, 409);
      }
      // Either player may say no without being forced to save a conversation.
      const updated = await svc.Game3DEchoEncounter.update(session.id, {
        consent_initiator: false, consent_recipient: false,
      });
      return json({ success: true, session: updated });
    }
    if (action === 'withdraw_remember') {
      if (!['active', 'finished'].includes(session.status)) return json({ error: 'Cannot change this conversation' }, 409);
      if (session.remembered_at) return json({ error: 'This memory was already saved together' }, 409);
      const patch = isRecipient ? { consent_recipient: false } : { consent_initiator: false };
      const updated = await svc.Game3DEchoEncounter.update(session.id, patch);
      return json({ success: true, session: updated });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('[Game3DEchoChronicle]', error);
    return json({ error: 'Echo Chronicle is temporarily unavailable' }, 500);
  }
});
