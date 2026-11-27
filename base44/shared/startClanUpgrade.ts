import { UPGRADE_TREE } from './clanUpgradeCatalog.mjs';

export async function startClanUpgrade(svc: any, clanId: string, key: string) {
  const plan = UPGRADE_TREE.find(row => row.key === key);
  const fail = (message: string, status = 409) => Object.assign(new Error(message), { status });
  if (!plan) throw fail('Unknown guild upgrade', 400);
  const [hall] = await svc.ClanHall.filter({ clan_id: clanId }, 'created_date', 1);
  if (!hall) throw fail('Claim a guild hall first');
  const [existing] = await svc.ClanUpgrade.filter({ clan_id: clanId, upgrade_key: key }, 'created_date', 1);
  if (existing?.status === 'in_progress') throw fail('Upgrade already in progress');
  const tier = Number(existing?.tier || 0);
  if (!Number.isInteger(tier) || tier < 0 || tier >= 5) throw fail('Maximum tier reached');
  const receipt = key + '_' + tier;
  const field = 'upgrade_payments.' + receipt;
  const now = Date.now();
  let started = hall.upgrade_payments?.[receipt];
  if (!started) {
    // Single-record conditional write couples both debits to a unique tier receipt.
    const charge = await svc.ClanHall.updateMany({
      id: hall.id, [field]: { $exists: false }, favor: { $gte: plan.favor }, aetherium: { $gte: plan.aetherium }
    }, { $inc: { favor: -plan.favor, aetherium: -plan.aetherium }, $set: { [field]: now } });
    if (charge.updated !== 1) throw fail('Insufficient guild funds or upgrade already starting');
    started = now;
  } else {
    // Resume an interrupted start without a second charge; only one retry gets the lease.
    const lease = 'upgrade_payments.' + receipt + '_lease';
    if (started > now - 60000) throw fail('Upgrade is starting');
    const claimed = await svc.ClanHall.updateMany({ id: hall.id, [field]: started,
      $or: [{ [lease]: { $exists: false } }, { [lease]: { $lt: now - 60000 } }]
    }, { $set: { [lease]: now } });
    if (claimed.updated !== 1) throw fail('Upgrade is starting');
  }
  const patch = { clan_id: clanId, upgrade_key: key, upgrade_name: plan.name, category: plan.category,
    max_tier: 5, status: 'in_progress', progress_seconds: 0, build_seconds: plan.seconds,
    cost_favor: plan.favor, cost_aetherium: plan.aetherium, started_at: new Date(started).toISOString() };
  return existing ? await svc.ClanUpgrade.update(existing.id, patch) : await svc.ClanUpgrade.create({ ...patch, tier });
}
