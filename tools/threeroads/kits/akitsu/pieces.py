"""Akitsu's kit: a Meiji-era field camp (the Camp of the Western Road). Game coordinates (see common/kitlib).

Metres, x right, y up, z toward the front. Builders work above y = 0; Builder.finish
carries whatever touches the ground down by the table's skirt. Our own designs from
the way such camps were made: white canvas on plank decks, a camp curtain round the
command post, tall narrow banners, rice-bale breastworks, a timber watchtower.
No lettering anywhere; the curtain's crest is a plain ring.
"""
import math

from kitlib import M

PI = math.pi
TAU = 2 * PI


def L0(B):
    return B.lod == 0


def _deck(B, w, d, h=0.25):
    """A plank deck on bearers; its feet are what the skirt carries down."""
    B.box((0, 0, 0), (w, h, d), 'timber_lt')
    if L0(B):
        n = int(w / 0.5)
        for k in range(1, n):
            x = -w / 2 + k * w / n
            B.box((x, h - 0.005, 0), (0.025, 0.012, d - 0.04), 'timber_old')
        for sx in (-1, 1):
            B.box((sx * (w / 2 - 0.08), 0, 0), (0.16, h, d + 0.02), 'timber')


def _bale(B, m, length=0.78, r=0.22):
    """A rice bale lying along the local z axis, centred on the origin of m."""
    segs = 6 if L0(B) else 5
    if L0(B):
        mid = length / 2
        prof = [(r * 0.72, 0.0), (r, 0.08), (r, mid - 0.04), (r, mid + 0.04), (r, length - 0.08), (r * 0.72, length)]
        cols = ['thatch_dk', 'straw', 'rope', 'straw', 'thatch_dk']
    else:
        prof = [(r * 0.8, 0.0), (r, 0.1), (r, length - 0.1), (r * 0.8, length)]
        cols = ['thatch_dk', 'straw', 'thatch_dk']
    B.lathe(prof, segs, 'straw', cols=cols, m=m @ M((0, 0, -length / 2), rx=PI / 2), smooth=False, phase=0.2)


# --------------------------------------------------------------------------
# Canvas
# --------------------------------------------------------------------------

def tent_bell(B, r):
    _deck(B, 4.0, 4.0)
    y0 = 0.25
    segs = 14 if L0(B) else 8
    B.lathe([(1.82, y0), (1.84, y0 + 0.62), (1.6, y0 + 0.8), (0.18, y0 + 2.72), (0.0, y0 + 2.78)], segs, 'canvas',
            cols=['khaki', 'canvas', 'canvas', 'canvas'], phase=PI / segs)
    B.cyl((0, y0 + 2.7, 0), 0.04, 0.25, 6, 'timber')  # the pole's top
    B.lathe([(0.0, y0 + 2.93), (0.06, y0 + 2.96), (0.0, y0 + 2.95)], 6, 'brass')
    B.hull([(-0.42, y0, 1.79), (0.42, y0, 1.79), (0.0, y0 + 1.75, 1.3), (-0.42, y0, 1.83), (0.42, y0, 1.83)], 'dark')
    if L0(B):
        B.hull([(0.42, y0, 1.84), (0.06, y0 + 1.7, 1.36), (0.85, y0 + 0.5, 1.75), (0.5, y0, 1.88)], 'canvas')  # flap tied back
        for k in range(6):  # guy ropes to deck cleats
            a = TAU * k / 6 + PI / 6
            c, s = math.cos(a), -math.sin(a)
            B.beam((c * 1.62, y0 + 0.82, s * 1.62), (c * 1.92, y0 + 0.03, s * 1.92), 0.018, 0.018, 'rope')
            B.box((c * 1.92, y0, s * 1.92), (0.08, 0.06, 0.08), 'timber')
        B.ring((0, y0 + 0.6, 0), 1.83, 1.87, 0.05, segs, 'navy', smooth=False, phase=PI / segs)


def tent_officer(B, r):
    _deck(B, 6.0, 4.0)
    y0 = 0.25
    W, D, wall = 2.55, 1.7, 1.55
    B.box((0, y0, 0), (2 * W, wall, 2 * D), 'canvas')
    B.gable_roof(0, 0, 2 * W + 0.4, 2 * D + 0.4, y0 + wall + 0.05, y0 + 2.55, 0.06, 'canvas', along='x')
    B.box((0, y0 + wall - 0.3, 0), (2 * W + 0.42, 0.32, 2 * D + 0.42), 'navy')  # the blue band
    for x in (-W - 0.1, W + 0.1):
        B.cyl((x, y0 + 2.4, 0), 0.04, 0.35, 6, 'timber')
    B.box((0, y0, D - 0.02), (1.1, 1.45, 0.06), 'dark')
    if L0(B):
        for sx in (-1, 1):
            B.box((sx * 0.75, y0, D + 0.02), (0.4, 1.5, 0.05), 'canvas')  # flaps rolled to the sides
            B.box((sx * 0.75, y0 + 1.35, D + 0.06), (0.42, 0.12, 0.08), 'canvas')
        for x in (-1.7, 0.0, 1.7):
            for sz in (-1, 1):
                B.beam((x, y0 + wall + 0.25, sz * (D + 0.2)), (x, y0 + 0.02, sz * 1.95), 0.016, 0.016, 'rope')
                B.box((x, y0, sz * 1.92), (0.08, 0.06, 0.08), 'timber')
        B.box((1.2, y0 + 0.55, D + 0.01), (0.6, 0.5, 0.04), 'dark')  # a window flap open


def curtain_run(B, r):
    """4 m of camp curtain on poles; the pole stands at the left end so runs tile end to end."""
    B.box((-1.96, 0, 0), (0.08, 2.1, 0.08), 'white_dk')
    B.box((0, 2.0, 0), (4.0, 0.025, 0.025), 'white_dk')  # the rope
    n = 10 if L0(B) else 4
    for k in range(n):
        x0 = -1.92 + 3.92 * k / n
        x1 = -1.92 + 3.92 * (k + 1) / n
        z = 0.075 if k % 2 == 0 else -0.075
        col = 'white' if k % 2 == 0 else 'white_dk'
        q = []
        for x in (x0, x1):
            for y in (0.32, 1.98):
                q += [(x, y, z - 0.012), (x, y, z + 0.012)]
        B.hull(q, col)
    B.box((-1.96, 2.06, 0), (0.12, 0.04, 0.12), 'white_dk')
    if L0(B):
        _paw(B, 0.0, 1.15, 0.09)


def _paw(B, x, y, z):
    """Akitsu's bear as a paw print in a ring: a broad rounded pad, four round toes in an arc above it."""
    B.ring((x, y, z), 0.3, 0.35, 0.02, 20, 'white_dk', axis='z')
    pad = M((x, y - 0.07, z), rx=PI / 2)
    B.lathe([(0.0, 0.0), (0.11, 0.0), (0.11, 0.02), (0.0, 0.02)], 12, 'white_dk', m=pad, sx=1.2, sz=0.85, smooth=False)
    for a in (150, 112, 68, 30):
        t = math.radians(a)
        B.cyl((x + math.cos(t) * 0.18, y - 0.02 + math.sin(t) * 0.16, z), 0.045, 0.02, 8, 'white_dk', axis='z')


def curtain_post(B, r):
    """The curtain's pole on its own, for the open end of a row."""
    B.box((0, 0, 0), (0.08, 2.06, 0.08), 'white_dk')
    B.box((0, 2.06, 0), (0.12, 0.04, 0.12), 'white_dk')


def banner_tall_pole(B, r):
    segs = 8 if L0(B) else 5
    B.cyl((0, 0, 0), 0.07, 6.25, segs, 'lacquer', r_top=0.05)
    B.lathe([(0.03, 6.22), (0.06, 6.27), (0.0, 6.5)], segs, 'brass', smooth=False)
    if L0(B):
        B.cyl((0, 0, 0), 0.09, 0.3, segs, 'iron_dk')
        B.cyl((0, 6.18, 0), 0.06, 0.06, segs, 'brass')
        for y in (2.0, 3.6, 5.2):
            B.cyl((0, y, 0), 0.075, 0.03, segs, 'brass')


def banner_tall_cloth(B, r):
    """Narrow upright banner, built from y 0 (hem) to 5 (its top arm). Its origin is on the
    pole's axis: the arm starts there and the cloth hangs beside the pole toward +x."""
    B.from_axis = True
    B.cyl((-0.45, 4.97, 0), 0.025, 0.9, 6 if L0(B) else 4, 'white_dk', axis='x')
    B.box((0.035, 0.0, 0), (0.79, 4.93, 0.02), 'white')  # the cloth clears the pole (radius about 0.06)
    B.box((0, 4.35, 0), (0.88, 0.5, 0.028), 'white_dk')  # a darker head band
    if L0(B):
        for y in (0.6, 1.6, 2.6, 3.6):  # loops that tie its side to the pole
            B.box((-0.4, y, 0), (0.12, 0.14, 0.04), 'white_dk')
        B.box((0, 0.0, 0), (0.88, 0.08, 0.026), 'white_dk')


# --------------------------------------------------------------------------
# Works
# --------------------------------------------------------------------------

def watchtower(B, r):
    """Timber tower, four splayed legs, roofed platform at 7.5 m with a signal drum."""
    base, top = 1.85, 1.35
    legs = [(sx, sz) for sx in (-1, 1) for sz in (-1, 1)]
    for (sx, sz) in legs:
        B.beam((sx * base, 0.0, sz * base), (sx * top, 7.5, sz * top), 0.24, 0.24, 'timber')
        if L0(B):
            B.box((sx * base, 0, sz * base), (0.45, 0.3, 0.45), 'stone', top=(0.8, 0.8))

    def at(y):
        return base + (top - base) * y / 7.5
    tiers = (0.4, 2.8, 5.2, 7.3) if L0(B) else (0.4, 3.8, 7.3)
    for y in tiers:  # ring beams
        h = at(y)
        for sz in (-1, 1):
            B.box((0, y, sz * h), (2 * h + 0.2, 0.16, 0.16), 'timber_old')
        for sx in (-1, 1):
            B.box((sx * h, y, 0), (0.16, 0.16, 2 * h + 0.2), 'timber_old')
    if L0(B):
        for y0, y1 in ((0.4, 2.8), (2.8, 5.2), (5.2, 7.3)):  # X braces on all four faces
            h0, h1 = at(y0), at(y1)
            for s in (-1, 1):
                B.beam((-h0, y0, s * h0), (h1, y1, s * h1), 0.1, 0.08, 'timber_old', up=(0, 0, 1))
                B.beam((h0, y0, s * h0), (-h1, y1, s * h1), 0.1, 0.08, 'timber_old', up=(0, 0, 1))
                B.beam((s * h0, y0, -h0), (s * h1, y1, h1), 0.1, 0.08, 'timber_old', up=(1, 0, 0))
                B.beam((s * h0, y0, h0), (s * h1, y1, -h1), 0.1, 0.08, 'timber_old', up=(1, 0, 0))
        for k in range(12):  # ladder up the front
            y = 0.35 + k * 0.6
            B.box((0, y, at(y) + 0.22), (0.6, 0.05, 0.05), 'timber_lt')
        for sx in (-1, 1):
            B.beam((sx * 0.3, 0.0, base + 0.22), (sx * 0.3, 7.5, top + 0.22), 0.07, 0.07, 'timber_lt')
    B.box((0, 7.45, 0), (3.3, 0.18, 3.3), 'timber_lt')  # platform
    for (dx, dz, w, d) in ((0, 1.6, 3.3, 0.06), (0, -1.6, 3.3, 0.06), (1.6, 0, 0.06, 3.3), (-1.6, 0, 0.06, 3.3)):
        B.box((dx, 7.63, dz), (w, 0.08, d), 'timber')  # top rail
        B.box((dx, 7.95, dz), (w, 0.08, d), 'timber')
    for (sx, sz) in legs:
        B.box((sx * 1.58, 7.63, sz * 1.58), (0.14, 1.0, 0.14), 'timber')
    B.hip_roof(0, 0, 3.9, 3.9, 8.75, 10.0, 0.6, 'shingle', thick=0.16)
    B.cyl((-0.35, 7.63, -0.5), 0.36, 0.5, 12 if L0(B) else 6, 'red_dk', axis='z')  # the signal drum on its side
    if L0(B):
        for z in (-0.52, 0.02):
            B.cyl((-0.35, 7.63, z), 0.34, 0.02, 12, 'canvas', axis='z')
        B.box((-0.35, 7.63, -0.25), (0.6, 0.5, 0.08), 'timber')
        B.box((0, 9.85, 0), (0.15, 0.15, 0.7), 'lacquer')


def bale_wall(B, r):
    """Three courses of rice bales, ends to the front; 4 m long so runs tile."""
    n = 9
    d = 4.0 / n
    rr = 0.215
    rows = 3
    for row in range(rows):
        y = rr + row * 2 * rr * 0.98
        for k in range(n):
            if not L0(B) and k % 3 != 1:
                continue
            x = -2.0 + d * (k + 0.5)
            jit = (((k * 7 + row * 3) % 5) - 2) * 0.03 if L0(B) else 0.0
            if L0(B):
                _bale(B, M((x, y, jit), ry=jit * 0.5), length=0.98 if row == 0 else 0.9, r=rr)
    if not L0(B):
        for row in range(rows):
            y = row * 2 * rr * 0.98
            B.box((0, y, 0), (4.0, 2 * rr, 0.96 if row == 0 else 0.88), 'thatch', top=(1.0, 0.96))
            B.box((0, y + rr - 0.03, 0), (4.0, 0.06, 0.99 if row == 0 else 0.91), 'rope')


def gate_bar(B, r):
    """Two posts and a striped bar lifted across them over a 4 m road."""
    for sx in (-1, 1):
        B.box((sx * 2.62, 0, 0), (0.3, 2.4, 0.3), 'timber')
        B.box((sx * 2.62, 0, 0), (0.5, 0.25, 0.5), 'stone')
        B.box((sx * 2.62, 2.3, 0), (0.36, 0.1, 0.42), 'timber_old')
    n = 14 if L0(B) else 4
    for k in range(n):
        x0 = -2.8 + 5.6 * k / n
        x1 = -2.8 + 5.6 * (k + 1) / n
        q = []
        for x in (x0, x1):
            for (y, z) in ((2.4, -0.09), (2.4, 0.09), (2.58, -0.09), (2.58, 0.09)):
                q.append((x, y, z))
        B.hull(q, 'lacquer' if k % 2 == 0 else 'canvas')
    if L0(B):
        B.cyl((2.2, 0.0, 0.0), 0.15, 0.55, 8, 'stone_dk')  # the counterweight stone, by the right post
        B.beam((2.2, 0.55, 0.0), (2.5, 2.35, 0.0), 0.03, 0.03, 'rope')


def telegraph_pole(B, r):
    segs = 8 if L0(B) else 5
    B.cyl((0, 0, 0), 0.13, 7.3, segs, 'timber_old', r_top=0.1)
    B.box((0, 6.85, 0), (1.8, 0.12, 0.12), 'timber')
    B.cyl((0, 7.3, 0), 0.11, 0.2, segs, 'lacquer')
    for x in ((-0.8, -0.35, 0.35, 0.8) if L0(B) else (-0.8, 0.8)):
        B.lathe([(0.03, 6.97), (0.06, 7.0), (0.05, 7.1), (0.065, 7.12), (0.03, 7.22), (0.0, 7.24)], 6, 'canvas',
                m=M((x, 0, 0)), smooth=False)
    if L0(B):
        B.beam((-0.55, 6.6, 0), (0, 6.2, 0), 0.06, 0.06, 'timber')
        B.beam((0.55, 6.6, 0), (0, 6.2, 0), 0.06, 0.06, 'timber')
        # the snapped wire: from an insulator, down and swinging
        B.beam((0.8, 7.15, 0), (0.86, 5.6, 0.08), 0.012, 0.012, 'iron_dk')
        B.beam((0.86, 5.6, 0.08), (0.78, 4.4, 0.13), 0.012, 0.012, 'iron_dk')
        B.beam((-0.8, 7.15, 0), (-0.86, 6.6, -0.12), 0.012, 0.012, 'iron_dk')
        for k in range(6):  # climbing pegs
            y = 2.2 + 0.55 * k
            a = 0.0 if k % 2 == 0 else PI
            B.beam((math.cos(a) * 0.1, y, 0), (math.cos(a) * 0.32, y, 0), 0.03, 0.03, 'iron_dk')


# --------------------------------------------------------------------------
# Yard
# --------------------------------------------------------------------------

def _rifle(B, p_butt, p_muzzle):
    B.beam(p_butt, tuple(a + (b - a) * 0.62 for a, b in zip(p_butt, p_muzzle)), 0.05, 0.03, 'timber')
    B.beam(tuple(a + (b - a) * 0.55 for a, b in zip(p_butt, p_muzzle)), p_muzzle, 0.022, 0.022, 'iron_dk')


def rifle_rack(B, r):
    """Rifles stacked in threes under an oilcloth on a ridge frame (powder is dead under this sky)."""
    for sx in (-1, 1):
        B.box((sx * 1.15, 0, 0), (0.08, 1.45, 0.08), 'timber')
    B.cyl((-1.2, 1.45, 0), 0.04, 2.4, 6 if L0(B) else 4, 'timber', axis='x')
    for sz in (-1, 1):  # the oilcloth, two sloping sheets
        B.hull([(-1.2, 1.5, 0.0), (1.2, 1.5, 0.0), (-1.2, 0.72, sz * 0.49), (1.2, 0.72, sz * 0.49),
                (-1.2, 1.47, 0.0), (1.2, 1.47, 0.0), (-1.2, 0.7, sz * 0.47), (1.2, 0.7, sz * 0.47)], 'leather_dk')
    stacks = (-0.65, 0.0, 0.65) if L0(B) else (0.0,)
    for x in stacks:
        for k in range(3):
            a = TAU * k / 3 + 0.4
            c, s = math.cos(a), -math.sin(a)
            _rifle(B, (x + c * 0.28, 0.0, s * 0.28), (x + c * 0.03, 1.3, s * 0.03))


def spear_rack(B, r):
    for sx in (-1, 1):
        B.box((sx * 1.15, 0, 0), (0.1, 1.7, 0.12), 'timber')
        B.box((sx * 1.15, 0, 0), (0.14, 0.06, 0.8), 'timber_old')
    B.box((0, 1.55, 0), (2.4, 0.08, 0.12), 'timber')
    B.box((0, 0.2, 0), (2.4, 0.08, 0.2), 'timber')
    n = 8 if L0(B) else 4
    for k in range(n):
        x = -0.98 + 1.96 * k / (n - 1)
        B.beam((x, 0.2, 0.05), (x, 2.1, -0.08), 0.035, 0.035, 'lacquer')
        B.lathe([(0.025, 2.1), (0.035, 2.16), (0.0, 2.4)], 4, 'iron', m=M((x, 0, -0.08)), smooth=False)
    if L0(B):
        for k in range(5):  # wooden practice swords on pegs
            y = 0.55 + 0.17 * k
            B.beam((-0.95, y, 0.12), (0.05, y + 0.03, 0.12), 0.035, 0.03, 'timber_lt')
            B.box((-0.86, y - 0.04, 0.12), (0.05, 0.1, 0.06), 'timber')
        for k in range(5):
            B.box((-1.08, 0.53 + 0.17 * k, 0.1), (0.05, 0.03, 0.12), 'timber_old')


def rice_kettle(B, r):
    """Iron kettle on a tripod over a ring of stones; the coals are kettle_coals."""
    if L0(B):
        for k in range(9):
            a = TAU * k / 9
            B.rock((math.cos(a) * 0.62, 0, -math.sin(a) * 0.62), (0.15, 0.2, 0.13), 'stone' if k % 2 else 'stone_dk', n=9)
    else:
        B.ring((0, 0, 0), 0.5, 0.75, 0.2, 7, 'stone', smooth=False)
    for k in range(3):
        a = TAU * k / 3 + PI / 2
        c, s = math.cos(a), -math.sin(a)
        B.limb((c * 0.72, 0.0, s * 0.72), (c * 0.05, 1.4, s * 0.05), 0.04, 0.03, 5 if L0(B) else 4, 'timber_old',
               smooth=False)
    B.beam((0, 1.38, 0), (0, 0.98, 0), 0.02, 0.02, 'iron_dk')
    segs = 12 if L0(B) else 7
    B.lathe([(0.12, 0.42), (0.24, 0.48), (0.3, 0.62), (0.3, 0.75), (0.34, 0.78), (0.34, 0.8), (0.26, 0.82),
             (0.24, 0.9), (0.06, 0.93), (0.0, 0.96)], segs, 'iron_dk',
            cols=['iron_dk', 'iron_dk', 'iron_dk', 'iron_dk', 'iron_dk', 'iron_dk', 'timber', 'timber', 'timber'],
            smooth=True)
    if L0(B):
        B.ring((0, 0.92, 0), 0.25, 0.27, 0.06, 8, 'iron_dk', axis='x')


def kettle_coals(B, r):
    """Coals in the stone ring under the kettle, from y 0 to 0.3."""
    if L0(B):
        for k in range(9):
            a = TAU * k / 9 + 0.3
            rr = 0.25 + 0.1 * (k % 2)
            B.rock((math.cos(a) * rr, 0, -math.sin(a) * rr), (0.12, 0.13, 0.1), 'ember' if k % 3 else 'char', n=8)
        B.rock((0, 0, 0), (0.32, 0.3, 0.32), 'flame', n=14)
        for k in range(3):
            a = TAU * k / 3 + 0.9
            B.beam((math.cos(a) * 0.42, 0.06, -math.sin(a) * 0.42), (-math.cos(a) * 0.05, 0.18, math.sin(a) * 0.05), 0.07,
                   0.07, 'char')
    else:
        B.rock((0, 0, 0), (0.45, 0.3, 0.45), 'ember', n=10)


def _crate(B, x, z, w, h, d, y=0.0, rot=0.0):
    m = M((x, y, z), ry=rot)
    B.box((0, 0, 0), (w, h, d), 'timber_lt', m=m)
    if L0(B):
        B.box((0, 0, 0), (w + 0.02, 0.08, d + 0.02), 'timber', m=m)
        B.box((0, h - 0.08, 0), (w + 0.02, 0.08, d + 0.02), 'timber', m=m)


def supply_stack(B, r):
    _crate(B, -0.6, -0.35, 0.9, 0.6, 0.8, rot=0.05)
    _crate(B, -0.55, -0.35, 0.75, 0.5, 0.65, y=0.6, rot=-0.1)
    _crate(B, -0.6, -0.4, 0.5, 0.4, 0.45, y=1.1, rot=0.2)
    for k, (x, y) in enumerate(((0.3, 0.0), (0.75, 0.0), (0.52, 0.42))):
        if not L0(B) and k == 2:
            continue
        _bale(B, M((x, y + 0.21, -0.25)), length=0.85, r=0.21)
    if not L0(B):
        B.box((0.52, 0.42, -0.25), (0.42, 0.42, 0.85), 'straw')
    # the folded handcart, tipped up on its wheels against the stack
    m = M((0.0, 0.0, 0.3))
    B.box((0, 0.35, 0), (2.0, 0.08, 0.32), 'timber_lt', m=m @ M((0, 0.35, 0), rx=-0.9) @ M((0, -0.35, 0)))
    for sx in (-1, 1):
        B.ring((sx * 0.62, 0.36, 0.32), 0.3, 0.36, 0.06, 10 if L0(B) else 6, 'timber', axis='z', m=m, smooth=False)
        if L0(B):
            for k in range(4):
                a = k * PI / 4
                B.beam((sx * 0.62 + math.cos(a) * 0.3, 0.36 + math.sin(a) * 0.3, 0.35),
                       (sx * 0.62 - math.cos(a) * 0.3, 0.36 - math.sin(a) * 0.3, 0.35), 0.04, 0.04, 'timber_old', m=m,
                       up=(0, 0, 1))


def map_table(B, r):
    """The colonel's table with a map, two stools."""
    B.box((0, 0.74, 0), (1.3, 0.05, 1.15), 'timber_lt')
    for sx in (-1, 1):
        for sz in (-1, 1):
            B.box((sx * 0.58, 0, sz * 0.5), (0.06, 0.74, 0.06), 'timber')
    B.box((0, 0.79, 0), (0.95, 0.01, 0.8), 'paper')
    if L0(B):
        for (x0, z0, x1, z1) in ((-0.4, -0.2, 0.1, 0.05), (0.1, 0.05, 0.38, -0.15), (-0.2, 0.25, 0.25, 0.2)):
            B.beam((x0, 0.802, z0), (x1, 0.802, z1), 0.012, 0.003, 'dark')  # roads drawn in ink, no names
        B.box((0.42, 0.8, 0.22), (0.12, 0.04, 0.08), 'lacquer')
        B.lathe([(0.03, 0.8), (0.035, 0.86), (0.0, 0.88)], 6, 'brass', m=M((-0.45, 0, -0.22)))
    for sx in (-1, 1):  # camp stools, legs crossed
        x = sx * 0.85
        if L0(B):
            for sz in (-1, 1):
                B.beam((x - 0.14, 0.0, sz * 0.13), (x + 0.14, 0.45, sz * 0.13), 0.03, 0.03, 'timber')
                B.beam((x + 0.14, 0.0, sz * 0.13), (x - 0.14, 0.45, sz * 0.13), 0.03, 0.03, 'timber')
            B.box((x, 0.44, 0), (0.3, 0.03, 0.3), 'khaki')
        else:
            B.box((x, 0, 0), (0.3, 0.46, 0.3), 'khaki', top=(1.0, 1.0))


def signal_lantern(B, r):
    """Square wire-and-paper lantern; built from y 0 to 0.6, hangs from its top."""
    s = 0.19
    B.box((0, 0.05, 0), (2 * s - 0.03, 0.4, 2 * s - 0.03), 'paper_glow')
    B.box((0, 0.0, 0), (2 * s, 0.05, 2 * s), 'lacquer')
    B.box((0, 0.45, 0), (2 * s, 0.05, 2 * s), 'lacquer')
    for sx in (-1, 1):
        for sz in (-1, 1):
            B.box((sx * (s - 0.012), 0.05, sz * (s - 0.012)), (0.024, 0.4, 0.024), 'lacquer')
    B.hull([(-0.08, 0.5, -0.02), (0.08, 0.5, -0.02), (-0.08, 0.5, 0.02), (0.08, 0.5, 0.02), (0.0, 0.6, 0.0)], 'lacquer')
    if L0(B):
        for y in (0.18, 0.32):
            for (dx, dz, w, d) in ((0, s - 0.012, 2 * s, 0.01), (0, -s + 0.012, 2 * s, 0.01), (s - 0.012, 0, 0.01, 2 * s),
                                   (-s + 0.012, 0, 0.01, 2 * s)):
                B.box((dx, y, dz), (w, 0.012, d), 'lacquer')


# Companions shown with a piece on the contact sheets, at their mounted place.
COMBO = {
    'banner_tall_cloth': [('banner_tall_pole_LOD{l}', (0, 0, 0)), ('banner_tall_cloth_LOD{l}', (0, 6.3, 0))],
    'curtain_post': [('curtain_run_LOD{l}', (-2, 0, 0)), ('curtain_post_LOD{l}', (0, 0, 0))],
    'kettle_coals': [('rice_kettle_LOD{l}', (0, 0, 0)), ('kettle_coals_LOD{l}', (0, 0, 0))],
    'signal_lantern': [('signal_lantern_LOD{l}', (0, 1.8, 0))],
    'curtain_run': [('curtain_run_LOD{l}', (-2, 0, 0)), ('curtain_run_LOD{l}', (2, 0, 0))],
    'bale_wall': [('bale_wall_LOD{l}', (-2, 0, 0)), ('bale_wall_LOD{l}', (2, 0, 0))],
}

BUILDERS = {name: fn for name, fn in dict(globals()).items() if callable(fn) and not name.startswith('_') and name not in
            ('M', 'L0')}
