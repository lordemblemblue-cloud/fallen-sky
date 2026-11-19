import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { DONOR_UPGRADES, SERVER_ROLLED_UPGRADES, consumedItemIds, findItem, heroLevelOf, pickCostUnits, readUpgrade, rollUpgrade, saveAsServerKnows, spentCounts, upgradeBase, upgradeCost } from '../../shared/itemUpgradeLedger.ts';

// The server rolls Game 3D's risky item upgrades (docs/game3d/SERVER_UPGRADES.md):
// reinforcement (the Enchant %), over-enchant, refine, ultimate, Combine and Ascension
// (service 'stage'; docs/game3d/BLACKSMITH_V2_20261118.md). It rolls with the game's own rules
// (base44/shared/axeItemEnhancement.ts, axeItemAdvancement.ts) on the record it holds for
// the item, keeps the result (Game3DItemUpgrade), and the Character Vault puts that result
// back into any save that says otherwise. Each attempt is paid on the server: the cost is
// taken, unit by unit, from the server's copy of the save, and those units stay spent.
// Combine and Ascension take a donor from the server's copy of the save; a donor used up by
// a success is recorded on the target's row (consumed) and is gone for the server from then
// on: never a target or a donor again, and removed from every save the Vault keeps.
// A gear-tier tier-up (service 'tier_up'; docs/game3d/GEAR_TIERS_20261119.md) moves the item to
// its next step, checked against the hero's level in the server's copy of the save.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

export const UPGRADE_RULES = Object.freeze({
  characterIdPattern: /^[A-Za-z0-9_-]{1,128}$/,
  itemIdPattern: /^[\x21-\x7e]{1,200}$/,
  localOnlyCharacters: Object.freeze(['__default__', '__anon__']),
  minIntervalMs: 250, // per item and kind; the game's own button is slower
});

// a uniform roll in [0, 1) that the browser can't choose or predict
const serverRoll = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action || '');
    const data = payload?.data || {};
    const svc = base44.asServiceRole.entities;
    // an admin may look at another account's character (support); everyone else only their own
    const ownerId = String(user.role === 'admin' && data.ownerId ? data.ownerId : user.id);
    const characterId = String(data.characterId || '');
    if (!UPGRADE_RULES.characterIdPattern.test(characterId) || UPGRADE_RULES.localOnlyCharacters.includes(characterId)) {
      return json({ error: 'That character is kept on this device only', code: 'local_only' }, 400);
    }

    if (action === 'list') {
      const rows = await svc.Game3DItemUpgrade.filter({ owner_id: ownerId, character_id: characterId }, '-created_date', 1000);
      return json({ success: true, upgrades: (rows || []).map((r: any) => ({ item_id: r.item_id, service: r.service, record: r.record, attempts: r.attempts || 0, last_outcome: r.last_outcome || null, rolled_at: r.rolled_at || null, consumed: r.consumed || [] })) });
    }

    if (action === 'roll') {
      const serviceId = String(data.serviceId || '');
      const itemId = String(data.itemId || '');
      const donorId = data.donorId ? String(data.donorId) : '';
      const transactionId = data.transactionId ? String(data.transactionId).slice(0, 200) : '';
      if (!SERVER_ROLLED_UPGRADES.includes(serviceId)) return json({ error: 'That upgrade is not rolled by the server', code: 'invalid' }, 400);
      if (!UPGRADE_RULES.itemIdPattern.test(itemId)) return json({ error: 'Unknown item', code: 'invalid' }, 400);
      const takesDonor = DONOR_UPGRADES.includes(serviceId);
      if (donorId && (!takesDonor || !UPGRADE_RULES.itemIdPattern.test(donorId))) return json({ error: 'Unknown donor', code: 'invalid' }, 400);

      const [saves, rows] = await Promise.all([
        svc.Game3DCharacterSave.filter({ owner_id: ownerId, character_id: characterId }, '-created_date', 1),
        svc.Game3DItemUpgrade.filter({ owner_id: ownerId, character_id: characterId }, '-created_date', 1000),
      ]);
      const save = (saves || [])[0];
      const rowOf = (id: string, service: string) => (rows || []).find((r: any) => r.item_id === id && r.service === service) || null;
      const row = rowOf(itemId, serviceId);
      // the same attempt again (a lost answer, a double click): the same result, never a second roll
      if (row && transactionId && row.last_transaction_id === transactionId && row.last_result) {
        return json({ success: true, result: row.last_result, repeated: true });
      }
      // a refine can destroy an item and a Combine or Ascension can use one up; the server's
      // copy of the save may not know it yet
      const consumed = consumedItemIds(rows || []);
      if (rowOf(itemId, 'refine')?.record?.destroyed) return json({ error: 'This item was destroyed', code: 'item_destroyed' }, 409);
      if (consumed.has(itemId)) return json({ error: 'This item was used up in an upgrade', code: 'item_consumed' }, 409);
      if (donorId && (donorId === itemId || consumed.has(donorId) || rowOf(donorId, 'refine')?.record?.destroyed)) {
        return json({ error: 'That donor is no longer available', code: 'donor_unavailable' }, 409);
      }
      // the server rolls on what it knows: the character's save must be on the server, item (and donor) included
      const known = save ? saveAsServerKnows(save.data, rows || []) : null;
      const item = known ? findItem(known, itemId) : null;
      const donor = known && donorId ? findItem(known, donorId) : null;
      if (!item || (donorId && !donor)) return json({ error: 'Saving your character first; try again in a moment', code: 'not_synced' }, 409);
      const now = Date.now();
      if (row?.rolled_at && now - Date.parse(row.rolled_at) < UPGRADE_RULES.minIntervalMs) {
        return json({ error: 'Too fast', code: 'too_fast' }, 429);
      }

      const before = row ? { ...upgradeBase(serviceId), ...(row.record || {}) } : { ...upgradeBase(serviceId), ...(readUpgrade(save.data, serviceId, itemId) || {}) };
      const protectedAttempt = data.protectedAttempt === true;
      const roll = serverRoll();
      const rolled = rollUpgrade(serviceId, before, { roll, protectedAttempt, item, donor, heroLevel: heroLevelOf(save.data) });
      // at the cap, an item that can't take this upgrade or a donor that doesn't match: nothing was rolled
      if (rolled.reason) return json({ success: true, result: { ok: false, reason: rolled.reason, serviceId, itemId, ...(takesDonor ? { donorId: donorId || null } : {}) } });
      // paid from the server's copy of the save; without the materials, nothing is rolled. What
      // an attempt costs can depend on its result (Ascension's catalyst), so the most it can
      // cost must be there first, whatever the roll was.
      const spent = spentCounts(rows || []);
      const most = upgradeCost(serviceId, before, { protectedAttempt, item });
      const affordable = pickCostUnits(save.data, most, spent);
      if (!affordable.ok) return json({ success: true, result: { ok: false, reason: 'insufficient_materials', cost: most, missing: affordable.missing, serviceId, itemId } });
      const cost = upgradeCost(serviceId, before, { protectedAttempt, item, success: rolled.ok });
      const paid = pickCostUnits(save.data, cost, spent);
      if (!paid.ok) return json({ success: true, result: { ok: false, reason: 'insufficient_materials', cost, missing: paid.missing, serviceId, itemId } });

      const usedUp = takesDonor && rolled.donorConsumed && donorId ? [donorId] : [];
      const result = {
        ok: rolled.ok, outcome: rolled.outcome, chance: rolled.chance, destroyed: rolled.destroyed, roll, before: rolled.before, after: rolled.after,
        cost, spent: paid.dropIds, serviceId, itemId,
        ...(takesDonor ? { donorId: donorId || null, donorConsumed: usedUp.length > 0 } : {}),
      };
      const iso = new Date(now).toISOString();
      const patch = {
        record: rolled.after, attempts: Number(row?.attempts || 0) + 1, last_outcome: String(rolled.outcome || ''), last_roll: roll,
        last_transaction_id: transactionId, last_result: result, rolled_at: iso,
        spent: [...(row?.spent || []), ...paid.dropIds],
        ...(takesDonor ? { consumed: [...(row?.consumed || []), ...usedUp] } : {}),
      };
      if (row) await svc.Game3DItemUpgrade.update(row.id, patch);
      else await svc.Game3DItemUpgrade.create({ owner_id: ownerId, character_id: characterId, item_id: itemId, service: serviceId, ...patch });
      return json({ success: true, result });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('[itemUpgrade]', error);
    return json({ error: (error as Error)?.message || 'Upgrade failed' }, 500);
  }
});
