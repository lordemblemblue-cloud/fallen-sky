import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const { channel_id } = await req.json().catch(() => ({}));
    if (typeof channel_id !== 'string' || !channel_id) {
      return Response.json({ success: false, error: 'Channel ID is required' }, { status: 400 });
    }
    const channel = await base44.asServiceRole.entities.ClanFormChannel.get(channel_id);
    if (!channel) return Response.json({ success: false, error: 'Channel not found' }, { status: 404 });
    const current = Array.isArray(channel.active_member_ids) ? channel.active_member_ids : [];
    if (!current.includes(user.id)) {
      // Do not touch another clan's channel or expose its stored password
      // and member identifiers to someone who never joined it.
      return Response.json({ success: true, left: false });
    }
    await base44.asServiceRole.entities.ClanFormChannel.update(channel_id, {
      active_member_ids: current.filter((id: string) => id !== user.id),
    });
    return Response.json({ success: true, left: true });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || 'Could not leave channel' }, { status: 500 });
  }
});
