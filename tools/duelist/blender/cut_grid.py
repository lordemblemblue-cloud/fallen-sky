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


def bend_trunk(q, loc, yaw, pitch, roll, free=None):  # free: the arm that hangs back (the left unless told)
    free = FREE_ARM if free is None else free
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
    m = (turn @ pose[free].to_3x3()).to_4x4()
    m.translation = pose[free].translation
    q[free] = rig.local(m, free, pose[rig.parent[free]])[0]


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


def easy_hold(pose, q, point, axis, near, arm=None):
    """A weapon hand at a point with the blade along `axis`, or as near that as the wrist allows: past WRIST the
    bend is held there and the blade gives way instead. arm: which arm (the right one unless told)."""
    side = arm or RIGHT
    solved, bend, _, miss = side.hold(pose, q, point, axis, near)
    for _ in range(3):
        if bend <= WRIST:
            break
        straight = (solved[side.fore] @ rig.rel[side.hand]).to_3x3()
        d = (straight.inverted() @ solved[side.hand].to_3x3()).to_quaternion()
        twist = 2 * math.atan2(Vector((d.x, d.y, d.z)).dot(side.palm), d.w)
        twist = (twist + math.pi) % (2 * math.pi) - math.pi
        turn = Quaternion(side.palm, twist)
        over = d @ turn.inverted()
        if over.w < 0:
            over = -over
        ax = Vector((over.x, over.y, over.z))
        hand3 = straight @ (Quaternion(ax.normalized(), WRIST) @ turn).to_matrix()
        solved = side.reach(pose, q, point - hand3 @ side.grip.translation, hand3)
        bend, _ = side.wrist(solved)
        miss = ((solved[side.hand] @ side.grip).translation - point).length
    return solved, bend, miss


def flip(v):  # a direction as the body's mirror shows it (left for right)
    return v - LEFT0 * (2 * v.dot(LEFT0))


def mirror_spec(s):  # a pose for the other hand: the same pose in the mirror
    return {'yaw': -s['yaw'], 'pitch': s['pitch'], 'roll': -s['roll'], 'shift': Vector((s['shift'].x, -s['shift'].y, s['shift'].z)),
            'arm': flip(s['arm']), 'reach': s['reach'], 'blade': flip(s['blade'])}


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
    # no step of their own: in the game the legs keep walking under a cut (the fighter is not rooted), and standing
    # still the feet stay where they are
    'Down': ('T', 'B', (0.0, 0.0)), 'Up': ('B', 'T', (0.0, 0.0)),
    'Left': ('R', 'L', (0.0, 0.0)), 'Right': ('L', 'R', (0.0, 0.0)),
    'DownLeft': ('TR', 'BL', (0.0, 0.0)), 'DownRight': ('TL', 'BR', (0.0, 0.0)),
    'UpLeft': ('BR', 'TL', (0.0, 0.0)), 'UpRight': ('BL', 'TR', (0.0, 0.0)),
}
# How far out a mode's points are, its seconds of wind-up, cut, hold and recovery, and how much of the step it
# takes. KEEP IN STEP with src/components/duelist/core/cuts.mjs (a test compares the clips with it).
CUT_MODES = {
    'Swift': dict(amp=0.72, wind=0.11, cut=0.10, hold=0.03, rec=0.18, step=0.6, guard=1.0),  # the free hand guards the chest
    'Balanced': dict(amp=0.88, wind=0.13, cut=0.12, hold=0.04, rec=0.24, step=1.0),
    'Heavy': dict(amp=1.0, wind=0.21, cut=0.16, hold=0.08, rec=0.34, step=1.3),
}
# The backhand (one of the three moves a second press hard on the first turns a cut into): from the left side
# round by the front and the sword side to behind the body. Its own seconds: KEEP IN STEP with core/cuts.mjs.
BACKHAND_LINE = ('L', 'BACK', (0.0, 0.0))
BACKHAND_MODES = {
    'Swift': dict(amp=0.85, wind=0.10, cut=0.13, hold=0.05, rec=0.20, step=0.6),
    'Balanced': dict(amp=0.95, wind=0.13, cut=0.16, hold=0.06, rec=0.27, step=1.0),
    'Heavy': dict(amp=1.0, wind=0.20, cut=0.21, hold=0.10, rec=0.37, step=1.3),
}
sharp = lambda x: smoothstep(smoothstep(x))  # slow, then through the middle at more than twice the average, then slow


def ready_spec(q, loc, arm=None):  # the stance itself as a spec: where its weapon arm and blade are
    side = arm or RIGHT
    pose = rig.fk(q, loc)
    grip = pose[side.hand] @ side.grip
    to = grip.translation - pose[side.upper].translation
    return {'yaw': 0.0, 'pitch': 0.0, 'roll': 0.0, 'shift': Vector((0.0, 0.0, 0.0)), 'arm': to.normalized(), 'reach': to.length / (side.len1 + side.len2),
            'blade': grip.to_3x3().col[1].normalized()}


def pose_frame(base_q, base_loc, s, travel, feet, state, arm=None, guard=0.0):
    """One frame: the stance bent, shifted and reaching as a spec says, with the feet where they are told.
    arm: the arm that cuts (the right unless told); guard: how far the other hand is up in front of the chest."""
    unit = scale_of()
    side = arm or RIGHT
    other = LEFT if side is RIGHT else RIGHT
    q = [x.copy() for x in base_q]
    loc = base_loc + HIPS_REST_INV @ (travel + (FORWARD0 * s['shift'].x + LEFT0 * s['shift'].y + UP0 * s['shift'].z) / unit)
    bend_trunk(q, loc, s['yaw'], s['pitch'], s['roll'], other.upper)
    pose = rig.fk(q, loc)
    leg_miss = max(leg.plant(q, pose, *foot) for leg, foot in zip(LEGS, feet))
    pose = rig.fk(q, loc)
    point = pose[side.upper].translation + s['arm'] * (min(s['reach'], 0.985) * (side.len1 + side.len2))
    solved, bend, miss = easy_hold(pose, q, point, s['blade'], state.get('near'), side)
    side.take(q, pose, solved)
    state['near'] = solved[side.hand].to_3x3()
    if guard > 0:  # the free hand comes up in front of the chest, the forearm across it; the wrist stays as it was
        pose = rig.fk(q, loc)
        forward, left, up = chest_axes(pose)
        sign = 1 if other is LEFT else -1
        wrist = pose[CHEST].translation + (forward * 0.27 + left * (0.06 * sign) + up * 0.05) / unit
        held = other.reach(pose, q, wrist, pose[other.hand].to_3x3())
        for i in (other.upper, other.fore):
            p = rig.parent[i]
            q[i] = q[i].slerp(rig.local(held[i], i, held.get(p, pose[p]))[0], guard)
    state['worst'] = [max(a, b) for a, b in zip(state.get('worst', [0, 0, 0]), (miss * unit, math.degrees(bend), leg_miss * unit))]
    return q, loc


def make_cut(cut, mode, base_q, base_loc, line=None, modes=None, hand='Right', ring=None):
    """One cut in one mode: wind up to the point it leaves, cut through to the point it ends at, hold, come back.
    line, modes: a line and a table of modes of its own (the backhand's, the forms'). hand: the hand that cuts; the
    left cuts the same line in the mirror. ring: points of its own (the staff's)."""
    p_name, q_name, step = line or CUTS[cut]
    m = (modes or CUT_MODES)[mode]
    unit = scale_of()
    amp = m['amp'] * (0.85 if cut == 'Stand' else 1.0)
    side = LEFT if hand == 'Left' else RIGHT
    table = ring or RING
    turn = mirror_spec if hand == 'Left' else (lambda s: s)
    ready = ready_spec(base_q, base_loc, side)
    centre = turn(m.get('centre', CENTRE))
    P, Q = mix(centre, turn(table[p_name]), amp), mix(centre, turn(table[q_name]), amp)
    if m.get('close'):  # both hands stay on the weapon: the hand keeps near the body and the far end does the reaching
        between = P['arm'] + Q['arm']
        c_arm = between.normalized() if between.length > 1e-3 else FORWARD0.copy()
        c_blade = (FORWARD0 + (P['blade'] + Q['blade']) * 0.35).normalized()
        c_reach = m['close']
    else:
        c_arm = (FORWARD0 + (P['arm'] + Q['arm']) * 0.25 + UP0 * 0.05).normalized()  # the reach in front of the chest
        c_blade = (c_arm + P['blade'] * 0.2).normalized()  # the blade still trails a little as it passes
        c_reach = 0.84 + 0.06 * m['amp']  # the elbow keeps a bend: the blade is the reach
    r_ctrl = 2 * c_reach - (P['reach'] + Q['reach']) / 2
    arm_way, blade_way = arc3(P['arm'], c_arm, Q['arm']), arc3(P['blade'], c_blade, Q['blade'])
    if m.get('direct'):  # straight from the one pose to the other: no reach through the front (the recoil, the push)
        arm_way, blade_way = (lambda u: slerp(P['arm'], Q['arm'], u)), (lambda u: slerp(P['blade'], Q['blade'], u))
        r_ctrl = (P['reach'] + Q['reach']) / 2
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

    total = Tw + Tc + Th + Tr

    def at(t):  # the pose asked for at a time: out to the point it leaves, through to the other, held, back
        if t < Tw:
            return mix(ready, P, smoothstep(t / Tw))
        if t < Tw + Tc:
            x = (t - Tw) / Tc
            u = smoothstep(x ** 1.25)  # gathering speed into the contact, easing out past it
            s = mix(P, Q, u)
            bump = math.sin(math.pi * x)
            s['pitch'] += 6 * bump * m['amp']
            s['shift'] = s['shift'] + Vector((0.02 * bump, 0.0, -0.03 * bump))
            s['arm'] = arm_way(u)
            s['reach'] = (1 - u) ** 2 * P['reach'] + 2 * u * (1 - u) * r_ctrl + u ** 2 * Q['reach']
            s['blade'] = blade_way(u)
            return s
        if t < Tw + Tc + Th:
            return dict(Q)
        return mix(Q, ready, smoothstep((t - Tw - Tc - Th) / Tr))

    out_q, out_loc, state = [], [], {}
    for f in range(int(round(total * FPS)) + 1):
        t = f / FPS
        # The trunk leads the arm: it has already turned back toward the cut while the blade is still going out, so
        # the motion never stops at the top of the wind-up (the lead grows in from nothing at the start).
        ahead = 0.3 * Tw * smoothstep(t / (0.5 * Tw))
        s, trunk = dict(at(t)), at(min(total, t + ahead))
        for k in ('yaw', 'pitch', 'roll', 'shift'):
            s[k] = trunk[k]
        gone = 0.75 * smoothstep((t - t1a) / (t1b - t1a)) + 0.25 * smoothstep((t - t2a) / (t2b - t2a))
        out_and_back = smoothstep(t / Tw) * (1 - smoothstep((t - Tw - Tc - Th) / Tr))
        guard = m.get('guard', 0.0) * out_and_back
        q, loc = pose_frame(base_q, base_loc, s, V * gone, [foot(0, t), foot(1, t)], state, side, guard)
        if m.get('open'):  # the hand opens as it goes out (its fingers toward their rest)
            for i in side.fingers:
                q[i] = q[i].slerp(Quaternion(), m['open'] * out_and_back)
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


# ---- The twin blades and the staff cut the same nine lines, each in its own time (one mode a form).
# KEEP IN STEP with src/components/duelist/core/cuts.mjs FORM_TIMING.
FORM_MODES = {
    'blades': dict(amp=0.82, wind=0.10, cut=0.10, hold=0.03, rec=0.20, step=0.0),
    # the staff is held in both hands: the right hand keeps near the hip and the far end does the reaching
    'staff': dict(amp=0.92, wind=0.13, cut=0.13, hold=0.05, rec=0.25, step=0.0, close=0.56,
                  centre=spec(0, 3, 0, (0.0, 0.0, -0.01), (8, -45, 0.5), (20, 40))),
}
# The twin blades: each cut has a hand that leads it (the line that hand cuts, which hand, and how far behind the
# other blade follows). The right hand leads what travels to the left, the left hand what travels to the right; the
# other blade cuts the same line in the mirror a beat behind, so the two cross and uncross.
BLADES = {
    'Stand': ('Stand', 'Right', 0.06), 'Left': ('Left', 'Right', 0.06), 'DownLeft': ('DownLeft', 'Right', 0.06), 'UpLeft': ('UpLeft', 'Right', 0.06),
    'Down': ('Down', 'Right', 0.08),
    'Right': ('Left', 'Left', 0.06), 'DownRight': ('DownLeft', 'Left', 0.06), 'UpRight': ('UpLeft', 'Left', 0.06),
    'Up': ('Up', 'Left', 0.08),
}
# The staff's own points: where the right hand is (near the hip: both hands stay on the shaft) and where the far end
# points. The far end can point anywhere ahead, up, down or to the left, and only a little to the right: the left
# hand holds the shaft beyond the right hand and cannot follow it far across the body.
STAFF_RING = {
    'T': spec(-6, -6, 0, (-0.02, 0.0, 0.01), (5, -20, 0.5), (0, 75)),
    'TR': spec(-22, -4, -4, (-0.02, -0.03, 0.0), (-15, -25, 0.5), (-25, 55)),
    'R': spec(-28, 2, -5, (-0.01, -0.04, -0.02), (-25, -40, 0.5), (-30, 8)),
    'BR': spec(-20, 12, -6, (0.02, -0.03, -0.06), (-20, -55, 0.52), (-25, -35)),
    'B': spec(6, 16, 0, (0.04, 0.0, -0.07), (5, -55, 0.55), (0, -42)),
    'BL': spec(24, 14, 6, (0.03, 0.04, -0.07), (20, -55, 0.52), (60, -35)),
    'L': spec(32, 5, 5, (0.02, 0.05, -0.03), (25, -40, 0.5), (80, 8)),
    'TL': spec(26, -3, 4, (-0.01, 0.04, 0.0), (20, -25, 0.5), (60, 55)),
}


def on_shaft(clip):
    """The left hand closed on the staff wherever it can reach it (STAFF_HANDS along from the right hand's grip);
    where it cannot, the arm is left as it was, and the change between the two is eased over a few frames."""
    unit = scale_of()
    out = copy_clip(clip)
    n = len(out['q'])
    solved, w = [], []
    last = None
    for f in range(n):
        q = out['q'][f]
        pose = rig.fk(q, out['loc'][f])
        grip = pose[RIGHT.hand] @ RIGHT.grip
        axis = grip.to_3x3().col[1].normalized()
        arm, bend, _, miss = LEFT.hold(pose, q, grip.translation + axis * (STAFF_HANDS / unit), axis * STAFF_THUMB, last)
        good = miss * unit < 0.03 and bend < math.radians(55)
        last = arm[LEFT.hand].to_3x3() if good else None
        held = [x.copy() for x in q]
        if good:
            LEFT.take(held, pose, arm)
        solved.append(held)
        w.append(good)
    # on the shaft only well inside a stretch where it can be held: nothing at all within a few frames of where it
    # cannot, rising smoothly from there (so the hand never jumps on or off)
    reach = 6
    w = [1.0 if all(w[max(0, i - reach):min(n, i + reach + 1)]) else 0.0 for i in range(n)]
    for _ in range(reach - 1):
        w = [(w[max(0, i - 1)] + w[i] + w[min(n - 1, i + 1)]) / 3 for i in range(n)]
    for f in range(n):
        for i in (LEFT.upper, LEFT.fore, LEFT.hand):
            out['q'][f][i] = out['q'][f][i].slerp(solved[f][i], w[f])
    return out, sum(w) / n


def build_form_cuts(add, notes, blades_idle, staff_idle, only=None):
    report = 'arm miss %.3f m, wrist %d deg, foot miss %.3f m'
    base_q, base_loc = pose_of(blades_idle, 0)
    for cut, (line, hand, delay) in BLADES.items():
        name = 'bladesCut' + cut
        if only and name not in only:
            continue
        clip, marks, worst = make_cut(line, 'blades', base_q, base_loc, modes=FORM_MODES, hand=hand)
        clip = mirror_arm(clip, delay=delay, to='Left' if hand == 'Right' else 'Right')
        add(name, inertial_in(clip, blades_idle, 0, 0.1),
            f'{cut} cut with the twin blades: the {hand.lower()} blade leads from {CUTS[cut][0]} to {CUTS[cut][1]}, the other follows in the mirror', sigma=0.5)
        notes[name].update({'marks': marks, 'from': CUTS[cut][0], 'to': CUTS[cut][1], 'lead': hand})
        print('CUT', name, 'seconds', notes[name]['seconds'], report % tuple(worst), '| led by the', hand.lower(), 'blade')
    base_q, base_loc = pose_of(staff_idle, 0)
    for cut in CUTS:
        name = 'staffCut' + cut
        if only and name not in only:
            continue
        clip, marks, worst = make_cut(cut, 'staff', base_q, base_loc, modes=FORM_MODES, ring=STAFF_RING)
        clip, share = on_shaft(clip)
        add(name, inertial_in(clip, staff_idle, 0, 0.1), f'{cut} cut with the staff in both hands: the far end from {CUTS[cut][0]} to {CUTS[cut][1]}', sigma=0.5)
        notes[name].update({'marks': marks, 'from': CUTS[cut][0], 'to': CUTS[cut][1]})
        print('CUT', name, 'seconds', notes[name]['seconds'], report % tuple(worst), '| second hand on the shaft %d%% of the time' % round(share * 100))

# ---- Two more moves made the same way.
# The recoil: what a cut does when it is parried (the blades meet). The blade is where it met the other, in front of
# the chest; it is thrown back over the weapon shoulder and the trunk rocks back with it, then the stance returns.
# The game shows it from `wind` seconds in (the blade already in front): client/animator.mjs RECOIL_FROM.
RECOIL_MODE = {'recoil': dict(amp=1.0, wind=0.07, cut=0.08, hold=0.10, rec=0.30, step=0.0, direct=True)}
RECOIL_RING = {
    'MEET': spec(8, 8, 0, (0.03, 0.0, -0.02), (-5, 5, 0.9), (-25, 35)),
    'THROWN': spec(-22, -14, -3, (-0.08, -0.02, 0.0), (-55, 38, 0.66), (-150, 62)),
}
STAFF_RECOIL_RING = {
    'MEET': spec(6, 8, 0, (0.03, 0.0, -0.02), (5, -35, 0.56), (0, 28)),
    'THROWN': spec(-14, -12, -2, (-0.07, 0.0, 0.0), (-10, -22, 0.5), (-20, 78)),
}
# The push: the free hand is drawn back to the ribs as the trunk turns away, then shot straight out with the trunk
# behind it, the hand open. Written for the right hand; the left does it in the mirror. Its seconds are the push's
# own (core/moves.mjs: 0.12 to the push, 0.46 in all).
PUSH_MODE = {'push': dict(amp=1.0, wind=0.07, cut=0.09, hold=0.08, rec=0.22, step=0.0, direct=True, open=1.0)}
PUSH_RING = {
    'COIL': spec(-32, -4, 0, (-0.05, 0.0, -0.02), (-35, -18, 0.42), (90, 5)),
    'THRUST': spec(30, 12, 0, (0.09, 0.0, -0.04), (4, 6, 0.97), (90, 0)),
}


def build_extras(add, notes, idle, blades_idle, staff_idle, only=None):
    want = lambda name: not only or name in only
    report = 'arm miss %.3f m, wrist %d deg, foot miss %.3f m'
    line = ('MEET', 'THROWN', (0.0, 0.0))
    if want('swordRecoil'):
        base_q, base_loc = pose_of(idle, 0)
        clip, _, worst = make_cut('Recoil', 'recoil', base_q, base_loc, line, RECOIL_MODE, ring=RECOIL_RING)
        add('swordRecoil', inertial_in(clip, idle, 0, 0.06), 'a cut parried: the blade thrown back, the trunk rocked, then the stance', sigma=0.5)
        print('CUT swordRecoil seconds', notes['swordRecoil']['seconds'], report % tuple(worst))
    if want('bladesRecoil'):
        base_q, base_loc = pose_of(blades_idle, 0)
        clip, _, worst = make_cut('Recoil', 'recoil', base_q, base_loc, line, RECOIL_MODE, ring=RECOIL_RING)
        add('bladesRecoil', inertial_in(mirror_arm(clip, delay=0.02), blades_idle, 0, 0.06), 'a cut parried with the twin blades: both thrown back', sigma=0.5)
        print('CUT bladesRecoil seconds', notes['bladesRecoil']['seconds'], report % tuple(worst))
    if want('staffRecoil'):
        base_q, base_loc = pose_of(staff_idle, 0)
        modes = {'recoil': dict(RECOIL_MODE['recoil'], centre=FORM_MODES['staff']['centre'])}
        clip, _, worst = make_cut('Recoil', 'recoil', base_q, base_loc, line, modes, ring=STAFF_RECOIL_RING)
        clip, share = on_shaft(clip)
        add('staffRecoil', inertial_in(clip, staff_idle, 0, 0.06), 'a cut parried with the staff: the far end thrown up and back', sigma=0.5)
        print('CUT staffRecoil seconds', notes['staffRecoil']['seconds'], report % tuple(worst), '| second hand on the shaft %d%%' % round(share * 100))
    if want('pushThrust'):
        base_q, base_loc = pose_of(idle, 0)
        clip, _, worst = make_cut('Push', 'push', base_q, base_loc, ('COIL', 'THRUST', (0.0, 0.0)), PUSH_MODE, hand='Left', ring=PUSH_RING)
        add('pushThrust', inertial_in(clip, idle, 0, 0.05), 'the push: the free hand drawn back to the ribs and shot straight out, open, the trunk behind it', sigma=0.5)
        print('CUT pushThrust seconds', notes['pushThrust']['seconds'], report % tuple(worst))
