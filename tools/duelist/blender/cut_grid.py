# Duelist Adventure: the sword's cuts by direction, made here from the body's own stance (no source clip).
# Loaded by weapon_clips.py (it supplies the rig, the arm solver and the blends).
#
# The idea: eight points round the body where a blade can be held ready (top, bottom, the two sides, the four
# corners). Each has one pose of the whole body: how the trunk is turned and leant, where the weight is, where the
# sword arm reaches and where the blade points. A cut is the way from one point to another through the reach in
# front of the chest, so the pose a cut ends in is the very pose another cut starts from: any cut can run on into
# any other, and a cut straight back along the line it came needs no wind-up at all (the rules give it that time:
# src/components/duelist/core/cuts.mjs). Three modes use the same lines: swift keeps close to the centre and is
# quick, heavy winds all the way out, steps farther and takes longer.
#
# Angles: `az` degrees round from straight ahead toward the body's left (so the right side is negative), `el`
# degrees up. Lengths: metres; an arm's reach is a share of its length from the shoulder.
UP0 = Vector((0.0, 0.0, 1.0))
LEFT0 = (-rig.side).normalized()
SPINE = [rig.index['mixamorig:' + n] for n in ('Hips', 'Spine', 'Spine1', 'Spine2')]
SPINE_SHARE = (0.2, 0.25, 0.25, 0.3)
NECK = [rig.index['mixamorig:Neck'], rig.index['mixamorig:Head']]
FREE_ARM = rig.index['mixamorig:LeftArm']


def aim_dir(az, el):
    a, e = math.radians(az), math.radians(el)
    return (FORWARD0 * (math.cos(a) * math.cos(e)) + LEFT0 * (math.sin(a) * math.cos(e)) + UP0 * math.sin(e)).normalized()


def spec(yaw, pitch, roll, shift, arm, blade):
    """A pose of the whole body: the trunk's turn (to the left), lean (forward) and bend (to the left), degrees; the
    hips' shift (forward, left, up), metres; the sword arm (az, el, share of its reach); the blade (az, el)."""
    return {'yaw': yaw, 'pitch': pitch, 'roll': roll, 'shift': Vector(shift), 'arm': aim_dir(arm[0], arm[1]), 'reach': arm[2], 'blade': aim_dir(*blade)}


def bend_trunk(q, loc, yaw, pitch, roll):
    for bone, share in zip(SPINE, SPINE_SHARE):
        pose = rig.fk(q, loc)
        turn = Matrix.Rotation(math.radians(yaw) * share, 3, UP0) @ Matrix.Rotation(math.radians(pitch) * share, 3, LEFT0) @ Matrix.Rotation(-math.radians(roll) * share, 3, FORWARD0)
        m = (turn @ pose[bone].to_3x3()).to_4x4()
        m.translation = pose[bone].translation
        p = rig.parent[bone]
        q[bone] = rig.local(m, bone, pose[p] if p >= 0 else None)[0]
    pose = rig.fk(q, loc)
    for bone, share in zip(NECK, (0.3, 0.35)):  # the eyes stay on what is in front
        turn = Matrix.Rotation(-math.radians(yaw) * share, 3, UP0) @ Matrix.Rotation(-math.radians(pitch) * share * 0.8, 3, LEFT0)
        m = (turn @ pose[bone].to_3x3()).to_4x4()
        m.translation = pose[bone].translation
        q[bone] = rig.local(m, bone, pose[rig.parent[bone]])[0]
        pose = rig.fk(q, loc)
    # the free arm hangs back from the trunk's turn, as a counterweight does
    turn = Matrix.Rotation(-math.radians(yaw) * 0.45, 3, UP0) @ Matrix.Rotation(math.radians(pitch) * 0.3, 3, LEFT0)
    m = (turn @ pose[FREE_ARM].to_3x3()).to_4x4()
    m.translation = pose[FREE_ARM].translation
    q[FREE_ARM] = rig.local(m, FREE_ARM, pose[rig.parent[FREE_ARM]])[0]


class Leg:
    def __init__(self, side):
        at = lambda part: rig.index[f'mixamorig:{side}{part}']
        self.upper, self.fore, self.end = at('UpLeg'), at('Leg'), at('Foot')
        self.len1, self.len2 = rig.rel[self.fore].translation.length, rig.rel[self.end].translation.length
        self.to_knee, self.to_ankle = rig.rel[self.fore].translation.normalized(), rig.rel[self.end].translation.normalized()

    def stand(self, q, loc):  # where the ankle is, how the foot is turned, and which way the knee points
        pose = rig.fk(q, loc)
        hip, knee, ankle = (pose[i].translation for i in (self.upper, self.fore, self.end))
        n = (ankle - hip).normalized()
        out = (knee - hip) - n * (knee - hip).dot(n)
        return ankle.copy(), pose[self.end].to_3x3(), (out.normalized() if out.length > 1e-4 else FORWARD0.copy())

    def plant(self, q, pose, ankle, foot3, knee):
        """The leg solved so its ankle is at a point (the knee bending the way it did); returns how far it misses."""
        hip = pose[self.upper].translation
        to = ankle - hip
        d = min(max(to.length, abs(self.len1 - self.len2) + 1e-4), (self.len1 + self.len2) * 0.999)
        n = to.normalized()
        pole = knee - n * knee.dot(n)
        pole = pole.normalized() if pole.length > 1e-5 else FORWARD0.copy()
        c = min(max((self.len1 ** 2 + d * d - self.len2 ** 2) / (2 * self.len1 * d), -1.0), 1.0)
        joint = hip + n * (self.len1 * c) + pole * (self.len1 * math.sqrt(max(0.0, 1 - c * c)))
        up3 = pose[self.upper].to_3x3()
        upper = swing(up3, (up3 @ self.to_knee).normalized(), (joint - hip).normalized()).to_4x4()
        upper.translation = hip
        fore = upper @ rig.rel[self.fore] @ q[self.fore].to_matrix().to_4x4()
        f3 = fore.to_3x3()
        lower = swing(f3, (f3 @ self.to_ankle).normalized(), (hip + n * d - fore.translation).normalized()).to_4x4()
        lower.translation = fore.translation
        foot = foot3.to_4x4()
        foot.translation = (lower @ rig.rel[self.end]).translation
        q[self.upper] = rig.local(upper, self.upper, pose[rig.parent[self.upper]])[0]
        q[self.fore] = rig.local(lower, self.fore, upper)[0]
        q[self.end] = rig.local(foot, self.end, lower)[0]
        return (foot.translation - ankle).length


LEGS = (Leg('Left'), Leg('Right'))
ARM_LEN = RIGHT.len1 + RIGHT.len2


def slerp(a, b, w):  # between two directions (w may run a little past either end)
    d = max(-1.0, min(1.0, a.dot(b)))
    ang = math.acos(d)
    if ang < 1e-5:
        return a.copy()
    if math.pi - ang < 1e-3:
        return slerp(a, (b + UP0 * 0.02).normalized(), w)
    s = math.sin(ang)
    return (a * (math.sin((1 - w) * ang) / s) + b * (math.sin(w * ang) / s)).normalized()


def mix(a, b, w):
    return {'yaw': a['yaw'] + (b['yaw'] - a['yaw']) * w, 'pitch': a['pitch'] + (b['pitch'] - a['pitch']) * w, 'roll': a['roll'] + (b['roll'] - a['roll']) * w,
            'shift': a['shift'].lerp(b['shift'], w), 'arm': slerp(a['arm'], b['arm'], w), 'reach': a['reach'] + (b['reach'] - a['reach']) * w,
            'blade': slerp(a['blade'], b['blade'], w)}


def arc3(p, c, q):
    """The way round from direction p to q that passes by c: the circle on the sphere through all three (so a blade
    that starts behind one shoulder and ends behind the other goes round by the front, never over the top)."""
    n = (c - p).cross(q - c)
    if n.length < 1e-5:
        return lambda u: slerp(p, q, u)
    n.normalize()
    h = p.dot(n)
    e1 = (p - n * h).normalized()
    e2 = n.cross(e1)
    rho = math.sqrt(max(0.0, 1 - h * h))
    ang = lambda v: math.atan2((v - n * h).dot(e2), (v - n * h).dot(e1)) % (2 * math.pi)
    tc, tq = ang(c), ang(q)
    a, b = 2 * tq - 4 * tc, 4 * tc - tq  # the angle as a curve through (0, 0), (half, c's), (1, q's)
    if b <= 0 or 2 * a + b <= 0:  # c is far from the middle of the way: go round evenly
        a, b = 0.0, tq
    return lambda u: (n * h + (e1 * math.cos(a * u * u + b * u) + e2 * math.sin(a * u * u + b * u)) * rho).normalized()


WRIST = math.radians(42)  # as far as a wrist bends before the pose reads as broken


def easy_hold(pose, q, point, axis, near):
    """The sword hand at a point with the blade along `axis`, or as near that as the wrist allows: past WRIST the
    bend is held there and the blade gives way instead."""
    arm, bend, _, miss = RIGHT.hold(pose, q, point, axis, near)
    for _ in range(3):
        if bend <= WRIST:
            break
        straight = (arm[RIGHT.fore] @ rig.rel[RIGHT.hand]).to_3x3()
        d = (straight.inverted() @ arm[RIGHT.hand].to_3x3()).to_quaternion()
        twist = 2 * math.atan2(Vector((d.x, d.y, d.z)).dot(RIGHT.palm), d.w)
        twist = (twist + math.pi) % (2 * math.pi) - math.pi
        turn = Quaternion(RIGHT.palm, twist)
        over = d @ turn.inverted()
        if over.w < 0:
            over = -over
        ax = Vector((over.x, over.y, over.z))
        hand3 = straight @ (Quaternion(ax.normalized(), WRIST) @ turn).to_matrix()
        arm = RIGHT.reach(pose, q, point - hand3 @ RIGHT.grip.translation, hand3)
        bend, _ = RIGHT.wrist(arm)
        miss = ((arm[RIGHT.hand] @ RIGHT.grip).translation - point).length
    return arm, bend, miss


# The eight points for a blade in the right hand, and the centre the three modes measure them from.
RING = {
    'T': spec(-12, -10, 0, (-0.03, 0.0, 0.02), (-20, 72, 0.72), (175, 50)),
    'TR': spec(-38, -6, -5, (-0.03, -0.05, 0.01), (-62, 52, 0.78), (-150, 50)),
    'R': spec(-48, 2, -6, (-0.02, -0.07, -0.02), (-95, 8, 0.80), (-155, 18)),
    'BR': spec(-32, 16, -8, (0.02, -0.05, -0.07), (-62, -42, 0.80), (-140, -38)),
    'B': spec(10, 22, 0, (0.05, 0.0, -0.08), (8, -52, 0.82), (0, -48)),
    'BL': spec(34, 20, 8, (0.04, 0.05, -0.08), (55, -42, 0.70), (145, -34)),
    'L': spec(50, 6, 6, (0.02, 0.07, -0.03), (72, 2, 0.70), (150, 12)),
    'TL': spec(40, -4, 5, (-0.02, 0.05, 0.01), (50, 55, 0.64), (150, 48)),
    # behind the sword shoulder: where the backhand ends, the trunk turned to look over it
    'BACK': spec(-115, 2, -4, (-0.04, -0.06, -0.02), (-150, 10, 0.86), (-178, 6)),
}
CENTRE = spec(0, 4, 0, (0.0, 0.0, -0.01), (-25, -5, 0.6), (-10, 55))
# Each cut: the point it leaves, the point it ends at, and the step it takes (forward, to the left; metres).
CUTS = {
    'Stand': ('R', 'L', (0.0, 0.0)),
    'Down': ('T', 'B', (0.30, 0.0)), 'Up': ('B', 'T', (-0.22, 0.0)),
    'Left': ('R', 'L', (0.0, 0.25)), 'Right': ('L', 'R', (0.0, -0.25)),
    'DownLeft': ('TR', 'BL', (0.22, 0.12)), 'DownRight': ('TL', 'BR', (0.22, -0.12)),
    'UpLeft': ('BR', 'TL', (-0.15, 0.12)), 'UpRight': ('BL', 'TR', (-0.15, -0.12)),
}
# How far out a mode's points are, its seconds of wind-up, cut, hold and recovery, and how much of the step it
# takes. KEEP IN STEP with src/components/duelist/core/cuts.mjs (a test compares the clips with it).
CUT_MODES = {
    'Swift': dict(amp=0.72, wind=0.12, cut=0.12, hold=0.04, rec=0.24, step=0.6),
    'Balanced': dict(amp=0.88, wind=0.17, cut=0.15, hold=0.06, rec=0.30, step=1.0),
    'Heavy': dict(amp=1.0, wind=0.27, cut=0.19, hold=0.10, rec=0.42, step=1.3),
}
# The backhand (one of the three moves a second press hard on the first turns a cut into): from the left side
# round by the front and the sword side to behind the body. Its own seconds: KEEP IN STEP with core/cuts.mjs.
BACKHAND_LINE = ('L', 'BACK', (-0.1, -0.12))
BACKHAND_MODES = {
    'Swift': dict(amp=0.85, wind=0.12, cut=0.16, hold=0.06, rec=0.26, step=0.6),
    'Balanced': dict(amp=0.95, wind=0.16, cut=0.2, hold=0.08, rec=0.34, step=1.0),
    'Heavy': dict(amp=1.0, wind=0.24, cut=0.26, hold=0.12, rec=0.46, step=1.3),
}
sharp = lambda x: smoothstep(smoothstep(x))  # slow, then through the middle at more than twice the average, then slow


def ready_spec(q, loc):  # the stance itself as a spec: where its sword arm and blade are
    pose = rig.fk(q, loc)
    grip = pose[RIGHT.hand] @ RIGHT.grip
    to = grip.translation - pose[RIGHT.upper].translation
    return {'yaw': 0.0, 'pitch': 0.0, 'roll': 0.0, 'shift': Vector((0.0, 0.0, 0.0)), 'arm': to.normalized(), 'reach': to.length / ARM_LEN,
            'blade': grip.to_3x3().col[1].normalized()}


def pose_frame(base_q, base_loc, s, travel, feet, state):
    """One frame: the stance bent, shifted and reaching as a spec says, with the feet where they are told."""
    unit = scale_of()
    q = [x.copy() for x in base_q]
    loc = base_loc + HIPS_REST_INV @ (travel + (FORWARD0 * s['shift'].x + LEFT0 * s['shift'].y + UP0 * s['shift'].z) / unit)
    bend_trunk(q, loc, s['yaw'], s['pitch'], s['roll'])
    pose = rig.fk(q, loc)
    leg_miss = max(leg.plant(q, pose, *foot) for leg, foot in zip(LEGS, feet))
    pose = rig.fk(q, loc)
    point = pose[RIGHT.upper].translation + s['arm'] * (min(s['reach'], 0.985) * ARM_LEN)
    arm, bend, miss = easy_hold(pose, q, point, s['blade'], state.get('near'))
    RIGHT.take(q, pose, arm)
    state['near'] = arm[RIGHT.hand].to_3x3()
    state['worst'] = [max(a, b) for a, b in zip(state.get('worst', [0, 0, 0]), (miss * unit, math.degrees(bend), leg_miss * unit))]
    return q, loc


def make_cut(cut, mode, base_q, base_loc, line=None, modes=None):
    """One cut in one mode: wind up to the point it leaves, cut through to the point it ends at, hold, come back.
    line, modes: a line and a table of modes of its own (the backhand's)."""
    p_name, q_name, step = line or CUTS[cut]
    m = (modes or CUT_MODES)[mode]
    unit = scale_of()
    amp = m['amp'] * (0.85 if cut == 'Stand' else 1.0)
    ready = ready_spec(base_q, base_loc)
    P, Q = mix(CENTRE, RING[p_name], amp), mix(CENTRE, RING[q_name], amp)
    c_arm = (FORWARD0 + (P['arm'] + Q['arm']) * 0.25 + UP0 * 0.05).normalized()  # the reach in front of the chest
    c_blade = (c_arm + P['blade'] * 0.2).normalized()  # the blade still trails a little as it passes
    r_ctrl = 2 * (0.84 + 0.06 * m['amp']) - (P['reach'] + Q['reach']) / 2  # the elbow keeps a bend: the blade is the reach
    arm_way, blade_way = arc3(P['arm'], c_arm, Q['arm']), arc3(P['blade'], c_blade, Q['blade'])
    Tw, Tc, Th, Tr = m['wind'], m['cut'], m['hold'], m['rec']
    V = (FORWARD0 * step[0] + LEFT0 * step[1]) * (m['step'] / unit)
    stand = [leg.stand(base_q, base_loc) for leg in LEGS]
    lead = max((0, 1), key=lambda i: stand[i][0].dot(V)) if V.length > 1e-6 else 0  # the foot already that way goes first
    lift = min(0.06, V.length * unit * 0.25) / unit
    t1a, t1b = 0.35 * Tw, Tw + 0.45 * Tc  # the leading foot is down just before the blade arrives
    t2a, t2b = Tw + Tc + 0.2 * Th, Tw + Tc + Th + 0.6 * Tr  # the other follows as the body comes back to its stance

    def foot(i, t):
        a, b = (t1a, t1b) if i == lead else (t2a, t2b)
        k = min(max((t - a) / (b - a), 0.0), 1.0)
        ankle, foot3, knee = stand[i]
        return ankle + V * smoothstep(k) + UP0 * (lift * math.sin(math.pi * k)), foot3, knee

    out_q, out_loc, state = [], [], {}
    for f in range(int(round((Tw + Tc + Th + Tr) * FPS)) + 1):
        t = f / FPS
        if t < Tw:
            s = mix(ready, P, smoothstep(t / Tw))
        elif t < Tw + Tc:
            x = (t - Tw) / Tc
            body, hand = sharp(min(1.0, x * 1.18)), sharp(max(0.0, (x - 0.1) / 0.9))  # the body leads, the arm whips after it
            s = mix(P, Q, body)
            bump = math.sin(math.pi * x)
            s['pitch'] += 6 * bump * m['amp']
            s['shift'] = s['shift'] + Vector((0.02 * bump, 0.0, -0.03 * bump))
            s['arm'] = arm_way(hand)
            s['reach'] = (1 - hand) ** 2 * P['reach'] + 2 * hand * (1 - hand) * r_ctrl + hand ** 2 * Q['reach']
            s['blade'] = blade_way(hand)
        elif t < Tw + Tc + Th:
            s = Q
        else:
            s = mix(Q, ready, smoothstep((t - Tw - Tc - Th) / Tr))
        gone = 0.75 * smoothstep((t - t1a) / (t1b - t1a)) + 0.25 * smoothstep((t - t2a) / (t2b - t2a))
        q, loc = pose_frame(base_q, base_loc, s, V * gone, [foot(0, t), foot(1, t)], state)
        k = (t - Tw - Tc - Th) / Tr
        if k > 0.6:  # the last of the recovery closes on the stance itself
            w = smoothstep((k - 0.6) / 0.4)
            q = [a.slerp(b, w) for a, b in zip(q, base_q)]
        out_q.append(q)
        out_loc.append(loc)
    marks = [round(Tw + 0.3 * Tc, 4), round(Tw + 0.75 * Tc, 4), round(Tw + Tc + Th, 4)]
    return {'q': out_q, 'loc': out_loc}, marks, state['worst']


def build_cuts(add, notes, idle, only=None):
    base_q, base_loc = pose_of(idle, 0)
    for mode in CUT_MODES:
        for cut in CUTS:
            name = f'swordCut{cut}{mode}'
            if only and name not in only:
                continue
            clip, marks, worst = make_cut(cut, mode, base_q, base_loc)
            add(name, inertial_in(clip, idle, 0, 0.1), f'{cut} cut, {mode.lower()}: from {CUTS[cut][0]} to {CUTS[cut][1]}', sigma=0.5)
            notes[name].update({'marks': marks, 'from': CUTS[cut][0], 'to': CUTS[cut][1]})
            print('CUT', name, 'seconds', notes[name]['seconds'], 'marks', marks, 'arm miss %.3f m, wrist %d deg, foot miss %.3f m' % tuple(worst))
        name = f'swordBackhand{mode}'
        if only and name not in only:
            continue
        clip, _, worst = make_cut('Backhand', mode, base_q, base_loc, BACKHAND_LINE, BACKHAND_MODES)
        add(name, inertial_in(clip, idle, 0, 0.1), f'backhand, {mode.lower()}: from the left side round to behind the body', sigma=0.5)
        print('CUT', name, 'seconds', notes[name]['seconds'], 'arm miss %.3f m, wrist %d deg, foot miss %.3f m' % tuple(worst))
