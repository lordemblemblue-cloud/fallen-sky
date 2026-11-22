"""Render one picture per valley-kit piece for the contact sheets (Blender 5.2, headless).

  blender -b --factory-startup -P tools/threeroads/kits/valley/render_sheets.py -- GLB OUTDIR near|far

near: LOD0, front three-quarter view, a 1.8 m figure beside it (pieces that sit
      on or hang from another piece are shown on it).
far:  LOD0 (left) and LOD1 (right) seen from 60 m, rendered at the size one
      screen pixel covers at that distance (about 5.8 cm), so the composed
      sheet shows what the game can resolve there.
Then: node tools/threeroads/kits/valley/compose_sheet.mjs OUTDIR near|far OUT.png
"""
import math
import os
import re
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT, MODE = argv[0], argv[1], argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
TABLE = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..', 'src', 'components', 'game3d', 'threeroads', 'kits',
                                      'valleyKitPieces.mjs'))
IDS = [m.group(1) for m in re.finditer(r"piece\('(\w+)'", open(TABLE, encoding='utf-8').read())]
os.makedirs(OUT, exist_ok=True)

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=GLB)
OBJ = {ob.name: ob for ob in bpy.data.objects if ob.type == 'MESH'}
for ob in OBJ.values():
    ob.parent = None
    ob.location = (0, 0, 0)
    ob.rotation_mode = 'XYZ'
    ob.rotation_euler = (0, 0, 0)

scene = bpy.context.scene
try:
    scene.render.engine = 'BLENDER_EEVEE'
except TypeError:
    scene.render.engine = 'CYCLES'
if scene.render.engine == 'CYCLES':
    scene.cycles.samples = 24
scene.view_settings.view_transform = 'Standard'
scene.render.film_transparent = False
world = bpy.data.worlds.new('w')
scene.world = world
world.color = (0.55, 0.6, 0.66)
try:
    world.use_nodes = True
except Exception:
    pass
bg = world.node_tree.nodes.get('Background')
if bg:
    bg.inputs['Color'].default_value = (0.62, 0.66, 0.72, 1)
    bg.inputs['Strength'].default_value = 0.9

sun_data = bpy.data.lights.new('sun', 'SUN')
sun_data.energy = 3.2
sun_data.angle = math.radians(8)
sun = bpy.data.objects.new('sun', sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(-35))


def flat_mat(name, rgb):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = 0.95
    return m


bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
ground = bpy.context.active_object
ground.data.materials.append(flat_mat('ground', (0.33, 0.33, 0.25)))
bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.2, depth=1.45, location=(0, 0, 0.725))
body = bpy.context.active_object
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.13, location=(0, 0, 1.62), segments=12, ring_count=8)
head = bpy.context.active_object
fig_mat = flat_mat('figure', (0.12, 0.16, 0.26))
for o in (body, head):
    o.data.materials.append(fig_mat)
FIG = (body, head)

cam_data = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def g2b(x, y, z):  # game -> Blender
    return Vector((x, -z, y))


# Companions shown with a piece, at their mounted place (game metres).
COMBO = {
    'windmill_sails': [('windmill_body_LOD{l}', (0, 0, 0)), ('windmill_sails_LOD{l}', (0, 8.5, 3.25))],
    'wagon_cover': [('wagon_LOD{l}', (0, 0, 0)), ('wagon_cover_LOD{l}', (0, 0, 0))],
    'fire_basket_flame': [('fire_basket_LOD{l}', (0, 0, 0)), ('fire_basket_flame_LOD{l}', (0, 0, 0))],
    'paper_lantern': [('lantern_post_LOD{l}', (0, 0, 0)), ('paper_lantern_LOD{l}', (0, 2.27, 0.15))],
    'banner_cloth': [('banner_cloth_LOD{l}', (0, 3.5, 0))],
    'ribbon': [('ribbon_LOD{l}', (0, 1.3, 0))],
}


def show_only(objs):
    keep = set(objs) | {ground, sun, cam}
    for o in bpy.data.objects:
        o.hide_render = o not in keep


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    bpy.context.view_layer.update()
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def aim(target, direction, dist, lens):
    cam_data.lens = lens
    cam_data.clip_start = 0.05
    cam_data.clip_end = 2000
    cam.location = target + direction * dist
    d = target - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


AZ, EL = math.radians(35), math.radians(17)
VIEW = g2b(math.sin(AZ) * math.cos(EL), math.sin(EL), math.cos(AZ) * math.cos(EL)).normalized()
PIXEL_AT_60M = 2 * 60 * math.tan(math.radians(55) / 2) / 1080

for pid in IDS:
    for o in OBJ.values():
        o.location = (0, 0, 0)
    if MODE == 'near':
        parts = COMBO.get(pid, [(pid + '_LOD{l}', (0, 0, 0))])
        objs = []
        for name, off in parts:
            o = OBJ[name.format(l=0)]
            o.location = g2b(*off)
            objs.append(o)
        lo, hi = bounds(objs)
        w = hi.x - lo.x
        body.location = (lo.x - 0.45, (lo.y + hi.y) / 2, 0.725)
        head.location = (lo.x - 0.45, (lo.y + hi.y) / 2, 1.62)
        lo, hi = bounds(objs + list(FIG))
        show_only(objs + list(FIG))
        centre = (lo + hi) / 2
        radius = (hi - lo).length / 2
        scene.render.resolution_x = scene.render.resolution_y = 360
        lens = 50
        fov = 2 * math.atan(18 / lens)
        aim(centre, VIEW, radius / math.sin(fov / 2) * 1.02, lens)
        scene.render.filepath = os.path.join(OUT, f'{pid}.png')
        bpy.ops.render.render(write_still=True)
    else:
        parts = COMBO.get(pid, [(pid + '_LOD{l}', (0, 0, 0))])
        objs = []
        span = 0
        for l in (0, 1):
            for name, off in parts:
                o = OBJ[name.format(l=l)]
                objs.append(o)
        lo, hi = bounds(objs)
        size = max(hi.x - lo.x, hi.y - lo.y, 1.0)
        shift = size * 0.62 + 0.3
        for l in (0, 1):
            for name, off in parts:
                o = OBJ[name.format(l=l)]
                o.location = g2b(*off) + Vector(((-1 if l == 0 else 1) * shift, 0, 0))
        show_only(objs)
        lo, hi = bounds(objs)
        centre = (lo + hi) / 2
        span_x = (hi.x - lo.x) * 1.15 + 1
        span_y = max((hi.z - lo.z) * 1.3 + 1, (hi.y - lo.y) * 0.45 + (hi.z - lo.z) * 1.1 + 1)
        dist = 60.0
        resx = max(16, int(round(span_x / PIXEL_AT_60M)))
        resy = max(12, int(round(span_y / PIXEL_AT_60M)))
        scene.render.resolution_x, scene.render.resolution_y = resx, resy
        cam_data.sensor_fit = 'HORIZONTAL'
        lens = 36 * dist / span_x
        aim(centre, VIEW, dist, lens)
        scene.render.filepath = os.path.join(OUT, f'{pid}.png')
        bpy.ops.render.render(write_still=True)
print('RENDERED', len(IDS), MODE, scene.render.engine)
