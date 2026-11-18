"""Author the dodge moves (side flips, back flip, front roll) on a fused rig.

Run headless (never touches an open Blender session):
  blender -b tools/avatar-fuse/build/Female_Fused_v1.blend -P tools/avatar-motion/author-dodges.py -- \
      public/models/animations/dodges/dodges.glb [--preview DIR]

The .blend is the editable build of tools/avatar-fuse/fuse.py (run that first if it is missing).
Output: a small GLB holding the rig (Mixamo bone names) with four clips:
  Flip_Left, Flip_Right   aerial side flip toward the character's left / right
  Back_Flip               tucked back flip
  Front_Roll              diving forward roll along the ground
Clips are in place horizontally (the game moves the character along the dodge
direction); the hips carry the jump arc. The game retargets them onto any body
by world-space rotation (src/components/onboarding/retargetAvatarClip.js), so
the fused bodies and the v5 Artemis / Getsuga rigs all play the same moves.

Poses are authored, not captured: every limb is aimed at a direction in the
body's frame (forward f, outward l, up u), the spine and head bend about the
body axes, and the whole body spins about a pivot near the navel. A ground
solver keeps the lowest body part on the floor for grounded keys (feet in a
crouch, the back in the roll) and never lets anything pass through the floor.
A captured take with the same clip name can replace any clip later (tools/mocap).
"""
import bpy, sys, os, math, json
from mathutils import Vector, Quaternion, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'dodges.glb'
PREVIEW = argv[argv.index('--preview') + 1] if '--preview' in argv else None
FPS = 30

arms = [o for o in bpy.data.objects if o.type == 'ARMATURE' and 'mixamorig:Hips' in o.data.bones]
arm = next((o for o in arms if o.name == 'Armature'), arms[0])
B = arm.data.bones
P = arm.pose.bones
N = lambda s: 'mixamorig:' + s
REST = {b.name: b.matrix_local.copy() for b in B}
head_of = lambda s: REST[N(s)].translation.copy()
tail_of = lambda s: REST[N(s)] @ Vector((0, B[N(s)].length, 0))

# ---------------------------------------------------------------- body frame (armature space)
L = (head_of('LeftArm') - head_of('RightArm')).normalized()
U = (head_of('Head') - head_of('Hips'))
U = (U - L * U.dot(L)).normalized()
F = L.cross(U).normalized()
HIPS = head_of('Hips')
ANKLE = (head_of('LeftFoot') + head_of('RightFoot')) / 2
HH = (HIPS - ANKLE).dot(U)  # hip height above the ankles

body_mesh = next((o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers)
                  and not o.name.startswith('Hair_')), None)
to_arm = arm.matrix_world.inverted()
if body_mesh is not None:
    FLOOR = min((to_arm @ (body_mesh.matrix_world @ v.co)).dot(U) for v in body_mesh.data.vertices)
else:
    FLOOR = ANKLE.dot(U) - 0.12 * HH


def body(v):
    """(f, l, u) in the body frame -> armature-space vector."""
    return F * v[0] + L * v[1] + U * v[2]


def rest_dir(name):
    return (REST[N(name)].to_3x3() @ Vector((0, 1, 0))).normalized()


def swing(name, d, side):
    """Rotation turning the bone's rest direction to body-frame direction d (l outward, mirrored on the right)."""
    f, l, u = d
    return rest_dir(name).rotation_difference(body((f, l * side, u)).normalized())


def axis_rot(axis, deg):
    return Quaternion(axis, math.radians(deg))


# ---------------------------------------------------------------- poses (limb aim directions, l = outward)
POSES = {
    'neutral': dict(arm=(0.05, 0.32, -1), fore=(0.22, 0.12, -1), thigh=(0.0, 0.05, -1), shin=(0.0, 0.02, -1), spine=4, neck=0, head=0),
    'crouch': dict(arm=(-0.45, 0.35, -0.85), fore=(-0.15, 0.2, -1), thigh=(0.62, 0.12, -0.78), shin=(-0.62, 0.05, -0.78), spine=26, neck=-6, head=-4),
    'takeoff': dict(arm=(0.35, 0.42, 0.85), fore=(0.45, 0.2, 0.85), thigh=(0.05, 0.08, -1), shin=(0.0, 0.04, -1), spine=-4, neck=-4, head=-6),
    'tuck': dict(arm=(0.82, 0.22, -0.42), fore=(0.38, -0.12, -0.9), thigh=(0.94, 0.14, 0.32), shin=(-0.38, 0.06, -0.92), spine=38, neck=16, head=10),
    # side-flip air pose: arms folded in front of the chest, knees up and slightly split
    'tuck_side': dict(arm=(0.55, 0.3, -0.3), fore=(0.4, -0.8, 0.35), thigh=(0.8, 0.3, 0.2), shin=(-0.3, 0.12, -0.95), spine=24, neck=10, head=6),
    'open': dict(arm=(0.25, 0.75, -0.15), fore=(0.35, 0.7, -0.05), thigh=(0.2, 0.12, -0.95), shin=(-0.1, 0.06, -1), spine=12, neck=0, head=-4),
    'land': dict(arm=(0.35, 0.72, -0.35), fore=(0.45, 0.62, -0.25), thigh=(0.55, 0.14, -0.82), shin=(-0.55, 0.07, -0.82), spine=22, neck=-8, head=-6),
    'reach': dict(arm=(0.9, 0.25, -0.35), fore=(0.75, 0.12, -0.65), thigh=(0.7, 0.12, -0.7), shin=(-0.7, 0.06, -0.7), spine=50, neck=8, head=-6),
}

# keys: (t, pose, spin fraction, floor clearance of the lowest body part in HH, side lean deg).
# Clearance 0 = touching the floor (feet in a crouch, the back in the roll); airborne keys set the jump height.
CLIPS = {
    'Flip_Left': dict(dur=0.62, axis='F', sign=-1, keys=[
        (0.00, 'neutral', 0.00, 0.00, 0), (0.14, 'crouch', 0.00, 0.00, -12), (0.26, 'takeoff', 0.10, 0.04, -10),
        (0.40, 'tuck_side', 0.40, 0.45, 0), (0.55, 'tuck_side', 0.72, 0.42, 0), (0.70, 'open', 0.96, 0.10, 6),
        (0.82, 'land', 1.00, 0.00, 8), (1.00, 'neutral', 1.00, 0.00, 0)]),
    'Back_Flip': dict(dur=0.72, axis='L', sign=-1, keys=[
        (0.00, 'neutral', 0.00, 0.00, 0), (0.15, 'crouch', 0.00, 0.00, 0), (0.27, 'takeoff', 0.10, 0.05, 0),
        (0.42, 'tuck', 0.42, 0.62, 0), (0.57, 'tuck', 0.74, 0.54, 0), (0.71, 'open', 0.96, 0.12, 0),
        (0.83, 'land', 1.00, 0.00, 0), (1.00, 'neutral', 1.00, 0.00, 0)]),
    'Front_Roll': dict(dur=0.70, axis='L', sign=1, keys=[
        (0.00, 'neutral', 0.00, 0.00, 0), (0.17, 'reach', 0.06, 0.00, 0), (0.32, 'tuck', 0.28, 0.00, 0),
        (0.47, 'tuck', 0.54, 0.00, 0), (0.62, 'tuck', 0.80, 0.00, 0), (0.77, 'crouch', 0.99, 0.00, 0),
        (1.00, 'neutral', 1.00, 0.00, 0)]),
}
CLIPS['Flip_Right'] = dict(CLIPS['Flip_Left'], sign=1, keys=[(t, p, r, h, -lean) for t, p, r, h, lean in CLIPS['Flip_Left']['keys']])


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def cubic(vals, times, t):
    """Monotone cubic (Fritsch-Carlson) through the keys: smooth spin and arc, never reversing between keys."""
    if t <= times[0]:
        return vals[0]
    if t >= times[-1]:
        return vals[-1]
    i = max(k for k in range(len(times) - 1) if times[k] <= t)
    t0, t1 = times[i], times[i + 1]
    h = t1 - t0
    u = (t - t0) / h
    p0, p1 = vals[i], vals[i + 1]
    d = (p1 - p0) / h
    dl = (vals[i] - vals[i - 1]) / (times[i] - times[i - 1]) if i > 0 else d
    dr = (vals[i + 2] - vals[i + 1]) / (times[i + 2] - times[i + 1]) if i + 2 < len(times) else d
    m0 = 0.0 if dl * d <= 0 else 2 / (1 / dl + 1 / d)
    m1 = 0.0 if dr * d <= 0 else 2 / (1 / dr + 1 / d)
    u2, u3 = u * u, u * u * u
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * m1


def blend_pose(keys, t):
    times = [k[0] for k in keys]
    i = max(k for k in range(len(keys) - 1) if times[k] <= t) if t < times[-1] else len(keys) - 2
    a, b = POSES[keys[i][1]], POSES[keys[i + 1][1]]
    u = smooth((t - times[i]) / max(1e-6, times[i + 1] - times[i]))
    out = {}
    for k in a:
        if isinstance(a[k], tuple):
            va, vb = Vector(a[k]).normalized(), Vector(b[k]).normalized()
            out[k] = tuple(va.slerp(vb, u, va.lerp(vb, u)).normalized())
        else:
            out[k] = a[k] + (b[k] - a[k]) * u
    return out


ORDER = []
def walk(b):
    ORDER.append(b.name)
    for c in b.children:
        walk(c)
walk(B['mixamorig:Hips'])
PIVOT = HIPS + F * (0.18 * HH) + U * (0.22 * HH)  # near the navel: flips spin about the centre of mass

# contact points: (bone, end, skin radius). Foot radii come from the rest pose so a standing body touches the floor.
up = lambda v: v.dot(U)
CONTACTS = []
for side in ('Left', 'Right'):
    CONTACTS += [(side + 'Foot', 'head', up(head_of(side + 'Foot')) - FLOOR),
                 (side + 'ToeBase', 'tail', max(0.005 * HH, up(tail_of(side + 'ToeBase')) - FLOOR)),
                 (side + 'ToeBase', 'head', max(0.01 * HH, up(head_of(side + 'ToeBase')) - FLOOR)),
                 (side + 'Leg', 'head', 0.06 * HH), (side + 'Arm', 'head', 0.07 * HH),
                 (side + 'ForeArm', 'head', 0.045 * HH), (side + 'Hand', 'head', 0.04 * HH)]
CONTACTS += [('Hips', 'head', 0.16 * HH), ('Spine2', 'head', 0.15 * HH), ('Neck', 'head', 0.07 * HH),
             ('Head', 'head', 0.12 * HH), ('Head', 'tail', 0.03 * HH)]


def solve_rotations(clip, t):
    keys = clip['keys']
    times = [k[0] for k in keys]
    frac = cubic([k[2] for k in keys], times, t)
    clear = max(0.0, cubic([k[3] for k in keys], times, t))
    lean = cubic([k[4] for k in keys], times, t)
    pose = blend_pose(keys, t)
    axis = {'F': F, 'L': L}[clip['axis']]
    Qb = Quaternion(axis, clip['sign'] * frac * 2 * math.pi) @ Quaternion(F, math.radians(lean))
    bend = pose['spine']
    chest = Qb @ axis_rot(L, bend)
    want = {
        'Hips': Qb,
        'Spine': Qb @ axis_rot(L, bend / 3),
        'Spine1': Qb @ axis_rot(L, bend * 2 / 3),
        'Spine2': chest,
        'Neck': chest @ axis_rot(L, pose['neck']),
        'Head': chest @ axis_rot(L, pose['neck'] + pose['head']),
        'LeftShoulder': chest, 'RightShoulder': chest,
    }
    for side, s in (('Left', 1), ('Right', -1)):
        want[side + 'Arm'] = chest @ swing(side + 'Arm', pose['arm'], s)
        want[side + 'ForeArm'] = chest @ swing(side + 'ForeArm', pose['fore'], s)
        want[side + 'Hand'] = want[side + 'ForeArm']
        want[side + 'UpLeg'] = Qb @ swing(side + 'UpLeg', pose['thigh'], s)
        want[side + 'Leg'] = Qb @ swing(side + 'Leg', pose['shin'], s)
        want[side + 'Foot'] = want[side + 'Leg']
    hips = PIVOT + Qb @ (HIPS - PIVOT)
    return want, hips, clear


def fk(want, hips_pos):
    poseM, bases = {}, {}
    for name in ORDER:
        b = B[name]
        rest = REST[name]
        default = poseM[b.parent.name] @ (REST[b.parent.name].inverted() @ rest) if b.parent else rest
        key = name.replace('mixamorig:', '')
        if key in want:
            R = want[key].to_matrix() @ rest.to_3x3()
            M = Matrix.Translation(hips_pos if name == 'mixamorig:Hips' else default.translation) @ R.to_4x4()
            bases[name] = default.inverted() @ M if b.parent else rest.inverted() @ M
            poseM[name] = M
        else:
            poseM[name] = default
    return poseM, bases


def lowest(poseM):
    low = 1e9
    for bone, end, r in CONTACTS:
        n = N(bone)
        if n not in poseM:
            continue
        p = poseM[n].translation if end == 'head' else poseM[n] @ Vector((0, B[n].length, 0))
        low = min(low, up(p) - r)
    return low


def solve_frame(clip, t):
    want, hips, clear = solve_rotations(clip, t)
    poseM, _ = fk(want, hips)
    # place the body so its lowest part is exactly `clear` above the floor (0 = touching)
    hips = hips + U * (FLOOR + clear * HH - lowest(poseM))
    poseM, bases = fk(want, hips)
    return bases, poseM


scene = bpy.context.scene
scene.render.fps = FPS
if arm.animation_data is None:
    arm.animation_data_create()
for pb in P:
    pb.rotation_mode = 'QUATERNION'
for tr in list(arm.animation_data.nla_tracks):
    arm.animation_data.nla_tracks.remove(tr)
report = {}
for clip_name, clip in CLIPS.items():
    if clip_name in bpy.data.actions:
        bpy.data.actions.remove(bpy.data.actions[clip_name])
    act = bpy.data.actions.new(clip_name)
    arm.animation_data.action = act
    frames = int(round(clip['dur'] * FPS))
    prevq = {}
    lows = []
    for f in range(frames + 1):
        bases, poseM = solve_frame(clip, f / frames)
        lows.append(lowest(poseM) - FLOOR)
        for name, basis in bases.items():
            pb = P[name]
            loc, rot, _ = basis.decompose()
            if name in prevq and prevq[name].dot(rot) < 0:
                rot.negate()
            prevq[name] = rot.copy()
            pb.rotation_quaternion = rot
            pb.keyframe_insert('rotation_quaternion', frame=f + 1, group=name)
            if name == 'mixamorig:Hips':
                pb.location = loc
                pb.keyframe_insert('location', frame=f + 1, group=name)
    track = arm.animation_data.nla_tracks.new()
    track.name = clip_name
    track.strips.new(clip_name, 1, act)
    arm.animation_data.action = None
    report[clip_name] = {'frames': frames + 1, 'duration': clip['dur'], 'min_clearance_hh': round(min(lows) / HH, 4),
                         'max_clearance_hh': round(max(lows) / HH, 3)}
    print('[dodges]', clip_name, report[clip_name])

# ---------------------------------------------------------------- export (rig + a 1-triangle skin so loaders create bones)
for pb in P:
    pb.rotation_quaternion = Quaternion()
    pb.location = Vector()
me = bpy.data.meshes.new('DodgeRigProxy')
me.from_pydata([HIPS, HIPS + F * 0.001, HIPS + U * 0.001], [], [(0, 1, 2)])
proxy = bpy.data.objects.new('DodgeRigProxy', me)
scene.collection.objects.link(proxy)
proxy.parent = arm
proxy.vertex_groups.new(name='mixamorig:Hips').add([0, 1, 2], 1.0, 'REPLACE')
proxy.modifiers.new('Armature', 'ARMATURE').object = arm
for o in bpy.context.selected_objects:
    o.select_set(False)
chain = []
p = arm
while p:
    chain.append(p)
    p = p.parent
for o in chain + [proxy]:
    o.hide_set(False)
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_skins=True,
                          export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                          export_frame_step=1, export_morph=False, export_materials='NONE')
print('[dodges] wrote', OUT)
json.dump(report, open(os.path.splitext(OUT)[0] + '.report.json', 'w'), indent=1)

# ---------------------------------------------------------------- preview strips
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'SINGLE'
    scene.render.resolution_x = scene.render.resolution_y = 360
    for o in bpy.data.objects:
        if o.type == 'MESH' and (o.name.startswith('Hair_') or o.name == 'DodgeRigProxy'):
            o.hide_render = True
    W = arm.matrix_world
    cam = bpy.data.objects.new('pc', bpy.data.cameras.new('pc'))
    cam.data.type = 'ORTHO'
    scene.collection.objects.link(cam)
    scene.camera = cam
    up_w = (W.to_3x3() @ U).normalized()
    floor_w = W @ (HIPS - U * (up(HIPS) - FLOOR))
    fl = bpy.data.objects.new('floor', bpy.data.meshes.new('floor'))
    a1, a2 = (W.to_3x3() @ F).normalized() * 3, (W.to_3x3() @ L).normalized() * 3
    fl.data.from_pydata([floor_w - a1 - a2, floor_w + a1 - a2, floor_w + a1 + a2, floor_w - a1 + a2], [], [(0, 1, 2, 3)])
    scene.collection.objects.link(fl)
    ctr = W @ (HIPS + U * 0.15 * HH)
    for clip_name, clip in CLIPS.items():
        arm.animation_data.action = bpy.data.actions[clip_name]
        frames = int(round(clip['dur'] * FPS))
        view = (W.to_3x3() @ (L if clip['axis'] == 'L' else -F)).normalized()
        cam.data.ortho_scale = HH * 4.6 * W.to_scale().x
        for k, frac in enumerate([0.0, 0.18, 0.32, 0.46, 0.6, 0.74, 0.88]):
            scene.frame_set(int(round(frac * frames)) + 1)
            cam.location = ctr + view * 6
            cam.rotation_euler = (-view).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = os.path.join(PREVIEW, f'{clip_name}_{k}.png')
            bpy.ops.render.render(write_still=True)
    arm.animation_data.action = None
