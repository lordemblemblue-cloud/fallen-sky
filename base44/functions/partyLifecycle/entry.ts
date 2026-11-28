import { readBoundedGuestBody } from '../../shared/readBoundedGuestBody.mjs';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Only a signed automation may remove an empty Party.
// The producer signs "timestamp.body" with HMAC-SHA256. Without the configured
// secret, this cleanup is disabled; direct unauthenticated requests cannot
// trigger privileged entity deletions.
const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});
const hex = (bytes: Uint8Array) => [...bytes].map(v => v.toString(16).padStart(2, '0')).join('');
function sameSignature(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
Deno.serve(async (req) => {
    if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    const secret = Deno.env.get('PARTY_LIFECYCLE_EVENT_SECRET') || '';
    if (secret.length < 32) return reply({ error: 'Party cleanup unavailable' }, 503);
    const stamp = req.headers.get('x-party-event-time') || '';
    const signature = req.headers.get('x-party-event-signature') || '';
    if (!/^[0-9]{13}$/.test(stamp) || !/^[0-9a-f]{64}$/.test(signature) ||
        Math.abs(Date.now() - Number(stamp)) > 120_000) {
      return reply({ error: 'Unauthorized' }, 401);
    }
    let raw: string | null;
    try {
      raw = await readBoundedGuestBody(req, 16_000);
    } catch {
      return reply({ error: 'Invalid request' }, 400);
    }
    if (raw === null) return reply({ error: 'Request too large' }, 413);
    // A slow request must not extend the signature's validity window.
    if (Math.abs(Date.now() - Number(stamp)) > 120_000) return reply({ error: 'Unauthorized' }, 401);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = hex(new Uint8Array(await crypto.subtle.sign('HMAC', key,
      new TextEncoder().encode(stamp + '.' + raw))));
    if (!sameSignature(signature, expected)) return reply({ error: 'Unauthorized' }, 401);
    try {
        const base44 = createClientFromRequest(req);
        const payload = JSON.parse(raw || '{}');
        const event = payload?.event || {};
        const partyId = String(payload?.data?.id || payload?.event?.entity_id || '').trim();

        if (event.entity_name !== 'Party' || event.type !== 'update' || !partyId) {
            return Response.json({ message: 'Ignored event' });
        }

        // Authoritative read: the stored row decides, never the payload.
        const stored = await base44.asServiceRole.entities.Party.get(partyId).catch(() => null);
        if (!stored) {
            return reply({ message: 'No action taken' });
        }

        const members = Array.isArray(stored.members) ? stored.members : [];
        if (members.length === 0) {
            console.log(`Party ${partyId} is empty. Deleting...`);
            await base44.asServiceRole.entities.Party.delete(partyId);
            return reply({ message: 'Empty party cleaned' });
        }

        return Response.json({ message: 'No action taken' });
    } catch (error) {
        console.error('Error in partyLifecycle:', error);
        return reply({ error: 'Party cleanup unavailable' }, 500);
    }
});