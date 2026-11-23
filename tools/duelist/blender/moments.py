# Duelist Adventure: the moments, posed here key by key on each weapon's own stance (no source clip).
# The owner (2026-11-22): "create brand new animations, add a taunt system that they can press the T key to taunt";
# the Warrior's Rage: "he starts screaming, and then he starts charging"; the Duelist's Execution: "he pulls them
# towards him and he stabs right in the center, and then he pulls [the blade] out and he pushes them away".
#   swordTauntWarrior  "Is that all you have got?": the sword dropped low to the side, chest out, the free hand
#                      held out palm up and beckoning twice
#   swordTauntHealer   "I will still be standing.": the blade raised straight up overhead, the free hand on the heart
#   bladesTaunt        the Duelist's "Too slow.": the twin blades crossed before the face, then swept out and down
#   staffTaunt         the Assassin's "You never saw me coming.": the staff planted upright at her side, leaning on
#                      it, the free hand on her hip, head tilted
#   swordRoar          the Warrior's Rage: hunched and gathered, then the chest thrown up and the arms flung wide
#                      and back, trembling through the scream, then down into a forward lean to charge
#   bladesExecution    the Duelist's Execution, to the rules' seconds (core/moves.mjs execution): the free hand thrown
#                      out at the enemy and drawn back to the chest (the pull, 0 to 0.4 s), the right blade coiled at
#                      the hip, driven straight into the centre with a step in (0.78 s), drawn out, and the left hand
#                      shoves (1.18 s)
#   staffDominate      the Assassin's Mind Dominance: two fingers to the temple, then the hand thrown at the enemy
# Loaded by weapon_clips.py after cut_grid.py (they supply the rig, the arm and leg solvers and the blends).
#
# A key is a time and the channels set there:
#   yaw, pitch, roll      the trunk's turn to the left, lean forward and bend to the left (degrees)
#   fx, fy, fz            the hips' shift forward, to the left and up (metres; keep it under 0.12 m across, or the
#                         pack builder takes it out as travel)
#   r=, l=                a hand: (az, el, reach) where its grip is from its shoulder (degrees round to the left and up,
#                         a share of the arm's reach), then (taz, tel) the way its thumb points (a weapon hand: the blade)
#   rw, lw                how much of that hand is posed (0: as the stance holds it); r= or l= sets it to 1 unless given
#   ro, lo                how far its fingers open (0: as the stance holds them, 1: flat)
#   hyaw, hpitch, hroll   the head's own turn, nod (down) and tilt (to the left), degrees
#   sl, sr                each foot's step forward (metres); a foot lifts as it moves
#   shake                 a tremble through the trunk (degrees)
# Each channel runs on a monotone cubic through the keys that set it (PCHIP): it keeps its speed through a key it
# passes and comes to rest at one where it turns back or holds, so the body never stops dead between keys. A moment
# starts and ends on its stance, every channel at rest.
import numpy as np

HEAD_SHARE = (0.4, 0.6)  # how the head's own turn is shared between the neck and the head
STANCE_CH = dict(yaw=0.0, pitch=0.0, roll=0.0, fx=0.0, fy=0.0, fz=0.0, rw=0.0, lw=0.0, ro=0.0, lo=0.0,
                 hyaw=0.0, hpitch=0.0, hroll=0.0, sl=0.0, sr=0.0, shake=0.0)


def K(t, r=None, l=None, **ch):
    out = dict(ch)
    for p, v in (('r', r), ('l', l)):
        if v is not None:
            out.update({f'{p}_az': v[0], f'{p}_el': v[1], f'{p}_reach': v[2], f'{p}_taz': v[3], f'{p}_tel': v[4]})
            out.setdefault(p + 'w', 1.0)
    return (t, out)


def az_el(v):
    v = v.normalized()
    return math.degrees(math.atan2(v.dot(LEFT0), v.dot(FORWARD0))), math.degrees(math.asin(max(-1.0, min(1.0, v.dot(UP0)))))


def stance_channels(base_q, base_loc):
    """Every channel at rest: the hands where the stance holds them (so a hand posed from here sets out from there)."""
    ch = dict(STANCE_CH)
    for p, side in (('r', RIGHT), ('l', LEFT)):
        s = ready_spec(base_q, base_loc, side)
        a, e = az_el(s['arm'])
        ta, te = az_el(s['blade'])
        ch.update({f'{p}_az': a, f'{p}_el': e, f'{p}_reach': s['reach'], f'{p}_taz': ta, f'{p}_tel': te})
    return ch


def pchip(knots):
    """A monotone cubic through (t, v) knots: flat at the ends and wherever the values turn back or hold."""
    ts = [k[0] for k in knots]
    vs = [k[1] for k in knots]
    n = len(ts)
    if n == 1:
        return lambda t: vs[0]
    h = [ts[i + 1] - ts[i] for i in range(n - 1)]
    d = [(vs[i + 1] - vs[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def at(t):
        if t <= ts[0]:
            return vs[0]
        if t >= ts[-1]:
            return vs[-1]
        i = max(j for j in range(n - 1) if ts[j] <= t)
        u = (t - ts[i]) / h[i]
        h00, h10, h01, h11 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
        return h00 * vs[i] + h10 * h[i] * m[i] + h01 * vs[i + 1] + h11 * h[i] * m[i + 1]
    return at


def curves_of(keys, rest, total):
    """The channels as curves over the moment: from the stance at 0 to the stance at `total`."""
    keys = [(0.0, dict(rest))] + sorted(keys, key=lambda k: k[0]) + [(total, dict(rest))]
    out = {}
    for name in rest:
        knots = [(t, ch[name]) for t, ch in keys if name in ch]
        out[name] = pchip(knots)
    return out


def turn_head(q, loc, yaw, pitch, roll):
    pose = rig.fk(q, loc)
    for bone, share in zip(NECK, HEAD_SHARE):
        turn = Matrix.Rotation(math.radians(yaw) * share, 3, UP0) @ Matrix.Rotation(math.radians(pitch) * share, 3, LEFT0) @ \
            Matrix.Rotation(-math.radians(roll) * share, 3, FORWARD0)
        m = (turn @ pose[bone].to_3x3()).to_4x4()
        m.translation = pose[bone].translation
        q[bone] = rig.local(m, bone, pose[rig.parent[bone]])[0]
        pose = rig.fk(q, loc)


def make_moment(keys, total, base_q, base_loc):
    """The moment's frames at FPS, and the worst arm miss (m), wrist bend (degrees) and foot miss (m) on the way."""
    unit = scale_of()
    rest = stance_channels(base_q, base_loc)
    c = curves_of(keys, rest, total)
    stand = [leg.stand(base_q, base_loc) for leg in LEGS]  # (Left, Right)
    out_q, out_loc, near, worst = [], [], {}, [0.0, 0.0, 0.0]
    for f in range(int(round(total * FPS)) + 1):
        t = f / FPS
        v = {name: curve(t) for name, curve in c.items()}
        q = [x.copy() for x in base_q]
        loc = base_loc + HIPS_REST_INV @ ((FORWARD0 * v['fx'] + LEFT0 * v['fy'] + UP0 * v['fz']) / unit)
        tremble = v['shake']
        pitch = v['pitch'] + tremble * math.sin(2 * math.pi * 13 * t)
        roll = v['roll'] + tremble * 0.7 * math.sin(2 * math.pi * 9 * t + 1.0)
        bend_trunk(q, loc, v['yaw'], pitch, roll, LEFT.upper)
        pose = rig.fk(q, loc)
        feet = []
        for i, name in enumerate(('sl', 'sr')):
            ankle, foot3, knee = stand[i]
            speed = abs(c[name](t + 0.5 / FPS) - c[name](t - 0.5 / FPS)) * FPS  # metres a second
            lift = min(0.07, speed * 0.05)
            feet.append((ankle + (FORWARD0 * v[name] + UP0 * lift) / unit, foot3, knee))
        worst[2] = max(worst[2], max(leg.plant(q, pose, *foot) for leg, foot in zip(LEGS, feet)) * unit)
        pose = rig.fk(q, loc)
        for p, side in (('r', RIGHT), ('l', LEFT)):
            w = min(1.0, max(0.0, v[p + 'w']))
            if w < 1e-3:
                near.pop(p, None)
                continue
            point = pose[side.upper].translation + aim_dir(v[p + '_az'], v[p + '_el']) * (min(v[p + '_reach'], 0.985) * (side.len1 + side.len2))
            solved, bend, miss = easy_hold(pose, q, point, aim_dir(v[p + '_taz'], v[p + '_tel']), near.get(p), side)
            near[p] = solved[side.hand].to_3x3()
            was = [q[i].copy() for i in (side.upper, side.fore, side.hand)]
            side.take(q, pose, solved)
            if w < 1:
                for k, i in enumerate((side.upper, side.fore, side.hand)):
                    q[i] = was[k].slerp(q[i], w)
            worst[0] = max(worst[0], miss * unit * w)
            worst[1] = max(worst[1], math.degrees(bend) * w)
            pose = rig.fk(q, loc)
        for p, side in (('r', RIGHT), ('l', LEFT)):
            o = min(1.0, max(0.0, v[p + 'o']))
            if o > 1e-3:
                for i in side.fingers:
                    q[i] = q[i].slerp(Quaternion(), o)
        turn_head(q, loc, v['hyaw'], v['hpitch'], v['hroll'])
        out_q.append(q)
        out_loc.append(loc)
    return {'q': out_q, 'loc': out_loc}, worst


# ---- the moments (seconds; KEEP IN STEP with core/moves.mjs where the rules time them: the taunts' 2.2 s, the
# Rage's 0.5 s roar, the Execution's 0.78 s thrust and 1.18 s shove, Mind Dominance's 0.2 s cast)
TAUNT = 2.2
MOMENTS = {
    # "Is that all you have got?": the sword dropped low out to the side, the chest out and the chin up, the free
    # hand held out palm up and beckoning twice, then the stance
    'swordTauntWarrior': ('sword', TAUNT, [
        K(0.32, yaw=6, pitch=-9, fx=0.03, fz=0.01, r=(-72, -32, 0.93, -80, -55), l=(30, -2, 0.9, 120, 10), lo=1.0, hpitch=-12, hroll=-5),
        K(0.62, l=(26, 8, 0.72, 118, 35), lo=0.15),
        K(0.80, l=(30, -2, 0.9, 120, 10), lo=1.0),
        K(1.00, l=(26, 8, 0.72, 118, 35), lo=0.15),
        K(1.20, l=(30, -2, 0.9, 120, 10), lo=1.0),
        K(1.62, yaw=8, pitch=-10, fx=0.03, fz=0.01, r=(-74, -34, 0.93, -82, -57), hpitch=-14, hroll=-6, lo=0.9),
    ]),
    # "I will still be standing.": the blade raised straight up overhead, the free hand on the heart, the chin up
    'swordTauntHealer': ('sword', TAUNT, [
        K(0.45, yaw=-6, pitch=-7, fz=0.02, r=(-12, 76, 0.95, 0, 88), l=(-34, -40, 0.47, 30, 80), lo=0.8, hpitch=-12),
        K(1.60, yaw=-8, pitch=-9, fz=0.025, r=(-10, 79, 0.97, 4, 89), l=(-36, -40, 0.46, 30, 80), lo=0.8, hpitch=-14),
    ]),
    # "Too slow.": the twin blades crossed before the face, swept out and down to the sides, held with a tilt of
    # the head
    'bladesTaunt': ('blades', TAUNT, [
        K(0.26, pitch=-3, r=(14, 32, 0.62, 40, 62), l=(-14, 32, 0.62, -40, 62), hpitch=5),
        K(0.50, pitch=-7, fz=0.015, r=(-82, -26, 0.95, -100, -45), l=(82, -26, 0.95, 100, -45), hroll=6, hpitch=-6),
        K(1.00, hroll=11, hyaw=-6, fz=0.0),
        K(1.60, pitch=-8, r=(-84, -29, 0.95, -102, -50), l=(84, -29, 0.95, 102, -50), hroll=10, hyaw=-5),
    ]),
    # "You never saw me coming.": the staff planted upright at her side and leant on, the free hand on her hip,
    # the hips cocked toward the staff, the head tilted
    'staffTaunt': ('staff', TAUNT, [
        K(0.42, roll=-5, fy=-0.05, fz=-0.01, r=(-78, -64, 0.84, 0, 89), l=(112, -76, 0.64, 175, -10), lo=0.5, hroll=11, hyaw=-12),
        K(1.65, roll=-6, fy=-0.055, fz=-0.012, r=(-78, -65, 0.84, 0, 89), l=(112, -76, 0.64, 175, -10), lo=0.5, hroll=13, hyaw=-14),
    ]),
    # the Rage: hunched and gathered, the chest thrown up and the arms flung wide and back, trembling through the
    # scream, then down into a forward lean to charge
    'swordRoar': ('sword', 1.1, [
        K(0.16, pitch=16, fx=-0.02, fz=-0.07, r=(-30, -45, 0.55, -10, -60), l=(-5, -30, 0.5, -60, 40), lo=0.0, hpitch=12),
        K(0.30, pitch=-22, fx=0.03, fz=0.02, r=(-100, -8, 0.97, -115, -25), l=(100, -8, 0.97, 130, 45), lo=1.0, hpitch=-38, shake=0.0),
        K(0.36, shake=2.4),
        K(0.50, pitch=-21, r=(-102, -10, 0.97, -117, -27), l=(102, -10, 0.97, 132, 45), hpitch=-36, shake=2.4),
        K(0.70, pitch=14, fx=0.06, fz=-0.05, r=(-30, -18, 0.8, -15, 20), l=(30, -15, 0.7, 60, 40), lo=0.3, hpitch=-6, shake=0.0),
    ]),
    # the Execution: the pull, the thrust into the centre with a step in, the blade drawn out, the shove
    'bladesExecution': ('blades', 1.7, [
        K(0.12, yaw=-14, pitch=4, fx=0.02, l=(4, 8, 0.97, 10, 82), lo=0.0),
        K(0.40, yaw=-4, pitch=-4, fx=-0.03, l=(-12, -8, 0.46, 0, 82)),
        K(0.68, yaw=-24, pitch=2, fx=-0.02, fz=-0.03, r=(-52, -42, 0.5, 0, 6), l=(-8, -12, 0.45, 0, 82), sr=0.0),
        K(0.80, yaw=16, pitch=10, fx=0.09, fz=-0.05, r=(-2, 2, 0.98, 0, 0), sr=0.28),
        K(0.96, yaw=14, pitch=9, fx=0.09, fz=-0.05, r=(-2, 1, 0.97, 0, -2)),
        K(1.10, yaw=-6, pitch=3, fx=0.04, fz=-0.03, r=(-42, -28, 0.55, 0, 4), l=(-6, -10, 0.5, 0, 82)),
        K(1.21, yaw=-20, pitch=8, fx=0.07, l=(2, 10, 0.98, 0, 84), lo=0.0, sr=0.2),
        K(1.40, yaw=-12, pitch=4, fx=0.04, sr=0.08),
    ]),
    # Mind Dominance: two fingers to the temple, then the hand thrown at the enemy, the staff kept in the right
    'staffDominate': ('staff', 0.75, [
        K(0.15, yaw=-6, l=(-25, 62, 0.33, -40, 70), lo=0.4, hpitch=10, hroll=6),
        K(0.24, yaw=-16, pitch=6, l=(4, 9, 0.97, 8, 80), lo=1.0, hpitch=-3, hroll=0),
        K(0.42, yaw=-12, pitch=4, l=(4, 8, 0.95, 8, 80), lo=0.9),
    ]),
}


def build_moments(add, notes, idle, blades_idle, staff_idle, only=None):
    stances = {'sword': idle, 'blades': blades_idle, 'staff': staff_idle}
    for name, (kind, total, keys) in MOMENTS.items():
        if only and name not in only:
            continue
        base = stances[kind]
        base_q, base_loc = pose_of(base, 0)
        clip, worst = make_moment(keys, total, base_q, base_loc)
        add(name, inertial_in(clip, base, 0, 0.08), f'a moment posed key by key on the {kind} stance', sigma=1.2)
        print('MOMENT', name, 'seconds', notes[name]['seconds'], 'arm miss %.3f m, wrist %d deg, foot miss %.3f m' % tuple(worst))


def contact_sheet(rows, out_path):
    """Pictures in rows (a row a clip) as one PNG, with Blender's own images (no other tools needed)."""
    loaded = [[bpy.data.images.load(p) for p in row] for row in rows if row]
    w, h = loaded[0][0].size
    cols = max(len(r) for r in loaded)
    canvas = np.zeros((len(loaded) * h, cols * w, 4), dtype=np.float32)
    canvas[..., 3] = 1
    for ri, row in enumerate(loaded):
        y0 = (len(loaded) - 1 - ri) * h  # the first row at the top: pixels run up from the bottom
        for ci, im in enumerate(row):
            px = np.empty(w * h * 4, dtype=np.float32)
            im.pixels.foreach_get(px)
            canvas[y0:y0 + h, ci * w:(ci + 1) * w] = px.reshape(h, w, 4)
    out = bpy.data.images.new('contact', cols * w, len(loaded) * h, alpha=False)
    out.pixels.foreach_set(canvas.ravel())
    out.filepath_raw = out_path
    out.file_format = 'PNG'
    out.save()
    return out_path
