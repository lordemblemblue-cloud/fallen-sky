"""Render poses of the Weapon Animation Studio to PNG (quick checks and contact sheets, no live Blender needed).

    blender -b <studio .blend> -P tools/game3d-weapon-anim/render_poses.py -- --out <folder> \
        swordCombo1@hit bowHold@0 daggerCharge@charge idleDaggers@30 ...

Each pose is <action>@<frame | marker name>; only the weapon family the action belongs to is shown. Workbench
renders, 640x480, from the studio camera (or --view front|side|back).
"""
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out_dir, view, poses = None, 'three_quarter', []
i = 0
while i < len(argv):
    if argv[i] == '--out':
        out_dir = argv[i + 1]; i += 2
    elif argv[i] == '--view':
        view = argv[i + 1]; i += 2
    else:
        poses.append(argv[i]); i += 1
os.makedirs(out_dir, exist_ok=True)

scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE' and o.name.endswith('_Rig'))
FAMILIES = {'sword': 'Weapon_Sword', 'bow': 'Weapon_Bow', 'dagger': 'Weapon_Daggers', 'idleSword': 'Weapon_Sword',
            'idleBow': 'Weapon_Bow', 'idleDaggers': 'Weapon_Daggers'}


# a reference clip shows the weapon its name suggests (ref_longbow_draw_arrow: the bow)
REF_FAMILIES = (('archery', 'Weapon_Bow'), ('longbow', 'Weapon_Bow'), ('arrow', 'Weapon_Bow'), ('sword', 'Weapon_Sword'),
                ('slash', 'Weapon_Sword'), ('dagger', 'Weapon_Daggers'))


def family_of(state):
    for key, col in FAMILIES.items():
        if state.startswith(key):
            return col
    if state.startswith('ref_'):
        for word, col in REF_FAMILIES:
            if word in state.lower():
                return col
    return None


def set_view(name):
    cam = scene.camera
    spots = {'three_quarter': ((2.6, -3.2, 1.45), (82, 0, 39)), 'front': ((0, -4.2, 1.2), (86, 0, 0)),
             'side': ((4.2, 0, 1.2), (86, 0, 90)), 'back': ((0, 4.2, 1.3), (86, 0, 180)),
             'left': ((-4.2, 0, 1.2), (86, 0, -90))}
    loc, rot = spots.get(name, spots['three_quarter'])
    cam.location = loc
    cam.rotation_euler = tuple(math.radians(a) for a in rot)


scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x, scene.render.resolution_y = 640, 480
scene.render.image_settings.file_format = 'PNG'
set_view(view)
for pose in poses:
    state, _, where = pose.partition('@')
    act = bpy.data.actions.get(state)
    if not act:
        print('[render] no action', state)
        continue
    ad = rig.animation_data or rig.animation_data_create()
    ad.action = act
    if getattr(ad, 'action_slot', None) is None and act.slots:
        ad.action_slot = act.slots[0]
    marker = act.pose_markers.get(where) if where else None
    frame = marker.frame if marker else int(float(where or 0))
    scene.frame_set(frame)
    show = family_of(state)
    for col in bpy.data.collections:
        if col.name.startswith('Weapon_'):
            col.hide_render = col.name != show
    path = os.path.join(out_dir, f'{state}_{where or 0}_{view}.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('[render]', path)
