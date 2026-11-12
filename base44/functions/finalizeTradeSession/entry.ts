import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Legacy finalization used independent card mutations. A network interruption,
// stale session or concurrent finalizer could transfer only one side or transfer
// the same card twice. No ownership changes occur until the replacement
// authenticated, idempotent, ACID escrow service is connected.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const app = createClientFromRequest(req);
    const user = await app.auth.me().catch(() => null);
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json({
      error: 'Card transfers are paused until atomic ownership settlement is available.',
      code: 'ATOMIC_CARD_ESCROW_REQUIRED', previewOnly: true,
    }, { status: 503 });
  } catch {
    return Response.json({ error: 'Card settlement unavailable' }, { status: 503 });
  }
});
