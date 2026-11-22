"""Build public/game3d/threeroads/kits/valley.glb (Blender 5.2, headless).

  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      -P tools/threeroads/kits/valley/build_valley_kit.py -- [options]

Options (after --):
  --out PATH        GLB to write (default public/game3d/threeroads/kits/valley.glb)
  --flat            no bake: every colour key is a flat swatch in the atlas (fast)
  --boxes           every piece as a plain box of its table size (the first pass)
  --only a,b        build only these ids (for trying a piece; not for the real file)
  --blend PATH      also save the scene as a .blend
  --atlas PATH      also save the atlas as a PNG
  --samples N       ambient-occlusion samples for the bake (default 64)

Reads the piece table from src/components/game3d/threeroads/kits/valleyKitPieces.mjs
(sizes, pivots, material, tint), builds each piece twice (LOD0, LOD1) with
pieces.py, fits each to its size, gives the whole kit one 2048 atlas and two
materials (valley_lit, valley_glow) and exports it.
"""
import importlib
import math
import os
import re
import sys
import time
import zlib

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
sys.path.insert(0, HERE)
import kitlib  # noqa: E402
import pieces  # noqa: E402
import kitbake  # noqa: E402

importlib.reload(kitlib)
importlib.reload(pieces)
importlib.reload(kitbake)

ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
TABLE = os.path.join(ROOT, 'src', 'components', 'game3d', 'threeroads', 'kits', 'valleyKitPieces.mjs')
ATLAS = 2048


def read_table():
    rows = []
    with open(TABLE, encoding='utf-8') as fh:
        for line in fh:
            m = re.search(r"piece\('(\w+)',\s*\[([^\]]+)\]", line)
            if not m:
                continue
            pv = re.search(r"pivot: '(\w+)'", line)
            rows.append(dict(
                id=m.group(1),
                size=[float(x) for x in m.group(2).split(',')],
                material='glow' if "material: 'glow'" in line else 'lit',
                tint='tint: true' in line,
                pivot=pv.group(1) if pv else 'base',
            ))
    return rows


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opt = dict(out=os.path.join(ROOT, 'public', 'game3d', 'threeroads', 'kits', 'valley.glb'),
               flat=False, boxes=False, only=None, blend=None, atlas=None, samples=64)
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ('--flat', '--boxes'):
            opt[a[2:]] = True
        elif a in ('--out', '--blend', '--atlas'):
            opt[a[2:]] = argv[i + 1]
            i += 1
        elif a == '--only':
            opt['only'] = set(argv[i + 1].split(','))
            i += 1
        elif a == '--samples':
            opt['samples'] = int(argv[i + 1])
            i += 1
        i += 1
    return opt


def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for d in list(coll):
            coll.remove(d)


def kit_material(name, img, glow):
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.92
    bsdf.inputs['Metallic'].default_value = 0.0
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.25
    if glow:
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    mat.use_backface_culling = True
    return mat


def main():
    t0 = time.time()
    opt = parse_args()
    rows = read_table()
    assert len(rows) == 37, f'expected 37 pieces in the table, found {len(rows)}'
    if opt['only']:
        rows = [r for r in rows if r['id'] in opt['only']]
    clear_scene()
    warn = []
    objs = []
    for row in rows:
        for lod in (0, 1):
            B = kitlib.Builder(lod, seed=zlib.crc32(row['id'].encode()) % 10007 + lod * 31)
            if opt['boxes']:
                pieces.build_box(B, row)
            else:
                pieces.BUILDERS[row['id']](B, row)
            ob = B.finish(f"{row['id']}_LOD{lod}", row['size'], row['pivot'], warn=warn)
            ob['piece'] = row['id']
            ob['lod'] = lod
            ob['glow'] = row['material'] == 'glow'
            ob['tint'] = row['tint']
            ob['pivot'] = row['pivot']
            objs.append(ob)
    if opt['flat']:
        img = kitbake.flat_atlas(ATLAS)
        for ob in objs:
            kitbake.flat_uvs(ob)
    else:
        img = kitbake.bake_atlas(objs, ATLAS, samples=opt['samples'])
    lit = kit_material('valley_lit', img, False)
    glow = kit_material('valley_glow', img, True)
    for ob in objs:
        me = ob.data
        me.materials.clear()
        me.materials.append(glow if ob['glow'] else lit)
        for p in me.polygons:
            p.material_index = 0
        ob.location = (0, 0, 0)
    if opt['atlas']:
        kitbake.save_png(img, opt['atlas'])
    os.makedirs(os.path.dirname(opt['out']), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=opt['out'], export_format='GLB', use_selection=True,
                              export_image_format='WEBP', export_image_quality=86,
                              export_materials='EXPORT', export_tangents=False,
                              export_yup=True, export_apply=True)
    if opt['blend']:
        bpy.ops.wm.save_as_mainfile(filepath=opt['blend'])
    tris = {0: 0, 1: 0}
    for ob in objs:
        tris[ob['lod']] += kitlib.tri_count(ob)
    for w in warn:
        print('WARN', w)
    print('TRIS', tris, 'PIECES', len(rows))
    print('GLB', opt['out'], os.path.getsize(opt['out']), 'bytes', round(time.time() - t0, 1), 's')


main()
