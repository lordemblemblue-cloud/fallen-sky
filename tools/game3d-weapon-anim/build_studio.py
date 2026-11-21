"""Build the Weapon Animation Studio: one .blend per fused body, for editing the game's weapon clips in Blender.

    blender -b --factory-startup -P tools/game3d-weapon-anim/build_studio.py -- \
        --repo <fallen-sky root> --studio <studio folder> --body male [--refs <reference clips .glb> ...]

Needs <studio>/game-clips-<body>.glb and .json from tools/game3d-weapon-anim/export-game-clips.mjs. The .blend holds:
  - the fused body at the game's scale (Body collection), its armature named "<Body>_Rig";
  - the sword, the bow and the two daggers in the hands exactly where the game holds them (Weapon_* collections,
    each parented to its hand bone): hide the ones you don't need;
  - one Action per game state (swordCombo1, bowDraw, daggerCharge ...), each with markers for its timing: hit, cancel,
    sweep_start / sweep_end, windUp, chargeFrom / charge (the charge's slow coil), nock / full (the bow's draw). Move a
    marker to retime the game; the export writes them back;
  - reference clips (actions named ref_*: the owner's animations retargeted onto this body by
    export-reference-clips.mjs) when --refs is given.
A state the game already plays from the pack (public/models/animations/weapons, an earlier export) starts from that
clip, so a rebuilt studio shows what the game plays. Each studio action keeps a fingerprint of its keys and markers
(studio_fingerprint): export_clips.py writes only the actions changed since the studio was built.
Saved as <studio>/WeaponStudio_<body>_v001.blend (the next free version if it exists); tools/game3d-weapon-anim/README.md
explains the live workflow and the export (export_clips.py).
"""
import hashlib
import json
import math
import os
import sys

import bpy
from mathutils import Matrix

FPS = 60
MARKERS = ('windUp', 'chargeFrom', 'charge', 'hit', 'cancel', 'nock', 'full')
# glTF is Y-up, Blender Z-up: the importer turns (x, y, z) into (x, -z, y)
Y_UP_TO_Z_UP = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {'refs': []}
    i = 0
    while i < len(argv):
        key = argv[i].lstrip('-')
        if key == 'refs':
            i += 1
            while i < len(argv) and not argv[i].startswith('--'):
                out['refs'].append(argv[i]); i += 1
            continue
        out[key] = argv[i + 1]; i += 2
    for need in ('repo', 'studio', 'body'):
        if need not in out:
            sys.exit('usage: blender -b -P build_studio.py -- --repo <root> --studio <folder> --body male|female [--refs a.glb ...]')
    return out


def import_gltf(path):
    """Import a glTF file; returns (new objects, new actions)."""
    objects, actions = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path, bone_heuristic='BLENDER', guess_original_bind_pose=False)
    return [o for o in bpy.data.objects if o not in objects], [a for a in bpy.data.actions if a not in actions]


def collection(name, parent=None):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in (parent or bpy.context.scene.collection).children:
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def move_to(objs, col):
    for o in objs:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        col.objects.link(o)


def clean_name(name):
    """An imported action's glTF animation name (the importer appends the object it was made for)."""
    name = name.split('|')[0]
    for suffix in ('_Armature', '_Node_0', '_node_0'):
        name = name.replace(suffix, '')
    return name


def assign_action(obj, action):
    ad = obj.animation_data or obj.animation_data_create()
    ad.action = action
    if getattr(ad, 'action_slot', None) is None and getattr(action, 'slots', None):
        ad.action_slot = action.slots[0]


def matrix_from_three(values):
    """A three.js column-major 4x4 (Y-up) as a Blender world matrix (Z-up)."""
    m = Matrix([[values[c * 4 + r] for c in range(4)] for r in range(4)])
    return Y_UP_TO_Z_UP @ m @ Y_UP_TO_Z_UP.inverted()


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


# keep in step with export_clips.py (tests/game3d-weapon-clip-pack.test.mjs compares them)
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


def next_version(folder, stem):
    v = 1
    while os.path.exists(os.path.join(folder, f'{stem}_v{v:03d}.blend')):
        v += 1
    return os.path.join(folder, f'{stem}_v{v:03d}.blend')


def main():
    args = parse_args()
    repo, studio, body = args['repo'], args['studio'], args['body']
    with open(os.path.join(studio, f'game-clips-{body}.json'), encoding='utf-8') as f:
        info = json.load(f)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 1

    # the body with the game's clips as its actions (one import: the clips are the body file's animations), at the
    # game's scale, feet on the floor; the body file's helper sphere stays out
    body_col = collection('Body')
    objs, actions = import_gltf(os.path.join(studio, f'game-clips-{body}.glb'))
    for o in list(objs):
        if o.type == 'MESH' and o.name.startswith('Icosphere'):
            objs.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
    move_to(objs, body_col)
    rig = next(o for o in objs if o.type == 'ARMATURE')
    rig.name = f'{body.capitalize()}_Rig'
    scale = bpy.data.objects.new('GameScale', None)
    scale.empty_display_type = 'ARROWS'
    scale.scale = (info['scale'],) * 3
    body_col.objects.link(scale)
    for o in objs:
        if o.parent is None:
            o.parent = scale
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    lowest = math.inf
    for o in objs:
        if o.type == 'MESH':
            evaluated = o.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            lowest = min([lowest] + [(evaluated.matrix_world @ v.co).z for v in mesh.vertices])
            evaluated.to_mesh_clear()
    if math.isfinite(lowest):
        scale.location.z = -lowest
    bpy.context.view_layer.update()

    # the game's clips, with their timing as markers
    for act in actions:
        state = clean_name(act.name)
        act.name = state
        act.use_fake_user = True
        timing = info['clips'].get(state, {})
        act['game_state'] = state
        act['loop'] = bool(timing.get('loop') or timing.get('idle'))
        for key in MARKERS:
            if isinstance(timing.get(key), (int, float)):
                act.pose_markers.new(key).frame = round(timing[key] * FPS)
        sweep = timing.get('sweep')
        if isinstance(sweep, list) and len(sweep) == 2:
            act.pose_markers.new('sweep_start').frame = round(sweep[0] * FPS)
            act.pose_markers.new('sweep_end').frame = round(sweep[1] * FPS)
        act['from_pack'] = bool(timing.get('authored'))  # the game plays this state from the pack already
        if timing.get('variant', 'standard') != 'standard':
            act['variant'] = timing['variant']
        act['studio_fingerprint'] = fingerprint(act)
    first = bpy.data.actions.get('swordCombo1') or (actions[0] if actions else None)
    if first:
        assign_action(rig, first)
        scene.frame_start, scene.frame_end = int(first.frame_range[0]), int(math.ceil(first.frame_range[1]))

    # the weapons, in the hands where the game holds them (placed with the rig at rest, then parented to the hand)
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    weapons_col = collection('Weapons')
    for entry in info['weapons']:
        family_col = collection(f"Weapon_{entry['family'].capitalize()}", weapons_col)
        objs, _ = import_gltf(os.path.join(repo, entry['file']))
        keep = objs
        if entry.get('node'):
            node = next((o for o in objs if o.name.startswith(entry['node'])), None)
            keep = [o for o in objs if node and (o == node or o.parent == node)]
            for o in objs:
                if o not in keep:
                    bpy.data.objects.remove(o, do_unlink=True)
            if node:
                node.parent = None
                node.matrix_basis = Matrix.Identity(4)  # the runtime puts each dagger at its root's origin
        grip = bpy.data.objects.new(f"Grip_{entry['family']}_{entry['hand'].split(':')[-1]}", None)
        grip.empty_display_type = 'ARROWS'
        grip.empty_display_size = 0.05
        family_col.objects.link(grip)
        move_to(keep, family_col)
        for o in keep:
            if o.parent is None:
                o.parent = grip
                o.matrix_parent_inverse = Matrix.Identity(4)
        grip.parent = rig
        grip.parent_type = 'BONE'
        grip.parent_bone = entry['hand']
        bpy.context.view_layer.update()
        grip.matrix_world = matrix_from_three(entry['matrixWorld'])
    rig.data.pose_position = 'POSE'

    # reference clips (the owner's animations on this body): actions named ref_<source>_<clip>, each with the game
    # clips' slot, so picking one in the Action Editor plays it on the rig
    rig_slot = first.slots[0].identifier if first and first.slots else None
    for ref in args['refs']:
        ref_objs, ref_actions = import_gltf(ref)
        for o in ref_objs:
            bpy.data.objects.remove(o, do_unlink=True)
        tag = os.path.splitext(os.path.basename(ref))[0]
        for act in ref_actions:
            name = clean_name(act.name)
            act.name = name if name.startswith('ref_') else f'ref_{tag}_{name}'
            act.use_fake_user = True
            act['reference'] = True
            if rig_slot and act.slots and act.slots[0].identifier != rig_slot:
                try:
                    act.slots[0].identifier = rig_slot
                except (AttributeError, TypeError, ValueError) as error:
                    print('[studio] slot of', act.name, 'kept:', error)

    # a camera and light for screenshots: three-quarter front of the body
    cam = bpy.data.objects.new('StudioCamera', bpy.data.cameras.new('StudioCamera'))
    scene.collection.objects.link(cam)
    cam.location = (2.6, -3.2, 1.45)
    cam.rotation_euler = (math.radians(82), 0, math.radians(39))
    cam.data.lens = 42
    scene.camera = cam
    sun = bpy.data.objects.new('StudioSun', bpy.data.lights.new('StudioSun', 'SUN'))
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    sun.data.energy = 3.5
    scene.collection.objects.link(sun)
    scene.world = scene.world or bpy.data.worlds.new('World')
    scene.render.resolution_x, scene.render.resolution_y = 1280, 960

    os.makedirs(studio, exist_ok=True)
    out = next_version(studio, f'WeaponStudio_{body}')
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print('[studio] saved', out, 'actions', len([a for a in bpy.data.actions if a.use_fake_user]))


main()
