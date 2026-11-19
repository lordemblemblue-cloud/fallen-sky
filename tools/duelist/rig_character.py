"""Rig an unrigged T-pose character (a Tripo GLB, say) with the fused bodies' Mixamo skeleton, so every
Duelist clip plays on it.

  blender -b --factory-startup -P tools/duelist/rig_character.py -- <character.glb> <out.glb>
      [--template public/models/characters/fused/Female_Fused_v2.glb] [--preview DIR] [--texture 2048]

How:
  1. The character is scaled to 1.7 m and measured: its arm row (T-pose shoulder height), arm span, armpits,
     and where its legs and torso sit at each height.
  2. The template's skeleton is mapped onto those measures: heights scale with the arm row, the arms run
     from the armpit to the fingertips, then every joint is centred in the character's own cross-section.
  3. The skin is bound with Blender's automatic (heat) weights; any vertex left without a bone takes the
     weights of its nearest bound neighbour.
  4. Exported as GLB: the skeleton (same bone names as the fused bodies) and the skinned mesh, textures
     shrunk for the web. A report (json) and preview renders (with the bones drawn) go next to it.
"""
import bpy, bmesh, sys, os, json, math
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC = argv[0]
OUT = argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
TEMPLATE = opt('--template', os.path.join(REPO, 'public/models/characters/fused/Female_Fused_v2.glb'))
PREVIEW = opt('--preview')
MAX_TEX = int(opt('--texture', '2048'))
HEIGHT = 1.7
report = {'source': os.path.basename(SRC), 'template': os.path.basename(TEMPLATE)}


def log(*a):
    print('[rig]', *a, flush=True)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

# ---------------------------------------------------------------- template skeleton and body
tpl = import_glb(TEMPLATE)
arm = next(o for o in tpl if o.type == 'ARMATURE')
tbody = max((o for o in tpl if o.type == 'MESH' and not o.name.lower().startswith('hair')), key=lambda o: len(o.data.vertices))
# the importer poses the template with its first clip: back to the rest pose, no clips
arm.animation_data_clear()
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
dg = bpy.context.evaluated_depsgraph_get()


def world_points(obj, evaluated=True):
    if evaluated:
        ev = obj.evaluated_get(dg)
        me = ev.to_mesh()
        pts = [ev.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
        return pts
    return [obj.matrix_world @ v.co for v in obj.data.vertices]


tpts = world_points(tbody, evaluated=False)  # the rest (T-pose) mesh

# ---------------------------------------------------------------- the character, 1.7 m tall, feet on the ground
chars = [o for o in import_glb(SRC) if o.type == 'MESH']
if len(chars) > 1:
    bpy.ops.object.select_all(action='DESELECT')
    for o in chars:
        o.select_set(True)
    bpy.context.view_layer.objects.active = chars[0]
    bpy.ops.object.join()
char = chars[0]
char.name = char.data.name = 'Character_Body'
mw = char.matrix_world.copy()
char.parent = None
char.data.transform(mw)
char.matrix_world = Matrix.Identity(4)
pts = [v.co.copy() for v in char.data.vertices]
lo_z = min(p.z for p in pts)
hi_z = max(p.z for p in pts)
k = HEIGHT / (hi_z - lo_z)
cx = (max(p.x for p in pts) + min(p.x for p in pts)) / 2
cy = (max(p.y for p in pts) + min(p.y for p in pts)) / 2
char.data.transform(Matrix.Translation((-cx * k, -cy * k, -lo_z * k)) @ Matrix.Scale(k, 4))
# weld duplicate vertices (Tripo meshes are split along UV seams): heat weighting wants connected surfaces
bm = bmesh.new()
bm.from_mesh(char.data)
before_verts = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=HEIGHT * 0.0004)
bm.to_mesh(char.data)
bm.free()
char.data.update()
cpts = [v.co.copy() for v in char.data.vertices]
report['character'] = {'verts_in': before_verts, 'verts': len(cpts), 'scale': k}
log('character', report['character'])


# ---------------------------------------------------------------- measuring a T-pose body
def median(values):
    s = sorted(values)
    return s[len(s) // 2] if s else 0.0


def measure(points, label):
    h = max(p.z for p in points) - min(p.z for p in points)
    span = {side: max((p.x * side for p in points), default=0) for side in (1, -1)}
    # the arm row: arm vertices near the wrists (outer quarter of the span), their height and depth
    row = {}
    for side in (1, -1):
        band = [p for p in points if 0.7 * span[side] < p.x * side < 0.82 * span[side]]
        row[side] = (median([p.z for p in band]), median([p.y for p in band]))
    arm_z = (row[1][0] + row[-1][0]) / 2
    # armpits: going outward from the body, where the cross-section stops being a torso
    pit = {}
    for side in (1, -1):
        x = h * 0.04
        found = None
        while x < span[side]:
            slab = [p for p in points if abs(p.x * side - x) < h * 0.004 and p.z > arm_z - h * 0.25]
            if slab and (max(p.z for p in slab) - min(p.z for p in slab)) < h * 0.13:
                found = x
                break
            x += h * 0.004
        pit[side] = found or span[side] * 0.25
    m = {'height': h, 'span': span, 'arm_z': arm_z, 'row': row, 'pit': pit}
    log(label, {'height': round(h, 3), 'span': {s: round(v, 3) for s, v in span.items()}, 'arm_z': round(arm_z, 3),
                'pit': {s: round(v, 3) for s, v in pit.items()}})
    return m


T = measure(tpts, 'template')
Cm = measure(cpts, 'character')
report['measures'] = {'template': {'arm_z': T['arm_z'], 'pit': T['pit'], 'span': T['span']},
                      'character': {'arm_z': Cm['arm_z'], 'pit': Cm['pit'], 'span': Cm['span']}}
vk = Cm['arm_z'] / T['arm_z']  # heights scale with the arm row (hair and headdresses do not count)


def map_point(p, region):
    """A template joint (world) onto the character. region: 'arm+' / 'arm-' / 'body'."""
    if region in ('arm+', 'arm-'):
        side = 1 if region == 'arm+' else -1
        # along the arm: armpit -> fingertips; across it: scaled about the arm row
        x0t, x1t = T['pit'][side], T['span'][side]
        x0c, x1c = Cm['pit'][side], Cm['span'][side]
        u = (p.x * side - x0t) / (x1t - x0t)
        x = (x0c + u * (x1c - x0c)) * side
        z = Cm['row'][side][0] + (p.z - T['row'][side][0]) * vk
        y = Cm['row'][side][1] + (p.y - T['row'][side][1]) * vk
        return Vector((x, y, z))
    return Vector((p.x * vk, p.y * vk, p.z * vk))


def centred(p, axis, region_test, half=0.012, depth_only=False):
    """Centre a joint in the character's cross-section across `axis` ('x' slab for arms, 'z' for the rest)."""
    if axis == 'x':
        slab = [q for q in cpts if abs(q.x - p.x) < HEIGHT * half and region_test(q)]
        if len(slab) < 8:
            return p
        return Vector((p.x, median([q.y for q in slab]), median([q.z for q in slab])))
    slab = [q for q in cpts if abs(q.z - p.z) < HEIGHT * half and region_test(q)]
    if len(slab) < 8:
        return p
    y = median([q.y for q in slab])
    if depth_only:
        return Vector((p.x, y, p.z))
    return Vector((median([q.x for q in slab]), y, p.z))


# ---------------------------------------------------------------- fit the skeleton
bpy.context.view_layer.objects.active = arm
for o in bpy.context.selected_objects:
    o.select_set(False)
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
amw = arm.matrix_world.copy()
aim = amw.inverted()
# the template's hair bones go: the character has its own hair, bound to the head
for b in [b for b in eb if not b.name.startswith('mixamorig')]:
    eb.remove(b)
names = [b.name for b in eb]
base = lambda n: n.split(':', 1)[-1]
world_head = {b.name: amw @ b.head for b in eb}
world_tail = {b.name: amw @ b.tail for b in eb}


def region_of(name):
    n = base(name)
    if n.startswith('Left') and ('Arm' in n or 'Hand' in n or n == 'LeftShoulder'):
        return 'arm+' if 'Shoulder' not in n else 'body'
    if n.startswith('Right') and ('Arm' in n or 'Hand' in n or n == 'RightShoulder'):
        return 'arm-' if 'Shoulder' not in n else 'body'
    return 'body'


new_head = {}
for n in names:
    new_head[n] = map_point(world_head[n], region_of(n))
# centre the main joints in the character's own body
leg_band = lambda side: (lambda q: q.x * side > HEIGHT * 0.012 and q.z < Cm['arm_z'] - HEIGHT * 0.2)
torso_band = lambda q: abs(q.x) < min(Cm['pit'][1], Cm['pit'][-1]) * 0.9
for n in names:
    b = base(n)
    p = new_head[n]
    if b in ('LeftForeArm', 'LeftHand', 'RightForeArm', 'RightHand'):
        side = 1 if b.startswith('Left') else -1
        new_head[n] = centred(p, 'x', lambda q, s=side: q.x * s > 0 and abs(q.z - Cm['row'][s][0]) < HEIGHT * 0.09)
    elif b in ('LeftArm', 'RightArm'):
        # the shoulder joint sits inside the torso, where hair and collars crowd the cross-section: it takes
        # the arm's own depth
        side = 1 if b.startswith('Left') else -1
        new_head[n] = Vector((p.x, Cm['row'][side][1], p.z))
    elif b in ('LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'):
        side = 1 if b.startswith('Left') else -1
        c = centred(p, 'z', leg_band(side))
        # cloth (skirts, tabards) pulls the measured centre: halfway to the proportional guess across, and the
        # template's own depth (moved with the hips) front to back
        new_head[n] = Vector(((p.x + c.x) / 2, p.y, p.z))
    elif b in ('Hips', 'Spine', 'Spine1', 'Spine2'):
        new_head[n] = centred(p, 'z', torso_band, depth_only=True)
        new_head[n].x = 0.0
# legs keep the template's depth, moved with the measured hips
hips = next(x for x in names if base(x) == 'Hips')
hips_dy = new_head[hips].y - map_point(world_head[hips], 'body').y
for n in names:
    if base(n) in ('LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'):
        new_head[n].y += hips_dy
# neck and head keep the template's line above the chest (hoods, scarves and ponytails would drag them back)
chest = next(x for x in names if base(x) == 'Spine2')
chest_delta = new_head[chest] - map_point(world_head[chest], 'body')
for n in names:
    if base(n) in ('Neck', 'Head', 'HeadTop_End'):
        new_head[n] = map_point(world_head[n], 'body') + chest_delta
        new_head[n].x = 0.0
# fingers and toes follow their hand or foot (moved with the corrected wrist / ankle)
for n in names:
    b = base(n)
    for parent_part, prefix in (('LeftHand', 'LeftHand'), ('RightHand', 'RightHand'), ('LeftFoot', 'LeftToe'), ('RightFoot', 'RightToe')):
        if b.startswith(prefix) and b != parent_part:
            anchor = next(x for x in names if base(x) == parent_part)
            delta = new_head[anchor] - map_point(world_head[anchor], region_of(anchor))
            new_head[n] = map_point(world_head[n], region_of(n)) + delta
            break
# write heads and tails: a bone's tail meets its (main) child's head; end bones keep their direction
main_child = {}
for b in eb:
    kids = [c for c in b.children]
    if kids:
        # the child closest to the bone's own direction (the spine over the legs, the middle finger in a hand)
        d = (world_tail[b.name] - world_head[b.name]).normalized()
        main_child[b.name] = max(kids, key=lambda c: (world_head[c.name] - world_head[b.name]).normalized().dot(d)).name
for b in eb:
    head = new_head[b.name]
    if b.name in main_child and (new_head[main_child[b.name]] - head).length > 1e-4:
        tail = new_head[main_child[b.name]]
    else:
        tail = head + (map_point(world_tail[b.name], region_of(b.name)) - map_point(world_head[b.name], region_of(b.name)))
    roll = b.roll
    b.use_connect = False
    b.head = aim @ head
    b.tail = aim @ tail
    b.roll = roll
# end bones and the template's leaf bones do not deform
for b in eb:
    if b.name.endswith('_End') or base(b.name)[-1:] == '4':
        b.use_deform = False
bpy.ops.object.mode_set(mode='OBJECT')
report['joints'] = {base(n): [round(c, 4) for c in new_head[n]] for n in names if base(n) in (
    'Hips', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot')}
log('joints', report['joints'])

# ---------------------------------------------------------------- the template body goes; the skin binds
for o in tpl:
    if o.type == 'MESH' and o.name in bpy.data.objects:
        bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.context.selected_objects:
    o.select_set(False)
char.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
deform = {b.name for b in arm.data.bones if b.use_deform}


def bound_split():
    groups = {g.index: g.name for g in char.vertex_groups}
    bound, unbound = [], []
    for v in char.data.vertices:
        total = sum(g.weight for g in v.groups if groups.get(g.group) in deform)
        (bound if total > 1e-4 else unbound).append(v.index)
    return bound, unbound


def geometric_weights():
    """Weights from each vertex's distance to the bones of its own body region (an arm's vertices only see
    that arm, a leg's only that leg), the four nearest blended by inverse distance, then smoothed along the
    mesh's edges. Used when heat weighting cannot solve the mesh (open shells, overlapping cloth)."""
    bones = [b for b in arm.data.bones if b.use_deform]
    seg = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in bones}
    hips_z = (arm.matrix_world @ arm.data.bones[next(n for n in seg if base(n) == 'Hips')].head_local).z
    side_of = lambda n: 1 if base(n).startswith('Left') else -1 if base(n).startswith('Right') else 0
    arm_bones = {s: [n for n in seg if side_of(n) == s and ('Arm' in base(n) or 'Hand' in base(n))] for s in (1, -1)}
    leg_bones = {s: [n for n in seg if side_of(n) == s and ('Leg' in base(n) or 'Foot' in base(n) or 'Toe' in base(n))] for s in (1, -1)}
    core = [n for n in seg if side_of(n) == 0 or 'Shoulder' in base(n)]
    hips_and_thighs = [n for n in seg if base(n) in ('Hips', 'LeftUpLeg', 'RightUpLeg', 'Spine')]

    def dist(p, ab):
        a, b = ab
        d = b - a
        t = max(0.0, min(1.0, (p - a).dot(d) / max(1e-9, d.length_squared)))
        return (p - (a + d * t)).length

    weights = []
    for v in char.data.vertices:
        p = char.matrix_world @ v.co
        side = 1 if p.x >= 0 else -1
        if abs(p.x) > Cm['pit'][side] * 0.9 and abs(p.z - Cm['row'][side][0]) < HEIGHT * 0.14:
            pool = arm_bones[side] + [n for n in core if 'Shoulder' in base(n) and side_of(n) == side]
        elif p.z < hips_z - HEIGHT * 0.03 and abs(p.x) > HEIGHT * 0.025:
            pool = leg_bones[side] + (hips_and_thighs if p.z > hips_z - HEIGHT * 0.12 else [])
        elif p.z < hips_z - HEIGHT * 0.03:
            pool = hips_and_thighs  # cloth hanging between the legs follows the pelvis
        else:
            pool = core
        near = sorted(((dist(p, seg[n]), n) for n in pool))[:4]
        raw = {n: 1.0 / (d ** 4 + (HEIGHT * 0.01) ** 4) for d, n in near}
        total = sum(raw.values())
        weights.append({n: w / total for n, w in raw.items()})
    # smooth across edges (twice), keep the four strongest
    nbrs = [[] for _ in char.data.vertices]
    for e in char.data.edges:
        a, b = e.vertices
        nbrs[a].append(b)
        nbrs[b].append(a)
    for _ in range(2):
        nxt = []
        for i, w in enumerate(weights):
            if not nbrs[i]:
                nxt.append(w)
                continue
            acc = {n: x * 0.5 for n, x in w.items()}
            share = 0.5 / len(nbrs[i])
            for j in nbrs[i]:
                for n, x in weights[j].items():
                    acc[n] = acc.get(n, 0.0) + x * share
            top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]
            s = sum(x for _, x in top)
            nxt.append({n: x / s for n, x in top})
        weights = nxt
    for g in list(char.vertex_groups):
        char.vertex_groups.remove(g)
    vgs = {n: char.vertex_groups.new(name=n) for n in seg}
    for i, w in enumerate(weights):
        for n, x in w.items():
            vgs[n].add([i], x, 'REPLACE')


bound, unbound = bound_split()
report['weights'] = {'heat_bound': len(bound), 'heat_unbound': len(unbound)}
if len(bound) < 0.85 * len(char.data.vertices):
    log('heat weighting bound only', len(bound), 'of', len(char.data.vertices), '- using distance weights')
    geometric_weights()
    report['weights']['method'] = 'distance'
    bound, unbound = bound_split()
else:
    report['weights']['method'] = 'heat'
# fill vertices heat weighting left unbound from their nearest bound neighbour
if unbound and bound:
    tree = KDTree(len(bound))
    for i, idx in enumerate(bound):
        tree.insert(char.data.vertices[idx].co, i)
    tree.balance()
    for idx in unbound:
        _, i, _ = tree.find(char.data.vertices[idx].co)
        src = char.data.vertices[bound[i]]
        for g in src.groups:
            char.vertex_groups[g.group].add([idx], g.weight, 'REPLACE')
report['weights'].update({'filled_from_neighbours': len(unbound), 'bound': len(bound)})
log('weights', report['weights'])

# ---------------------------------------------------------------- previews: the skeleton drawn over the body
def stick(a, b, radius):
    d = b - a
    if d.length < 1e-5:
        return None
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return o


if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    sticks = []
    for b in arm.data.bones:
        if b.use_deform:
            s = stick(arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local, HEIGHT * 0.006)
            if s:
                sticks.append(s)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'OBJECT'
    scene.display.shading.show_xray = True
    scene.display.shading.xray_alpha = 0.55
    for s in sticks:
        s.color = (1, 0.3, 0.1, 1)
    char.color = (0.75, 0.8, 0.9, 1)
    scene.render.resolution_x, scene.render.resolution_y = 560, 640
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = HEIGHT * 1.15
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    centre = Vector((0, 0, HEIGHT / 2))
    for view, direction in (('front', Vector((0, -1, 0))), ('side', Vector((1, 0, 0)))):
        cam.location = centre + direction * 10
        cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f'{os.path.splitext(os.path.basename(OUT))[0]}_{view}.png')
        bpy.ops.render.render(write_still=True)
    for s in sticks:
        bpy.data.objects.remove(s, do_unlink=True)

# ---------------------------------------------------------------- export
for img in bpy.data.images:
    if img.size[0] > MAX_TEX or img.size[1] > MAX_TEX:
        f = MAX_TEX / max(img.size)
        img.scale(int(img.size[0] * f), int(img.size[1] * f))
for o in bpy.context.selected_objects:
    o.select_set(False)
chain = []
p = arm
while p:
    chain.append(p)
    p = p.parent
for o in chain + [char]:
    o.select_set(True)
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_skins=True, export_animations=False,
                          export_morph=False, export_yup=True, export_apply=False, export_image_format='JPEG', export_jpeg_quality=86)
report['output'] = {'file': os.path.basename(OUT), 'bytes': os.path.getsize(OUT)}
with open(os.path.splitext(OUT)[0] + '.rig.json', 'w') as fh:
    json.dump(report, fh, indent=1, default=lambda x: list(x) if hasattr(x, '__iter__') else str(x))
log('wrote', OUT, report['output'])
