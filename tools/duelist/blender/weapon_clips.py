# Duelist Adventure: the class weapons' clips, made in Blender from the owner's own clip pack (ActionForge, 80 clips
# on the fused female rig).
#   Twin blades: a strike for the left hand (the sword's, in a mirror) and both blades working together.
#   Staff: a stance and a guard posed here with both hands on the shaft (the pack has no two-handed clips: each arm
#   is solved onto the staff, the wrists kept easy), and the heavy combo's sweeps with one hand, each leaving from
#   the stance and settling back into it.
#   Strikes by direction for every form (the rules' Flow: forward an advance, sideways a wide sweep, back a turn
#   that cuts all round), also from the heavy combo, each leaving from its form's stance and settling back into it.
# Every clip is rebuilt at 60 frames a second on a smooth curve through the pack's keys (the pack is keyed at 24),
# smoothed lightly, and each link of a chain starts from where the one before leaves the body, keeping the speed it
# had (inertial blending).
#
#   blender -b --factory-startup -P tools/duelist/blender/weapon_clips.py -- <actionforge.glb with its meshes> <out dir> [options]
#     --sheet a:12,b:8        pictures of source clips (name:frames) into <out dir>/sheets, then stop
#     --weapon sword|blades|staff   what the body holds in those pictures
#     --pictures a:10/0.6,b   pictures of the new clips with their weapons (name:frames/first seconds)
#     --turn 0.6              the angle those pictures are taken from (radians round the body)
#     --only a,b              build only these clips
#     --tune                  search for staff holds that are easy on the wrists, print the best, then stop
#     --studio <file.blend>   also save the scene (the body, the blades, every new clip on its own track)
#     --info                  what was imported, then stop
#
# Writes <out dir>/class-weapons.anim.glb (the armature and the new clips, plus `__ref` and `__check` for the pack
# builder) and class-weapons.clips.json (what each clip is). Copy both to tools/duelist/source/ and run
# tools/duelist/build-motion-pack.mjs: it puts the clips on the pack's skeleton, checks the round trip, and records
# when the staff's second hand is on the shaft (the game keeps it there on every body: client/secondHand.mjs).
# Strike timings live in src/components/duelist/core/moveMotion.mjs; the builder prints each clip's hand speed peaks.
import bpy, sys, os, json, math
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
opt = lambda name, default=None: argv[argv.index(name) + 1] if name in argv else default
FPS = 60
SRC_FPS = 24

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
skinned = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent is arm]
for o in bpy.data.objects:
    if o.type == 'MESH' and o not in skinned:
        o.hide_render = True  # the importer's bone shape is not for pictures


def seat_on_bones(mesh):
    """The pack's body is stored a quarter turn from its bones (its bind faces the side, and the importer does not
    undo that): turn the mesh so the right hand's vertices sit on the right hand's bone."""
    group = mesh.vertex_groups.get('mixamorig:RightHand')
    if not group:
        return 0
    pts = [v.co.copy() for v in mesh.data.vertices if any(g.group == group.index and g.weight > 0.6 for g in v.groups)]
    if not pts:
        return 0
    centre = sum(pts, Vector()) / len(pts)
    bone = arm.data.bones['mixamorig:RightHand']
    want = (bone.head_local + bone.tail_local) / 2
    best = min((0, 90, 180, 270), key=lambda deg: ((Matrix.Rotation(math.radians(deg), 4, 'Z') @ centre) - want).length)
    if best:
        mesh.data.transform(Matrix.Rotation(math.radians(best), 4, 'Z'), shape_keys=True)  # its shape keys with it
        mesh.data.update()
    return best


turned = {o.name: seat_on_bones(o) for o in skinned}
meshes = [o for o in skinned if not o.name.startswith('Hair')]  # the body and the head
for o in skinned:
    o.hide_render = o not in meshes  # the wig's strands hang from bones the clips do not drive
ad = arm.animation_data or arm.animation_data_create()
for track in list(ad.nla_tracks):
    ad.nla_tracks.remove(track)  # the importer stashes every clip on a track: they would all play at once


# ---------------------------------------------------------------- the rig
class Rig:
    def __init__(self, arm):
        bones = list(arm.data.bones)
        self.names = [b.name for b in bones]
        self.index = {n: i for i, n in enumerate(self.names)}
        self.parent = [self.index[b.parent.name] if b.parent else -1 for b in bones]
        self.rest = [b.matrix_local.copy() for b in bones]
        self.rest_inv = [m.inverted() for m in self.rest]
        self.rel = [(self.rest_inv[p] @ self.rest[i]) if p >= 0 else self.rest[i].copy() for i, p in enumerate(self.parent)]
        self.hips = self.index['mixamorig:Hips']
        swap = lambda n: n.replace('Left', '\0').replace('Right', 'Left').replace('\0', 'Right')
        self.mirror = [self.index.get(swap(n), i) for i, n in enumerate(self.names)]
        # the body's own left-right axis and middle, from the rest pose
        l, r = self.rest[self.index['mixamorig:LeftArm']].translation, self.rest[self.index['mixamorig:RightArm']].translation
        self.side = (r - l).normalized()
        self.middle = (l + r) / 2
        n = self.side
        refl = Matrix(((1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z), (-2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z), (-2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z)))
        self.S = Matrix.Translation(self.middle) @ refl.to_4x4() @ Matrix.Translation(-self.middle)

    def chain(self, root):  # a bone and everything under it
        out = [self.index[root]]
        for i, p in enumerate(self.parent):
            if p in out:
                out.append(i)
        return out

    def fk(self, q, loc):  # one frame's local rotations (and the hips' offset) -> armature-space matrices
        pose = [None] * len(self.names)
        for i, p in enumerate(self.parent):
            basis = q[i].to_matrix().to_4x4()
            if i == self.hips:
                basis = Matrix.Translation(loc) @ basis
            pose[i] = (pose[p] @ self.rel[i] @ basis) if p >= 0 else (self.rest[i] @ basis)
        return pose

    def local(self, pose, i, parent_pose):  # an armature-space matrix back to the bone's own rotation (and offset)
        base = (parent_pose @ self.rel[i]) if self.parent[i] >= 0 else self.rest[i]
        basis = base.inverted() @ pose
        return basis.to_quaternion(), basis.translation.copy()


rig = Rig(arm)
ARM_L = rig.chain('mixamorig:LeftShoulder')
ARM_R = rig.chain('mixamorig:RightShoulder')
CHEST = rig.index['mixamorig:Spine2']


# ---------------------------------------------------------------- clips: { q: [frame][bone] Quaternion, loc: [frame] Vector }
def use(action):
    ad.action = action
    if hasattr(ad, 'action_slot') and ad.action_slot is None and len(action.slots):
        ad.action_slot = action.slots[0]


def keys(name):  # the source clip at its own keys (24 a second)
    action = bpy.data.actions[name]
    use(action)
    last = int(round(action.frame_range[1]))
    q, loc = [], []
    for f in range(0, last + 1):
        scene.frame_set(f)
        q.append([pb.rotation_quaternion.copy() for pb in arm.pose.bones])
        loc.append(arm.pose.bones[rig.hips].location.copy())
    return {'q': q, 'loc': loc}


def continuous(seq):  # the same rotations with no sign flips between neighbours
    out = [seq[0].copy()]
    for s in seq[1:]:
        out.append(-s if out[-1].dot(s) < 0 else s.copy())
    return out


def spline(p0, p1, p2, p3, u):  # Catmull-Rom between p1 and p2
    u2, u3 = u * u, u * u * u
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)


def cut(source, t0, t1, seconds=None):
    """Seconds t0..t1 of a source clip, on a smooth curve through its keys, at FPS; seconds: retimed to last that long."""
    n_src = len(source['q'])
    length = seconds if seconds else (t1 - t0)
    n = max(2, int(round(length * FPS)) + 1)
    bones = len(rig.names)
    tracks = [continuous([source['q'][f][b] for f in range(n_src)]) for b in range(bones)]
    out_q, out_loc = [], []
    for i in range(n):
        t = t0 + (t1 - t0) * i / (n - 1)
        x = min(max(t * SRC_FPS, 0), n_src - 1 - 1e-6)
        k, u = int(x), x - int(x)
        at = lambda j: min(max(j, 0), n_src - 1)
        frame = []
        for b in range(bones):
            tr = tracks[b]
            a, b1, c, d = tr[at(k - 1)], tr[at(k)], tr[at(k + 1)], tr[at(k + 2)]
            v = Quaternion([spline(a[j], b1[j], c[j], d[j], u) for j in range(4)])
            frame.append(v.normalized())
        out_q.append(frame)
        ls = source['loc']
        out_loc.append(Vector([spline(ls[at(k - 1)][j], ls[at(k)][j], ls[at(k + 1)][j], ls[at(k + 2)][j], u) for j in range(3)]))
    return {'q': out_q, 'loc': out_loc}


def mirrored(clip):
    """The whole body the other way round: what the right hand did, the left does."""
    out_q, out_loc = [], []
    for q, loc in zip(clip['q'], clip['loc']):
        pose = rig.fk(q, loc)
        target = [rig.S @ (pose[rig.mirror[i]] @ rig.rest_inv[rig.mirror[i]]) @ rig.S @ rig.rest[i] for i in range(len(pose))]
        fq, floc = [], Vector()
        for i, p in enumerate(rig.parent):
            rot, off = rig.local(target[i], i, target[p] if p >= 0 else None)
            fq.append(rot)
            if i == rig.hips:
                floc = off
        out_q.append(fq)
        out_loc.append(floc)
    return {'q': out_q, 'loc': out_loc}


def chest_space_mirror():
    rest_chest = rig.rest[CHEST]
    n = rest_chest.to_3x3().inverted() @ rig.side
    return Matrix(((1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z), (-2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z), (-2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z))).to_4x4()


SC = chest_space_mirror()


def smoothstep(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def ramp(t0, t1, a=0.0, b=1.0):  # a weight that goes from a to b between two times (seconds into the clip)
    return lambda t: a + (b - a) * smoothstep((t - t0) / max(1e-6, t1 - t0))


def copy_clip(clip):
    return {'q': [[x.copy() for x in f] for f in clip['q']], 'loc': [v.copy() for v in clip['loc']]}


def seconds_of(clip):
    return (len(clip['q']) - 1) / FPS


def frame_at(clip, t):
    return min(max(int(round(t * FPS)), 0), len(clip['q']) - 1)


def part(clip, t0, t1):  # seconds t0..t1 of a clip
    a, b = frame_at(clip, t0), frame_at(clip, t1)
    return {'q': [[x.copy() for x in f] for f in clip['q'][a:b + 1]], 'loc': [v.copy() for v in clip['loc'][a:b + 1]]}


HIPS_REST = rig.rest[rig.hips].to_3x3()
HIPS_REST_INV = HIPS_REST.inverted()


def flat(loc):  # a hips offset without its height
    w = HIPS_REST @ loc
    w.z = 0
    return HIPS_REST_INV @ w


def join(a, b):
    """b after a: b carries on from where a stopped."""
    shift = flat(a['loc'][-1] - b['loc'][0])
    return {'q': [[x.copy() for x in f] for f in a['q']] + [[x.copy() for x in f] for f in b['q'][1:]],
            'loc': [v.copy() for v in a['loc']] + [v + shift for v in b['loc'][1:]]}


def mirror_arm(clip, delay=0.0, weight=1.0, source=None, to='Left'):
    """The left arm does what the right arm does (in `source`, `delay` seconds later), mirrored across the chest.
    weight: how much (a number, or a function of the time in seconds). to='Right': the right arm follows the left."""
    chain = ARM_R if to == 'Right' else ARM_L
    source = source or clip
    rest_chest_inv = rig.rest_inv[CHEST]
    out = copy_clip(clip)
    last = len(source['q']) - 1
    for f, q in enumerate(out['q']):
        w = weight(f / FPS) if callable(weight) else weight
        if w <= 0:
            continue
        g = min(max(f - delay * FPS, 0.0), float(last))
        g0 = int(g)
        g1, u = min(g0 + 1, last), g - int(g)
        sq = [a.slerp(b, u) for a, b in zip(source['q'][g0], source['q'][g1])] if u > 1e-6 else source['q'][g0]
        src_pose = rig.fk(sq, source['loc'][g0])
        dst_pose = rig.fk(q, clip['loc'][f])
        src_chest_inv = src_pose[CHEST].inverted()
        for i in chain:
            m = rig.mirror[i]
            delta = (src_chest_inv @ src_pose[m]) @ (rest_chest_inv @ rig.rest[m]).inverted()
            target = dst_pose[CHEST] @ SC @ delta @ SC @ (rest_chest_inv @ rig.rest[i])
            p = rig.parent[i]
            rot, _ = rig.local(target, i, dst_pose[p])
            if w < 1:
                rot = q[i].slerp(rot, w)
            q[i] = rot
            dst_pose[i] = dst_pose[p] @ rig.rel[i] @ rot.to_matrix().to_4x4()
    return out


def lean(clip, bones, pose_q, weight=1.0):
    """Those bones lean toward a pose (weight: a number, or a function of the time in seconds)."""
    out = copy_clip(clip)
    for f, frame in enumerate(out['q']):
        w = weight(f / FPS) if callable(weight) else weight
        if w > 0:
            for i in bones:
                frame[i] = frame[i].slerp(pose_q[i], min(1.0, w))
    return out


def smoothed(clip, sigma=1.2, loop=False):
    """A light Gaussian in time on every bone: the jitter goes, the timing stays."""
    n = len(clip['q'])
    radius = max(1, int(math.ceil(sigma * 2.5)))
    weights = [math.exp(-0.5 * (k / sigma) ** 2) for k in range(-radius, radius + 1)]
    bones = len(rig.names)
    tracks = [continuous([clip['q'][f][b] for f in range(n)]) for b in range(bones)]
    pick = (lambda f: f % n) if loop else (lambda f: min(max(f, 0), n - 1))
    out_q, out_loc = [], []
    for f in range(n):
        frame = []
        for b in range(bones):
            acc = [0.0, 0.0, 0.0, 0.0]
            ref = tracks[b][f]
            for k, w in zip(range(-radius, radius + 1), weights):
                s = tracks[b][pick(f + k)]
                sign = -1.0 if ref.dot(s) < 0 else 1.0
                for j in range(4):
                    acc[j] += s[j] * w * sign
            frame.append(Quaternion(acc).normalized())
        out_q.append(frame)
        acc = Vector()
        total = 0.0
        for k, w in zip(range(-radius, radius + 1), weights):
            acc += clip['loc'][pick(f + k)] * w
            total += w
        out_loc.append(acc / total)
    return {'q': out_q, 'loc': out_loc}


def pose_of(clip, f=0):
    return [x.copy() for x in clip['q'][f]], clip['loc'][f].copy()


# ---------------------------------------------------------------- blends that keep the body's speed
def fade_curve(x0, v0, seconds):
    """An offset x0 (>= 0, changing by v0 a second) brought to nothing within `seconds`, with no jolt at either end
    (the quintic of inertial blending). Returns x(t)."""
    v0 = min(v0, 0.0)  # an offset that was growing starts from rest instead of overshooting
    T = seconds if v0 == 0 else min(seconds, -5 * x0 / v0)
    T = max(T, 1e-4)
    a0 = (-8 * v0 * T - 20 * x0) / (T * T)
    A = -(a0 * T * T + 6 * v0 * T + 12 * x0) / (2 * T ** 5)
    B = (3 * a0 * T * T + 16 * v0 * T + 30 * x0) / (2 * T ** 4)
    C = -(3 * a0 * T * T + 12 * v0 * T + 20 * x0) / (2 * T ** 3)
    return lambda t: 0.0 if t >= T else ((((A * t + B) * t + C) * t + a0 / 2) * t + v0) * t + x0


def turn_between(q_from, q_to):  # the turn that takes q_to to q_from: its axis and angle (0..pi)
    r = q_from @ q_to.inverted()
    if r.w < 0:
        r = -r
    axis = Vector((r.x, r.y, r.z))
    return (axis.normalized() if axis.length > 1e-9 else Vector((1.0, 0.0, 0.0))), 2 * math.atan2(axis.length, r.w)


def turn_about(q_from, q_to, axis):  # the same turn measured about a given axis
    r = q_from @ q_to.inverted()
    if r.w < 0:
        r = -r
    return 2 * math.atan2(Vector((r.x, r.y, r.z)).dot(axis), r.w)


def offsets(now_q, before_q, target_q, bones, seconds):
    """Per bone: the axis and the curve that fade the difference between a moving pose and a target."""
    out = {}
    for b in bones:
        axis, x0 = turn_between(now_q[b], target_q[b])
        if x0 < 1e-5:
            continue
        v0 = (x0 - turn_about(before_q[b], target_q[b], axis)) * FPS if before_q is not None else 0.0
        out[b] = (axis, fade_curve(x0, v0, seconds))
    return out


def inertial_in(clip, other, t, seconds=0.12, bones=None):
    """Start from where another clip is at time t: the difference fades over `seconds` and the body keeps the speed
    it had (bones: only these; the hips' height comes along when they are among them)."""
    f = frame_at(other, t)
    now_q, before_q = other['q'][f], other['q'][max(0, f - 1)]
    out = copy_clip(clip)
    frames = min(len(out['q']), int(math.ceil(seconds * FPS)) + 1)
    chosen = bones if bones is not None else range(len(rig.names))
    for b, (axis, curve) in offsets(now_q, before_q, clip['q'][0], chosen, seconds).items():
        for k in range(frames):
            x = curve(k / FPS)
            if x:
                out['q'][k][b] = Quaternion(axis, x) @ out['q'][k][b]
    if bones is None or rig.hips in bones:
        d = other['loc'][f] - clip['loc'][0]
        d = d - flat(d)  # the height only: each clip travels from its own start
        if d.length > 1e-7:
            before = other['loc'][max(0, f - 1)] - clip['loc'][0]
            curve = fade_curve(d.length, (d.length - (before - flat(before)).dot(d.normalized())) * FPS, seconds)
            for k in range(frames):
                out['loc'][k] = out['loc'][k] + d.normalized() * curve(k / FPS)
    return out


def settle_to(clip, target_q, target_loc, seconds=0.45):
    """Carry on from the last frame into a held stance, keeping the speed the body had."""
    out = copy_clip(clip)
    fades = offsets(clip['q'][-1], clip['q'][-2], target_q, range(len(rig.names)), seconds)
    here = clip['loc'][-1]
    rest_at = flat(here) + (target_loc - flat(target_loc))  # stays where it stands; only the height settles
    d = here - rest_at
    before = clip['loc'][-2] - rest_at
    curve = fade_curve(d.length, (d.length - before.dot(d.normalized())) * FPS, seconds) if d.length > 1e-7 else None
    for k in range(1, int(round(seconds * FPS)) + 1):
        t = k / FPS
        frame = [x.copy() for x in target_q]
        for b, (axis, c) in fades.items():
            x = c(t)
            if x:
                frame[b] = Quaternion(axis, x) @ frame[b]
        out['q'].append(frame)
        out['loc'].append(rest_at + (d.normalized() * curve(t) if curve else Vector()))
    return out


# ---------------------------------------------------------------- pictures
def facing():
    world = arm.matrix_world.to_3x3()
    side = (world @ rig.side).normalized()
    return Vector((0, 0, 1)).cross(side).normalized(), side


def setup_view():
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('w')
    scene.world.color = (0.16, 0.2, 0.26)
    scene.render.resolution_x, scene.render.resolution_y = 230, 300
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def aim(cam, centre, turn=0.6, height=1.0, span=2.6):
    forward, side = facing()
    unit = scale_of()
    eye = centre + (forward * math.cos(turn) + side * math.sin(turn)) * 6 / unit + Vector((0, 0, height / unit))
    look = centre + Vector((0, 0, height / unit))
    cam.location = eye
    cam.rotation_euler = (look - eye).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = span / unit


_unit = []


def scale_of():  # metres per scene unit: the game makes every body 1.7 m tall (measured once, at rest)
    if not _unit:
        arm.data.pose_position = 'REST'
        bpy.context.view_layer.update()
        top = max((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)
        low = min((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)
        arm.data.pose_position = 'POSE'
        bpy.context.view_layer.update()
        _unit.append(1.7 / max(1e-6, top - low))
    return _unit[0]


def render_frames(tag, action, frames, cam, out_dir, turn=0.6):
    use(action)
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for k, f in enumerate(frames):
        scene.frame_set(int(f), subframe=f - int(f))
        hips_world = arm.matrix_world @ arm.pose.bones[rig.hips].matrix.translation
        aim(cam, Vector((hips_world.x, hips_world.y, 0)), turn=turn)
        scene.render.filepath = os.path.join(out_dir, f'{tag}_{k:02d}.png')
        bpy.ops.render.render(write_still=True)
        paths.append(scene.render.filepath)
    return paths


# ---------------------------------------------------------------- blades in the hands (pictures and the studio file)
GRIP = {'along': 0.8, 'palm': 0.29, 'tilt': (0.309, 0.9511)}  # the game's solved grip, measured in the running game


def hand_frame(pose, side):
    """A hand's own axes from its knuckles (the game solves its grip on the same ones): along the palm, across the
    knuckles from the little finger to the forefinger, and the third."""
    at = lambda part: pose[rig.index[f'mixamorig:{side}{part}']].translation
    wrist, mid, fore, little = at('Hand'), at('HandMiddle1'), at('HandIndex1'), at('HandPinky1')
    x = (mid - wrist).normalized()
    across = fore - little
    y = (across - x * across.dot(x)).normalized()
    return wrist, x, y, x.cross(y), (mid - wrist).length


def grip_matrix(pose, side):
    """Where the game holds a blade in that hand, in armature space: the grip's place, the blade along +Y, the edge +Z."""
    wrist, x, y, z, palm = hand_frame(pose, side)
    sign = 1 if side == 'Right' else -1  # the left hand's grip is the right's in a mirror
    blade = (x * GRIP['tilt'][0] + y * GRIP['tilt'][1]).normalized()
    edge = (x * GRIP['tilt'][1] - y * GRIP['tilt'][0]).normalized()
    m = Matrix((blade.cross(edge), blade, edge)).transposed().to_4x4()
    m.translation = wrist + x * (GRIP['along'] * palm) - z * (GRIP['palm'] * palm * sign)
    return m


def add_blade(name, side, up, down=0.1, color=(0.5, 0.9, 1.0, 1)):
    """A plain blade in a hand, following its bone: `up` metres past the thumb, `down` past the little finger."""
    unit = scale_of()
    w = 0.012 / unit
    lo, hi = -down / unit, up / unit
    verts = [(sx * w, y, sz * w * 2) for y in (lo, hi) for sx in (-1, 1) for sz in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    bone = arm.data.bones[f'mixamorig:{side}Hand']
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone.name
    # a bone's children hang from its tail
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = Matrix.Translation((0, -bone.length, 0)) @ bone.matrix_local.inverted() @ grip_matrix(rig.rest, side)
    return obj


def add_weapon(kind):
    if kind == 'blades':
        return [add_blade('BladeRight', 'Right', 0.78, color=(1.0, 0.81, 0.42, 1)), add_blade('BladeLeft', 'Left', 0.78, color=(1.0, 0.81, 0.42, 1))]
    if kind == 'staff':
        return [add_blade('Staff', 'Right', 1.02 + STAFF_SHIFT, 1.02 - STAFF_SHIFT, color=(0.72, 0.47, 1.0, 1))]
    return [add_blade('Blade', 'Right', 0.98)]


STAFF_SHIFT = STAFF_MIDDLE = 0.19  # metres: the right hand holds the staff this far below its middle (the left hand as far above)


if '--info' in argv:
    print('TURNED', turned, 'shape keys', {o.name: (len(o.data.shape_keys.key_blocks) if o.data.shape_keys else 0) for o in skinned})
    for o in meshes:
        print('MESH', o.name, len(o.data.vertices), [(m.name, getattr(m, 'blend_method', '?')) for m in o.data.materials][:3], 'parent', o.parent.name if o.parent else None,
              'mods', [m.type for m in o.modifiers])
    print('UNIT', scale_of(), 'facing', tuple(round(v, 2) for v in facing()[0]), 'side', tuple(round(v, 2) for v in facing()[1]))
    sys.exit(0)

if '--sheet' in argv:
    cam = setup_view()
    add_weapon(opt('--weapon', 'sword'))
    listing = {}
    for item in opt('--sheet').split(','):
        name, _, n = item.partition(':')
        action = bpy.data.actions[name]
        last = action.frame_range[1]
        count = int(n or opt('--frames', '8'))
        frames = [last * k / (count - 1) for k in range(count)]
        listing[name] = {'seconds': round(last / SRC_FPS, 3), 'times': [round(f / SRC_FPS, 3) for f in frames],
                         'files': render_frames(name, action, frames, cam, os.path.join(OUT, 'sheets'), turn=float(opt('--turn', '0.6')))}
    with open(os.path.join(OUT, 'sheets', 'sheet.json'), 'w') as fh:
        json.dump(listing, fh)
    print('SHEET', json.dumps({k: [v['seconds'], len(v['files'])] for k, v in listing.items()}))
    sys.exit(0)


# ---------------------------------------------------------------- hands on a shaft (the staff's stance and guard)
FORWARD0 = Vector((0, 0, 1)).cross(rig.side).normalized()  # the way the body faces at rest
STAFF_HANDS = 0.38  # metres between the hands along the shaft (the staff's middle is halfway)
STAFF_THUMB = 1  # the left thumb points up the shaft, away from the right hand (the easier hold in both stances)


def swing(m3, direction, toward):  # the smallest turn that takes one direction to another, applied to a 3x3
    return direction.rotation_difference(toward).to_matrix() @ m3


def chest_axes(pose):  # the way the chest faces, its left, and its up
    turn = pose[CHEST].to_3x3() @ rig.rest[CHEST].to_3x3().inverted()
    forward, left = (turn @ FORWARD0).normalized(), (turn @ -rig.side).normalized()
    return forward, left, forward.cross(left)


class Arm:
    def __init__(self, side):
        at = lambda part: rig.index[f'mixamorig:{side}{part}']
        self.upper, self.fore, self.hand = at('Arm'), at('ForeArm'), at('Hand')
        self.len1, self.len2 = rig.rel[self.fore].translation.length, rig.rel[self.hand].translation.length
        self.to_elbow, self.to_wrist = rig.rel[self.fore].translation.normalized(), rig.rel[self.hand].translation.normalized()
        self.grip = rig.rest_inv[self.hand] @ grip_matrix(rig.rest, side)  # the grip in the hand's own space
        self.palm = (rig.rest_inv[self.hand] @ rig.rest[at('HandMiddle1')].translation).normalized()  # along the hand
        self.out = 1 if side == 'Left' else -1
        self.fingers = [i for i in rig.chain(f'mixamorig:{side}Shoulder') if rig.names[i].startswith(f'mixamorig:{side}Hand') and i != self.hand]

    def reach(self, pose, q, wrist, hand3):
        """Upper arm, forearm and hand (armature space) with the wrist at a point and the hand turned as given; the
        elbow bends down and out, as a relaxed arm's does."""
        shoulder = pose[self.upper].translation
        to = wrist - shoulder
        d = min(max(to.length, abs(self.len1 - self.len2) + 1e-4), (self.len1 + self.len2) * 0.999)
        n = to.normalized()
        forward, left, _ = chest_axes(pose)
        want = Vector((0, 0, -1)) * 0.75 + left * (0.5 * self.out) - forward * 0.35
        pole = want - n * want.dot(n)
        pole = pole.normalized() if pole.length > 1e-5 else left * self.out
        c = min(max((self.len1 ** 2 + d * d - self.len2 ** 2) / (2 * self.len1 * d), -1.0), 1.0)
        elbow = shoulder + n * (self.len1 * c) + pole * (self.len1 * math.sqrt(max(0.0, 1 - c * c)))
        up3 = pose[self.upper].to_3x3()
        up3 = swing(up3, (up3 @ self.to_elbow).normalized(), (elbow - shoulder).normalized())
        upper = up3.to_4x4()
        upper.translation = shoulder
        fore = upper @ rig.rel[self.fore] @ q[self.fore].to_matrix().to_4x4()
        f3 = fore.to_3x3()
        f3 = swing(f3, (f3 @ self.to_wrist).normalized(), (shoulder + n * d - fore.translation).normalized())
        lower = f3.to_4x4()
        lower.translation = fore.translation
        hand = hand3.to_4x4()
        hand.translation = (lower @ rig.rel[self.hand]).translation
        return {self.upper: upper, self.fore: lower, self.hand: hand}

    def wrist(self, arm):  # how the wrist is turned: bent (radians, the hard part) and twisted along the forearm
        straight = (arm[self.fore] @ rig.rel[self.hand]).to_3x3()
        d = (straight.inverted() @ arm[self.hand].to_3x3()).to_quaternion()
        twist = 2 * math.atan2(Vector((d.x, d.y, d.z)).dot(self.palm), d.w)
        twist = (twist + math.pi) % (2 * math.pi) - math.pi
        return (d @ Quaternion(self.palm, -twist)).angle, twist

    def hold(self, pose, q, point, axis, near=None):
        """The hand closed on a shaft at a point, its thumb toward `axis`. A grip leaves the hand free to turn about
        the shaft: it takes the turn that is easiest on the wrist (near: the hand a frame earlier, to stay close to).
        Returns the arm, the wrist's bend and twist, and how far the grip misses the point."""
        g3, g_off = self.grip.to_3x3(), self.grip.translation
        start = near if near is not None else pose[self.hand].to_3x3()
        base = swing(start, (start @ g3.col[1]).normalized(), axis)

        def tried(turn):
            hand3 = Matrix.Rotation(turn, 3, axis) @ base
            arm = self.reach(pose, q, point - hand3 @ g_off, hand3)
            bend, twist = self.wrist(arm)
            return bend + 0.3 * abs(twist), turn, arm, bend, twist

        best = min((tried(k * math.pi / 12) for k in range(24)), key=lambda t: t[0]) if near is None else tried(0.0)
        span = math.pi / 24
        while span > 0.01:
            best = min((best, tried(best[1] - span), tried(best[1] + span)), key=lambda t: t[0])
            span /= 2
        _, _, arm, bend, twist = best
        return arm, bend, twist, ((arm[self.hand] @ self.grip).translation - point).length

    def take(self, q, pose, arm):  # the solved arm as the bones' own rotations
        for i in (self.upper, self.fore, self.hand):
            p = rig.parent[i]
            q[i] = rig.local(arm[i], i, arm.get(p, pose[p]))[0]


LEFT, RIGHT = Arm('Left'), Arm('Right')
HAND_MIRROR = rig.rest_inv[LEFT.hand] @ rig.S @ rig.rest[RIGHT.hand]  # the right hand's space seen in the left hand's


def staff_hold(clip, where):
    """Both hands on the staff. where(t): where the right hand's grip is and where the shaft runs to from there, in the
    chest's own frame (metres forward, to the left, up): the left hand closes on it STAFF_HANDS along."""
    unit = scale_of()
    out = copy_clip(clip)
    worst = [0.0, 0.0, 0.0, 0.0]  # the right wrist's bend, the left's, the worst twist, the worst miss (metres)
    last = [None, None]
    for f, q in enumerate(out['q']):
        pose = rig.fk(q, clip['loc'][f])
        forward, left, up = chest_axes(pose)
        place = lambda c: pose[CHEST].translation + (forward * c[0] + left * c[1] + up * c[2]) / unit
        right_at, toward = (place(c) for c in where(f / FPS))
        axis = (toward - right_at).normalized()
        arm, bend_r, twist_r, miss_r = RIGHT.hold(pose, q, right_at, axis, last[0])
        RIGHT.take(q, pose, arm)
        last[0] = arm[RIGHT.hand].to_3x3()
        held = (arm[RIGHT.hand] @ RIGHT.grip).translation  # where the staff really is
        arm, bend_l, twist_l, miss_l = LEFT.hold(pose, q, held + axis * (STAFF_HANDS / unit), axis * STAFF_THUMB, last[1])
        LEFT.take(q, pose, arm)
        last[1] = arm[LEFT.hand].to_3x3()
        from_right = pose[RIGHT.hand].inverted()
        done = dict(arm)
        for i in LEFT.fingers:  # the left fingers close as the right hand's do, in a mirror
            m = rig.mirror[i]
            delta = (from_right @ pose[m]) @ (rig.rest_inv[RIGHT.hand] @ rig.rest[m]).inverted()
            done[i] = arm[LEFT.hand] @ (HAND_MIRROR @ delta @ HAND_MIRROR.inverted()) @ (rig.rest_inv[LEFT.hand] @ rig.rest[i])
            q[i] = rig.local(done[i], i, done[rig.parent[i]])[0]
        worst = [max(worst[0], bend_r), max(worst[1], bend_l), max(worst[2], abs(twist_r), abs(twist_l)), max(worst[3], miss_r * unit, miss_l * unit)]
    print('STAFF HOLD wrists bend up to', round(math.degrees(worst[0])), 'and', round(math.degrees(worst[1])), 'degrees, twist up to',
          round(math.degrees(worst[2])), '; the worst miss', round(worst[3], 3), 'm')
    return out


# the stance: the right hand by the right hip, the staff running forward and up past the left hand (found with --tune:
# the holds below are the easiest on the wrists near the ones in mind)
STANCE = ((0.18, -0.14, -0.16), (0.36, 0.0, 0.12))
# the guard: the staff raised steeply across the body, the left hand high
GUARD = ((0.24, -0.16, -0.11), (0.34, 0.12, 0.36))


def between(a, b, w):  # two holds mixed
    return tuple(tuple(x + (y - x) * w for x, y in zip(p, r)) for p, r in zip(a, b))


# ---------------------------------------------------------------- the clips
def source(name, t0=0.0, t1=None):  # a clip of the pack on a smooth curve at FPS (seconds t0..t1 of it)
    data = keys(name + '_fit')
    return cut(data, t0, (len(data['q']) - 1) / SRC_FPS if t1 is None else t1)


BODY = [i for i, n in enumerate(rig.names) if 'Hair' not in n]
clips, notes = {}, {}


def add(name, clip, note, loop=False, sigma=1.0):
    clips[name] = smoothed(clip, sigma, loop=loop)
    notes[name] = {'seconds': round(seconds_of(clip), 4), 'loop': loop, 'note': note}


def hold_cost(q, loc, where, thumb):
    """How hard a two-handed hold is: the worse wrist's bend plus a share of its twist (radians), and the miss (metres)."""
    unit = scale_of()
    q = [x.copy() for x in q]
    pose = rig.fk(q, loc)
    forward, left, up = chest_axes(pose)
    place = lambda c: pose[CHEST].translation + (forward * c[0] + left * c[1] + up * c[2]) / unit
    right_at, toward = place(where[0]), place(where[1])
    axis = (toward - right_at).normalized()
    arm, bend_r, twist_r, miss_r = RIGHT.hold(pose, q, right_at, axis)
    held = (arm[RIGHT.hand] @ RIGHT.grip).translation
    _, bend_l, twist_l, miss_l = LEFT.hold(pose, q, held + axis * (STAFF_HANDS / unit), axis * thumb)
    return max(bend_r + 0.3 * abs(twist_r), bend_l + 0.3 * abs(twist_l)), max(miss_r, miss_l) * unit, (bend_r, twist_r, bend_l, twist_l)


if '--tune' in argv:  # look for easy holds near the ones in mind: prints the best few for the stance and the guard
    grid = lambda a, b, n: [a + (b - a) * k / (n - 1) for k in range(n)]
    idle_q, idle_loc = pose_of(source('sword_idle'), 0)
    block_clip = source('sword_block')
    block_q, block_loc = pose_of(block_clip, frame_at(block_clip, 0.4))
    for label, q, loc, rights, lefts in (
        ('STANCE', idle_q, idle_loc, [(f, s, u) for f in grid(0.18, 0.3, 3) for s in grid(-0.2, -0.08, 3) for u in grid(-0.32, -0.16, 3)],
         [(f, s, u) for f in grid(0.2, 0.36, 3) for s in grid(0.0, 0.2, 3) for u in grid(-0.1, 0.12, 3)]),
        ('GUARD', block_q, block_loc, [(f, s, u) for f in grid(0.24, 0.4, 3) for s in grid(-0.16, 0.0, 3) for u in grid(-0.22, 0.0, 3)],
         [(f, s, u) for f in grid(0.26, 0.5, 4) for s in grid(0.0, 0.24, 3) for u in grid(0.0, 0.36, 4)]),
    ):
        found = []
        for r in rights:
            for l in lefts:
                for thumb in (1, -1):
                    cost, miss, detail = hold_cost(q, loc, (r, l), thumb)
                    if miss < 0.005:
                        found.append((cost, thumb, tuple(round(v, 2) for v in r), tuple(round(v, 2) for v in l), tuple(round(math.degrees(v)) for v in detail)))
        found.sort()
        for thumb in (1, -1):
            print('TUNE', label, 'thumb', thumb, 'of', len(found), [(round(b[0], 2), b[2], b[3], b[4]) for b in [x for x in found if x[1] == thumb][:5]])
    sys.exit(0)


# the sword's cuts by direction (eight points round the body, three modes): made from the stance alone
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(sys.argv[sys.argv.index('-P') + 1])), 'cut_grid.py')).read(), 'cut_grid.py', 'exec'), globals())
# the taunts, the Rage's roar, the Execution and Mind Dominance: posed key by key on each weapon's stance
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(sys.argv[sys.argv.index('-P') + 1])), 'moments.py')).read(), 'moments.py', 'exec'), globals())


def build():
    if '--moments-only' in argv:  # a quick look at the moments alone (not for the pack: the other clips are left out)
        plain = source('sword_idle')
        twin, staff = mirror_arm(plain), staff_hold(plain, lambda t: STANCE)
        build_moments(add, notes, plain, twin, staff, (opt('--only') or '').split(',') if opt('--only') else None)
        return
    if '--cuts-only' in argv:  # a quick look at the cuts alone (not for the pack: the other clips are left out)
        chosen = (opt('--only') or '').split(',') if opt('--only') else None
        plain = source('sword_idle')
        build_cuts(add, notes, plain, chosen)
        twin, staff = mirror_arm(plain), staff_hold(plain, lambda t: STANCE)
        build_form_cuts(add, notes, twin, staff, chosen)
        build_extras(add, notes, plain, twin, staff, chosen)
        build_spins(add, notes, plain, chosen)
        return
    slash, slash_back = source('sword_regular_a', 0.05), source('sword_regular_a_rec')
    lunge, lunge_back = source('sword_regular_b'), source('sword_regular_b_rec')
    spin, chop, block, idle = source('sword_regular_c'), source('sword_attack'), source('sword_block'), source('sword_idle')
    combo = source('sword_heavy_combo', 0, 3.0)

    # ---- twin blades: the left arm is the right arm in a mirror wherever both blades work together
    ready_q, ready_loc = pose_of(mirror_arm(part(block, 0, 0.02)), 0)  # standing, a blade either side
    add('bladesIdle', mirror_arm(idle), 'the sword stance, a blade low at either side', loop=True, sigma=1.5)
    add('bladesGuard', mirror_arm(block), 'the sword block with both blades', sigma=1.2)
    rise = join(slash, slash_back)
    to_guard = lambda t: 0.75 + 0.25 * smoothstep((t - 0.6) / 0.6)
    # 1: the left blade's rising slash (the sword's, in a mirror); the right blade keeps the guard
    first = lean(mirrored(rise), ARM_R, ready_q, to_guard)
    add('bladesA', first, 'left rising slash (the sword slash in a mirror), contact about 0.19 s')
    # 2: the right blade's rising slash; the left comes back from its cut
    body = [i for i in range(len(rig.names)) if i not in ARM_L]
    second = lean(rise, ARM_L, ready_q, to_guard)
    second = inertial_in(inertial_in(second, first, 0.26, 0.10, body), first, 0.26, 0.26, ARM_L)
    add('bladesB', second, 'right rising slash, contact about 0.19 s')
    # 3: the right blade cuts down into a lunge; the left trails, then comes back to the guard
    low = lean(join(lunge, lunge_back), ARM_L, ready_q, ramp(0.75, 1.3))
    low = inertial_in(low, second, 0.30, 0.22, ARM_L)
    add('bladesC', low, 'right cut down into a lunge, contact about 0.27 s')
    # 4: out of the lunge into a turn in the air, a blade out either side
    whirl = inertial_in(mirror_arm(spin, delay=0.04), low, 0.40, 0.2, ARM_L)
    add('bladesD', whirl, 'turn in the air with both blades out, contact about 0.64 s')
    # heavy: both blades chop down, the left a beat after the right
    add('bladesHeavy', mirror_arm(chop, delay=0.1), 'both blades chop down, the right about 0.39 s, the left 0.1 s later')

    # ---- the staff: a stance and a guard with both hands on it (posed here: the pack has no two-handed clips), and
    # the heavy combo's sweeps with one hand, each leaving from the stance and settling back into it
    stance = staff_hold(idle, lambda t: STANCE)
    stance_q, stance_loc = pose_of(stance, 0)
    add('staffIdle', stance, 'the sword stance, the staff held low in both hands and pointing ahead', loop=True, sigma=1.5)
    raised = lambda t: smoothstep(t / 0.2) * (1 - smoothstep((t - 0.85) / 0.3))
    add('staffGuard', staff_hold(block, lambda t: between(STANCE, GUARD, raised(t))), 'the staff raised steeply across the body in both hands', sigma=1.2)
    sweep = inertial_in(part(combo, 0.08, 0.62), stance, 0, 0.14, ARM_L + ARM_R)
    add('staffA', settle_to(sweep, stance_q, stance_loc), 'level sweep into a low lunge, contact about 0.32 s')
    add('staffB', settle_to(part(combo, 0.55, 1.0), stance_q, stance_loc), 'turning backhand sweep, contact from 0.1 to 0.3 s')
    add('staffC', settle_to(part(combo, 1.0, 1.42), stance_q, stance_loc), 'rising diagonal sweep, contact about 0.17 s')
    add('staffHeavy', settle_to(part(spin, 0, 1.3), stance_q, stance_loc, 0.6), 'turn in the air with the staff level: both ends pass, then the landing cut (0.3 to 0.7 s)')

    # ---- strikes by direction, from the heavy combo: forward an advance, sideways a wide sweep, back a turn that
    # cuts all round. Any of them may open a chain or follow any other strike, so each leaves from its weapon's
    # stance and settles back into it.
    def directional(t0, t1, leave, to_q, to_loc, shape=lambda c: c):
        return settle_to(inertial_in(shape(part(combo, t0, t1)), leave, 0, 0.2), to_q, to_loc)  # a wind-up, not a snap

    one_q, one_loc = pose_of(combo, 0)
    ready1 = part(block, 0, 0.05)  # the sword's standing ready
    add('swordAdvance', directional(0.08, 0.62, ready1, one_q, one_loc), 'level sweep driving forward into a low lunge, contact about 0.32 s')
    add('swordTurn', directional(0.55, 1.0, ready1, one_q, one_loc), 'turning backhand cut, all round, contact from 0.1 to 0.3 s')
    add('swordSweep', directional(1.40, 2.05, ready1, one_q, one_loc), 'wide swing from behind the shoulders, contact about 0.41 s')
    ready2 = mirror_arm(part(block, 0, 0.05))
    twin = lambda delay: (lambda c: mirror_arm(c, delay=delay))
    add('bladesAdvance', directional(0.08, 0.62, ready2, ready_q, ready_loc, twin(0.05)), 'both blades sweep level, driving forward, contact about 0.32 s')
    add('bladesTurn', directional(0.55, 1.0, ready2, ready_q, ready_loc, twin(0.0)), 'a turn with a blade out either side, all round, contact from 0.1 to 0.3 s')
    add('bladesSweep', directional(1.40, 2.05, ready2, ready_q, ready_loc, twin(0.06)), 'both blades swing wide, the left behind the right, contact about 0.41 s')
    add('staffLeap', directional(2.15, 2.95, stance, stance_q, stance_loc), 'a leap and an overhead chop, contact about 0.41 s')
    add('staffSweep', directional(1.40, 2.05, stance, stance_q, stance_loc), 'wide swing from behind the shoulders, contact about 0.41 s')

    build_cuts(add, notes, idle)
    build_form_cuts(add, notes, clips['bladesIdle'], clips['staffIdle'])
    build_extras(add, notes, idle, clips['bladesIdle'], clips['staffIdle'])
    build_spins(add, notes, idle)
    build_moments(add, notes, idle, clips['bladesIdle'], clips['staffIdle'])

    # for the pack builder: a known frame of the pack (it lines the two skeletons up on it) and a known clip (its check)
    ref = keys('sword_idle_fit')
    clips['__ref'] = {'q': [ref['q'][0], ref['q'][0]], 'loc': [ref['loc'][0], ref['loc'][0]]}
    clips['__check'] = source('sword_regular_a')


def write_action(name, clip):
    """The clip as an action on the armature (the body's bones: the wig's are left alone)."""
    action = bpy.data.actions.new(name)
    ad.action = action
    n = len(clip['q'])
    times = [float(f) for f in range(n)]

    def curve(path, index, values, group):
        fc = action.fcurve_ensure_for_datablock(arm, path, index=index, group_name=group)
        fc.keyframe_points.add(n)
        co = [0.0] * (2 * n)
        co[0::2] = times
        co[1::2] = values
        fc.keyframe_points.foreach_set('co', co)
        fc.update()

    for i in BODY:
        bone = rig.names[i]
        track = continuous([clip['q'][f][i] for f in range(n)])
        for c in range(4):
            curve(f'pose.bones["{bone}"].rotation_quaternion', c, [q[c] for q in track], bone)
    for c in range(3):
        curve(f'pose.bones["{rig.names[rig.hips]}"].location', c, [v[c] for v in clip['loc']], rig.names[rig.hips])
    action.use_fake_user = True
    return action


def at_rest():
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)


build()
only = opt('--only')
names = [n for n in clips if not only or n in only.split(',') or n.startswith('__')]
scene.render.fps = FPS
at_rest()
actions = {name: write_action(name, clips[name]) for name in names}
print('BUILT', json.dumps({n: notes[n]['seconds'] for n in names if n in notes}))

if '--pictures' in argv:  # the new clips with their weapons, for a look before they go to the game
    cam = setup_view()
    weapons = {'blades': add_weapon('blades'), 'staff': add_weapon('staff'), 'sword': add_weapon('sword')}
    listing = {}
    for item in opt('--pictures').split(','):
        name, _, n = item.partition(':')
        count, _, until = n.partition('/')  # name:frames/seconds (seconds: only the start of the clip)
        for kind, objs in weapons.items():
            for o in objs:
                o.hide_render = not name.startswith(kind)
        last = len(clips[name]['q']) - 1
        if until:
            last = min(last, float(until) * FPS)
        frames = [last * k / (int(count or 10) - 1) for k in range(int(count or 10))]
        listing[name] = {'seconds': notes[name]['seconds'], 'times': [round(f / FPS, 3) for f in frames],
                         'files': render_frames(name, actions[name], frames, cam, os.path.join(OUT, 'sheets'), turn=float(opt('--turn', '0.6')))}
    with open(os.path.join(OUT, 'sheets', 'sheet.json'), 'w') as fh:
        json.dump(listing, fh)
    # all of them on one sheet, a row a clip
    print('CONTACT', contact_sheet([v['files'] for v in listing.values()], os.path.join(OUT, 'sheets', 'contact.png')))

# the armature and the new clips, one animation a track, for the pack builder
for track in list(ad.nla_tracks):
    ad.nla_tracks.remove(track)
ad.action = None
for name in names:
    track = ad.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 0, actions[name])
    if getattr(strip, 'action_slot', None) is None and len(actions[name].slots):
        strip.action_slot = actions[name].slots[0]
for old in [a for a in bpy.data.actions if a.name not in actions]:
    bpy.data.actions.remove(old)
at_rest()
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
os.makedirs(OUT, exist_ok=True)
glb = os.path.join(OUT, 'class-weapons.anim.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True, export_optimize_animation_size=True, export_anim_slide_to_zero=False, export_yup=True)
with open(os.path.join(OUT, 'class-weapons.clips.json'), 'w') as fh:
    json.dump({'fps': FPS, 'source': os.path.basename(SRC), 'clips': {n: notes[n] for n in names if n in notes}}, fh, indent=1)
print('EXPORTED', glb, os.path.getsize(glb))
if opt('--studio'):  # the scene for hands-on work: the body, the blades, every new clip on its own track
    bpy.ops.wm.save_as_mainfile(filepath=opt('--studio'))
    print('STUDIO', opt('--studio'))
