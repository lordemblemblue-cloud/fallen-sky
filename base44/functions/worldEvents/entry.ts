import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return new Response('Unauthorized', { status: 401 });
        }

        // The body is read exactly once. The previous handler consumed the
        // request stream again inside each case, so every action after the
        // first threw before reaching its logic.
        const body = await req.json().catch(() => ({}));
        const { action, eventId, questId } = body || {};

        switch (action) {
            case 'getCurrentEvent': {
                const event = await getCurrentWorldEvent();
                return new Response(JSON.stringify(event), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            case 'joinEvent': {
                const participation = await joinWorldEvent(user.id, eventId);
                return new Response(JSON.stringify(participation), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            case 'getEventProgress': {
                const progress = await getEventProgress(user.id, eventId);
                return new Response(JSON.stringify(progress), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            case 'completeEventQuest': {
                const completion = await completeEventQuest(base44, user, questId);
                return new Response(JSON.stringify(completion), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            default:
                return new Response('Invalid action', { status: 400 });
        }
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

async function getCurrentWorldEvent() {
    // Simulate current world event
    return {
        id: 'leviathan_rise_2024',
        name: "Leviathan's Rise",
        description: "An ancient sea monster has awakened across multiple game worlds",
        status: 'active',
        startDate: new Date(Date.now() - 86400000 * 2).toISOString(),
        endDate: new Date(Date.now() + 86400000 * 5).toISOString(),
        participants: 15420,
        globalProgress: 65,
        worldBoss: {
            name: "Abyssal Leviathan",
            health: 42,
            timeRemaining: "02:15:34",
            totalDamage: 7800000,
            targetDamage: 10000000
        },
        quests: [
            {
                id: 'damage_leviathan',
                title: 'Damage the Leviathan',
                description: 'Deal damage to the world boss',
                progress: 7800000,
                target: 10000000,
                reward: '500 AGP',
                type: 'damage'
            },
            {
                id: 'find_cache',
                title: 'Find a Leviathan Cache',
                description: 'Discover a hidden treasure cache',
                progress: 0,
                target: 1,
                reward: 'Legendary Item',
                type: 'exploration'
            }
        ],
        rewards: {
            participation: '200 AGP',
            completion: 'Exclusive Leviathan Mount',
            topDamage: 'Mythic Trident of the Deep'
        }
    };
}

async function joinWorldEvent(userId, eventId) {
    // Record user participation in world event
    const participation = {
        userId,
        eventId,
        joinedAt: new Date().toISOString(),
        contribution: 0,
        questsCompleted: 0,
        rewards: []
    };

    return {
        success: true,
        participation,
        message: 'Successfully joined the world event!',
        initialReward: '50 AGP'
    };
}

async function getEventProgress(userId, eventId) {
    // Get user's progress in the event
    return {
        userId,
        eventId,
        personalDamage: 125000,
        questsCompleted: 1,
        rank: 342,
        contribution: 8.5,
        rewards: [
            { type: 'agp', amount: 250, claimed: true },
            { type: 'item', name: 'Leviathan Scale', claimed: false }
        ]
    };
}

async function completeEventQuest(base44, user, questId) {
    const questRewards = {
        'damage_leviathan': { agp: 500, experience: 1000 },
        'find_cache': { item: 'Legendary Treasure Chest', agp: 300 }
    };

    const reward = questRewards[String(questId || '')];
    if (!reward) {
        throw new Error('Quest not found');
    }

    // A world-event quest pays out at most once per account. The claim is a
    // server-side RewardGrant row keyed by the quest, written before any
    // currency moves, so replaying the request cannot mint AGP again.
    const svc = base44.asServiceRole.entities;
    const grantKey = `world_event_quest:${questId}`;
    const claimed = await svc.RewardGrant.filter({ user_id: user.id, grant_key: grantKey }, '-created_date', 5);
    if (claimed.length) {
        throw new Error('This quest reward has already been claimed');
    }

    const grant = await svc.RewardGrant.create({
        user_id: user.id,
        grant_key: grantKey,
        status: 'pending',
        payload: { source: 'world_event_quest', quest_id: String(questId), ...reward }
    });

    // Two racing requests can both create a claim; only the oldest may pay.
    const settled = await svc.RewardGrant.filter({ user_id: user.id, grant_key: grantKey }, 'created_date', 5);
    if (settled.length !== 1 || settled[0].id !== grant.id) {
        await svc.RewardGrant.delete(grant.id).catch(() => {});
        throw new Error('This quest reward has already been claimed');
    }

    if (reward.agp) {
        const fresh = await base44.auth.me();
        await base44.entities.User.updateMyUserData({
            avatar_gamer_points: (Number(fresh?.avatar_gamer_points) || 0) + reward.agp
        });
    }

    await svc.RewardGrant.update(grant.id, {
        status: 'completed',
        completed_at: new Date().toISOString()
    }).catch(() => {});

    return {
        success: true,
        quest: questId,
        rewards: reward,
        message: `Quest completed! Earned ${reward.agp ? reward.agp + ' AGP' : reward.item}!`
    };
}