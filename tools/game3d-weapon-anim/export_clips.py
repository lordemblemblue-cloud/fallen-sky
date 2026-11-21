"""Write the Weapon Animation Studio's clips back into the game.

    blender -b <studio>/WeaponStudio_male_v003.blend -P tools/game3d-weapon-anim/export_clips.py -- \
        --repo <fallen-sky root> [--only swordCombo1,swordCharge | --all] [--remove daggerLight2]

or, with the studio open in Blender (the Scripting tab, or the Blender MCP during a live session):

    import sys; sys.argv = ['blender', '--', '--repo', r'C:/path/to/fallen-sky', '--only', 'swordCombo1']
    exec(open(r'C:/path/to/fallen-sky/tools/game3d-weapon-anim/export_clips.py').read())

Without --only or --all it writes the clips you changed in this studio: every action with a game_state whose keys or
markers differ from when build_studio.py made the studio (its studio_fingerprint). Each becomes
public/models/animations/weapons/<body dir><state>.glb: the rig's bones only, that one animation, sampled at the
scene's frame rate. Its timing comes from the action's markers (hit, cancel, sweep_start / sweep_end, windUp,
chargeFrom / charge, nock, full), in seconds from the action's first frame, and goes into
public/models/animations/weapons/manifest.json. The game (weapons/weaponClipPack.mjs) plays an exported clip in place
of the baked clip of the same state, for every weapon of that family that swings its move set (the action's
`variant` property, 'standard' unless set: a long blade's katana moves are 'longBlade').
--remove takes states out of the pack again (their manifest entry and file): the game goes back to the baked clip.
"""
import hashlib
import json
import os
import sys

import bpy

RIGS = {'Male': ('fused-male-v1', ''), 'Female': ('fused-female-v1', 'female/')}
MARKER_KEYS = ('windUp', 'chargeFrom', 'charge', 'hit', 'cancel', 'nock', 'full')
PACK = os.path.join('public', 'models', 'animations', 'weapons')


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out, i = {}, 0
    while i < len(argv):
        key = argv[i].lstrip('-')
        if i + 1 < len(argv) and not argv[i + 1].startswith('--'):
            out[key] = argv[i + 1]
            i += 2
        else:
            out[key] = True
            i += 1
    if not isinstance(out.get('repo'), str):
        raise SystemExit('usage: ... export_clips.py -- --repo <fallen-sky root> [--only a,b | --all] [--remove c,d]')
    return out


def action_fcurves(action):
    """Every F-curve of an action (slotted actions: each slot's channel bag)."""
    try:
        from bpy_extras.anim_utils import action_get_channelbag_for_slot
    except ImportError:
        return list(action.fcurves)
    out = []
    for slot in action.slots:
        bag = action_get_channelbag_for_slot(action, slot)
        if bag:
            out.extend(bag.fcurves)
    return out


# keep in step with build_studio.py (tests/game3d-weapon-clip-pack.test.mjs compares them)
def fingerprint(action):
    """A hash of an action's keys, handles, interpolation and markers: changes whenever the clip is edited."""
    h = hashlib.sha1()
    for fc in sorted(action_fcurves(action), key=lambda f: (f.data_path, f.array_index)):
        h.update(f'{fc.data_path}[{fc.array_index}]'.encode())
        for kp in fc.keyframe_points:
            h.update(('%.4f,%.5f,%.4f,%.5f,%.4f,%.5f,%s;' % (kp.co[0], kp.co[1], kp.handle_left[0], kp.handle_left[1],
                                                           kp.handle_right[0], kp.handle_right[1], kp.interpolation)).encode())
    for marker in sorted(action.pose_markers, key=lambda m: (m.name, m.frame)):
        h.update(f'{marker.name}@{marker.frame};'.encode())
    return h.hexdigest()


def timing_of(action, fps):
    start = action.frame_range[0]
    seconds = lambda frame: round((frame - start) / fps, 4)
    out = {'duration': round((action.frame_range[1] - start) / fps, 4)}
    marks = {m.name: m.frame for m in action.pose_markers}
    for key in MARKER_KEYS:
        if key in marks:
            out[key] = seconds(marks[key])
    if 'sweep_start' in marks and 'sweep_end' in marks:
        out['sweep'] = [seconds(marks['sweep_start']), seconds(marks['sweep_end'])]
    if action.get('loop'):
        out['loop'] = True
    if action.get('variant', 'standard') != 'standard':
        out['variant'] = action['variant']
    return out


def main():
    args = parse_args()
    only = set(filter(None, args['only'].split(','))) if isinstance(args.get('only'), str) else set()
    remove = set(filter(None, args['remove'].split(','))) if isinstance(args.get('remove'), str) else set()
    scene = bpy.context.scene
    fps = scene.render.fps / scene.render.fps_base
    rig = next(o for o in scene.objects if o.type == 'ARMATURE' and o.name.endswith('_Rig'))
    rig_id, sub_dir = RIGS[rig.name.split('_')[0]]
    out_dir = os.path.join(args['repo'], PACK, sub_dir)
    manifest_path = os.path.join(args['repo'], PACK, 'manifest.json')
    manifest = {'version': 1, 'generatedBy': 'tools/game3d-weapon-anim/export_clips.py', 'bodies': {}}
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding='utf-8') as f:
            manifest = json.load(f)
    entry = manifest['bodies'].setdefault(rig_id, {'dir': sub_dir, 'clips': {}})
    entry['dir'] = sub_dir

    studio = [a for a in bpy.data.actions if a.get('game_state')]
    if only:
        chosen = [a for a in studio if a['game_state'] in only]
    elif args.get('all') is True:
        chosen = studio
    elif remove:
        chosen = []
    else:
        chosen = [a for a in studio if a.get('studio_fingerprint') != fingerprint(a)]
    if not chosen and not remove:
        print('[export] nothing changed in this studio since it was built; use --only <state> or --all')
        return

    os.makedirs(out_dir, exist_ok=True)
    ad = rig.animation_data or rig.animation_data_create()
    previous, previous_range = ad.action, (scene.frame_start, scene.frame_end)
    written = []
    for action in chosen:
        state = action['game_state']
        ad.action = action
        if getattr(ad, 'action_slot', None) is None and action.slots:
            ad.action_slot = action.slots[0]
        scene.frame_start, scene.frame_end = int(action.frame_range[0]), int(round(action.frame_range[1]))
        for o in scene.objects:
            o.select_set(o == rig)
        bpy.context.view_layer.objects.active = rig
        path = os.path.join(out_dir, f'{state}.glb')
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=True,
                                  export_animation_mode='ACTIVE_ACTIONS', export_force_sampling=True,
                                  export_frame_range=False, export_anim_slide_to_zero=True, export_skins=False,
                                  export_morph=False, export_materials='NONE', export_yup=True, export_def_bones=False,
                                  export_optimize_animation_size=False, export_extras=False)
        entry['clips'][state] = {'file': f'{sub_dir}{state}.glb', **timing_of(action, fps)}
        written.append(state)
    for state in remove:
        if entry['clips'].pop(state, None) is not None:
            path = os.path.join(out_dir, f'{state}.glb')
            if os.path.exists(path):
                os.remove(path)
    ad.action = previous
    if previous is not None and getattr(ad, 'action_slot', None) is None and previous.slots:
        ad.action_slot = previous.slots[0]
    scene.frame_start, scene.frame_end = previous_range
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    print('[export]', rig_id, 'wrote', written, 'removed', sorted(remove), '->', out_dir)


main()
