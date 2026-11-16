# Optimizes one weapon GLB for Game 3D. Run through build-weapons.mjs, or directly:
#   blender -b --factory-startup --python tools/game3d-weapons/optimize_weapon.py -- <spec.json> <src.glb> <out.glb> <meta.json> [preview.png]
#
# Output convention (glTF axes, metres, sized for a 1.7 m character):
#   origin = centre of the main grip (where the palm centre of the holding hand sits)
#   +Y     = towards the tip (bows: towards the upper limb)
#   +Z     = blade edge direction (bows: the arrow's flight, from string to riser)
#   +X     = Y x Z (the blade's flat / the bow's side)
# The meta JSON records measured points in that frame (tip, guard, pommel, second grip, string, nock, ...).
import bpy, sys, json, math
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
spec_path, src, out_glb, out_meta = argv[:4]
preview = argv[4] if len(argv) > 4 else None
with open(spec_path, encoding='utf-8') as f:
    spec = json.load(f)
is_bow = spec['class'] == 'bow'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in [o for o in bpy.data.objects if o.type != 'MESH']:
    bpy.data.objects.remove(o)


def select_only(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


# One mesh with its world transform baked in.
for o in meshes:
    o.data.transform(o.matrix_world)
    o.matrix_world = Matrix.Identity(4)
    o.parent = None
select_only(meshes)
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
obj.name = spec['id']
src_tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)


def verts_of(o):
    a = np.empty(len(o.data.vertices) * 3, dtype=np.float64)
    o.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def gltf_to_blender(v):
    x, y, z = v
    return np.array([x, -z, y], dtype=np.float64)


# Loose parts: keep the main cluster (drops e.g. a bundled arrow) and find a separate bowstring.
select_only([obj])
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in bpy.data.objects if o.type == 'MESH']
boxes = []
for p in parts:
    v = verts_of(p)
    boxes.append((v.min(0), v.max(0), len(v)))
size = max((b[1] - b[0]).max() for b in boxes)
dropped = []
if spec.get('keepLargestCluster') and len(parts) > 1:
    # union parts whose (slightly grown) boxes touch, keep the cluster with the most vertices
    eps = size * 0.01
    group = list(range(len(parts)))
    def root(i):
        while group[i] != i:
            group[i] = group[group[i]]
            i = group[i]
        return i
    for i in range(len(parts)):
        for j in range(i + 1, len(parts)):
            a0, a1, _ = boxes[i]; b0, b1, _ = boxes[j]
            if np.all(a0 - eps <= b1) and np.all(b0 - eps <= a1):
                group[root(i)] = root(j)
    totals = {}
    for i in range(len(parts)):
        totals[root(i)] = totals.get(root(i), 0) + boxes[i][2]
    keep = max(totals, key=totals.get)
    for i, p in enumerate(parts):
        if root(i) != keep:
            dropped.append({'name': p.name, 'verts': boxes[i][2], 'extent': (boxes[i][1] - boxes[i][0]).round(4).tolist()})
            bpy.data.objects.remove(p)
    parts = [o for o in bpy.data.objects if o.type == 'MESH']

# Principal axes of the kept geometry.
allv = np.concatenate([verts_of(p) for p in parts])
center = allv.mean(0)
cov = np.cov((allv - center).T)
evals, evecs = np.linalg.eigh(cov)
order = np.argsort(evals)[::-1]
a1, a2, a3 = (evecs[:, k] for k in order)

tip_hint = gltf_to_blender(spec['tipHint'])
T = a1 if a1 @ tip_hint >= 0 else -a1
coord = lambda v, axis: (v - center) @ axis
ys = coord(allv, T)
y0, y1 = ys.min(), ys.max()
L = y1 - y0
edge_hint = spec.get('edgeHint', 'auto')
if isinstance(edge_hint, list):
    h = gltf_to_blender(edge_hint)
    h = h - (h @ T) * T
    E = max([a2, -a2, a3, -a3], key=lambda c: c @ h)
else:
    E = a2
    zs = coord(allv, E)
    if edge_hint == 'curve':
        # A curved blade bulges towards its edge: compare the mid-blade centre with the chord guard->tip.
        def mid_z(lo, hi):
            m = (ys >= y0 + lo * L) & (ys <= y0 + hi * L)
            return float(np.median(zs[m]))
        base, mid, tip = mid_z(0.30, 0.36), mid_z(0.62, 0.68), mid_z(0.93, 0.97)
        if mid - (base + tip) / 2 < 0:
            E = -E
    else:
        # Bow: the riser sits in front of the line between the limb tips (where the string runs).
        top = zs[ys >= y1 - 0.02 * L].mean(); bot = zs[ys <= y0 + 0.02 * L].mean()
        mid = zs[np.abs(ys - (y0 + y1) / 2) <= 0.03 * L]
        if np.median(mid) - (top + bot) / 2 < 0:
            E = -E
F = np.cross(T, E)
F /= np.linalg.norm(F)
E = np.cross(F, T)  # re-orthogonalize

scale = spec['length'] / L
# rows map a source vector to canonical glTF axes (x=F, y=T, z=E); Blender stores (x, -z, y)
R_gltf = np.stack([F, T, E])
to_blender = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=np.float64)
R = to_blender @ R_gltf * scale
M = Matrix.Identity(4)
for r in range(3):
    for c in range(3):
        M[r][c] = R[r, c]
t = -(R @ center)
for r in range(3):
    M[r][3] = t[r]
for p in parts:
    p.data.transform(M)


def canon(o):
    v = verts_of(o)
    return np.stack([v[:, 0], v[:, 2], -v[:, 1]], 1)  # Blender -> glTF axes


# Bowstring: a long, thin separate part.
string_part = None
if is_bow:
    for p in parts:
        c = canon(p)
        ext = c.max(0) - c.min(0)
        if ext[1] > 0.5 * spec['length'] and ext[0] < 0.02 and ext[2] < 0.05:
            string_part = p
            break
string_pts = None
if string_part is not None:
    c = canon(string_part)
    order_y = np.argsort(c[:, 1])
    n = max(3, len(c) // 50)
    string_pts = {'top': c[order_y[-n:]].mean(0), 'bottom': c[order_y[:n]].mean(0)}
    bpy.data.objects.remove(string_part)
    parts = [o for o in parts if o.name in bpy.data.objects]

select_only(parts)
if len(parts) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
obj.name = spec['id']
P = canon(obj)
ymin, ymax = P[:, 1].min(), P[:, 1].max()

meta_strip = {}
# A bowstring modelled into the bow mesh: a thin straight run behind the riser. Fit a line through the
# thin rear cluster at several heights and delete the vertices on it; the game draws a string that the
# drawing hand can pull instead.
if is_bow and string_pts is None and spec.get('stripString', True):
    Lb = ymax - ymin
    centres = []
    for f in np.arange(0.15, 0.86, 0.05):
        y = ymin + f * Lb
        s = P[np.abs(P[:, 1] - y) <= 0.004]
        if len(s) < 3:
            continue
        order_z = np.argsort(s[:, 2])
        zs_ = s[order_z, 2]
        cut = np.where(np.diff(zs_) > 0.015)[0]
        if not len(cut):
            continue
        rear = s[order_z[:cut[0] + 1]]
        if np.ptp(rear[:, 0]) < 0.012 and np.ptp(rear[:, 2]) < 0.012:
            centres.append([np.median(rear[:, 0]), y, np.median(rear[:, 2]), max(np.ptp(rear[:, 0]), np.ptp(rear[:, 2]))])
    # a real string shows up at most heights and runs most of the bow's length
    if len(centres) >= 10 and (centres[-1][1] - centres[0][1]) > 0.6 * Lb:
        C = np.array(centres)
        bx = np.polyfit(C[:, 1], C[:, 0], 1); bz = np.polyfit(C[:, 1], C[:, 2], 1)
        tol = max(0.006, 0.6 * float(np.median(C[:, 3])) + 0.004)
        on = (np.abs(P[:, 0] - np.polyval(bx, P[:, 1])) < tol) & (np.abs(P[:, 2] - np.polyval(bz, P[:, 1])) < tol) \
            & (P[:, 1] > ymin + 0.03 * Lb) & (P[:, 1] < ymax - 0.03 * Lb)
        if on.sum() > 0:
            import bmesh
            bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
            idx = np.where(on)[0]
            ys_on = P[idx, 1]
            bmesh.ops.delete(bm, geom=[bm.verts[i] for i in idx], context='VERTS')
            bm.to_mesh(obj.data); bm.free()
            # string ends: where the line meets the limbs (just past the deleted run)
            yt, yb = float(ys_on.max()), float(ys_on.min())
            string_pts = {'top': np.array([np.polyval(bx, yt), yt, np.polyval(bz, yt)]),
                          'bottom': np.array([np.polyval(bx, yb), yb, np.polyval(bz, yb)])}
            meta_strip = {'stringStripped': int(on.sum())}
            P = canon(obj)


def slab(y, half=0.01):
    return P[np.abs(P[:, 1] - y) <= half]


meta = {'id': spec['id'], 'class': spec['class'], 'length': round(float(ymax - ymin), 4), 'sourceTris': int(src_tris), 'droppedParts': dropped}
if not is_bow:
    # Handle = the longest run of thin slabs in the lower 45%, measured inside a 4 cm core around the
    # blade axis so guard wings that curl down past the handle do not count. The palm centre sits 5 cm
    # below the top of that run (just under the guard); a two-handed hilt adds a second grip below it.
    step = 0.005
    axis_xz = np.median(P[P[:, 1] > ymin + 0.6 * (ymax - ymin)][:, [0, 2]], 0)
    core = P[(np.abs(P[:, 0] - axis_xz[0]) < 0.04) & (np.abs(P[:, 2] - axis_xz[1]) < 0.04)]
    bins = np.arange(ymin + step, ymin + 0.45 * (ymax - ymin), step)
    def core_width(y):
        s = core[np.abs(core[:, 1] - y) <= step / 2]
        return np.ptp(s[:, 2]) + np.ptp(s[:, 0]) if len(s) > 2 else np.inf
    widths = np.array([core_width(b) for b in bins])
    thin = widths <= 1.35 * np.percentile(widths[np.isfinite(widths)], 10)
    best, run_start = (0, 0, 0), None
    for i, t in enumerate(list(thin) + [False]):
        if t and run_start is None:
            run_start = i
        elif not t and run_start is not None:
            if i - run_start > best[0]:
                best = (i - run_start, run_start, i - 1)
            run_start = None
    hA, hB = float(bins[best[1]]), float(bins[best[2]])
    guard_lower = hB
    widest = int(np.argmax(np.where(np.isfinite(widths), widths, 0)))
    bins_guard = float(bins[widest])
    grip_y = max(hA + 0.04, hB - 0.05)
    if 'gripFromPommel' in spec:  # measured override (profile printed by the tool's --profile check)
        grip_y = ymin + spec['gripFromPommel']
    s = slab(grip_y)
    grip = np.array([np.median(s[:, 0]), grip_y, np.median(s[:, 2])])
    radius = float((np.ptp(s[:, 0]) + np.ptp(s[:, 2])) / 4)
    tip_s = P[P[:, 1] >= ymax - 0.01]
    meta.update({'guardY': bins_guard, 'guardLowerY': guard_lower, 'pommelY': float(ymin), 'handleBottomY': hA,
                 'tip': [float(np.median(tip_s[:, 0])), float(ymax), float(np.median(tip_s[:, 2]))],
                 'handleRadius': round(radius, 4), 'handleLength': round(hB - hA, 4)})
    if spec['class'] == 'greatsword':
        y2 = ymin + spec['secondaryFromPommel'] if 'secondaryFromPommel' in spec else max(hA + 0.045, grip_y - 0.11)
        s2 = slab(y2)
        meta['secondaryGrip'] = [float(np.median(s2[:, 0])), float(y2), float(np.median(s2[:, 2]))]
else:
    grip_y = (ymin + ymax) / 2 + spec.get('gripOffset', 0) * (ymax - ymin)
    s = slab(grip_y, 0.015)
    z = np.sort(s[:, 2])
    gaps = np.diff(z)
    clusters = np.split(z, np.where(gaps > 0.02)[0] + 1)
    riser = max(clusters, key=len)
    rs = s[(s[:, 2] >= riser.min()) & (s[:, 2] <= riser.max())]
    grip = np.array([np.median(rs[:, 0]), grip_y, (riser.min() + riser.max()) / 2])
    radius = float((np.ptp(rs[:, 0]) + np.ptp(rs[:, 2])) / 4)
    top = P[P[:, 1] >= ymax - 0.01].mean(0); bot = P[P[:, 1] <= ymin + 0.01].mean(0)
    meta.update({'handleRadius': round(radius, 4), 'limbTop': top.tolist(), 'limbBottom': bot.tolist()})
    meta.update(meta_strip)
    if string_pts is not None:
        meta['stringTop'] = string_pts['top'].tolist(); meta['stringBottom'] = string_pts['bottom'].tolist()
        meta['stringSource'] = 'stripped' if meta_strip else 'part'
    else:
        # no string in the model: the game strings it between the limb tips
        meta['stringTop'] = top.tolist(); meta['stringBottom'] = bot.tolist()
        meta['stringSource'] = 'tips'
    st, sb = np.array(meta['stringTop']), np.array(meta['stringBottom'])
    nock_y = grip_y + 0.03
    f = (nock_y - sb[1]) / max(1e-6, st[1] - sb[1])
    meta['nock'] = (sb + (st - sb) * f).tolist()

# Move the grip to the origin.
shift = Matrix.Translation(Vector((-grip[0], grip[2], -grip[1])))  # glTF -> Blender: (x, -z, y)
obj.data.transform(shift)
for key in ('tip', 'secondaryGrip', 'limbTop', 'limbBottom', 'stringTop', 'stringBottom', 'nock'):
    if key in meta:
        meta[key] = [round(float(a - b), 4) for a, b in zip(meta[key], grip)]
for key in ('guardY', 'guardLowerY', 'pommelY', 'handleBottomY'):
    if key in meta:
        meta[key] = round(meta[key] - float(grip[1]), 4)

# Decimate.
tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
if tris > spec['targetTris']:
    select_only([obj])
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.ratio = spec['targetTris'] / tris
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
select_only([obj])
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
me = obj.data
me.calc_loop_triangles()
meta['tris'] = len(me.loop_triangles)
meta['verts'] = len(me.vertices)

# Textures: base colour up to baseColorTexture, the others up to texture.
for mat in me.materials:
    if not mat or not mat.use_nodes:
        continue
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    for n in mat.node_tree.nodes:
        if n.type != 'TEX_IMAGE' or not n.image:
            continue
        is_base = bsdf and any(l.to_node == bsdf and l.to_socket.name == 'Base Color' for l in n.outputs['Color'].links)
        cap = spec.get('baseColorTexture', spec['texture']) if is_base else spec['texture']
        w, h = n.image.size
        if max(w, h) > cap:
            n.image.scale(cap, cap)
        n.image.name = f"{spec['id']}_{'basecolor' if is_base else n.image.name.split('_')[-1].split('.')[0]}"

bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_apply=True,
                          export_image_format='JPEG', export_jpeg_quality=86, export_image_quality=86,
                          export_normals=True, export_tangents=False, export_animations=False,
                          export_cameras=False, export_lights=False, export_extras=False)
meta['grip'] = [0, 0, 0]
with open(out_meta, 'w', encoding='utf-8') as f:
    json.dump(meta, f, indent=1)
print('OPTIMIZE_OK', spec['id'], meta['tris'], meta['length'])

if preview:
    # Flat-side view: tip up, edge / arrow flight to the right, markers on the measured points.
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x = scene.render.resolution_y = 720
    scene.world = bpy.data.worlds.new('w')
    def marker(p, color, r=0.012):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(p[0], -p[2], p[1]))
        m = bpy.data.materials.new('m'); m.diffuse_color = color
        bpy.context.active_object.data.materials.append(m)
    # grip: a red disc slightly wider than the handle, visible as a band across it
    bpy.ops.mesh.primitive_cylinder_add(radius=meta['handleRadius'] + 0.012, depth=0.008, location=(0, 0, 0))
    gm = bpy.data.materials.new('grip'); gm.diffuse_color = (1, 0.1, 0.1, 1)
    bpy.context.active_object.data.materials.append(gm)
    for key, col in (('tip', (0.1, 0.4, 1, 1)), ('secondaryGrip', (1, 0.6, 0, 1)), ('nock', (0.1, 1, 0.3, 1)),
                     ('stringTop', (1, 1, 0.1, 1)), ('stringBottom', (1, 1, 0.1, 1))):
        if key in meta:
            marker(meta[key], col)
    cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = spec['length'] * 1.08
    cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
    mid = (meta.get('pommelY', meta.get('limbBottom', [0, -0.5, 0])[1]) + (meta.get('tip') or meta.get('limbTop'))[1]) / 2
    cam.location = (-3, 0, mid)
    cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
    scene.render.filepath = preview
    bpy.ops.render.render(write_still=True)
