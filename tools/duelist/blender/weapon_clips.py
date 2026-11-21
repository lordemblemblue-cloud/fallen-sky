# Duelist Adventure: the class weapons' clips, made in Blender from the owner's own clip pack (ActionForge, 80 clips
# on the fused female rig). Twin blades get strikes for the left hand (mirrored), the staff its own chain, and every
# strike is rebuilt at 60 frames a second on a smooth curve (the pack is keyed at 24) and eased into and out of its
# weapon's ready stance, so one link of a chain flows into the next.
#
#   blender -b --factory-startup -P tools/duelist/blender/weapon_clips.py -- <actionforge.glb> <out dir> [options]
#     --sheet a,b,c     render reference frames of source clips (out dir/sheets) and stop
#     --grip <json>     the game's weapon grip in the right hand (from the running game), for the blades in previews
#     --studio <blend>  save the scene (rig, blades, new actions) for hands-on work
#
# Writes <out dir>/class-weapons.anim.glb (the rig and the new clips; tools/duelist/build-motion-pack.mjs puts them on
# the pack's skeleton) and class-weapons.clips.json (each clip's phases: wind-up, contact, follow-through, in seconds).
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


def left_arm_mirrors_right(clip, source=None, delay=0.0, weight=1.0):
    """The left arm does what the right arm does (in `source`, `delay` seconds later), mirrored across the chest."""
    source = source or clip
    n = len(clip['q'])
    rest_chest_inv = rig.rest_inv[CHEST]
    out_q = []
    for f in range(n):
        g = min(max(int(round(f - delay * FPS)), 0), len(source['q']) - 1)
        src_pose = rig.fk(source['q'][g], source['loc'][g])
        dst_pose = rig.fk(clip['q'][f], clip['loc'][f])
        src_chest_inv = src_pose[CHEST].inverted()
        q = [x.copy() for x in clip['q'][f]]
        for i in ARM_L:
            m = rig.mirror[i]
            delta = (src_chest_inv @ src_pose[m]) @ (rest_chest_inv @ rig.rest[m]).inverted()
            target = dst_pose[CHEST] @ SC @ delta @ SC @ (rest_chest_inv @ rig.rest[i])
            p = rig.parent[i]
            rot, _ = rig.local(target, i, dst_pose[p])
            q[i] = q[i].slerp(rot, weight) if weight < 1 else rot
            dst_pose[i] = target if weight >= 1 else rig.fk(q, clip['loc'][f])[i]
        out_q.append(q)
    return {'q': out_q, 'loc': [v.copy() for v in clip['loc']]}


def hold_bones(clip, bones, pose_q, weight=1.0):
    """Those bones keep a pose (weight < 1: lean toward it)."""
    out = [[x.copy() for x in frame] for frame in clip['q']]
    for frame in out:
        for i in bones:
            frame[i] = frame[i].slerp(pose_q[i], weight)
    return {'q': out, 'loc': [v.copy() for v in clip['loc']]}


def smoothstep(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def eased(clip, pose_in=None, pose_out=None, seconds_in=0.06, seconds_out=0.1, loc_in=None, loc_out=None):
    """Start from one stance and end in another: the first and last moments are blended toward them."""
    n = len(clip['q'])
    out_q = [[x.copy() for x in frame] for frame in clip['q']]
    out_loc = [v.copy() for v in clip['loc']]
    for f in range(n):
        if pose_in is not None and seconds_in > 0:
            w = 1 - smoothstep(f / max(1, seconds_in * FPS))
            if w > 0:
                out_q[f] = [a.slerp(b, w) for a, b in zip(out_q[f], pose_in)]
                if loc_in is not None:
                    out_loc[f] = out_loc[f].lerp(loc_in, w)
        if pose_out is not None and seconds_out > 0:
            w = 1 - smoothstep((n - 1 - f) / max(1, seconds_out * FPS))
            if w > 0:
                out_q[f] = [a.slerp(b, w) for a, b in zip(out_q[f], pose_out)]
                if loc_out is not None:
                    out_loc[f] = out_loc[f].lerp(loc_out, w)
    return {'q': out_q, 'loc': out_loc}


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


def write_action(name, clip):
    action = bpy.data.actions.new(name)
    ad.action = action
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    hips = arm.pose.bones[rig.hips]
    for f, (q, loc) in enumerate(zip(clip['q'], clip['loc'])):
        for i, pb in enumerate(arm.pose.bones):
            pb.rotation_quaternion = q[i]
            pb.keyframe_insert('rotation_quaternion', frame=f)
        hips.location = loc
        hips.keyframe_insert('location', frame=f)
    action.use_fake_user = True
    return action


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


STAFF_SHIFT = 0.14  # metres: the right hand holds the staff this far above its middle, the left hand as far below


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
