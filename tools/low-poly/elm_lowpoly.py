# Headless Blender: the owner elm GLB (public/game3d/elm-owner-optimized.glb) as a low-poly GLB that keeps its look.
#
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P tools/low-poly/elm_lowpoly.py -- \
#       public/game3d/elm-owner-optimized.glb public/game3d/elm-owner-lowpoly.glb [--bark 0.2] [--leaf 0.5] [--far]
#
# - Bark (trunk, branches, twigs): Blender's collapse decimate to --bark of the triangles. The decimate removes the
#   smallest twig triangles first (they cost the least), so the trunk and main branches keep their outline.
# - Leaves: every leaf is one alpha-cut triangle card. A seeded random --leaf share of the cards is kept and each
#   kept card is scaled about its own centre by 1/sqrt(--leaf), so the canopy covers the same area with fewer cards.
# - Node names, parents, transforms, materials, textures and UV channels are kept: the game picks the variants by
#   name (elm-broad / elm-slim / elm-wild, children *-bark and *-leaf) and multiplies each mesh's authored transform.
# - --far adds a second, lighter set (elm-broad-far, ...) for distance LOD.
import sys
import math
import random
import bpy
import bmesh

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
src, dst = argv[0], argv[1]


def opt(name, default):
    if name in argv:
        return float(argv[argv.index(name) + 1])
    return default


BARK = opt('--bark', 0.2)
LEAF = opt('--leaf', 0.5)
FAR_BARK = opt('--far-bark', 0.07)
FAR_LEAF = opt('--far-leaf', 0.25)
MAKE_FAR = '--far' in argv

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def decimate(obj, ratio):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('LowPolyDecimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)


def thin_cards(obj, keep, seed):
    rng = random.Random(seed)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    grow = 1.0 / math.sqrt(keep)
    doomed = []
    for face in bm.faces:
        if rng.random() < keep:
            c = face.calc_center_median()
            for v in face.verts:
                v.co = c + (v.co - c) * grow
        else:
            doomed.append(face)
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def lower(root_name, bark, leaf, seed):
    root = bpy.data.objects[root_name]
    report = []
    for child in root.children:
        if child.type != 'MESH':
            continue
        before = tri_count(child)
        if 'leaf' in child.name:
            thin_cards(child, leaf, seed)
        else:
            decimate(child, bark)
        report.append((child.name, before, tri_count(child)))
    return report


VARIANTS = ['elm-broad', 'elm-slim', 'elm-wild']

if MAKE_FAR:
    # duplicate each variant (with its meshes as single-user copies) before lowering the near set
    for name in VARIANTS:
        root = bpy.data.objects[name]
        copy_root = root.copy()
        copy_root.name = name + '-far'
        bpy.context.scene.collection.objects.link(copy_root)
        for child in list(root.children):
            c = child.copy()
            c.data = child.data.copy()
            c.name = child.name.replace(name, name + '-far')
            c.data.name = child.data.name + '_far'
            bpy.context.scene.collection.objects.link(c)
            c.parent = copy_root
            c.matrix_parent_inverse = child.matrix_parent_inverse.copy()

for i, name in enumerate(VARIANTS):
    for row in lower(name, BARK, LEAF, 1000 + i):
        print('LOWPOLY', *row)
    if MAKE_FAR:
        for row in lower(name + '-far', FAR_BARK, FAR_LEAF, 2000 + i):
            print('LOWPOLY', *row)

bpy.ops.export_scene.gltf(
    filepath=dst, export_format='GLB', use_selection=False, export_yup=True, export_apply=False,
    export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
    export_image_format='AUTO', export_cameras=False, export_lights=False, export_extras=False,
    export_animations=False, export_skins=False, export_morph=False,
)
print('WROTE', dst)
