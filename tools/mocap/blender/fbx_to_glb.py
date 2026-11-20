"""Convert a capture FBX (Rokoko Studio, Mixamo, Move.ai, Brekel ...) to a GLB that keeps the skeleton and its
animation, for tools/mocap/import-clip.mjs to retarget onto the fused bodies.

    blender --background --factory-startup --python tools/mocap/blender/fbx_to_glb.py -- input.fbx output.glb

Meshes, materials and images are dropped (only the armature and its actions are exported). Every action becomes a
glTF animation named after it.
"""
import sys
import bpy

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) != 2:
    sys.exit('usage: blender -b -P fbx_to_glb.py -- input.fbx output.glb')
src, dst = argv

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=False, ignore_leaf_bones=False)
arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
if not arms:
    sys.exit('no armature in ' + src)
for o in list(bpy.context.scene.objects):
    if o.type not in ('ARMATURE', 'EMPTY'):
        bpy.data.objects.remove(o, do_unlink=True)
actions = list(bpy.data.actions)
print('[fbx_to_glb] armatures:', [a.name for a in arms], 'actions:', [(a.name, tuple(a.frame_range)) for a in actions])
scene = bpy.context.scene
if actions:
    lo = min(a.frame_range[0] for a in actions); hi = max(a.frame_range[1] for a in actions)
    scene.frame_start, scene.frame_end = int(lo), int(hi)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
                          export_force_sampling=True, export_frame_range=False, export_skins=True, export_morph=False,
                          export_materials='NONE', export_yup=True, export_def_bones=False, export_optimize_animation_size=False)
print('[fbx_to_glb] wrote', dst, 'fps', scene.render.fps)
