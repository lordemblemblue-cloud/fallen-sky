"""Re-rig the Faction 3 mount (the owner's GLB #160, a Tripo auto-rig whose joints sit off the limbs and whose only
clip wiggles the tail) with a clean quadruped skeleton, fresh weights and authored Idle / Walk / Run / Fly clips.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
        --python tools/game3d-mounts/rerig_faction_tiger.py -- <in.glb> <out.glb> [<renders dir>]

What it does:
  1. imports the GLB, remembers which old bone each vertex followed (the old wing and tail groups are good; the
     old leg joints are not), detaches the parts from the Tripo armature and joins them into one mesh;
  2. measures that mesh in world space: floor, height, the four leg columns (clustered from the lower body), the
     torso centreline from the back ridge and the belly, the wings and the tail from the old groups, the head mass;
  3. builds a new armature with the SAME bone names the game already knows (pelvis, spine, chest, neck, head,
     front/hind.L/R.upper/lower/paw, wing.L/R.base/tip, tail.01..06; see factionPetAnimationRigs.mjs profile
     winged_faction_3_160 and the rider seat in player/mountedRiderPose.mjs), with symmetric legs under the body;
  4. weights the mesh itself (Blender's heat solver cannot handle the fifteen overlapping Tripo shells): every
     vertex belongs to a region decided from the same measurements, gets a smooth falloff over that region's bone
     chain, and the groups are smoothed across the mesh so the regions blend;
  5. keys Idle, Walk, Run and Fly as separate loopable actions (30 fps) with world-axis rotations resolved per bone,
     shrinks textures above RERIG_MAX_TEXTURE (default 1024) and exports a GLB with the four animations;
  6. optionally renders preview frames of each clip (Workbench) for review.
The run prints '[rerig] ...' lines with the measurements and a JSON report at the end.
"""
import sys, json, math, os
import bpy
import numpy as np
from mathutils import Vector, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2:
    sys.exit('usage: blender -b --factory-startup --python rerig_faction_tiger.py -- in.glb out.glb [renders_dir]')
SRC, DST = argv[0], argv[1]
RENDERS = argv[2] if len(argv) > 2 else None
FPS = 30
MAX_TEXTURE = int(os.environ.get('RERIG_MAX_TEXTURE', '1024'))
report = {}
def say(*a):
    print('[rerig]', *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
scene.render.fps = FPS
for a in list(bpy.data.actions):  # the Tripo tail-wiggle action targets the old bones
    bpy.data.actions.remove(a)
meshes = [o for o in scene.objects if o.type == 'MESH']
old_arms = [o for o in scene.objects if o.type == 'ARMATURE']
old_arm = old_arms[0] if old_arms else None
say('imported meshes', len(meshes), 'armature', old_arm.name if old_arm else None)

# ------------------------------------------------------------------------------- old labels, detach, join
OLD_NAMES = []
def old_name_index(name):
    if name not in OLD_NAMES:
        OLD_NAMES.append(name)
    return OLD_NAMES.index(name)
for o in meshes:
    names = {g.index: g.name for g in o.vertex_groups}
    attr = o.data.attributes.get('old_bone') or o.data.attributes.new('old_bone', 'INT', 'POINT')
    values = []
    for v in o.data.vertices:
        best, bw = '', 0.0
        for g in v.groups:
            if g.weight > bw:
                bw, best = g.weight, names.get(g.group, '')
        values.append(old_name_index(best))
    attr.data.foreach_set('value', values)
for o in meshes:
    o.select_set(False)
for o in meshes:
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    o.vertex_groups.clear()
    o.select_set(False)
if old_arm:
    bpy.data.objects.remove(old_arm, do_unlink=True)
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = 'Creature_Body'
me = body.data
mw = np.array(body.matrix_world, dtype=np.float64)
coords = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', coords)
X = (np.c_[coords.reshape(-1, 3), np.ones(len(me.vertices))] @ mw.T)[:, :3]
old_idx = np.empty(len(me.vertices), dtype=np.int32); me.attributes['old_bone'].data.foreach_get('value', old_idx)
LABEL = np.array([OLD_NAMES[i] for i in old_idx], dtype=object)
lo, hi = X.min(0), X.max(0)
z0, H = float(lo[2]), float(hi[2] - lo[2])
say('joined vertices', len(X), 'bounds', np.round(lo, 3).tolist(), np.round(hi, 3).tolist(), 'height', round(H, 3))

# ------------------------------------------------------------------------------------------------ measure
starts = lambda prefix: np.array([str(s).startswith(prefix) for s in LABEL])
head_lab, tail_lab = LABEL == 'head', starts('tail.')
# forward: the long axis of the body's footprint (wings and tail excluded), pointing toward the head mass
trunk = X[(X[:, 2] > z0 + 0.25 * H) & ~(starts('wing') | tail_lab)]
cov = np.cov((trunk[:, :2] - trunk[:, :2].mean(0)).T)
evals, evecs = np.linalg.eigh(cov)
d = np.array([evecs[0, -1], evecs[1, -1], 0.0])
if head_lab.sum() > 20 and float((X[head_lab].mean(0) - trunk.mean(0)) @ d) < 0:
    d = -d
# Tripo left the creature yawed in its own frame. Turn the mesh so it faces Blender -Y, which the glTF exporter
# writes as +Z: the direction GameWorld3D steers a mount in (companion group yaw = the rider's yaw).
from mathutils import Matrix
yaw = math.atan2(-d[0], -d[1])  # rotation about Z taking d onto (0, -1, 0)
say('mesh yaw correction (deg)', round(math.degrees(yaw), 1))
body.matrix_world = Matrix.Rotation(yaw, 4, 'Z') @ body.matrix_world
bpy.context.view_layer.update()
mw = np.array(body.matrix_world, dtype=np.float64)
X = (np.c_[coords.reshape(-1, 3), np.ones(len(me.vertices))] @ mw.T)[:, :3]
lo, hi = X.min(0), X.max(0)
z0, H = float(lo[2]), float(hi[2] - lo[2])
d = np.array([0.0, -1.0, 0.0])
FWD = Vector(d.tolist()).normalized()
UP = Vector((0, 0, 1))
LEFT = UP.cross(FWD).normalized()
say('axes fwd', tuple(round(c, 3) for c in FWD), 'left', tuple(round(c, 3) for c in LEFT))
fx = lambda v: float(Vector(v).dot(FWD))
lx = lambda v: float(Vector(v).dot(LEFT))
def point(f, l, z):
    return Vector((0, 0, z)) + FWD * f + LEFT * l
F = X @ np.array(FWD); Lc = X @ np.array(LEFT); Z = X[:, 2]
appendage = starts('wing') | tail_lab
body_mask = (Z > z0 + 0.3 * H) & ~appendage
l_mid = float(np.median(Lc[body_mask]))
W = float(np.ptp(Lc[body_mask]))

# the four leg columns: lower body (ankles to knees) clustered around the quadrants
low_mask = (Z > z0 + 0.02 * H) & (Z < z0 + 0.32 * H) & ~appendage
low = X[low_mask]
lf, ll = low @ np.array(FWD), low @ np.array(LEFT)
f_mid = float(np.median(lf))
centres = np.array([[f_mid + s * 0.2 * H, l_mid + t * 0.15 * H] for s in (1, -1) for t in (1, -1)])
pts = np.c_[lf, ll]
for _ in range(30):
    dist = ((pts[:, None, :] - centres[None, :, :]) ** 2).sum(-1)
    lab = dist.argmin(1)
    for k in range(4):
        if (lab == k).any():
            centres[k] = pts[lab == k].mean(0)
order = sorted(range(4), key=lambda k: -centres[k][0])
front = sorted(order[:2], key=lambda k: -centres[k][1]); hind = sorted(order[2:], key=lambda k: -centres[k][1])
legs_idx = {'front.L': front[0], 'front.R': front[1], 'hind.L': hind[0], 'hind.R': hind[1]}
say('leg columns', {k: np.round(centres[v], 3).tolist() for k, v in legs_idx.items()})
def column_slice(k, z_lo, z_hi):
    sel = (lab == k) & (low[:, 2] > z_lo) & (low[:, 2] < z_hi)
    return pts[sel].mean(0) if sel.sum() >= 8 else centres[k]
legs = {}
for name, k in legs_idx.items():
    paw = column_slice(k, z0, z0 + 0.09 * H)
    knee = column_slice(k, z0 + 0.18 * H, z0 + 0.30 * H)
    legs[name] = {
        'upper': point(knee[0] * 0.6 + centres[k][0] * 0.4, knee[1] * 0.8 + l_mid * 0.2, z0 + 0.52 * H),
        'lower': point(knee[0], knee[1], z0 + 0.25 * H),
        'paw': point(paw[0], paw[1], z0 + 0.04 * H),
    }
for a, b in (('front.L', 'front.R'), ('hind.L', 'hind.R')):  # symmetric legs
    for j in ('upper', 'lower', 'paw'):
        f = (fx(legs[a][j]) + fx(legs[b][j])) / 2
        l = (abs(lx(legs[a][j]) - l_mid) + abs(lx(legs[b][j]) - l_mid)) / 2
        z = (legs[a][j].z + legs[b][j].z) / 2
        legs[a][j] = point(f, l_mid + l, z); legs[b][j] = point(f, l_mid - l, z)
f_hind = fx(legs['hind.L']['upper']); f_front = fx(legs['front.L']['upper'])

def torso_centre_z(f_at):
    slab = body_mask & (np.abs(F - f_at) < 0.06 * H) & (np.abs(Lc - l_mid) < 0.12 * W)
    if slab.sum() < 20:
        return z0 + 0.62 * H
    top = float(np.percentile(Z[slab], 97))
    belly = slab & (Z < top - 0.05 * H)
    bottom = float(np.percentile(Z[belly], 5)) if belly.sum() > 20 else top - 0.35 * H
    return bottom + 0.6 * (top - bottom)
pelvis = point(f_hind + 0.02 * H, l_mid, torso_centre_z(f_hind))
chest = point(f_front - 0.02 * H, l_mid, torso_centre_z(f_front))
spine = (pelvis + chest) / 2
if head_lab.sum() > 20:
    hc = X[head_lab].mean(0)
    head_pt = point(float(hc @ np.array(FWD)), l_mid, float(hc[2]))
else:
    head_pt = chest + FWD * (0.25 * H) + UP * (0.12 * H)
neck = chest * 0.45 + head_pt * 0.55 + UP * (0.02 * H)
head_end = head_pt + FWD * (0.14 * H)
say('spine', [[round(c, 3) for c in v] for v in (pelvis, spine, chest, neck, head_pt)])

# wings: the geometry the old rig skinned to its wing bones, re-anchored on the back
body_half = float(np.percentile(np.abs(Lc[body_mask & (F > f_hind) & (F < f_front)] - l_mid), 90))
wings = {}
for side in ('L', 'R'):
    sel = starts(f'wing.{side}')
    if sel.sum() < 30:
        say('no old wing geometry for side', side)
        continue
    Wv = X[sel]
    sgn = 1.0 if float(np.median(Wv @ np.array(LEFT))) > l_mid else -1.0
    wl = np.abs(Wv @ np.array(LEFT) - l_mid)
    root_pts = Wv[wl < np.percentile(wl, 15)]
    base = Vector(root_pts.mean(0).tolist()); base = point(fx(base), l_mid + sgn * min(float(np.median(wl)), body_half * 0.85), base.z)
    far = Wv[np.argmax(((Wv - np.array(base)) ** 2).sum(1))]
    tip = Vector(far.tolist())
    wings[side] = {'base': base, 'mid': base * 0.5 + tip * 0.5, 'tip': tip, 'verts': int(sel.sum())}
say('wings', {k: {j: [round(c, 3) for c in v] for j, v in w.items() if j != 'verts'} | {'verts': w['verts']} for k, w in wings.items()})

# tail: the old tail groups in order, each joint between neighbouring segments
tail_names = sorted({str(s) for s in LABEL if str(s).startswith('tail.')})
tail = []
if len(tail_names) >= 3:
    cents = [Vector(X[LABEL == n].mean(0).tolist()) for n in tail_names]
    tail.append(cents[0] - (cents[1] - cents[0]) * 0.5)
    for i in range(1, len(cents)):
        tail.append((cents[i - 1] + cents[i]) / 2)
    tail_end = cents[-1] + (cents[-1] - cents[-2]) * 0.5
else:
    tail = [pelvis - FWD * (0.08 + 0.1 * i) * H + UP * (0.02 * i) * H for i in range(6)]
    tail_end = tail[-1] - FWD * 0.1 * H
report['measure'] = {'height': round(H, 3), 'bodyHalfWidth': round(body_half, 3), 'legs': {k: {j: [round(c, 3) for c in v] for j, v in d.items()} for k, d in legs.items()}, 'wings': list(wings), 'tailJoints': len(tail)}

# ------------------------------------------------------------------------------------------------ armature
arm_data = bpy.data.armatures.new('CreatureRig')
arm = bpy.data.objects.new('Creature_Rig', arm_data)
scene.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
def bone(name, head, tail_pt, parent=None, connect=False):
    b = eb.new(name); b.head = head; b.tail = tail_pt
    if parent is not None:
        b.parent = eb[parent]; b.use_connect = connect
    b.use_deform = True
    return b
root_f = (fx(pelvis) + fx(chest)) / 2
root = bone('root', point(root_f, l_mid, z0), point(root_f, l_mid, z0 + 0.06 * H))
bone('pelvis', pelvis, spine, 'root')
bone('spine', spine, chest, 'pelvis', True)
bone('chest', chest, neck, 'spine', True)
bone('neck', neck, head_pt, 'chest', True)
bone('head', head_pt, head_end, 'neck', True)
for name, d in legs.items():
    par = 'chest' if name.startswith('front') else 'pelvis'
    bone(f'{name}.upper', d['upper'], d['lower'], par)
    bone(f'{name}.lower', d['lower'], d['paw'], f'{name}.upper', True)
    bone(f'{name}.paw', d['paw'], d['paw'] + FWD * (0.05 * H), f'{name}.lower', True)
for side, w in wings.items():
    bone(f'wing.{side}.base', w['base'], w['mid'], 'chest')
    bone(f'wing.{side}.tip', w['mid'], w['tip'], f'wing.{side}.base', True)
prev = 'pelvis'
for i, head in enumerate(tail):
    nxt = tail[i + 1] if i + 1 < len(tail) else tail_end
    bone(f'tail.{i + 1:02d}', head, nxt, prev, i > 0)
    prev = f'tail.{i + 1:02d}'
root.use_deform = False
bpy.ops.object.mode_set(mode='OBJECT')
say('bones', len(arm_data.bones))

# ------------------------------------------------------------------------------------------------ weights
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_NAME')  # armature modifier + one empty group per bone
bone_seg = {b.name: (np.array(arm.matrix_world @ b.head_local), np.array(arm.matrix_world @ b.tail_local)) for b in arm_data.bones if b.use_deform}
def seg_distance(names):
    out = np.empty((len(X), len(names)))
    for k, n in enumerate(names):
        a, c = bone_seg[n]; ab = c - a
        t = np.clip(((X - a) @ ab) / max(1e-9, float(ab @ ab)), 0, 1)
        out[:, k] = np.linalg.norm(X - (a + t[:, None] * ab), axis=1)
    return out
def seg_length(n):
    a, c = bone_seg[n]; return float(np.linalg.norm(c - a))
region = np.full(len(X), 'torso', dtype=object)
for side in wings:
    region[starts(f'wing.{side}')] = f'wing.{side}'
region[tail_lab] = 'tail'
for name, d in legs.items():
    axis_f, axis_l = (fx(d['upper']) + fx(d['paw'])) / 2, (lx(d['upper']) + lx(d['paw'])) / 2
    radial = np.hypot(F - axis_f, Lc - axis_l)
    sel = (radial < 0.13 * H) & (Z < d['upper'].z + 0.04 * H) & (region == 'torso')
    region[sel] = name
# Everything below the knees that is not tail or wing is a paw: the wide fur tufts belong to the nearest leg.
low_left = np.where((Z < z0 + 0.3 * H) & (region == 'torso'))[0]
if low_left.size:
    leg_names = list(legs)
    radials = np.stack([np.hypot(F[low_left] - (fx(legs[n]['upper']) + fx(legs[n]['paw'])) / 2, Lc[low_left] - (lx(legs[n]['upper']) + lx(legs[n]['paw'])) / 2) for n in leg_names], axis=1)
    nearest = radials.argmin(1)
    for k, n in enumerate(leg_names):
        region[low_left[nearest == k]] = n
region[(F > fx(neck) - 0.02 * H) & (region == 'torso')] = 'head'
# A small separate shell (a fur tuft, a claw, a buckle) follows the region most of its vertices are in, so it
# cannot be torn between a leg and the torso. The large body shells keep their per-vertex regions.
edges = np.empty(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get('vertices', edges); edges = edges.reshape(-1, 2)
uf = np.arange(len(X))
def find(i):
    while uf[i] != i:
        uf[i] = uf[uf[i]]; i = uf[i]
    return i
for a, b in edges:
    ra, rb = find(int(a)), find(int(b))
    if ra != rb:
        uf[ra] = rb
roots = np.array([find(i) for i in range(len(X))])
island_ids, island_sizes = np.unique(roots, return_counts=True)
moved = 0
for isl, size in zip(island_ids, island_sizes):
    if size >= 0.03 * len(X):
        continue
    idx = np.where(roots == isl)[0]
    regs, counts = np.unique(region[idx], return_counts=True)
    majority = regs[counts.argmax()]
    moved += int((region[idx] != majority).sum())
    region[idx] = majority
say('islands', len(island_ids), 'small-shell vertices re-assigned', moved)
chains = {'torso': ['pelvis', 'spine', 'chest', 'neck'], 'head': ['chest', 'neck', 'head'], 'tail': [n for n in bone_seg if n.startswith('tail.')]}
for side in wings:
    chains[f'wing.{side}'] = ['chest', f'wing.{side}.base', f'wing.{side}.tip']
for name in legs:
    chains[name] = [('chest' if name.startswith('front') else 'pelvis'), f'{name}.upper', f'{name}.lower', f'{name}.paw']
groups = {g.name: g for g in body.vertex_groups}
weights = {n: np.zeros(len(X)) for n in bone_seg}
for reg, names in chains.items():
    idx = np.where(region == reg)[0]
    if not idx.size:
        continue
    names = [n for n in names if n in bone_seg]
    dist = seg_distance(names)[idx]
    sigma = np.array([0.45 * seg_length(n) + 0.03 * H for n in names])
    w = np.exp(-(dist / sigma) ** 2)
    if reg in legs:  # the body bone only near the top of the leg
        w[:, 0] *= np.clip((Z[idx] - (bone_seg[names[1]][0][2] - 0.08 * H)) / (0.12 * H), 0, 1)
    if reg.startswith('wing'):
        w[:, 0] *= 0.35
    w = w / np.maximum(w.sum(1, keepdims=True), 1e-9)
    w[w < 0.03] = 0
    w = w / np.maximum(w.sum(1, keepdims=True), 1e-9)
    for k, n in enumerate(names):
        weights[n][idx] = w[:, k]
for n, w in weights.items():
    g = groups[n]
    for i in np.nonzero(w > 0)[0]:
        g.add([int(i)], float(w[i]), 'REPLACE')
bpy.context.view_layer.objects.active = body
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True)
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.5, repeat=5, expand=0.0)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
counts = {reg: int((region == reg).sum()) for reg in chains}
say('weights by region', counts)
report['weights'] = {'mode': 'regions+smooth', 'vertices': len(me.vertices), 'regions': counts, 'materials': len(body.data.materials)}

# ------------------------------------------------------------------------------------------------ animation
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='POSE')
pb = arm.pose.bones
for p in pb:
    p.rotation_mode = 'QUATERNION'
rest_rot = {p.name: (arm.matrix_world @ p.bone.matrix_local).to_3x3() for p in pb}
def q_about(name, world_axis, angle):
    local_axis = rest_rot[name].inverted() @ Vector(world_axis)
    return Quaternion(local_axis.normalized(), angle)
def set_rot(name, *pairs):
    q = Quaternion((1, 0, 0, 0))
    for world_axis, angle in pairs:
        q = q @ q_about(name, world_axis, angle)
    pb[name].rotation_quaternion = q
def clear_pose():
    for p in pb:
        p.rotation_quaternion = (1, 0, 0, 0); p.location = (0, 0, 0)
def world_tail(name):
    bpy.context.view_layer.update()
    return arm.matrix_world @ pb[name].tail
swing_sign = {}
for name in legs:  # which sign swings this leg's paw forward
    clear_pose(); before = world_tail(f'{name}.lower')
    set_rot(f'{name}.upper', (LEFT, 0.2)); after = world_tail(f'{name}.lower')
    swing_sign[name] = 1.0 if (after - before).dot(FWD) > 0 else -1.0
wing_sign = {}
for side in wings:  # which sign lifts this wing's tip
    clear_pose(); before = world_tail(f'wing.{side}.tip')
    set_rot(f'wing.{side}.base', (FWD, 0.2)); after = world_tail(f'wing.{side}.tip')
    wing_sign[side] = 1.0 if (after - before).dot(UP) > 0 else -1.0
clear_pose()
say('swing signs', swing_sign, 'wing lift signs', wing_sign)
tail_bones = [p.name for p in pb if p.name.startswith('tail.')]
D = math.radians
bob_unit = 0.012 * H
def pelvis_bob(amount):
    pb['pelvis'].location = rest_rot['pelvis'].inverted() @ (UP * amount)

def key_all(frame):
    for p in pb:
        p.keyframe_insert('rotation_quaternion', frame=frame)
    pb['pelvis'].keyframe_insert('location', frame=frame)

def pose_idle(t, T):
    w = 2 * math.pi * t / T
    set_rot('chest', (LEFT, D(1.2) * math.sin(w)))
    set_rot('spine', (LEFT, D(0.8) * math.sin(w + 0.3)))
    set_rot('neck', (LEFT, D(2.0) * math.sin(w * 0.5)), (UP, D(3.0) * math.sin(w / 3)))
    set_rot('head', (UP, D(4.0) * math.sin(w / 3 + 0.4)), (LEFT, D(1.5) * math.sin(w * 0.5)))
    for i, n in enumerate(tail_bones):
        set_rot(n, (UP, D(9.0) * math.sin(w * 1.5 - i * 0.55)), (LEFT, D(3.0) * math.sin(w * 0.75 - i * 0.4)))
    for side in wings:
        set_rot(f'wing.{side}.base', (FWD, wing_sign[side] * D(3.0) * math.sin(w * 1.15)))
        set_rot(f'wing.{side}.tip', (FWD, wing_sign[side] * D(2.0) * math.sin(w * 1.15 - 0.5)))
    pelvis_bob(0.3 * bob_unit * math.sin(w))

def pose_gait(t, T, amp, knee, phases, bob, spine_flex, head_bob):
    w = 2 * math.pi * t / T
    for name, ph in phases.items():
        s = swing_sign[name]
        sw = math.sin(w - ph * 2 * math.pi)
        lift = max(0.0, math.sin(w - ph * 2 * math.pi - 1.1))
        set_rot(f'{name}.upper', (LEFT, s * amp * sw))
        set_rot(f'{name}.lower', (LEFT, -s * (knee * lift + D(4))))
        set_rot(f'{name}.paw', (LEFT, s * (amp * 0.35 * sw - knee * 0.25 * lift)))
    set_rot('spine', (LEFT, spine_flex * math.sin(2 * w)))
    set_rot('chest', (LEFT, spine_flex * 0.6 * math.sin(2 * w + 0.4)))
    set_rot('neck', (LEFT, -head_bob * math.sin(2 * w)))
    set_rot('head', (LEFT, -head_bob * 0.5 * math.sin(2 * w + 0.3)))
    for i, n in enumerate(tail_bones):
        set_rot(n, (UP, D(7.0) * math.sin(w - i * 0.6)), (LEFT, D(4.0) * math.sin(2 * w - i * 0.5)))
    for side in wings:
        set_rot(f'wing.{side}.base', (FWD, wing_sign[side] * D(4.0) * math.sin(2 * w)))
    pelvis_bob(bob * (0.5 - 0.5 * math.cos(2 * w)))

def pose_fly(t, T):
    w = 2 * math.pi * 2 * t / T  # two beats per cycle
    for side in wings:
        s = wing_sign[side]
        set_rot(f'wing.{side}.base', (FWD, s * (D(14) + D(38) * math.sin(w))))
        set_rot(f'wing.{side}.tip', (FWD, s * (D(24) * math.sin(w - 0.6))))
    for name in legs:
        s = swing_sign[name]
        tuck = D(32) * (0.85 + 0.15 * math.sin(w - 0.9))
        set_rot(f'{name}.upper', (LEFT, -s * tuck))
        set_rot(f'{name}.lower', (LEFT, s * tuck * 1.3))
        set_rot(f'{name}.paw', (LEFT, -s * tuck * 0.4))
    set_rot('spine', (LEFT, D(3) * math.sin(w - 0.5)))
    set_rot('chest', (LEFT, D(2) * math.sin(w - 0.2)))
    set_rot('neck', (LEFT, -D(6)))
    set_rot('head', (LEFT, -D(4) + D(2) * math.sin(w)))
    for i, n in enumerate(tail_bones):
        set_rot(n, (LEFT, -D(6) + D(5) * math.sin(w - i * 0.7)), (UP, D(5) * math.sin(w * 0.5 - i * 0.5)))
    pelvis_bob(1.6 * bob_unit * math.sin(w - 0.5))

WALK_PHASES = {'hind.L': 0.0, 'front.L': 0.25, 'hind.R': 0.5, 'front.R': 0.75}
RUN_PHASES = {'front.L': 0.0, 'front.R': 0.1, 'hind.L': 0.5, 'hind.R': 0.6}
ACTIONS = [
    ('Idle', 3.0, lambda t, T: pose_idle(t, T)),
    ('Walk', 1.2, lambda t, T: pose_gait(t, T, D(24), D(26), WALK_PHASES, 1.0 * bob_unit, D(1.5), D(1.5))),
    ('Run', 0.6, lambda t, T: pose_gait(t, T, D(34), D(34), RUN_PHASES, 2.5 * bob_unit, D(7), D(3))),
    ('Fly', 1.0, lambda t, T: pose_fly(t, T)),
]
if not arm.animation_data:
    arm.animation_data_create()
made = []
for name, seconds, fn in ACTIONS:
    action = bpy.data.actions.new(name)
    arm.animation_data.action = action
    frames = int(round(seconds * FPS))
    for f in range(frames + 1):
        t = 0.0 if f == frames else f / FPS  # the last key repeats the first: a seamless loop
        clear_pose(); fn(t, seconds)
        key_all(f + 1)
    action.use_frame_range = True
    action.frame_start = 1; action.frame_end = frames + 1
    made.append((name, frames + 1))
    say('action', name, 'frames', frames + 1)
arm.animation_data.action = None
for name, _ in made:  # every action on its own NLA track so the exporter writes all four
    action = bpy.data.actions[name]
    track = arm.animation_data.nla_tracks.new(); track.name = name
    strip = track.strips.new(name, int(action.frame_range[0]), action)
    if hasattr(strip, 'action_slot') and len(action.slots):
        strip.action_slot = action.slots[0]
clear_pose()
bpy.ops.object.mode_set(mode='OBJECT')
report['actions'] = {n: f for n, f in made}

# ------------------------------------------------------------------------------------------------ export
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); arm.select_set(True)
bpy.context.view_layer.objects.active = arm
os.makedirs(os.path.dirname(os.path.abspath(DST)), exist_ok=True)
for img in bpy.data.images:
    if img.size[0] > MAX_TEXTURE or img.size[1] > MAX_TEXTURE:
        img.scale(min(img.size[0], MAX_TEXTURE), min(img.size[1], MAX_TEXTURE))
bpy.ops.export_scene.gltf(
    filepath=DST, export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_frame_range=False,
    export_nla_strips=True, export_optimize_animation_size=False,
    export_skins=True, export_def_bones=False, export_yup=True, export_apply=False,
    export_image_format='AUTO', export_materials='EXPORT', export_texcoords=True, export_normals=True,
)
report['output'] = {'path': DST, 'bytes': os.path.getsize(DST)}
say('wrote', DST, os.path.getsize(DST), 'bytes')

# ------------------------------------------------------------------------------------------------ previews
if RENDERS:
    os.makedirs(RENDERS, exist_ok=True)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x = 720; scene.render.resolution_y = 540
    world = bpy.data.worlds.new('W'); scene.world = world; world.color = (0.36, 0.39, 0.43)
    cam_data = bpy.data.cameras.new('Cam'); cam_data.lens = 45
    cam = bpy.data.objects.new('Cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
    centre = Vector(((lo + hi) / 2).tolist()); size = float(np.linalg.norm(hi - lo))
    def shoot(name, direction):
        d = Vector(direction).normalized()
        cam.location = centre + d * size * 1.2
        cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(RENDERS, name)
        bpy.ops.render.render(write_still=True)
    for track in arm.animation_data.nla_tracks:
        track.mute = True
    for name, frames in made:
        action = bpy.data.actions[name]
        arm.animation_data.action = action
        if hasattr(arm.animation_data, 'action_slot') and len(action.slots):
            arm.animation_data.action_slot = action.slots[0]
        for k, frac in ((0, 0.0), (1, 0.25), (2, 0.5)):
            scene.frame_set(1 + int(frac * (frames - 1)))
            shoot(f'{name}_{k}_side.png', -LEFT * 1.0 + FWD * 0.35 + UP * 0.25)
        scene.frame_set(1 + int(0.25 * (frames - 1)))
        shoot(f'{name}_front.png', FWD * 1.0 + UP * 0.3 + LEFT * 0.4)
    say('renders in', RENDERS)
print('[rerig-report]', json.dumps(report))
