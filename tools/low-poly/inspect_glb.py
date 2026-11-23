# Headless Blender: print the objects, hierarchy, materials and mesh islands of a GLB.
#   blender -b --factory-startup -P tools/low-poly/inspect_glb.py -- <file.glb>
import sys
import bpy
import bmesh

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
path = argv[0]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)


def islands(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    seen = set()
    count = 0
    for v in bm.verts:
        if v.index in seen:
            continue
        count += 1
        stack = [v]
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
    bm.free()
    return count


for obj in bpy.context.scene.objects:
    parent = obj.parent.name if obj.parent else '-'
    line = f'{obj.type:6} {obj.name:28} parent={parent:20} loc={tuple(round(x, 3) for x in obj.location)} rot={tuple(round(x, 3) for x in obj.rotation_euler)} scale={tuple(round(x, 4) for x in obj.scale)}'
    if obj.type == 'MESH':
        me = obj.data
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        mats = [m.name if m else None for m in me.materials]
        dims = tuple(round(x, 2) for x in obj.dimensions)
        line += f' mesh={me.name} verts={len(me.vertices)} polys={len(me.polygons)} tris={tris} islands={islands(obj)} mats={mats} uv={[u.name for u in me.uv_layers]} dims={dims}'
    print(line)
for img in bpy.data.images:
    print('IMAGE', img.name, img.size[:], img.file_format)
for mat in bpy.data.materials:
    print('MATERIAL', mat.name, 'blend', getattr(mat, 'blend_method', None), 'surface_render_method', getattr(mat, 'surface_render_method', None))
