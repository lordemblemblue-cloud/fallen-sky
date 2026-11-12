import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { action, partyId, targetUserId } = await req.json();

        if (!partyId || !action) {
            return Response.json({ error: 'Missing partyId or action' }, { status: 400 });
        }

        // Fetch party
        const party = await base44.entities.Party.get(partyId);
        if (!party) {
            return Response.json({ error: 'Party not found' }, { status: 404 });
        }

        // A clan party is accessible only to current members of that clan.
        // The legacy divisionId/userId filter did not match ClanMember schema
        // and blocked valid members from joining.
        let clanMember = null;
        if (party.clanId) {
            const records = await base44.asServiceRole.entities.ClanMember.filter({
                clan_id: party.clanId, user_id: user.id
            });
            clanMember = records?.[0] || null;
            if (!clanMember) {
                return Response.json({ success: false, error: 'Clan membership required' }, { status: 403 });
            }
        }

        let updatedMembers = [...(party.members || [])];
        let newStatus = party.status;
        let presenceUpdate = null;

        switch (action) {
            case 'join':
                if (['completed', 'disbanded'].includes(party.status)) {
                    return Response.json({ success: false, error: 'Party is no longer available' }, { status: 409 });
                }
                if (updatedMembers.includes(user.id)) {
                    return Response.json({ success: true, message: 'Already joined', party });
                }
                if (party.assignmentId && !['leader', 'officer'].includes(clanMember?.role)) {
                    const task = await base44.asServiceRole.entities.ClanAssignment.get(party.assignmentId);
                    if (!task || (task.clanId !== party.clanId && task.divisionId !== party.clanId) ||
                        (task.assigneeId !== 'all' && String(task.assigneeId) !== String(user.id))) {
                        return Response.json({ success: false, error: 'Party is restricted to assigned members' }, { status: 403 });
                    }
                }
                if (updatedMembers.length >= Number(party.maxSize || 5)) {
                    return Response.json({ error: 'Party is full' }, { status: 409 });
                }
                updatedMembers.push(user.id);
                
                // Sync presence
                presenceUpdate = {
                    current_activity: {
                        type: 'party',
                        id: partyId,
                        clanId: party.clanId || null,
                        gameId: party.gameId,
                        role: 'member'
                    }
                };
                break;

            case 'leave':
                if (!updatedMembers.includes(user.id)) {
                    return Response.json({ message: 'Not in party' });
                }
                updatedMembers = updatedMembers.filter(id => id !== user.id);
                
                // Sync presence
                presenceUpdate = {
                    current_activity: party.clanId && party.gameId
                        ? { type: 'game', clanId: party.clanId, id: party.gameId, zoneId: 'party' }
                        : null
                };
                
                // If leader leaves, either disband or assign new leader
                // For now, if leader leaves, we'll let the auto-expire handle empty party, 
                // or if members remain, we should probably promote someone.
                if (party.leaderId === user.id && updatedMembers.length > 0) {
                    // Promote next member
                    await base44.entities.Party.update(partyId, { leaderId: updatedMembers[0] });
                }
                break;

            case 'kick':
                if ((party.leaderId !== user.id || !updatedMembers.includes(user.id))
                    && !['leader', 'officer'].includes(clanMember?.role)) {
                    return Response.json({ success: false, error: 'Only party leader or clan officers can kick' }, { status: 403 });
                }
                if (!targetUserId) {
                    return Response.json({ error: 'Target user required for kick' }, { status: 400 });
                }
                updatedMembers = updatedMembers.filter(id => id !== targetUserId);
                if (party.leaderId === targetUserId && updatedMembers.length > 0) {
                    await base44.entities.Party.update(partyId, { leaderId: updatedMembers[0] });
                }
                // Cannot update kicked user's presence easily from here without service role + looking up user
                // We'll skip remote presence update for now, rely on frontend polling/subscription
                break;

            default:
                return Response.json({ error: 'Invalid action' }, { status: 400 });
        }

        // Update Status logic
        if (updatedMembers.length >= Number(party.maxSize || 5)) {
            newStatus = 'full';
        } else if (updatedMembers.length === 0) {
            // Will be cleaned up by automation, but we can mark it
            newStatus = 'completed'; 
        } else {
            // If it was full, now it's forming/active
            newStatus = 'active'; 
        }

        // Apply Party Update
        const updatedParty = await base44.entities.Party.update(partyId, {
            members: updatedMembers,
            status: newStatus,
            lastActive: new Date().toISOString()
        });

        // Apply Presence Update (Self)
        if (presenceUpdate) {
            await base44.auth.updateMe(presenceUpdate);
        }

        return Response.json({ success: true, party: updatedParty });

    } catch (error) {
        console.error('Error managing party:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});