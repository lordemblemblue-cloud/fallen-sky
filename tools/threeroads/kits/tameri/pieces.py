"""Tameri's kit: a New Kingdom river army (the Landing). Game coordinates (see common/kitlib).

Metres, x right, y up, z toward the front. Builders work above y = 0; Builder.finish
carries whatever touches the ground down by the table's skirt. Boats ('waterline')
set B.below: the hull's draft under the water. The hoist ('frame') sets B.reach:
its arm reaches 6 m beyond the frame toward +z, over the drop.
Our own designs from the way such an army made camp: a rail of hide shields,
painted flagstaffs, a linen pavilion on a mud-brick platform, jars and grain,
a great lever, a cargo barge and papyrus boats. No lettering; the tally board
carries tally strokes only.
"""
import math

from kitlib import M

PI = math.pi
TAU = 2 * PI


def L0(B):
    return B.lod == 0


def _loft(B, rings, cols, cap=True):
    """Join rings of equal length (lists of 3D points) into a closed skin.
    cols: one colour per ring edge (edge j joins point j and j+1)."""
    n = len(rings[0])
    verts = [p for ring in rings for p in ring]
    faces, fcols = [], []
    for i in range(len(rings) - 1):
        for j in range(n):
            j1 = (j + 1) % n
            a, b = i * n + j, i * n + j1
            faces.append((a, b, b + n, a + n))
            fcols.append(cols[j])
    if cap:
        faces.append(tuple(reversed(range(n))))
        fcols.append(cols[-1])
        last = (len(rings) - 1) * n
        faces.append(tuple(last + j for j in range(n)))
        fcols.append(cols[-1])
    B.mesh(verts, faces, cols[0], cols=fcols)


def _tube(B, path, radii, segs, col, sz=1.0, cols=None):
    """A round bundle swept along a path in the xy plane (z is the path's side)."""
    rings = []
    for i, (p, r) in enumerate(zip(path, radii)):
        a = path[max(0, i - 1)]
        b = path[min(len(path) - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        tl = math.hypot(tx, ty) or 1.0
        ux, uy = -ty / tl, tx / tl
        ring = []
        for k in range(segs):
            t = TAU * k / segs
            c, s = math.cos(t), math.sin(t)
            ring.append((p[0] + ux * r * c, p[1] + uy * r * c, p[2] + r * s * sz))
        rings.append(ring)
    _loft(B, rings, cols or [col] * segs)


def _flame(B):
    """Built from y 0 (it sits at y 1.1 in its bowl) to 0.6."""
    if L0(B):
        B.lathe([(0.17, 0.0), (0.19, 0.08), (0.14, 0.22), (0.08, 0.38), (0.0, 0.6)], 7, 'flame_core',
                cols=['flame_core', 'flame_core', 'flame', 'flame'], phase=0.3, smooth=False)
        for k in range(5):
            a = TAU * k / 5 + 0.2
            h = 0.36 + 0.1 * ((k * 3) % 4) / 3
            m = M((math.cos(a) * 0.13, 0.0, -math.sin(a) * 0.13)) @ M((0, 0, 0), ry=a) @ M((0, 0, 0), rz=-0.22)
            B.lathe([(0.075, 0.0), (0.08, 0.06), (0.04, h * 0.6), (0.0, h)], 5, 'flame', m=m, smooth=False)
    else:
        B.lathe([(0.2, 0.0), (0.21, 0.08), (0.12, 0.28), (0.0, 0.6)], 5, 'flame', cols=['flame_core', 'flame', 'flame'],
                smooth=False)
        for k in range(3):
            a = TAU * k / 3 + 0.5
            m = M((math.cos(a) * 0.15, 0.0, -math.sin(a) * 0.15)) @ M((0, 0, 0), ry=a) @ M((0, 0, 0), rz=-0.25)
            B.lathe([(0.08, 0.0), (0.0, 0.4)], 4, 'flame', m=m, smooth=False)


def _jar(B, x, z, h=0.8, r=0.24, y=0.0, sealed=True):
    """A tall storage jar standing at (x, y, z)."""
    segs = 10 if L0(B) else 6
    if L0(B):
        prof = [(0.0, 0.0), (r * 0.35, 0.02), (r * 0.8, h * 0.18), (r, h * 0.45), (r * 0.92, h * 0.68), (r * 0.55, h * 0.84),
                (r * 0.42, h * 0.88), (r * 0.48, h * 0.93), (r * 0.46, h * 0.97), (0.0, h)]
        cols = ['mudbrick'] * 7 + ['earth' if sealed else 'mudbrick', 'earth']
    else:
        prof = [(0.0, 0.0), (r * 0.8, h * 0.18), (r, h * 0.45), (r * 0.55, h * 0.84), (r * 0.46, h * 0.95), (0.0, h)]
        cols = ['mudbrick', 'mudbrick', 'mudbrick', 'mudbrick', 'earth']
    B.lathe(prof, segs, 'mudbrick', cols=cols, m=M((x, y, z)))
    if L0(B):
        B.ring((x, y + h * 0.6, z), r * 0.96, r * 1.0, 0.03, segs, 'rope')


# --------------------------------------------------------------------------
# The enclosure
# --------------------------------------------------------------------------

def shield_wall(B, r):
    """Tall hide shields edge to edge on a rail; 4 m so runs tile end to end."""
    n = 7
    w = 4.0 / n
    B.box((0, 0, 0.02), (4.0, 0.12, 0.28), 'mudbrick')  # the sill the shields stand in
    B.box((-1.96, 0, -0.1), (0.08, 1.45, 0.08), 'timber')  # one post per run, at its left end
    B.beam((-1.96, 1.0, -0.1), (-1.96, 0.0, -0.22), 0.06, 0.06, 'timber_old')  # its prop
    B.box((0, 1.1, -0.1), (4.0, 0.07, 0.07), 'timber')
    B.box((0, 0.18, -0.1), (4.0, 0.07, 0.07), 'timber')
    arc = 5 if L0(B) else 2
    for k in range(n):
        x = -2.0 + w * (k + 0.5)
        hw = w / 2 - 0.012
        top = 1.3 + 0.04 * ((k * 5) % 3)
        outline = [(-hw, 0.04), (hw, 0.04)]
        for i in range(arc + 1):
            a = PI * i / arc
            outline.append((math.cos(a) * hw, top + math.sin(a) * hw * 0.85))
        light = k % 2 == 0
        pts = [(x + ox, oy, z) for (ox, oy) in outline for z in (0.02, 0.07)]
        B.hull(pts, 'linen' if light else 'leather')
        if L0(B):
            # dappled hide: a few dark patches on the light shields, light ones on the dark
            for (px, py, pw, ph) in ((-0.08, 0.5, 0.14, 0.18), (0.07, 1.0, 0.12, 0.2), (0.02, 0.25, 0.1, 0.1)):
                B.box((x + px, py, 0.075), (pw, ph, 0.01), 'leather_dk' if light else 'sand')
            B.box((x, top - 0.02, 0.075), (0.06, 0.06, 0.012), 'brass')


def flagstaff(B, r):
    segs = 8 if L0(B) else 5
    B.box((0, 0, 0), (0.5, 0.5, 0.5), 'mudbrick', top=(0.85, 0.85))
    B.cyl((0, 0.5, 0), 0.12, 12.2, segs, 'timber', r_top=0.06)
    B.lathe([(0.06, 12.68), (0.09, 12.75), (0.07, 12.85), (0.0, 13.0)], segs, 'brass', smooth=False)
    B.cyl((0, 12.55, 0), 0.085, 0.08, segs, 'brass')  # the ring the pennant hangs from
    for y in ((2.0, 4.5, 7.0, 9.5) if L0(B) else (4.5, 9.5)):
        B.cyl((0, y, 0), 0.11 - 0.005 * y, 0.35, segs, 'eg_blue')
    if L0(B):
        for y in (2.35, 4.85, 7.35, 9.85):
            B.cyl((0, y, 0), 0.105 - 0.005 * y, 0.12, segs, 'red')
        for k in range(4):  # wedges at the foot
            a = TAU * k / 4
            B.beam((math.cos(a) * 0.12, 1.0, -math.sin(a) * 0.12), (math.cos(a) * 0.24, 0.5, -math.sin(a) * 0.24), 0.08, 0.05,
                   'timber_old')


def pennant(B, r):
    """Long cloth streamer, built from y 0 (tail) to 4 (tie); hangs from its top."""
    n = 10 if L0(B) else 4
    B.box((0, 3.92, 0), (0.48, 0.08, 0.04), 'white_dk')
    for i in range(n):
        y0 = 3.92 * i / n
        y1 = 3.92 * (i + 1) / n
        q = []
        for y in (y0, y1):
            t = 1 - y / 3.92  # 0 at the top, 1 at the tail
            hw = 0.22 - 0.14 * t
            cx = 0.1 * math.sin(t * 2.6) * t
            cz = 0.012 * math.sin(t * 5.0)
            q += [(cx - hw, y, cz - 0.008), (cx + hw, y, cz - 0.008), (cx - hw, y, cz + 0.008), (cx + hw, y, cz + 0.008)]
        B.hull(q, 'white' if i != n - 2 else 'white_dk')


# --------------------------------------------------------------------------
# Tents
# --------------------------------------------------------------------------

def pavilion_life(B, r):
    """The House of Life: a linen pavilion on its own mud-brick platform; steps at the front (+z)."""
    P = 0.8
    B.box((0, 0, -0.45), (8.0, P, 5.1), 'mudbrick')
    for k in range(3):  # three treads in front, z 2.1 .. 3.0
        z1 = 3.0 - 0.3 * k
        B.box((0, 0, (2.1 + z1) / 2), (2.4, P * (k + 1) / 3, z1 - 2.1), 'mudbrick')
    B.box((0, P, -0.45), (8.0, 0.05, 5.1), 'sand')
    cols_x = (-2.9, 0.0, 2.9)
    cols_z = (-2.4, 1.4)
    segs = 8 if L0(B) else 5
    for x in cols_x:
        for z in cols_z:
            B.lathe([(0.2, P + 0.05), (0.17, P + 0.3), (0.15, P + 2.4), (0.25, P + 2.75), (0.2, P + 2.85)], segs, 'papyrus',
                    cols=['eg_blue', 'papyrus', 'papyrus', 'eg_blue'], m=M((x, 0, z)))
    yb = P + 2.85
    for z in cols_z:
        B.box((0, yb, z), (6.3, 0.2, 0.22), 'timber')
    for x in cols_x:
        B.box((x, yb, -0.5), (0.22, 0.2, 4.2), 'timber')
    B.gable_roof(0, -0.5, 6.8, 4.6, yb + 0.15, 4.2, 0.06, 'linen', along='x')
    for sz in (-1, 1):
        B.box((0, yb + 0.02, -0.5 + sz * 2.28), (6.8, 0.22, 0.05), 'eg_blue')  # the border of the canopy
    # walls: linen hangings on the back and the sides, the front open
    B.box((0, P + 0.05, -2.45), (5.9, 2.75, 0.05), 'linen')
    for sx in (-1, 1):
        B.box((sx * 2.95, P + 0.05, -0.5), (0.05, 2.75, 3.8), 'linen')
        B.box((sx * 2.35, P + 0.05, 1.42), (1.1, 2.75, 0.05), 'linen')  # front hangings drawn aside
    if L0(B):
        for sx in (-1, 1):
            B.box((sx * 2.35, P + 1.2, 1.46), (1.15, 0.1, 0.06), 'red')
            B.box((sx * 2.97, P + 2.35, -0.5), (0.06, 0.18, 3.85), 'eg_blue')
        B.box((0, P + 2.35, -2.48), (5.95, 0.18, 0.06), 'eg_blue')
        for k in range(10):  # brick courses read on the platform
            B.box((-3.8 + k * 0.85, 0.4, 2.12), (0.02, 0.4, 0.02), 'earth')
        B.box((0, 0.4, 2.12), (8.0, 0.02, 0.02), 'earth')
        B.box((-1.5, P + 0.05, -1.6), (1.8, 0.45, 0.8), 'timber_lt')  # a couch for the sick
        B.box((-1.5, P + 0.5, -1.6), (1.8, 0.06, 0.8), 'linen')
        _jar(B, 1.6, -1.8, 0.6, 0.18, y=P + 0.05)
        _jar(B, 2.1, -1.9, 0.5, 0.16, y=P + 0.05)


def awning(B, r):
    """Reed mat on four poles, higher at the back; walk under it."""
    for sx in (-1, 1):
        for sz in (-1, 1):
            h = 2.35 if sz > 0 else 2.55
            B.cyl((sx * 1.88, 0, sz * 1.38), 0.055, h, 6 if L0(B) else 4, 'timber')
    pts = []
    for sx in (-1, 1):
        pts += [(sx * 2.0, 2.52, -1.5), (sx * 2.0, 2.6, -1.5), (sx * 2.0, 2.32, 1.5), (sx * 2.0, 2.4, 1.5)]
    B.hull(pts, 'reed')
    if L0(B):
        for k in range(7):  # bindings across the mat
            z = -1.35 + 0.45 * k
            y = 2.6 - 0.2 * (z + 1.5) / 3.0 + 0.005
            B.box((0, y, z), (4.0, 0.015, 0.04), 'rope')
        for sx in (-1, 1):
            for sz in (-1, 1):
                B.beam((sx * 1.88, 2.2, sz * 1.38), (sx * 2.0, 0.02, sz * 1.5), 0.015, 0.015, 'rope')


def tally_board(B, r):
    """The count of days of grain, in strokes (tally marks, no writing)."""
    for sx in (-1, 1):
        B.box((sx * 0.62, 0, 0), (0.1, 1.9, 0.1), 'timber')
    B.box((0, 0.95, 0.03), (1.3, 0.85, 0.05), 'linen')  # a plastered board
    B.box((0, 1.82, 0), (1.4, 0.08, 0.3), 'timber')
    if L0(B):
        for row in range(3):
            y = 1.08 + row * 0.25
            count = (9, 7, 4)[row]
            for k in range(count):
                x = -0.5 + k * 0.11 + (k // 5) * 0.06
                B.box((x, y, 0.06), (0.018, 0.16, 0.01), 'dark')
        B.box((0.3, 0.0, 0.05), (0.3, 0.35, 0.25), 'reed')  # a basket of tokens at its foot


# --------------------------------------------------------------------------
# Grain
# --------------------------------------------------------------------------

def grain_stack(B, r):
    """Sacks and baskets heaped under a net."""
    n = 10 if L0(B) else 9
    placements = [(-0.8, 0.0, -0.6), (0.2, 0.0, -0.75), (0.95, 0.0, 0.1), (-0.9, 0.0, 0.6), (0.1, 0.0, 0.8),
                  (-0.3, 0.75, -0.2), (0.55, 0.7, -0.1), (-0.2, 0.7, 0.55), (0.1, 1.4, 0.15), (0.0, 0.0, 0.0)]
    for k, (x, y, z) in enumerate(placements[:n]):
        B.rock((x, y, z), (0.55, 0.8, 0.45), 'linen' if k % 3 else 'sand', n=12 if L0(B) else 7, smooth=True)
    if L0(B):
        for (x, z) in ((1.15, -0.95), (-1.2, -0.2)):  # baskets at the foot
            B.lathe([(0.25, 0.0), (0.32, 0.4), (0.3, 0.45), (0.0, 0.42)], 8, 'reed', m=M((x, 0, z)), smooth=False)
        # the net: cords over the heap and stones weighting its corners
        for k in range(5):
            a = PI * k / 4
            c, s = math.cos(a), math.sin(a)
            pts = [(c * 1.45, 0.25, s * 1.45), (c * 0.9, 1.6, s * 0.9), (0, 2.25, 0), (-c * 0.9, 1.6, -s * 0.9),
                   (-c * 1.45, 0.25, -s * 1.45)]
            for i in range(4):
                B.beam(pts[i], pts[i + 1], 0.025, 0.025, 'rope')
        for k in range(4):
            a = TAU * k / 4 + PI / 4
            B.rock((math.cos(a) * 1.35, 0, math.sin(a) * 1.35), (0.13, 0.15, 0.12), 'stone', n=8)
    B.rock((0, 2.0, 0), (0.35, 0.6, 0.3), 'sand', n=10 if L0(B) else 6, smooth=True)


def jar_rack(B, r):
    """Five storage jars in a wooden rack."""
    for sx in (-1, 1):
        B.box((sx * 1.45, 0, 0), (0.1, 1.0, 0.9), 'timber', top=(1.0, 0.3))
    for sz in (-1, 1):
        B.box((0, 0.75, sz * 0.36), (3.0, 0.08, 0.08), 'timber')
        B.box((0, 0.12, sz * 0.36), (3.0, 0.08, 0.08), 'timber')
    for k in range(5):
        _jar(B, -1.12 + 0.56 * k, 0.0, h=1.3, r=0.26)


def grain_jar(B, r):
    _jar(B, 0, 0, h=0.8, r=0.25)
    if L0(B):
        B.lathe([(0.13, 0.76), (0.14, 0.78), (0.0, 0.8)], 8, 'linen')


# --------------------------------------------------------------------------
# The gorge
# --------------------------------------------------------------------------

def hoist(B, r):
    """A great lever on a frame with a counterweight. The frame stands on its 3 x 4
    footprint; the long arm reaches 6 m beyond it toward +z, over the drop, with a
    net of jars on its rope."""
    B.reach = 6.0
    py = 6.7
    for sx in (-1, 1):
        x = sx * 1.25
        B.box((x, 0, 0), (0.28, py + 0.2, 0.28), 'timber')
        B.beam((x, 0.0, -1.85), (x, py - 0.3, 0.0), 0.2, 0.2, 'timber_old')
        B.beam((x, 0.0, 1.85), (x, py - 0.3, 0.0), 0.2, 0.2, 'timber_old')
        B.box((x, 0, 0), (0.5, 0.3, 4.0), 'mudbrick')  # sill on the rim
    B.cyl((-1.45, py, 0), 0.1, 2.9, 8 if L0(B) else 5, 'timber', axis='x')  # the axle
    # the arm: short end with the weight behind (-z), long end over the drop (+z)
    B.limb((0, py - 0.55, -2.0), (0, py + 0.55, 8.0), 0.17, 0.09, 8 if L0(B) else 5, 'timber')
    B.rock((0, py - 2.0, -1.55), (0.42, 0.95, 0.4), 'mudbrick', n=14 if L0(B) else 8)  # counterweight: a bag of mud
    B.beam((0, py - 0.5, -1.6), (0, py - 1.1, -1.55), 0.04, 0.04, 'rope')
    B.beam((0, py + 0.48, 7.8), (0, 3.3, 7.8), 0.03, 0.03, 'rope')
    # the net of jars
    B.rock((0, 2.2, 7.8), (0.55, 1.1, 0.5), 'rope', n=12 if L0(B) else 7)
    if L0(B):
        for k in range(4):
            a = TAU * k / 4 + 0.4
            _jar(B, math.cos(a) * 0.2, 7.8 - math.sin(a) * 0.2, h=0.6, r=0.17, y=2.35)
        for sx in (-1, 1):
            B.box((sx * 1.25, 2.0, 0), (0.12, 0.12, 2.6), 'timber_old')


def landing_stage(B, r):
    """Plank stage on tall posts at the gorge's lip, reaching out over it toward +z.
    The posts carry the table's 7 m skirt; the deck stands just above y 0."""
    xs = (-2.3, 0.0, 2.3)
    zs = (-1.8, 0.0, 1.8)
    for x in xs:
        for z in zs:
            B.box((x, 0, z), (0.24, 0.25, 0.24), 'timber')
    for z in zs:
        B.box((0, 0.06, z), (5.0, 0.16, 0.2), 'timber_old')  # bearers
    B.box((0, 0.22, 0), (5.0, 0.1, 4.0), 'timber_lt')  # the deck
    for sx in (-1, 1):
        B.box((sx * 2.45, 0.32, 0.3), (0.08, 0.85, 3.4), 'timber', top=(1.0, 1.0))
    B.box((0, 1.12, 1.95), (5.0, 0.08, 0.08), 'timber')
    for x in (-2.45, -1.2, 0.0, 1.2, 2.45):
        B.box((x, 0.32, 1.95), (0.1, 0.88, 0.1), 'timber')
    if L0(B):
        for k in range(12):
            x = -2.3 + k * 4.6 / 11
            B.box((x, 0.32, 0), (0.02, 0.006, 3.9), 'timber_old')
        for x in xs:  # braces down from the deck edge: the skirt carries their feet
            B.beam((x, 0.06, 1.75), (x, 0.0, 0.9), 0.08, 0.08, 'timber_old')
        B.box((-1.9, 0.32, 1.6), (0.6, 0.06, 0.6), 'rope')  # a coil of rope where the jars come down
        B.box((0, 0.32, 1.7), (1.0, 0.12, 0.5), 'reed')  # mat at the head of the plank


def barge(B, r):
    """Cargo barge: blunt hull with upswept ends, a deck hut, a steering oar."""
    B.below = 0.6  # draft; builder y 0.6 is the water
    st = 13 if L0(B) else 7
    rings = []
    for i in range(st):
        x = -8.0 + 16.0 * i / (st - 1)
        f = abs(x) / 8.0
        w = max(0.12, 2.2 * (1 - f ** 4) ** 0.5)
        yb = 0.95 * f ** 3
        yt = 1.15 + (1.55 if x < 0 else 1.15) * f ** 5
        rings.append([(x, yt, w), (x, yb + 0.4, w * 0.96), (x, yb, w * 0.55), (x, yb, -w * 0.55), (x, yb + 0.4, -w * 0.96),
                      (x, yt, -w)])
    _loft(B, rings, ['timber', 'timber_old', 'dark', 'timber_old', 'timber', 'timber_lt'])
    # stern post curling up, a prow post
    B.limb((-7.6, 2.4, 0), (-8.0, 3.55, 0), 0.16, 0.08, 6 if L0(B) else 4, 'timber')
    B.limb((7.6, 2.0, 0), (7.95, 2.85, 0), 0.14, 0.08, 6 if L0(B) else 4, 'timber')
    # deck hut, aft
    B.box((-3.0, 1.15, 0), (3.0, 1.45, 2.4), 'linen')
    B.hull([(-4.6, 2.55, -1.35), (-1.4, 2.55, -1.35), (-4.6, 2.55, 1.35), (-1.4, 2.55, 1.35), (-4.6, 2.9, 0), (-1.4, 2.9, 0)],
           'reed')
    B.box((-3.0, 1.15, 1.21), (0.8, 1.2, 0.03), 'dark')
    # the steering oar on its post
    B.cyl((-6.6, 1.6, 0), 0.08, 1.5, 6 if L0(B) else 4, 'timber')
    B.beam((-6.6, 3.0, 0.1), (-7.95, 0.2, 1.9), 0.09, 0.09, 'timber_old')
    B.box((-7.95, 0.05, 1.95), (0.08, 0.7, 0.5), 'timber_old', m=M((0, 0, 0)))
    if L0(B):
        for k, x in enumerate((0.6, 1.5, 2.4, 3.3, 1.0, 2.0, 2.9)):  # cargo: sacks and jars forward
            z = (-0.8 if k < 4 else 0.7) + (0.15 if k % 2 else 0)
            if k % 3 == 2:
                _jar(B, x, z, h=0.9, r=0.25, y=1.15)
            else:
                B.rock((x, 1.15, z), (0.42, 0.45, 0.32), 'linen', n=10, smooth=True)
        for sx in (-1, 1):
            B.box((-3.0 + sx * 1.0, 1.15, 0), (0.05, 1.55, 2.45), 'eg_blue')
        B.cyl((-6.6, 1.15, 0), 0.12, 0.45, 6, 'timber')


def reed_boat(B, r):
    """Papyrus-bundle boat with upturned ends."""
    B.below = 0.3
    n = 13 if L0(B) else 7
    segs = 8 if L0(B) else 5

    def path(zoff, yoff, scale):
        pts, rad = [], []
        for i in range(n):
            x = -4.5 + 9.0 * i / (n - 1)
            f = abs(x) / 4.5
            y = 0.42 + yoff + 1.55 * f ** 3.2
            pts.append((x * (1 - 0.04 * f), y, zoff * (1 - 0.6 * f ** 2)))
            rad.append(max(0.06, (0.42 * scale) * (1 - f ** 2.2) + 0.06))
        return pts, rad
    p, rr = path(0.0, 0.0, 1.0)
    _tube(B, p, rr, segs, 'papyrus')
    for sz in (-1, 1):
        p2, r2 = path(sz * 0.62, -0.06, 0.78)
        _tube(B, p2, r2, segs, 'reed')
    if L0(B):
        for i in range(1, n - 1, 2):  # lashings
            x, y, _ = p[i]
            rad = rr[i]
            B.ring((x - 0.04, y, 0.0), rad * 1.55 + 0.05, rad * 1.55 + 0.1, 0.08, 10, 'rope', axis='x', smooth=False)
        B.box((0.0, 0.85, 0), (2.4, 0.06, 1.0), 'reed')  # a mat to stand on
        B.beam((-3.4, 1.1, 0.4), (-4.3, 0.2, 1.05), 0.05, 0.05, 'timber_old')  # a steering paddle


def reed_clump(B, r):
    """Tall reeds and a few papyrus heads for the water's edge and the rim."""
    blades = 34 if L0(B) else 12
    rng = B.rng
    for k in range(blades):
        a = rng.uniform(0, TAU)
        d = rng.uniform(0.0, 0.62)
        x, z = math.cos(a) * d, math.sin(a) * d
        h = rng.uniform(1.2, 2.2)
        lean = rng.uniform(-0.35, 0.35)
        la = rng.uniform(0, TAU)
        tip = (x + math.cos(la) * lean * h * 0.3, h, z + math.sin(la) * lean * h * 0.3)
        w = rng.uniform(0.025, 0.045)
        B.hull([(x - w, 0.0, z), (x + w, 0.0, z), (x, 0.0, z + w), tip, (tip[0] + 0.01, tip[1], tip[2])],
               'reed' if k % 3 else 'papyrus')
    heads = 5 if L0(B) else 2
    for k in range(heads):
        a = TAU * k / heads + 0.4
        x, z = math.cos(a) * 0.3, math.sin(a) * 0.3
        h = 1.6 + 0.12 * k
        B.beam((x * 0.4, 0.0, z * 0.4), (x, h, z), 0.025, 0.025, 'papyrus')
        B.lathe([(0.02, h - 0.02), (0.22, h + 0.12), (0.0, h + 0.08)], 7 if L0(B) else 5, 'papyrus', m=M((x, 0, z)),
                smooth=False)


# --------------------------------------------------------------------------
# Yard
# --------------------------------------------------------------------------

def brazier_bowl(B, r):
    """A painted stand with a wide bronze bowl."""
    segs = 10 if L0(B) else 6
    B.lathe([(0.3, 0.0), (0.3, 0.08), (0.16, 0.18), (0.11, 0.3), (0.1, 0.85), (0.16, 0.95), (0.12, 1.02)], segs, 'mudbrick',
            cols=['mudbrick', 'eg_blue', 'mudbrick', 'mudbrick', 'eg_blue', 'brass'], cap=True)
    B.lathe([(0.1, 1.0), (0.3, 1.08), (0.4, 1.22), (0.4, 1.3), (0.35, 1.3), (0.26, 1.18), (0.0, 1.15)], segs, 'brass',
            cols=['brass', 'brass', 'brass', 'brass', 'char', 'char'], cap=False, smooth=False)
    if L0(B):
        B.lathe([(0.3, 1.17), (0.2, 1.24), (0.0, 1.27)], 8, 'ember', smooth=False)


def brazier_flame(B, r):
    _flame(B)


def _wheel(B, x, z, rad=0.48):
    y = rad
    if L0(B):
        B.ring((x, y, z - 0.04), rad - 0.06, rad, 0.08, 12, 'timber', axis='z', cols=['timber', 'leather_dk', 'timber', 'timber'],
               smooth=False)
        for k in range(6):
            a = k * PI / 3
            B.beam((x, y, z), (x + math.cos(a) * (rad - 0.05), y + math.sin(a) * (rad - 0.05), z), 0.04, 0.04, 'timber_lt',
                   up=(0, 0, 1))
        B.cyl((x, y, z - 0.12), 0.07, 0.24, 6, 'timber_old', axis='z')
    else:
        B.cyl((x, y, z - 0.04), rad, 0.08, 8, 'timber', axis='z', smooth=False)


def chariot(B, r):
    """Parked chariot, its pole resting on a forked prop: the archer's, with a bow case."""
    for sz in (-1, 1):
        _wheel(B, -0.75, sz * 0.84)
    B.cyl((-0.75, 0.48, -0.84), 0.04, 1.68, 6 if L0(B) else 4, 'timber_old', axis='z')  # axle
    # the car: floor, D-shaped breastwork, siding
    B.box((-0.4, 0.5, 0), (0.9, 0.06, 1.0), 'timber_lt')
    rail = []
    for i in range(9 if L0(B) else 5):
        a = -PI / 2 + PI * i / (8 if L0(B) else 4)
        rail.append((-0.4 + 0.25 + math.cos(a) * 0.45, math.sin(a) * 0.5))
    for i in range(len(rail) - 1):
        (x0, z0), (x1, z1) = rail[i], rail[i + 1]
        B.hull([(x0, 0.56, z0), (x1, 0.56, z1), (x0, 1.05, z0), (x1, 1.05, z1), (x0 - 0.02, 0.56, z0 * 0.98),
                (x1 - 0.02, 1.05, z1 * 0.98)], 'red' if i % 2 == 0 else 'leather')
    B.limb((-0.2, 0.52, 0), (1.6, 0.98, 0), 0.05, 0.045, 6 if L0(B) else 4, 'timber')  # the pole
    B.limb((1.6, 0.98, 0), (2.35, 1.08, 0), 0.045, 0.04, 6 if L0(B) else 4, 'timber')
    B.box((2.3, 1.03, 0), (0.08, 0.08, 1.2), 'timber_old')  # yoke
    for sz in (-1, 1):  # the prop under the pole
        B.beam((1.9, 0.0, sz * 0.18), (1.93, 0.97, 0.0), 0.04, 0.04, 'timber_old')
    # the bow case and quiver on the side
    B.beam((-0.6, 0.65, 0.55), (0.35, 1.8, 0.52), 0.12, 0.08, 'leather', up=(0, 0, 1))
    if L0(B):
        B.beam((-0.55, 0.6, -0.52), (-0.1, 1.45, -0.55), 0.1, 0.1, 'red')
        for k in range(3):
            B.beam((-0.1 + k * 0.02, 1.45, -0.55), (-0.03 + k * 0.03, 1.62, -0.56), 0.012, 0.012, 'timber_lt')
        B.box((-0.4, 1.02, 0), (0.06, 0.04, 1.0), 'brass')
        for sz in (-1, 1):  # yoke saddles
            B.box((2.3, 1.08, sz * 0.4), (0.12, 0.25, 0.1), 'leather_dk')


# Companions shown with a piece on the contact sheets, at their mounted place.
COMBO = {
    'pennant': [('flagstaff_LOD{l}', (0, 0, 0)), ('pennant_LOD{l}', (0.28, 12.6, 0))],
    'brazier_flame': [('brazier_bowl_LOD{l}', (0, 0, 0)), ('brazier_flame_LOD{l}', (0, 0, 0))],
    'shield_wall': [('shield_wall_LOD{l}', (-2, 0, 0)), ('shield_wall_LOD{l}', (2, 0, 0))],
}

BUILDERS = {name: fn for name, fn in dict(globals()).items() if callable(fn) and not name.startswith('_') and name not in
            ('M', 'L0')}
