import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Entity automation handler for Party update events: an empty party is removed.
// Every server function is publicly reachable, so the request body is never
// trusted as an event: it may only name the row. The party is re-read from the
// database and deleted only when the stored record is actually empty, so a
// caller cannot point at a populated party and have it disbanded.
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json().catch(() => ({}));
        const event = payload?.event || {};
        const partyId = String(payload?.data?.id || payload?.event?.entity_id || '').trim();

        if (event.entity_name !== 'Party' || event.type !== 'update' || !partyId) {
            return Response.json({ message: 'Ignored event' });
        }

        // Authoritative read: the stored row decides, never the payload.
        const stored = await base44.asServiceRole.entities.Party.get(partyId).catch(() => null);
        if (!stored) {
            return Response.json({ message: `Party ${partyId} not found` });
        }

        const members = Array.isArray(stored.members) ? stored.members : [];
        if (members.length === 0) {
            console.log(`Party ${partyId} is empty. Deleting...`);
            await base44.asServiceRole.entities.Party.delete(partyId);
            return Response.json({ message: `Party ${partyId} deleted (empty)` });
        }

        return Response.json({ message: 'No action taken' });
    } catch (error) {
        console.error('Error in partyLifecycle:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});