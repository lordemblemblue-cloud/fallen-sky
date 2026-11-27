import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Only appearance and identity fields may come from the browser. Progression
// (level, experience, equipped_items, unlocked_abilities, reputation…) and the
// record owner are server-owned and never taken from the request body.
const APPEARANCE_FIELDS = [
  'name', 'gender', 'model_url', 'skin_tone', 'eye_color', 'hair_color',
  'eyelash_style', 'style_preset', 'cultural_inspirations', 'genre_direction',
  'hood_enabled', 'weapon_visible', 'body_proportions', 'face_shape',
  'face_fit_source', 'skin_tint_enabled', 'hair_tint_enabled', 'eye_tint_enabled',
  'complexion', 'facial_hair', 'facial_hair_color', 'tattoo_style',
  'tattoo_placement', 'tattoo_color', 'tattoo_opacity', 'hair_style',
  'hair_length', 'hair_volume', 'female_model_variant', 'base_body_gender',
  'base_body_model_url', 'face_scan_generated', 'face_model_url',
  'tripo_model_id', 'appearance_version', 'height_scale', 'material_colors',
  'selected_assets', 'customization_assets', 'shape_controls', 'skin_finish',
  'skin_finish_enabled', 'skin_highlight_color', 'skin_highlight_enabled',
  'layer_colors', 'layer_opacity', 'morph_targets', 'voice', 'personality',
  'customization_version', 'current_mode',
  'active_memory_id',
];

function pickAppearance(input: any) {
  const source = input && typeof input === 'object' ? input : {};
  return Object.fromEntries(
    APPEARANCE_FIELDS.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { operation, avatarId, avatarData, targetUserId } = body;
    
    switch (operation) {
      case 'get':
        // Get own avatar
        const avatars = await base44.asServiceRole.entities.Avatar.filter({ user_id: user.id });
        return Response.json({ success: true, data: avatars[0] || null });
        
      case 'getByUserId':
        // Public read of another user's avatar (limited fields)
        if (typeof targetUserId !== 'string' || !targetUserId) {
          return Response.json({ error: 'Target user ID required' }, { status: 400 });
        }
        
        const targetAvatars = await base44.entities.Avatar.filter({ user_id: targetUserId }, 'created_date', 1);
        if (!targetAvatars || targetAvatars.length === 0) {
          return Response.json({ success: true, data: null });
        }
        
        // Return only public fields
        const publicAvatar = {
          id: targetAvatars[0].id,
          name: targetAvatars[0].name,
          level: targetAvatars[0].level,
          gender: targetAvatars[0].gender,
          model_url: targetAvatars[0].model_url,
          skin_tone: targetAvatars[0].skin_tone,
          hair_color: targetAvatars[0].hair_color
        };
        
        return Response.json({ success: true, data: publicAvatar });
        
      case 'create':
        // Ensure user doesn't already have an avatar
        const existing = await base44.asServiceRole.entities.Avatar.filter({ user_id: user.id });
        if (existing && existing.length > 0) {
          return Response.json({ error: 'Avatar already exists' }, { status: 400 });
        }
        
        const newAvatar = await base44.asServiceRole.entities.Avatar.create({
          ...pickAppearance(avatarData),
          user_id: user.id
        });
        
        return Response.json({ success: true, data: newAvatar });
        
      case 'update':
        if (!avatarId) {
          return Response.json({ error: 'Avatar ID required' }, { status: 400 });
        }
        
        // Verify ownership
        const avatar = await base44.asServiceRole.entities.Avatar.filter({ id: avatarId });
        if (!avatar || avatar.length === 0 || avatar[0].user_id !== user.id) {
          return Response.json({ error: 'Forbidden: Not your avatar' }, { status: 403 });
        }
        
        // Whitelisted appearance fields only, and ownership is re-asserted so a
        // client can never hand its avatar to another account or forge stats.
        const updated = await base44.asServiceRole.entities.Avatar.update(avatarId, {
          ...pickAppearance(avatarData),
          user_id: user.id
        });
        return Response.json({ success: true, data: updated });
        
      default:
        return Response.json({ error: 'Invalid operation' }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Avatar Access Error:', error.message);
    return Response.json({ 
      error: 'Operation failed. Please try again.' 
    }, { status: 500 });
  }
});