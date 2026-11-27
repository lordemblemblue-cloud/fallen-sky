import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });

const fail = (message: string, status: number) => {
    throw Object.assign(new Error(message), { status });
};

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
        const event = getCurrentWorldEvent();

        switch (action) {
            case 'getCurrentEvent': {
                return json(event);
            }

            case 'joinEvent': {
                const participation = await joinWorldEvent(base44, user.id, eventId || event.id);
                return json(participation);
            }

            case 'getEventProgress': {
                const progress = await getEventProgress(base44, user.id, eventId || event.id, event);
                return json(progress);
            }

            case 'completeEventQuest': {
                const completion = await completeEventQuest(base44, user, event, questId);
                return json(completion);
            }

            default:
                return new Response('Invalid action', { status: 400 });
        }
    } catch (error) {
        return json({ error: error?.message || 'World event request failed' }, error?.status || 500);
    }
});

function getCurrentWorldEvent() {
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

// Participation is a real server-side row so eligibility can be checked later.
async function joinWorldEvent(base44: any, userId: string, eventId: string) {
    const rows = base44.asServiceRole.entities.WorldEventParticipation;
    const existing = await rows.filter({ user_id: userId, event_id: eventId }, '-created_date', 1);
    let participation = existing?.[0];

    if (!participation) {
        participation = await rows.create({
            user_id: userId,
            event_id: eventId,
            joined_at: new Date().toISOString(),
            contribution: 0,
            quest_progress: {}
        });
    }

    return {
        success: true,
        participation: projectParticipation(participation),
        message: 'Successfully joined the world event!'
    };
}

async function getEventProgress(base44: any, userId: string, eventId: string, event: any) {
    const rows = base44.asServiceRole.entities.WorldEventParticipation;
    const [participation] = await rows.filter({ user_id: userId, event_id: eventId }, '-created_date', 1);
    const recorded = participation?.quest_progress && typeof participation.quest_progress === 'object'
        ? participation.quest_progress
        : {};

    const quests = (event.quests || []).map((quest: any) => {
        const entry = recorded[quest.id] || {};
        const progress = Number(entry.progress) || 0;
        return {
            id: quest.id,
            progress,
            target: quest.target,
            complete: Boolean(entry.verified_at) && progress >= Number(quest.target || 0),
            claimed: Boolean(entry.claimed_at)
        };
    });

    return {
        userId,
        eventId,
        joined: Boolean(participation),
        contribution: Number(participation?.contribution) || 0,
        quests,
        questsCompleted: quests.filter((quest: any) => quest.complete).length
    };
}

function projectParticipation(participation: any) {
    const recorded = participation?.quest_progress && typeof participation.quest_progress === 'object'
        ? participation.quest_progress
        : {};
    return {
        userId: participation.user_id,
        eventId: participation.event_id,
        joinedAt: participation.joined_at,
        contribution: Number(participation.contribution) || 0,
        questsCompleted: Object.values(recorded).filter((entry: any) => entry?.claimed_at).length
    };
}

async function completeEventQuest(base44: any, user: any, event: any, questId: string) {
    const quest = (event.quests || []).find((entry: any) => entry.id === String(questId || ''));
    if (!quest) {
        fail('Quest not found', 404);
    }

    const questRewards: Record<string, { agp?: number; experience?: number; item?: string }> = {
        'damage_leviathan': { agp: 500, experience: 1000 },
        'find_cache': { item: 'Legendary Treasure Chest', agp: 300 }
    };
    const reward = questRewards[quest.id];
    if (!reward) {
        fail('Quest not found', 404);
    }

    const svc = base44.asServiceRole.entities;
    const [participation] = await svc.WorldEventParticipation.filter(
        { user_id: user.id, event_id: event.id },
        '-created_date',
        1
    );
    if (!participation) {
        fail('Join the world event before claiming its rewards', 403);
    }

    // Progress is only ever written by server-side gameplay, never by this
    // endpoint, so a client cannot claim a quest it has not actually completed.
    const recorded = participation.quest_progress?.[quest.id];
    const progress = Number(recorded?.progress) || 0;
    if (!recorded?.verified_at || progress < Number(quest.target || 0)) {
        fail('No verified progress for this quest yet', 409);
    }
    if (recorded?.claimed_at) {
        fail('This quest reward has already been claimed', 409);
    }

    // A world-event quest pays out at most once per account. The claim is a
    // server-side RewardGrant row keyed by the quest, written before any
    // currency moves, so replaying the request cannot mint AGP again.
    const grantKey = `world_event_quest:${quest.id}`;
    const claimed = await svc.RewardGrant.filter({ user_id: user.id, grant_key: grantKey }, '-created_date', 5);
    if (claimed.length) {
        fail('This quest reward has already been claimed', 409);
    }

    const grant = await svc.RewardGrant.create({
        user_id: user.id,
        grant_key: grantKey,
        status: 'pending',
        payload: { source: 'world_event_quest', quest_id: String(quest.id), ...reward }
    });

    // Two racing requests can both create a claim; only the oldest may pay.
    const settled = await svc.RewardGrant.filter({ user_id: user.id, grant_key: grantKey }, 'created_date', 5);
    if (settled.length !== 1 || settled[0].id !== grant.id) {
        await svc.RewardGrant.delete(grant.id).catch(() => {});
        fail('This quest reward has already been claimed', 409);
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

    await svc.WorldEventParticipation.update(participation.id, {
        quest_progress: {
            ...(participation.quest_progress || {}),
            [quest.id]: { ...recorded, claimed_at: new Date().toISOString() }
        }
    }).catch(() => {});

    return {
        success: true,
        quest: quest.id,
        rewards: reward,
        message: `Quest completed! Earned ${reward.agp ? reward.agp + ' AGP' : reward.item}!`
    };
}