"""High-poly -> low-poly rock bake for Wolfveil (Blender, headless).

For each rock variant an icosphere (subdivision 8 = 327,680 triangles) is
sculpted with layered displacement (broad shape, Voronoi crackle plates,
bedding strata, fine grain) and its underside is flattened. The sculpt is
decimated to a ~900-triangle game mesh (LOD0) with smart UVs in one shared
3x2 atlas. Cycles bakes the sculpt onto LOD0 (selected -> active): tangent
normals, procedural colour (cavity darkening, moss on top) and ambient
occlusion, which is multiplied into the albedo. LOD1/LOD2 are decimated from
LOD0 and keep its UVs, so all three share the baked atlas.

Each sculpt/game-mesh pair is baked at its own location, so earlier rocks can
never occlude a later rock's AO rays.

Outputs (in <out_dir>):
  wv_rocks.glb                 6 variants x 3 LODs, one atlas material (WebP)
  and, in <preview_dir> (optional 2nd argument):
  rocks-high-vs-low.jpg        Cycles render: sculpts (top) vs game meshes
  rock-atlas-albedo.jpg / rock-atlas-normal.jpg   1024 px previews

  blender -b --factory-startup -P tools/landscape-bake/bake_rocks.py -- <out_dir> [preview_dir]
"""
import bpy
import bmesh
import math
import os
import sys
import time
import numpy as np

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0]) if ARGS else os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'game3d', 'landscape'))
PREVIEW = os.path.abspath(ARGS[1]) if len(ARGS) > 1 else None
ATLAS = 2048
COLS, ROWS = 3, 2
SUBDIV = 8                       # 20 * 4^(8-1) = 327,680 triangles per sculpt
TARGET_TRIS = 900                # LOD0
LOD_RATIOS = (0.30, 0.085)       # LOD1 ~270, LOD2 ~76 triangles
BAKE_SPACING = 9.0               # metres between bake pairs

# Blender is Z-up: scale = (width, depth, height).
ROCKS = [
    dict(name='wv_rock_boulder', scale=(1.10, 1.00, 0.82), crackle=0.10, big=0.42, strata=0.00, seed=1),
    dict(name='wv_rock_flat', scale=(1.35, 1.05, 0.55), crackle=0.12, big=0.30, strata=0.05, seed=2),
    dict(name='wv_rock_block', scale=(1.00, 0.85, 0.92), crackle=0.20, big=0.25, strata=0.00, seed=3),
    dict(name='wv_rock_standing', scale=(0.55, 0.48, 1.75), crackle=0.12, big=0.22, strata=0.04, seed=4),
    dict(name='wv_rock_slab', scale=(1.55, 1.20, 0.72), crackle=0.08, big=0.20, strata=0.16, seed=5),
    dict(name='wv_rock_rubble', scale=(0.95, 0.85, 0.70), crackle=0.16, big=0.38, strata=0.00, seed=6),
]


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    return scene


def evaluated_copy(obj):
    deps = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(deps))
    obj.modifiers.clear()
    old = obj.data
    obj.data = mesh
    bpy.data.meshes.remove(old)


def texture(kind, name, **props):
    t = bpy.data.textures.new(name, type=kind)
    for k, v in props.items():
        setattr(t, k, v)
    return t


def displace(obj, tex, strength, mid=0.5):
    m = obj.modifiers.new(tex.name, 'DISPLACE')
    m.texture = tex
    m.texture_coords = 'LOCAL'
    m.strength = strength
    m.mid_level = mid
    return m


def make_high(spec, index):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=SUBDIV, radius=1.0,
                                          location=(index * BAKE_SPACING, 0, 0))
    obj = bpy.context.active_object
    obj.name = spec['name'] + '_high'
    obj.scale = spec['scale']
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    s = spec['seed']
    displace(obj, texture('CLOUDS', f'big{s}', noise_scale=0.85 + 0.1 * s % 0.3, noise_depth=3,
                          noise_basis='ORIGINAL_PERLIN'), spec['big'])
    crk = texture('VORONOI', f'crk{s}', noise_scale=0.42, distance_metric='DISTANCE',
                  weight_1=-1.0, weight_2=1.0, weight_3=0.0, weight_4=0.0, noise_intensity=1.6)
    displace(obj, crk, spec['crackle'], mid=0.15)
    if spec['strata'] > 0:
        st = texture('WOOD', f'str{s}', wood_type='BANDNOISE', noise_basis_2='SAW',
                     noise_scale=0.25, turbulence=4.0)
        displace(obj, st, spec['strata'])
    displace(obj, texture('CLOUDS', f'grain{s}', noise_scale=0.09, noise_depth=2), 0.025)
    evaluated_copy(obj)
    # Flatten the underside so rocks sit on the ground.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    floor = min(v.co.z for v in bm.verts) * 0.72
    for v in bm.verts:
        if v.co.z < floor:
            v.co.z = floor + (v.co.z - floor) * 0.15
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def high_material():
    m = bpy.data.materials.new('wv_rock_high')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3.2
    noise.inputs['Detail'].default_value = 8.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    # Weathered granite: lighter than the soil and grass it sits in.
    ramp.color_ramp.elements[0].color = (0.30, 0.29, 0.27, 1)
    ramp.color_ramp.elements[1].color = (0.60, 0.57, 0.52, 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    cav = nt.nodes.new('ShaderNodeValToRGB')
    cav.color_ramp.elements[0].position = 0.42
    cav.color_ramp.elements[0].color = (0.55, 0.55, 0.55, 1)
    cav.color_ramp.elements[1].position = 0.55
    cav.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(geo.outputs['Pointiness'], cav.inputs['Fac'])
    mul = nt.nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    nt.links.new(ramp.outputs['Color'], mul.inputs[6])
    nt.links.new(cav.outputs['Color'], mul.inputs[7])
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Normal'], sep.inputs['Vector'])
    mossmask = nt.nodes.new('ShaderNodeMapRange')
    mossmask.inputs['From Min'].default_value = 0.72
    mossmask.inputs['From Max'].default_value = 0.98
    nt.links.new(sep.outputs['Z'], mossmask.inputs['Value'])
    mossnoise = nt.nodes.new('ShaderNodeTexNoise')
    mossnoise.inputs['Scale'].default_value = 7.0
    mm = nt.nodes.new('ShaderNodeMath')
    mm.operation = 'MULTIPLY'
    nt.links.new(mossmask.outputs['Result'], mm.inputs[0])
    nt.links.new(mossnoise.outputs['Fac'], mm.inputs[1])
    moss = nt.nodes.new('ShaderNodeMix')
    moss.data_type = 'RGBA'
    nt.links.new(mm.outputs['Value'], moss.inputs['Factor'])
    nt.links.new(mul.outputs[2], moss.inputs[6])
    moss.inputs[7].default_value = (0.20, 0.27, 0.10, 1)
    nt.links.new(moss.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    return m


def select_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def decimated_copy(src, name, ratio):
    obj = src.copy()
    obj.data = src.data.copy()
    obj.name = name
    bpy.context.collection.objects.link(obj)
    dec = obj.modifiers.new('dec', 'DECIMATE')
    dec.ratio = ratio
    evaluated_copy(obj)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def make_low(high, index):
    low = decimated_copy(high, high.name.replace('_high', '_LOD0'),
                         TARGET_TRIS / max(1, len(high.data.polygons)))
    select_only(low)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    # Move this rock's UVs into its own atlas tile.
    col, row = index % COLS, index // COLS
    uv = low.data.uv_layers.active.data
    pad = 0.02
    for loop in uv:
        u, v = loop.uv
        loop.uv = ((col + pad + u * (1 - 2 * pad)) / COLS, (row + pad + v * (1 - 2 * pad)) / ROWS)
    return low


def low_material(albedo_img, normal_img):
    m = bpy.data.materials.new('wv_rock_atlas')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 0.86
    ta = nt.nodes.new('ShaderNodeTexImage')
    ta.image = albedo_img
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = normal_img
    normal_img.colorspace_settings.name = 'Non-Color'
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(ta.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m, ta, tn


def bake(kind, high, low, target_node, clear, **extra):
    bpy.ops.object.select_all(action='DESELECT')
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    low.active_material.node_tree.nodes.active = target_node
    bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=0.22,
                        max_ray_distance=0.6, margin=8, use_clear=clear, **extra)


def pixels(img):
    buf = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(buf)
    return buf.reshape(img.size[1], img.size[0], 4)


def save_preview(img, path, size=1024):
    """Downscaled JPEG copy of a bake image (documentation evidence)."""
    a = pixels(img)
    f = a.shape[0] // size
    a = a.reshape(size, f, size, f, 4).mean(axis=(1, 3))
    p = bpy.data.images.new(os.path.basename(path), size, size, alpha=False)
    if img.colorspace_settings.name == 'Non-Color':
        p.colorspace_settings.name = 'Non-Color'
    p.pixels.foreach_set(a.ravel().astype(np.float32))
    p.filepath_raw = path
    p.file_format = 'JPEG'
    p.save(quality=88)


def emission_material(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*rgb, 1)
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return m


def label(text, loc, size, mat):
    bpy.ops.object.text_add(location=loc, rotation=(math.radians(90), 0, 0))
    t = bpy.context.active_object
    t.data.body = text
    t.data.size = size
    t.data.align_x = 'LEFT'
    t.data.materials.append(mat)
    return t


def render_preview(scene, highs, lows, stats, path):
    """Sculpts on the top row, game meshes (LOD0 + baked maps) on the bottom."""
    gap = 3.9
    for i, (h, l) in enumerate(zip(highs, lows)):
        h.hide_set(False)
        h.hide_render = False
        h.location = (i * gap, 0, 4.4)
        l.location = (i * gap, 0, 0)
    world = bpy.data.worlds.new('preview') if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.42, 0.47, 0.53, 1)
    bg.inputs['Strength'].default_value = 0.55
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.6
    sun.data.angle = math.radians(6)
    sun.rotation_euler = (math.radians(48), math.radians(-12), math.radians(-38))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = gap * 6 + 1.2
    cx = gap * 2.5
    cam.location = (cx, -40, 2.4 + 40 * math.tan(math.radians(9)))
    cam.rotation_euler = (math.radians(81), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    ink = emission_material('ink', (0.93, 0.93, 0.90))
    left = cx - cam.data.ortho_scale / 2 + 0.35
    label(f'HIGH-POLY SCULPTS  ({stats[0][1]:,} triangles each)', (left, -3, 6.55), 0.42, ink)
    lod = {s[0].rsplit('_', 1)[-1]: s[2] for s in stats[len(ROCKS):len(ROCKS) + 2]}
    label(f'GAME MESHES + BAKED NORMAL/COLOUR/AO  (LOD0 {stats[0][2]}, LOD1 {lod["LOD1"]}, LOD2 {lod["LOD2"]} triangles)',
          (left, -3, 2.05), 0.42, ink)
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 820
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 88
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
    scene = reset_scene()
    hm = high_material()
    albedo = bpy.data.images.new('wv_rock_atlas_albedo', ATLAS, ATLAS, alpha=False)
    normal = bpy.data.images.new('wv_rock_atlas_normal', ATLAS, ATLAS, alpha=False)
    ao = bpy.data.images.new('wv_rock_atlas_ao', ATLAS, ATLAS, alpha=False)
    normal.generated_color = (0.5, 0.5, 1.0, 1.0)
    ao.colorspace_settings.name = 'Non-Color'
    lm, ta, tn = low_material(albedo, normal)
    ao_node = lm.node_tree.nodes.new('ShaderNodeTexImage')
    ao_node.image = ao
    highs, lows, stats = [], [], []
    for i, spec in enumerate(ROCKS):
        high = make_high(spec, i)
        high.data.materials.clear()
        high.data.materials.append(hm)
        low = make_low(high, i)
        low.data.materials.clear()
        low.data.materials.append(lm)
        stats.append((spec['name'], len(high.data.polygons), len(low.data.polygons)))
        scene.cycles.samples = 1
        bake('NORMAL', high, low, tn, i == 0, normal_space='TANGENT')
        bake('DIFFUSE', high, low, ta, i == 0, pass_filter={'COLOR'})
        scene.cycles.samples = 48
        bake('AO', high, low, ao_node, i == 0)
        high.hide_set(True)
        high.hide_render = True
        highs.append(high)
        lows.append(low)
        print('ROCK', spec['name'], 'high', stats[-1][1], 'low', stats[-1][2], round(time.time() - t0, 1), 's')
    # AO is multiplied into the albedo (the game uses one albedo + one normal).
    a = pixels(albedo)
    o = pixels(ao)
    a[..., :3] *= (0.55 + 0.45 * o[..., :1])
    albedo.pixels.foreach_set(a.ravel())
    lm.node_tree.nodes.remove(ao_node)
    albedo.pack()
    normal.pack()
    if PREVIEW:
        save_preview(albedo, os.path.join(PREVIEW, 'rock-atlas-albedo.jpg'))
        save_preview(normal, os.path.join(PREVIEW, 'rock-atlas-normal.jpg'))
    # LOD1/LOD2 share LOD0's UVs and therefore the baked atlas.
    lod_objects = []
    for low in lows:
        lod_objects.append(low)
        for k, ratio in enumerate(LOD_RATIOS, start=1):
            lod = decimated_copy(low, low.name.replace('_LOD0', f'_LOD{k}'), ratio)
            lod_objects.append(lod)
            stats.append((lod.name, 0, len(lod.data.polygons)))
    if PREVIEW:
        for o in lod_objects:
            if o not in lows:
                o.hide_render = True
        render_preview(scene, highs, lows, stats, os.path.join(PREVIEW, 'rocks-high-vs-low.jpg'))
    # Export every LOD at the origin with the baked atlas.
    for obj in bpy.data.objects:
        obj.select_set(obj in lod_objects)
    for obj in lod_objects:
        obj.location = (0, 0, 0)
    glb = os.path.join(OUT, 'wv_rocks.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True,
                              export_image_format='WEBP', export_image_quality=88,
                              export_materials='EXPORT', export_tangents=True,
                              export_yup=True, export_apply=True)
    print('STATS', stats)
    print('GLB', glb, os.path.getsize(glb), 'bytes', round(time.time() - t0, 1), 's')


main()
