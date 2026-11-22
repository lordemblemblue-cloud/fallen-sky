"""The 37 valley-kit pieces, modelled in game coordinates (see kitlib).

Metres, x right, y up, z toward the front. Each builder makes the piece at
roughly its table size standing on y = 0 (pieces that hang or sit on another
piece are also built upward from y = 0); Builder.finish fits it exactly and
moves the pivot. B.lod is 0 or 1: LOD1 keeps the outline and the colours and
drops small parts and round segments.
"""
import math

from kitlib import M

PI = math.pi
TAU = 2 * math.pi

# First-pass colour for the stand-in box of each piece (build --boxes).
BOX_KEYS = {
    'barn': 'timber', 'windmill_body': 'plaster', 'windmill_sails': 'timber_lt', 'farmhouse': 'plaster',
    'hut': 'thatch', 'well': 'stone', 'fence_3m': 'timber_old', 'hedgerow_4m': 'hedge', 'haystack': 'straw',
    'sheaf': 'straw', 'beehive': 'honey', 'scarecrow': 'cloth', 'flat_stone': 'stone', 'wagon': 'timber',
    'wagon_cover': 'white', 'crate_stack': 'timber_lt', 'truce_stone': 'old_stone', 'ribbon': 'white',
    'banner_pole': 'timber', 'banner_cloth': 'white', 'pledge_board': 'timber_lt', 'lantern_wall': 'stone',
    'lantern_post': 'timber', 'paper_lantern': 'paper_glow', 'gate_bell': 'bronze', 'straw_post': 'straw',
    'studio_frame': 'timber', 'paper_screen': 'paper', 'old_standard': 'iron', 'cairn': 'stone_dk',
    'pyre_stack': 'timber_old', 'stela': 'old_stone', 'grave_stone': 'old_stone', 'barrow_mound': 'grass',
    'barrow_door': 'old_stone', 'fire_basket': 'iron_dk', 'fire_basket_flame': 'flame', 'oath_tree': 'leaf',
}


def build_box(B, row):
    w, d, h = row['size']
    B.box((0, 0, 0), (w, h, d), BOX_KEYS[row['id']])


def L0(B):
    return B.lod == 0


# --------------------------------------------------------------------------
# Farm buildings
# --------------------------------------------------------------------------

def barn(B, r):
    W, D = 11.0, 7.0
    B.box((0, 0, 0), (W + 0.3, 0.5, D + 0.3), 'stone')
    B.box((0, 0.5, 0), (W, 3.3, D), 'timber')
    # gable ends (ridge runs along x)
    for sx in (-1, 1):
        x0, x1 = sx * W / 2, sx * (W / 2 - 0.2)
        B.hull([(x0, 3.75, -D / 2), (x0, 3.75, D / 2), (x0, 6.45, 0), (x1, 3.75, -D / 2), (x1, 3.75, D / 2), (x1, 6.45, 0)],
               'timber')
        if L0(B):
            B.box((sx * (W / 2 + 0.02), 4.3, 0), (0.08, 0.9, 0.9), 'dark')  # loft hatch
    # thatch roof with a rolled ridge
    B.gable_roof(0, 0, 12.0, 8.0, 3.95, 6.75, 0.45, 'thatch', along='x', ridge_col='thatch_dk', ridge_w=0.42)
    # front: big double door
    zf = D / 2
    B.box((0, 0.5, zf - 0.1), (3.4, 3.0, 0.2), 'dark')
    if L0(B):
        for sx in (-1, 1):
            B.box((sx * 0.82, 0.55, zf + 0.04), (1.58, 2.85, 0.1), 'timber_lt')
            B.beam((sx * 0.1, 0.75, zf + 0.12), (sx * 1.5, 3.2, zf + 0.12), 0.14, 0.06, 'timber', up=(0, 0, 1))
            B.box((sx * 0.82, 0.8, zf + 0.1), (1.5, 0.14, 0.06), 'timber')
            B.box((sx * 0.82, 3.0, zf + 0.1), (1.5, 0.14, 0.06), 'timber')
        B.box((0, 3.5, zf + 0.05), (3.9, 0.3, 0.25), 'timber_old')  # lintel
        for sx in (-1, 1):
            B.box((sx * 1.85, 0.5, zf + 0.05), (0.26, 3.0, 0.25), 'timber_old')
        # frame posts and plates proud of the boards
        for x in (-W / 2, -W / 4, W / 4, W / 2):
            for z in (-D / 2, D / 2):
                B.box((x, 0.5, z), (0.32, 3.3, 0.32), 'timber_old')
        for x in (-W / 2, W / 2):
            B.box((x, 0.5, 0), (0.32, 3.3, 0.32), 'timber_old')
        for z in (-D / 2, D / 2):
            B.box((0, 3.55, z), (W + 0.2, 0.28, 0.34), 'timber_old')
            B.box((-W * 0.31, 2.05, z), (W * 0.34, 0.2, 0.36), 'timber_old')
            B.box((W * 0.31, 2.05, z), (W * 0.34, 0.2, 0.36), 'timber_old')
        B.box((0, 0, zf + 0.25), (3.6, 0.35, 0.5), 'stone', top=(0.95, 0.5), shift=(0, -0.1))  # ramp
    else:
        B.box((0, 0.5, zf), (3.0, 2.85, 0.1), 'timber_lt')
        for z in (-D / 2, D / 2):
            B.box((0, 3.55, z), (W + 0.2, 0.28, 0.34), 'timber_old')
            for x in (-W / 2, -W / 4, W / 4, W / 2):
                B.box((x, 0.5, z), (0.34, 3.3, 0.34), 'timber_old')


def windmill_body(B, r):
    segs = 8
    ph = PI / 8
    if L0(B):
        prof = [(3.2, 0), (3.2, 0.35), (2.9, 0.35), (2.9, 0.7), (2.5, 0.7), (1.88, 7.2), (2.1, 7.2), (2.1, 7.5),
                (2.32, 7.5), (2.25, 8.3), (1.75, 9.2), (0.95, 9.8), (0, 10.0)]
        cols = ['stone', 'stone', 'stone', 'stone', 'plaster', 'timber', 'timber', 'timber', 'shingle', 'shingle',
                'shingle', 'shingle']
    else:
        prof = [(3.2, 0), (3.2, 0.7), (2.5, 0.7), (1.88, 7.2), (2.32, 7.5), (1.75, 9.2), (0, 10.0)]
        cols = ['stone', 'stone', 'plaster', 'timber', 'shingle', 'shingle']
    B.lathe(prof, segs, 'plaster', cols=cols, phase=ph, smooth=False)

    def face_z(y):  # distance of the front flat face at height y
        rv = 2.5 + (1.88 - 2.5) * (y - 0.7) / 6.5
        return rv * math.cos(PI / 8)
    # door and windows on the front face
    B.box((0, 0.7, face_z(1.7) - 0.1), (1.15, 2.1, 0.3), 'dark')
    if L0(B):
        B.box((0, 0.7, face_z(1.7) - 0.02), (0.95, 1.9, 0.26), 'timber')
        B.box((0, 2.75, face_z(2.8) - 0.1), (1.5, 0.2, 0.32), 'timber_old')
        for y in (3.9, 5.6):
            B.box((0, y, face_z(y + 0.4) - 0.12), (0.6, 0.8, 0.3), 'dark')
            B.box((0, y - 0.12, face_z(y) - 0.08), (0.8, 0.12, 0.3), 'timber_old')
        # side windows
        for sx in (-1, 1):
            y = 4.6
            fz = face_z(y + 0.4)
            B.box((0, y, 0), (0.3, 0.8, 0.6), 'dark', m=M((sx * fz, 0, 0)))
    # windshaft out to the front, where the sails' hub goes (y 8.5)
    B.cyl((0, 8.5, 1.4), 0.24, 1.6, 8 if L0(B) else 6, 'timber_old', axis='z')
    if L0(B):
        B.cyl((0, 8.5, 2.85), 0.3, 0.15, 8, 'iron_dk', axis='z')
    # tail pole down to the ground at the back (turns the cap): the outline's spine
    B.beam((0, 8.1, -1.9), (0, 0.15, -2.88), 0.26, 0.26, 'timber')
    B.beam((0, 7.6, -1.6), (0, 4.2, -2.55), 0.18, 0.18, 'timber')
    if L0(B):
        B.beam((-0.6, 7.65, -1.7), (0, 3.2, -2.68), 0.12, 0.12, 'timber_old')
        B.beam((0.6, 7.65, -1.7), (0, 3.2, -2.68), 0.12, 0.12, 'timber_old')
        B.cyl((0, 0.0, -2.75), 0.25, 0.3, 8, 'stone_dk')  # the tail's anchor stone
        B.cyl((0, 9.95, 0), 0.08, 0.05, 6, 'iron_dk')


def windmill_sails(B, r):
    for k in range(4):
        th = k * PI / 2
        u = (math.cos(th), math.sin(th), 0)
        v = (-math.sin(th), math.cos(th), 0)

        def P(a, b, z=0.0):
            return (u[0] * a + v[0] * b, u[1] * a + v[1] * b, z)
        B.beam(P(0.25, 0), P(4.5, 0), 0.2, 0.2, 'timber', up=(0, 0, 1))
        if L0(B):
            B.beam(P(1.0, 1.3), P(4.45, 1.3), 0.09, 0.1, 'timber_lt', up=(0, 0, 1))
            for i in range(8):
                a = 1.05 + i * (4.4 - 1.05) / 7
                B.beam(P(a, 0.05), P(a, 1.33), 0.07, 0.08, 'timber_lt', up=(0, 0, 1))
            B.box((0, 0, 0), (1, 1, 1), 'cloth', m=_panel(P(2.72, 0.68, -0.07), th, 3.25, 1.18, 0.03))
        else:
            B.box((0, 0, 0), (1, 1, 1), 'cloth', m=_panel(P(2.72, 0.68, -0.05), th, 3.45, 1.32, 0.05))
    B.cyl((0, 0, -0.2), 0.42, 0.4, 10 if L0(B) else 6, 'timber_old', axis='z')
    if L0(B):
        B.cyl((0, 0, 0.12), 0.2, 0.08, 8, 'iron_dk', axis='z')


def _panel(c, th, length, width, thick):
    """Matrix placing a unit box (base at its bottom face) as a panel in the xy plane."""
    return M((c[0], c[1], c[2]), rz=th) @ M((0, 0, 0), rx=PI / 2) @ M((0, 0, 0), s=(length, thick, width)) @ M((0, -0.5, 0))


def farmhouse(B, r):
    W, D = 6.8, 4.8
    B.box((0, 0, 0), (W + 0.3, 0.45, D + 0.3), 'stone')
    B.box((0, 0.45, 0), (W, 2.6, D), 'plaster')
    B.hip_roof(0, 0, 8.0, 6.0, 3.0, 5.65, 3.2, 'thatch', thick=0.4)
    B.box((0, 5.45, 0), (3.6, 0.55, 0.55), 'thatch_dk')  # ridge roll
    zf = D / 2
    B.box((-1.2, 0.45, zf - 0.05), (1.05, 2.05, 0.2), 'timber')  # door
    B.box((1.5, 1.35, zf - 0.05), (1.1, 0.85, 0.16), 'dark')  # window
    if L0(B):
        # timber frame on the plaster
        for x in (-W / 2, -W / 6 - 0.6, W / 6 + 0.25, W / 2):
            for z in (-D / 2, D / 2):
                B.box((x, 0.45, z), (0.24, 2.6, 0.24), 'timber')
        for x in (-W / 2, W / 2):
            B.box((x, 0.45, 0), (0.24, 2.6, 0.24), 'timber')
        for z in (-D / 2, D / 2):
            B.box((0, 2.85, z), (W + 0.1, 0.22, 0.26), 'timber')
            B.box((0, 0.45, z), (W + 0.05, 0.18, 0.26), 'timber')
        for x in (-W / 2, W / 2):
            B.box((x, 2.85, 0), (0.26, 0.22, D), 'timber')
        B.beam((-W / 2 + 0.1, 0.6, zf + 0.1), (-W / 6 - 0.7, 2.8, zf + 0.1), 0.16, 0.08, 'timber', up=(0, 0, 1))
        B.beam((W / 2 - 0.1, 0.6, zf + 0.1), (W / 6 + 0.35, 2.8, zf + 0.1), 0.16, 0.08, 'timber', up=(0, 0, 1))
        B.box((-1.2, 0.45, zf + 0.04), (1.25, 2.2, 0.08), 'timber_old')  # door frame
        B.box((-1.2, 0.45, zf + 0.09), (0.9, 1.95, 0.06), 'timber_lt')
        for sx in (-1, 1):  # shutters
            B.box((1.5 + sx * 0.82, 1.3, zf + 0.06), (0.55, 0.95, 0.06), 'timber_lt')
        B.box((1.5, 1.22, zf + 0.04), (1.3, 0.1, 0.2), 'timber_old')
        for sx in (-1, 1):  # side windows
            B.box((sx * (W / 2 + 0.02), 1.35, 0.4), (0.12, 0.8, 0.9), 'dark')
        B.box((-1.2, 0, zf + 0.3), (1.4, 0.22, 0.5), 'stone')  # step
        # small smoke gablets at the ridge ends
        for sx in (-1, 1):
            x0 = sx * 1.75
            B.hull([(x0, 5.0, -0.5), (x0, 5.0, 0.5), (x0, 5.6, 0), (x0 + sx * 0.1, 5.0, -0.5), (x0 + sx * 0.1, 5.0, 0.5),
                    (x0 + sx * 0.1, 5.6, 0)], 'timber')
    else:
        for z in (-D / 2, D / 2):
            B.box((0, 2.85, z), (W + 0.1, 0.22, 0.26), 'timber')
            for x in (-W / 2, -W / 6 - 0.6, W / 6 + 0.25, W / 2):
                B.box((x, 0.45, z), (0.26, 2.6, 0.26), 'timber')


def hut(B, r):
    W, D = 3.3, 2.8
    B.box((0, 0, 0), (W + 0.2, 0.3, D + 0.2), 'stone')
    B.box((0, 0.3, 0), (W, 1.55, D), 'timber_old')
    for sx in (-1, 1):
        x0, x1 = sx * W / 2, sx * (W / 2 - 0.12)
        B.hull([(x0, 1.84, -D / 2), (x0, 1.84, D / 2), (x0, 2.85, 0), (x1, 1.84, -D / 2), (x1, 1.84, D / 2), (x1, 2.85, 0)],
               'timber_old')
    B.gable_roof(0, 0, 4.0, 3.5, 1.95, 3.0, 0.32, 'thatch', along='x', ridge_col='thatch_dk', ridge_w=0.3)
    B.box((0.4, 0.3, D / 2 - 0.05), (0.85, 1.45, 0.14), 'dark')
    if L0(B):
        B.box((0.4, 0.75, D / 2 + 0.02), (0.8, 1.0, 0.05), 'cloth_dk')  # hanging door mat
        B.box((0.4, 1.72, D / 2 + 0.02), (1.05, 0.12, 0.1), 'timber')
        for x in (-W / 2, W / 2):
            for z in (-D / 2, D / 2):
                B.box((x, 0.3, z), (0.2, 1.55, 0.2), 'timber')
        B.box((-0.9, 1.0, D / 2 + 0.02), (0.55, 0.45, 0.05), 'dark')
        B.box((-0.9, 0.92, D / 2 + 0.03), (0.7, 0.08, 0.12), 'timber')


def well(B, r):
    segs = 10 if L0(B) else 7
    B.lathe([(0, 0.45), (0.58, 0.45), (0.58, 0.8), (0.86, 0.8), (0.86, 0.0), (0, 0.0)], segs, 'stone',
            cols=['water', 'stone_dk', 'stone', 'stone', 'stone'], cap=False, smooth=False, phase=0.3)
    for sx in (-1, 1):
        B.box((sx * 0.72, 0.8, 0), (0.12, 1.25, 0.12), 'timber')
    B.gable_roof(0, 0, 1.8, 1.8, 2.02, 2.32, 0.07, 'shingle', along='x', ridge_col='timber', ridge_w=0.1)
    if L0(B):
        B.cyl((-0.78, 1.7, 0), 0.07, 1.56, 8, 'timber_lt', axis='x')
        B.box((0.0, 2.0, 0), (1.56, 0.1, 0.1), 'timber')
        B.box((0.86, 1.55, 0.05), (0.05, 0.25, 0.04), 'iron_dk')
        B.box((0.1, 1.17, 0), (0.025, 0.5, 0.025), 'rope')
        B.lathe([(0.11, 0.95), (0.13, 1.17), (0, 1.17)], 8, 'timber_old', smooth=False, m=M((0.1, 0, 0)))


# --------------------------------------------------------------------------
# Field furniture
# --------------------------------------------------------------------------

def fence_3m(B, r):
    B.box((-1.42, 0, 0), (0.15, 1.1, 0.15), 'timber_old', top=(0.8, 0.8))
    B.box((1.42, 0, 0), (0.15, 1.04, 0.15), 'timber_old', top=(0.8, 0.8))
    B.beam((-1.5, 0.45, 0), (1.5, 0.5, 0), 0.07, 0.11, 'timber_old')
    B.beam((-1.5, 0.9, 0), (1.5, 0.86, 0), 0.07, 0.11, 'timber_old')


def hedgerow_4m(B, r):
    if L0(B):
        blobs = [(-1.4, 0.62, 1.4, 0.55, 'hedge'), (-0.7, 0.75, 1.7, 0.6, 'hedge'), (0.05, 0.75, 1.5, 0.58, 'grass'),
                 (0.75, 0.75, 1.65, 0.6, 'hedge'), (1.4, 0.62, 1.35, 0.55, 'hedge')]
        n = 20
    else:
        blobs = [(-1.2, 0.85, 1.7, 0.6, 'hedge'), (0.0, 0.9, 1.75, 0.6, 'grass'), (1.2, 0.85, 1.65, 0.6, 'hedge')]
        n = 10
    for (x, rx, h, rz, col) in blobs:
        B.rock((x, 0, 0), (rx, h, rz), col, n=n, smooth=True)


def haystack(B, r):
    if L0(B):
        prof = [(1.28, 0), (1.32, 0.45), (1.25, 1.05), (1.0, 1.65), (0.6, 2.05), (0.22, 2.32), (0, 2.4)]
        B.lathe(prof, 12, 'straw', cols=['thatch', 'straw', 'straw', 'straw', 'thatch_dk', 'thatch_dk'], jitter=0.035)
        B.ring((0, 1.2, 0), 1.2, 1.3, 0.08, 12, 'rope')
    else:
        B.lathe([(1.3, 0), (1.27, 0.9), (0.95, 1.7), (0.35, 2.25), (0, 2.4)], 8, 'straw',
                cols=['straw', 'straw', 'thatch_dk', 'thatch_dk'])


def sheaf(B, r):
    if L0(B):
        prof = [(0.2, 0), (0.18, 0.06), (0.11, 0.45), (0.12, 0.56), (0.2, 0.85), (0.29, 1.04), (0.19, 1.16), (0, 1.2)]
        B.lathe(prof, 8, 'straw', cols=['thatch', 'straw', 'rope', 'straw', 'straw', 'straw', 'thatch_dk'], jitter=0.08,
                smooth=False)
    else:
        B.lathe([(0.2, 0), (0.12, 0.5), (0.29, 1.02), (0, 1.2)], 6, 'straw', cols=['straw', 'straw', 'thatch_dk'],
                smooth=False)


def beehive(B, r):
    B.cyl((0, 0, 0), 0.17, 0.26, 7 if L0(B) else 5, 'timber_old', smooth=False)
    B.box((0, 0.24, 0), (0.6, 0.06, 0.6), 'timber_old')
    if L0(B):
        prof = [(0.26, 0.3), (0.285, 0.36), (0.27, 0.42), (0.29, 0.48), (0.265, 0.55), (0.265, 0.6), (0.22, 0.68),
                (0.2, 0.74), (0.13, 0.82), (0.07, 0.87), (0, 0.9)]
        cols = ['straw', 'honey', 'straw', 'honey', 'straw', 'honey', 'straw', 'honey', 'straw', 'straw']
        B.lathe(prof, 10, 'straw', cols=cols)
        B.box((0, 0.3, 0.26), (0.1, 0.05, 0.06), 'dark')
    else:
        B.lathe([(0.28, 0.3), (0.27, 0.58), (0.17, 0.79), (0, 0.9)], 6, 'straw', cols=['straw', 'honey', 'straw'])


def scarecrow(B, r):
    B.box((0, 0, 0), (0.08, 1.8, 0.08), 'timber_old')
    B.box((0, 1.43, 0), (1.45, 0.07, 0.07), 'timber_old')
    B.hull([(-0.24, 1.55, -0.11), (0.24, 1.55, -0.11), (-0.24, 1.55, 0.11), (0.24, 1.55, 0.11),
            (-0.36, 0.85, -0.15), (0.36, 0.85, -0.15), (-0.36, 0.85, 0.15), (0.36, 0.85, 0.15)], 'cloth_dk')
    for sx in (-1, 1):
        B.beam((sx * 0.2, 1.46, 0), (sx * 0.7, 1.44, 0), 0.17, 0.17, 'cloth_dk')
        B.hull([(sx * 0.7, 1.36, -0.08), (sx * 0.7, 1.54, -0.08), (sx * 0.7, 1.36, 0.08), (sx * 0.7, 1.54, 0.08),
                (sx * 0.8, 1.3, -0.11), (sx * 0.8, 1.6, 0.11), (sx * 0.8, 1.3, 0.1), (sx * 0.8, 1.58, -0.1)], 'straw')
    B.lathe([(0.37, 0.84), (0.33, 0.72), (0.2, 0.7)], 8 if L0(B) else 5, 'straw', cap=False, smooth=False, sz=0.42)
    B.lathe([(0, 1.58), (0.11, 1.6), (0.15, 1.72), (0.12, 1.86), (0, 1.9)], 8 if L0(B) else 5, 'cloth')
    # wide straw hat: elliptical so it stays inside the 0.4 m depth
    B.lathe([(0.3, 1.86), (0.3, 1.9), (0.06, 2.15), (0, 2.2)], 10 if L0(B) else 6, 'straw', sx=1.0, sz=0.66,
            cols=['thatch_dk', 'straw', 'straw'], smooth=False)
    if L0(B):
        B.box((0, 1.5, 0.12), (0.06, 0.06, 0.02), 'rope')
        B.box((0, 1.12, 0.155), (0.62, 0.06, 0.02), 'rope')


def flat_stone(B, r):
    n = 9 if L0(B) else 6
    pts = []
    for i in range(n):
        a = TAU * i / n + B.rng.uniform(-0.15, 0.15)
        rr = B.rng.uniform(0.85, 1.0)
        pts.append((math.cos(a) * 0.45 * rr, 0, math.sin(a) * 0.35 * rr))
        pts.append((math.cos(a) * 0.4 * rr, 0.08 - B.rng.uniform(0, 0.015), math.sin(a) * 0.3 * rr))
    B.hull(pts, 'stone')


# --------------------------------------------------------------------------
# Wagons and goods
# --------------------------------------------------------------------------

def _wheel(B, x, z, side):
    y = 0.55
    if L0(B):
        B.ring((x, y, z - 0.06), 0.45, 0.55, 0.12, 12, 'timber', axis='z',
               cols=['timber', 'iron_dk', 'timber', 'timber'], smooth=False)
        for k in range(6):
            a = k * PI / 3
            B.beam((x + math.cos(a) * 0.1, y + math.sin(a) * 0.1, z), (x + math.cos(a) * 0.47, y + math.sin(a) * 0.47, z),
                   0.06, 0.06, 'timber_lt', up=(0, 0, 1))
        B.cyl((x, y, z - 0.1 * side - 0.1), 0.11, 0.2, 8, 'timber_old', axis='z')
    else:
        B.cyl((x, y, z - 0.06), 0.55, 0.12, 8, 'timber', axis='z', smooth=False)


def wagon(B, r):
    B.box((0, 0.68, 0), (3.9, 0.12, 1.5), 'timber_lt')  # bed
    for sz in (-1, 1):
        B.box((0, 0.8, sz * 0.72), (3.9, 0.45, 0.06), 'timber')
    for sx in (-1, 1):
        B.box((sx * 1.92, 0.8, 0), (0.06, 0.45, 1.5), 'timber')
    for x in (-1.3, 1.3):
        B.box((x, 0.5, 0), (0.12, 0.12, 1.86), 'timber_old')  # axle beams
        for sz in (-1, 1):
            _wheel(B, x, sz * 0.92, sz)
    # drawbar at the front end (+x), step at the back (-x): x -2.1..2.1
    B.beam((1.9, 0.6, 0), (2.08, 0.42, 0), 0.1, 0.1, 'timber_old')
    B.box((-2.0, 0.55, 0), (0.2, 0.06, 0.9), 'timber_old')
    if L0(B):
        B.box((2.05, 0.38, 0), (0.08, 0.08, 0.8), 'timber_old')
        for x in (-1.85, -0.62, 0.62, 1.85):
            for sz in (-1, 1):
                B.box((x, 0.72, sz * 0.77), (0.07, 0.68, 0.07), 'timber_old')
        for sz in (-1, 1):
            B.box((0, 1.22, sz * 0.75), (3.95, 0.06, 0.08), 'timber_old')
        B.box((0, 0.42, 0), (2.9, 0.1, 0.12), 'timber_old')  # reach pole
        B.box((-1.88, 0.78, 0.0), (0.03, 0.44, 1.2), 'iron_dk')  # tailboard strap
    else:
        B.box((0, 0.8, 0.78), (0.07, 0.6, 0.07), 'timber_old')
        B.box((0, 0.8, -0.78), (0.07, 0.6, 0.07), 'timber_old')


def wagon_cover(B, r):
    """Cloth over hoops, open at both ends; built from y 0 (the table puts it at y 1.2)."""
    secs = [-2.0, -1.6, -0.8, 0.0, 0.8, 1.6, 2.0] if L0(B) else [-2.0, -1.0, 0.0, 1.0, 2.0]
    arc = 10 if L0(B) else 6
    a, b, t = 1.0, 1.4, 0.05
    hoops = {-1.6, -0.8, 0.0, 0.8, 1.6, -1.0, 1.0}
    verts, faces = [], []
    out_i, in_i = [], []
    for i, x in enumerate(secs):
        end = i in (0, len(secs) - 1)
        s = 0.93 if end else (1.0 if x in hoops else 0.96)
        oi, ii = [], []
        for j in range(arc + 1):
            ph = PI * j / arc
            z, y = math.cos(ph) * a * s, math.sin(ph) * b * s
            if end:
                z *= 1.0
            oi.append(len(verts))
            verts.append((x, y, z))
            ii.append(len(verts))
            zi = math.cos(ph) * (a * s - t)
            yi = max(0.0, math.sin(ph) * (b * s - t))
            verts.append((x, yi, zi))
        out_i.append(oi)
        in_i.append(ii)
    n = len(secs)
    for i in range(n - 1):
        for j in range(arc):
            faces.append((out_i[i][j], out_i[i][j + 1], out_i[i + 1][j + 1], out_i[i + 1][j]))
            faces.append((in_i[i][j], in_i[i + 1][j], in_i[i + 1][j + 1], in_i[i][j + 1]))
        for j in (0, arc):
            faces.append((out_i[i][j], out_i[i + 1][j], in_i[i + 1][j], in_i[i][j]))
    for i in (0, n - 1):
        for j in range(arc):
            faces.append((out_i[i][j], in_i[i][j], in_i[i][j + 1], out_i[i][j + 1]))
    B.mesh(verts, faces, 'white', smooth=True)


def _crate(B, x, z, s, rot, y=0.0):
    m = M((x, y, z), ry=rot)
    B.box((0, 0, 0), (s, s, s), 'timber_lt', m=m)
    if L0(B):
        B.box((0, 0.0, 0), (s + 0.03, 0.12, s + 0.03), 'timber', m=m)
        B.box((0, s - 0.12, 0), (s + 0.03, 0.12, s + 0.03), 'timber', m=m)
        B.box((0, s * 0.45, 0), (s + 0.025, 0.1, s + 0.025), 'timber_old', m=m)


def crate_stack(B, r):
    _crate(B, -0.38, 0.36, 0.82, 0.06)
    _crate(B, 0.4, -0.36, 0.8, -0.12)
    _crate(B, -0.25, -0.05, 0.74, 0.35, y=0.82)
    segs = 10 if L0(B) else 6
    prof = [(0.24, 0), (0.29, 0.15), (0.31, 0.4), (0.29, 0.65), (0.24, 0.8)]
    B.lathe(prof, segs, 'timber', m=M((0.48, 0, 0.5)), cols=['timber', 'iron_dk', 'timber', 'iron_dk'] if L0(B) else None)
    if L0(B):
        B.rock((0.42, 0.8, -0.3), (0.34, 0.3, 0.26), 'cloth', n=14, smooth=True)


# --------------------------------------------------------------------------
# Town and Truce
# --------------------------------------------------------------------------

def truce_stone(B, r):
    j = (lambda: B.rng.uniform(-0.02, 0.02)) if L0(B) else (lambda: 0.0)
    pts = []
    for (x, z) in ((-0.45, -0.24), (-0.38, -0.3), (0.38, -0.3), (0.45, -0.24), (0.45, 0.24), (0.38, 0.3), (-0.38, 0.3),
                   (-0.45, 0.24)):
        pts.append((x + j(), 0, z + j()))
        pts.append((x * 0.92 + j(), 0.86, z * 0.88 + j()))
    B.hull(pts, 'old_stone')
    # the crest, cut by three notches across the top edge
    notch = [-0.21, 0.0, 0.21]
    edges = [-0.41] + notch + [0.41]
    for i in range(4):
        lo, hi = edges[i], edges[i + 1]
        tlo = lo + (0.035 if i > 0 else 0.05)
        thi = hi - (0.035 if i < 3 else 0.05)
        ylo = 1.1 if i > 0 else 1.03
        yhi = 1.1 if i < 3 else 1.03
        q = []
        for (x0, y, dz) in ((lo, 0.85, 0.26), (hi, 0.85, 0.26), (lo, 0.99, 0.25), (hi, 0.99, 0.25), (tlo, ylo, 0.21),
                            (thi, yhi, 0.21)):
            q.append((x0, y, -dz))
            q.append((x0, y, dz))
        B.hull(q, 'old_stone')
    if L0(B):
        B.rock((0.0, 0.0, 0.0), (0.4, 0.06, 0.26), 'moss', n=12)


def ribbon(B, r):
    """A strip with a swallow tail, built from y 0 (bottom) to 0.8 (the knot)."""
    B.box((0, 0.12, 0), (0.06, 0.68, 0.02), 'white')
    for sx in (-1, 1):
        q = []
        for (x, y) in ((0.03 * sx, 0.12), (0.0, 0.12), (0.0, 0.065), (0.012 * sx, 0.0), (0.03 * sx, 0.0)):
            q += [(x, y, -0.01), (x, y, 0.01)]
        B.hull(q, 'white')


def banner_pole(B, r):
    segs = 8 if L0(B) else 5
    B.cyl((0, 0, 0), 0.08, 5.85, segs, 'timber', r_top=0.065)
    B.lathe([(0.055, 5.84), (0.1, 5.9), (0.03, 5.98), (0, 6.0)], segs, 'iron_dk', smooth=False)
    if L0(B):
        B.cyl((0, 0.0, 0), 0.1, 0.35, segs, 'stone_dk', r_top=0.09, smooth=False)
        B.cyl((0, 5.7, 0), 0.085, 0.08, segs, 'iron_dk')
        B.cyl((0, 2.8, 0), 0.085, 0.06, segs, 'iron_dk')


def banner_cloth(B, r):
    """Hangs from a top batten; built from y 0 (tails) to 3.2 (batten)."""
    B.cyl((-0.6, 3.15, 0), 0.025, 1.2, 6 if L0(B) else 4, 'white_dk', axis='x')
    B.box((0, 0.45, 0), (1.1, 2.72, 0.02), 'white')
    for i, x in enumerate((-0.37, 0.0, 0.37)):
        q = []
        tip = 0.0 if i != 1 else 0.08
        for (xx, y) in ((x - 0.18, 0.46), (x + 0.18, 0.46), (x - 0.15, 0.1), (x + 0.15, 0.1), (x, tip)):
            q += [(xx, y, -0.01), (xx, y, 0.01)]
        B.hull(q, 'white')
    if L0(B):
        B.box((0, 2.88, 0), (1.12, 0.12, 0.03), 'white_dk')
        B.box((0, 0.5, 0), (1.12, 0.07, 0.03), 'white_dk')
        for x in (-0.5, 0.0, 0.5):
            B.box((x, 3.05, 0), (0.06, 0.12, 0.035), 'white_dk')


def pledge_board(B, r):
    for sx in (-1, 1):
        B.box((sx * 0.68, 0, 0), (0.12, 2.02, 0.12), 'timber')
    B.box((0, 0.85, 0), (1.32, 1.05, 0.06), 'timber_lt')
    B.gable_roof(0, 0, 1.6, 0.3, 2.0, 2.14, 0.04, 'shingle', along='x', ridge_col='timber', ridge_w=0.07)
    for (x, y, w, h) in ((-0.38, 1.3, 0.26, 0.34), (0.02, 1.38, 0.22, 0.3), (0.36, 1.2, 0.28, 0.36), (-0.1, 0.95, 0.3, 0.26),
                         (0.4, 0.92, 0.18, 0.2)):
        B.box((x, y, 0.035), (w, h, 0.012), 'paper')
    if L0(B):
        for y in (0.8, 1.88):
            B.box((0, y, 0.0), (1.5, 0.08, 0.09), 'timber')
        for sx in (-1, 1):
            B.box((sx * 0.68, 0, 0), (0.22, 0.12, 0.22), 'stone')


def lantern_wall(B, r):
    B.box((0, 0, 0), (6.0, 0.25, 0.5), 'stone_dk')
    B.box((0, 0.25, 0), (5.9, 0.8, 0.4), 'stone')
    B.box((0, 1.05, 0), (6.0, 0.09, 0.46), 'stone_dk')
    for x in (-2.93, -1.47, 0.0, 1.47, 2.93):
        B.box((x, 1.14, 0), (0.13, 0.96, 0.13), 'timber')
    B.box((0, 2.07, 0), (6.0, 0.13, 0.15), 'timber')
    if L0(B):
        for x in (-2.2, -0.73, 0.73, 2.2):
            B.box((x, 1.93, 0.05), (0.025, 0.14, 0.025), 'iron_dk')
            B.box((x, 0.55, 0.2), (0.3, 0.3, 0.05), 'dark')  # little offering niches
        for x in (-2.93, -1.47, 0.0, 1.47, 2.93):
            B.box((x, 1.14, 0), (0.2, 0.06, 0.2), 'timber_old')


def lantern_post(B, r):
    B.box((0, 0, 0), (0.3, 0.22, 0.3), 'stone', top=(0.8, 0.8))
    B.box((0, 0.22, 0), (0.12, 2.22, 0.12), 'timber')
    B.hip_roof(0, 0, 0.3, 0.3, 2.47, 2.6, 0.02, 'shingle', thick=0.04)
    if L0(B):
        B.box((0, 2.3, 0.07), (0.05, 0.05, 0.16), 'timber')
        B.box((0, 2.24, 0.13), (0.015, 0.06, 0.015), 'iron_dk')
        B.box((0, 2.43, 0), (0.18, 0.04, 0.18), 'timber_old')


def paper_lantern(B, r):
    """Built from y 0 (tassel) to 0.5 (hook); the table hangs it from its top."""
    if L0(B):
        prof = [(0.0, 0.5), (0.012, 0.5), (0.012, 0.46), (0.11, 0.445), (0.11, 0.41), (0.15, 0.37), (0.175, 0.3),
                (0.168, 0.25), (0.175, 0.2), (0.15, 0.13), (0.11, 0.09), (0.11, 0.055), (0.03, 0.05), (0.04, 0.0), (0, 0.0)]
        cols = ['dark', 'dark', 'timber', 'timber', 'paper_glow', 'paper_glow', 'paper_glow', 'paper_glow', 'paper_glow',
                'paper_glow', 'timber', 'timber', 'vermilion', 'vermilion']
        B.lathe(prof, 10, 'paper_glow', cols=cols, cap=False)
    else:
        prof = [(0.0, 0.5), (0.012, 0.46), (0.11, 0.43), (0.175, 0.3), (0.175, 0.2), (0.11, 0.07), (0.03, 0.04), (0, 0.0)]
        B.lathe(prof, 6, 'paper_glow', cols=['dark', 'timber', 'paper_glow', 'paper_glow', 'paper_glow', 'timber',
                                             'vermilion'], cap=False)


def gate_bell(B, r):
    for sx in (-1, 1):
        B.box((sx * 0.78, 0, 0), (0.18, 2.9, 0.18), 'vermilion')
        if L0(B):
            B.box((sx * 0.78, 0, 0), (0.26, 0.22, 0.26), 'stone', top=(0.8, 0.8))
            B.beam((sx * 0.78, 2.2, 0), (sx * 0.45, 2.62, 0), 0.1, 0.1, 'vermilion')
    B.box((0, 2.6, 0), (1.8, 0.16, 0.22), 'vermilion')
    B.gable_roof(0, 0, 1.8, 0.8, 2.86, 3.12, 0.06, 'shingle', along='x', ridge_col='timber', ridge_w=0.1)
    B.box((0, 2.76, 0), (1.7, 0.1, 0.2), 'timber')
    bx = 0.15
    segs = 12 if L0(B) else 7
    if L0(B):
        prof = [(0, 2.6), (0.06, 2.6), (0.06, 2.53), (0.14, 2.52), (0.25, 2.46), (0.28, 2.3), (0.3, 2.0), (0.34, 1.9),
                (0.345, 1.86), (0.25, 1.86), (0, 1.9)]
        cols = ['bronze'] * 6 + ['bronze', 'bronze', 'dark', 'dark']
    else:
        prof = [(0, 2.6), (0.06, 2.53), (0.25, 2.46), (0.3, 2.0), (0.345, 1.86), (0, 1.9)]
        cols = ['bronze'] * 4 + ['dark']
    B.lathe(prof, segs, 'bronze', cols=cols, cap=False, m=M((bx, 0, 0)))
    # the striker log on two ropes
    B.cyl((-0.66, 2.05, 0), 0.075, 0.44, 8 if L0(B) else 5, 'timber_old', axis='x')
    if L0(B):
        for x in (-0.6, -0.3):
            B.box((x, 2.08, 0), (0.025, 0.52, 0.025), 'rope')
        B.box((bx, 1.55, 0.0), (0.02, 0.32, 0.02), 'rope')


def straw_post(B, r):
    B.box((0, 0, 0), (0.5, 0.12, 0.5), 'stone', top=(0.85, 0.85))
    B.box((0, 0.12, 0), (0.12, 1.78, 0.12), 'timber')
    segs = 10 if L0(B) else 6
    B.lathe([(0.19, 0.72), (0.23, 0.8), (0.24, 1.2), (0.23, 1.56), (0.18, 1.66)], segs, 'straw', jitter=0.05 if L0(B) else 0,
            smooth=False)
    if L0(B):
        for y in (0.94, 1.36):
            B.ring((0, y, 0), 0.2, 0.25, 0.06, segs, 'rope')


def studio_frame(B, r):
    B.box((0, 0, 0), (5.0, 0.35, 4.0), 'timber_lt')
    posts = [(x, z) for x in (-2.43, 0.0, 2.43) for z in (-1.93, 0.0, 1.93) if (x, z) != (0.0, 0.0)]
    for (x, z) in posts:
        B.box((x, 0.35, z), (0.14, 2.7, 0.14), 'timber')
    for z in (-1.93, 1.93):
        B.box((0, 2.88, z), (5.0, 0.16, 0.16), 'timber')
    for x in (-2.43, 2.43):
        B.box((x, 2.88, 0), (0.16, 0.16, 4.0), 'timber')
    nraft = 7 if L0(B) else 4
    for i in range(nraft):
        x = -2.3 + 4.6 * i / (nraft - 1)
        B.box((x, 3.04, 0), (0.1, 0.16, 4.0), 'timber_old')
    if L0(B):
        for z in (-1.93, 1.93):
            B.box((0, 2.25, z), (4.9, 0.08, 0.1), 'timber')  # head rail for screens
            B.box((0, 0.35, z), (4.9, 0.03, 0.1), 'timber')
        for x in (-2.43, 2.43):
            B.box((x, 2.25, 0), (0.1, 0.08, 3.9), 'timber')
        for (x, z) in ((-2.43, -1.93), (2.43, -1.93), (-2.43, 1.93), (2.43, 1.93)):
            B.box((x, 0, z), (0.16, 0.1, 0.16), 'stone')
        B.box((0, 0.35, 1.97), (5.0, 0.05, 0.06), 'timber')  # deck edge


def paper_screen(B, r):
    for sx in (-1, 1):
        B.box((sx * 0.87, 0, 0), (0.06, 1.9, 0.07), 'timber')
    B.box((0, 1.84, 0), (1.8, 0.06, 0.07), 'timber')
    B.box((0, 0, 0), (1.8, 0.32, 0.1), 'timber')
    B.box((0, 0.32, 0), (1.68, 1.52, 0.012), 'paper')
    xs = (-0.42, 0.0, 0.42) if L0(B) else (0.0,)
    ys = (0.7, 1.08, 1.46) if L0(B) else (1.08,)
    for x in xs:
        B.box((x, 0.32, 0), (0.025, 1.52, 0.03), 'timber_lt')
    for y in ys:
        B.box((0, y, 0), (1.68, 0.025, 0.03), 'timber_lt')


# --------------------------------------------------------------------------
# Memory and the dead
# --------------------------------------------------------------------------

def old_standard(B, r):
    segs = 7 if L0(B) else 5
    B.box((0, 0, 0), (0.3, 0.22, 0.3), 'stone_dk', top=(0.75, 0.75))
    B.cyl((0, 0, 0), 0.055, 4.72, segs, 'timber_old', r_top=0.045)
    B.box((0, 4.32, 0), (0.3, 0.05, 0.05), 'iron')
    B.hull([(-0.015, 4.68, -0.05), (0.015, 4.68, -0.05), (-0.015, 4.68, 0.05), (0.015, 4.68, 0.05), (0, 5.0, 0),
            (-0.02, 4.8, -0.08), (0.02, 4.8, 0.08), (-0.02, 4.8, 0.08), (0.02, 4.8, -0.08)], 'iron')
    for (x0, x1, yb0, yb1) in ((-0.14, -0.02, 3.35, 3.6), (0.02, 0.14, 3.75, 3.55)):
        q = []
        for (x, y) in ((x0, 4.31), (x1, 4.31), (x0, yb0), (x1, yb1)):
            q += [(x, y, -0.008), (x, y, 0.008)]
        B.hull(q, 'cloth_dk')
    if L0(B):
        B.cyl((0, 4.62, 0), 0.06, 0.07, segs, 'iron')
        B.cyl((0, 2.4, 0), 0.06, 0.1, segs, 'iron')
        B.cyl((0, 0.18, 0), 0.06, 0.25, segs, 'iron')


def cairn(B, r):
    if L0(B):
        for i in range(7):
            a = TAU * i / 7 + 0.2
            B.rock((math.cos(a) * 0.52, 0, math.sin(a) * 0.52), (0.3, 0.38, 0.26), 'stone' if i % 2 else 'stone_dk', n=12)
        for i in range(4):
            a = TAU * i / 4 + 0.6
            B.rock((math.cos(a) * 0.3, 0.3, math.sin(a) * 0.3), (0.27, 0.34, 0.23), 'stone_dk' if i % 2 else 'stone', n=12)
        for i in range(2):
            a = PI * i + 1.1
            B.rock((math.cos(a) * 0.12, 0.6, math.sin(a) * 0.12), (0.22, 0.3, 0.2), 'stone', n=12)
        B.rock((0.0, 0.84, 0.0), (0.14, 0.56, 0.12), 'old_stone', n=12)
        B.rock((0.45, 0.0, 0.5), (0.2, 0.1, 0.18), 'moss', n=10)
    else:
        pts = []
        for i in range(9):
            a = TAU * i / 9
            pts.append((math.cos(a) * 0.8, 0, math.sin(a) * 0.8))
            pts.append((math.cos(a + 0.3) * 0.62, 0.42, math.sin(a + 0.3) * 0.62))
            pts.append((math.cos(a) * 0.3, 0.82, math.sin(a) * 0.3))
        B.hull(pts, 'stone')
        B.rock((0.0, 0.8, 0.0), (0.14, 0.6, 0.12), 'old_stone', n=8)


def pyre_stack(B, r):
    segs = 6 if L0(B) else 4
    layers = 4 if L0(B) else 2
    dy = 0.2 if L0(B) else 0.4
    rr = 0.1 if L0(B) else 0.2
    for i in range(layers):
        y = rr + i * dy
        col = 'char' if i == 0 else 'timber_old'
        if i % 2 == 0:
            for z in ((-0.45, -0.15, 0.15, 0.45) if L0(B) else (-0.3, 0.3)):
                B.cyl((-1.2, y, z), rr, 2.4, segs, col, axis='x', smooth=False)
        else:
            for x in ((-1.0, -0.5, 0.0, 0.5, 1.0) if L0(B) else (-0.8, 0.0, 0.8)):
                B.cyl((x, y, -0.6), rr, 1.2, segs, col, axis='z', smooth=False)
    top = rr + (layers - 1) * dy + rr
    B.rock((0, top - 0.06, 0), (0.85, 0.42, 0.28), 'cloth', n=16 if L0(B) else 9, smooth=True)
    if L0(B):
        for x in (-0.45, 0.0, 0.45):
            B.box((x, top + 0.02, 0), (0.04, 0.24, 0.5), 'rope', m=M((0, 0, 0)))


def stela(B, r):
    B.box((0, 0, 0), (0.5, 0.12, 0.2), 'old_stone')
    pts = []
    n = 6 if L0(B) else 4
    outline = [(-0.2, 0.12), (0.2, 0.12)] + [(math.cos(PI * i / n) * 0.2, 0.8 + math.sin(PI * i / n) * 0.2) for i in range(n + 1)]
    for (x, y) in outline:
        pts += [(x, y, -0.08), (x, y, 0.08)]
    B.hull(pts, 'old_stone')
    if L0(B):
        B.ring((0, 0.74, 0.07), 0.07, 0.1, 0.025, 10, 'stone_dk', axis='z')
        for x in (-0.15, 0.15):
            B.box((x, 0.2, 0.075), (0.025, 0.45, 0.012), 'stone_dk')
        B.box((0, 0.2, 0.075), (0.3, 0.025, 0.012), 'stone_dk')


def grave_stone(B, r):
    n = 5 if L0(B) else 3
    outline = [(-0.22, 0.0), (0.22, 0.0)] + [(math.cos(PI * i / n) * 0.21, 0.5 + math.sin(PI * i / n) * 0.2) for i in range(n + 1)]
    pts = []
    for (x, y) in outline:
        jx = B.rng.uniform(-0.02, 0.02)
        pts += [(x + jx, y, -0.09 + B.rng.uniform(0, 0.015)), (x + jx, y, 0.09 - B.rng.uniform(0, 0.015))]
    B.hull(pts, 'old_stone', m=M((0, 0, 0), rz=0.05))
    if L0(B):
        B.rock((0, 0, 0), (0.21, 0.05, 0.08), 'moss', n=8)


# --------------------------------------------------------------------------
# The barrow, and the one sign that means "the way in is here"
# --------------------------------------------------------------------------

def barrow_mound(B, r):
    S = 32 if L0(B) else 14
    rings = [0.0, 0.18, 0.34, 0.5, 0.63, 0.75, 0.85, 0.93, 1.0] if L0(B) else [0.0, 0.4, 0.7, 0.9, 1.0]
    R, H = 8.25, 4.0

    def height(t, a):
        n = 1 + 0.05 * math.sin(3 * a + 0.7) + 0.04 * math.sin(5 * a + 2.1) + 0.03 * math.cos(7 * a)
        return H * max(0.0, 1 - t ** 2.6) ** 0.62 * (n if t > 0 else 1.0)
    verts, faces, cols = [(0.0, H, 0.0)], [], []
    idx = []
    for i, t in enumerate(rings[1:]):
        row = []
        for k in range(S):
            a = TAU * k / S
            rr = R * t * (1 + (0.015 * math.sin(4 * a + 1.0) if t < 1 else 0))
            row.append(len(verts))
            verts.append((math.cos(a) * rr, height(t, a), -math.sin(a) * rr))
        idx.append(row)
    for k in range(S):
        faces.append((0, idx[0][k], idx[0][(k + 1) % S]))
        cols.append('grass')
    for i in range(len(idx) - 1):
        for k in range(S):
            k1 = (k + 1) % S
            faces.append((idx[i][k], idx[i + 1][k], idx[i + 1][k1], idx[i][k1]))
            cols.append('earth' if i == len(idx) - 2 else 'grass')
    faces.append(tuple(reversed(idx[-1])))
    cols.append('earth')
    B.mesh(verts, faces, 'grass', smooth=True, cols=cols)
    # kerb of old standing stones around the foot
    nk = 22 if L0(B) else 11
    for i in range(nk):
        a = TAU * (i + 0.5) / nk
        if abs(math.sin(a) + 1) < 0.05:  # leave the front (+z) open
            continue
        rr = 8.58
        B.rock((math.cos(a) * rr, 0, -math.sin(a) * rr), (0.42, 0.8 + 0.25 * math.sin(i * 2.3), 0.34), 'old_stone',
               n=10 if L0(B) else 6, m=None)


def barrow_door(B, r):
    j = (lambda s: B.rng.uniform(-s, s)) if L0(B) else (lambda s: 0.0)
    for sx in (-1, 1):
        x0, x1 = sx * 1.3, sx * 0.72
        pts = []
        for (x, y, z) in ((x0, 0, -0.4), (x1, 0, -0.4), (x0, 0, 0.4), (x1, 0, 0.4), (x0 * 0.97, 2.55, -0.36),
                          (x1, 2.55, -0.36), (x0 * 0.97, 2.55, 0.36), (x1, 2.55, 0.36)):
            pts.append((x + j(0.03), y, z + j(0.03)))
        if L0(B):
            pts.append(((x0 + x1) / 2 + sx * 0.04, 1.3, 0.42))
        B.hull(pts, 'old_stone')
    lint = []
    for (x, y, z) in ((-1.3, 2.5, -0.4), (1.3, 2.5, -0.4), (-1.3, 2.5, 0.4), (1.3, 2.5, 0.4), (-1.24, 3.0, -0.36),
                      (1.26, 2.97, -0.36), (-1.24, 3.0, 0.38), (1.26, 2.96, 0.36)):
        lint.append((x + j(0.03), y + j(0.02), z))
    if L0(B):
        lint.append((0.0, 3.0, 0.4))
    B.hull(lint, 'old_stone')
    B.box((0, 0.08, -0.12), (1.46, 2.44, 0.32), 'stone_dk')  # the sealed slab
    B.box((0, 0, 0.1), (1.6, 0.1, 0.6), 'old_stone')  # threshold
    if L0(B):
        B.ring((0, 1.4, 0.04), 0.22, 0.34, 0.06, 14, 'old_stone', axis='z')
        B.cyl((0, 1.4, 0.04), 0.1, 0.07, 10, 'old_stone', axis='z')
        B.rock((0, 2.95, 0.0), (1.0, 0.08, 0.3), 'moss', n=10)
        B.rock((-1.15, 0.0, 0.25), (0.18, 0.1, 0.14), 'moss', n=8)


def fire_basket(B, r):
    n = 3
    for k in range(n):
        a = TAU * k / n + PI / 2
        foot = (math.cos(a) * 0.28, 0, -math.sin(a) * 0.28)
        top = (math.cos(a) * 0.09, 1.0, -math.sin(a) * 0.09)
        B.beam(foot, top, 0.045, 0.045, 'iron_dk')
        if L0(B):
            B.box((foot[0], 0, foot[2]), (0.08, 0.03, 0.08), 'iron_dk')
    if L0(B):
        B.ring((0, 0.42, 0), 0.17, 0.2, 0.025, 8, 'iron_dk', smooth=False)
        B.ring((0, 0.97, 0), 0.08, 0.13, 0.05, 8, 'iron_dk', smooth=False)
        B.ring((0, 1.2, 0), 0.21, 0.235, 0.03, 10, 'iron_dk', smooth=False)
        B.ring((0, 1.37, 0), 0.275, 0.3, 0.03, 12, 'iron_dk', smooth=False)
        for k in range(10):
            a = TAU * k / 10
            B.beam((math.cos(a) * 0.12, 0.99, -math.sin(a) * 0.12), (math.cos(a) * 0.3, 1.4, -math.sin(a) * 0.3), 0.028,
                   0.028, 'iron_dk')
        B.lathe([(0.12, 1.02), (0.2, 1.12), (0.25, 1.27), (0.18, 1.3), (0, 1.31)], 10, 'char',
                cols=['char', 'char', 'ember', 'ember'], smooth=False)
        for k in range(3):
            a = TAU * k / 3 + 0.4
            B.beam((math.cos(a) * 0.22, 1.18, -math.sin(a) * 0.22), (-math.cos(a) * 0.05, 1.36, math.sin(a) * 0.05), 0.06,
                   0.06, 'timber_old')
    else:
        B.lathe([(0.1, 0.97), (0.3, 1.4), (0.27, 1.4), (0.0, 1.05)], 6, 'iron_dk', cols=['iron_dk', 'iron_dk', 'ember'],
                cap=False, smooth=False)


def fire_basket_flame(B, r):
    """Built from y 0 (it sits at y 1.2 on its basket) to 0.6."""
    if L0(B):
        B.lathe([(0.17, 0.0), (0.19, 0.08), (0.14, 0.22), (0.08, 0.38), (0.0, 0.6)], 7, 'flame_core',
                cols=['flame_core', 'flame_core', 'flame', 'flame'], phase=0.3, smooth=False)
        for k in range(5):
            a = TAU * k / 5 + 0.2
            h = 0.36 + 0.1 * ((k * 3) % 4) / 3
            m = M((math.cos(a) * 0.13, 0.0, -math.sin(a) * 0.13), rz=0.0) @ M((0, 0, 0), ry=a) @ M((0, 0, 0), rz=-0.22)
            B.lathe([(0.075, 0.0), (0.08, 0.06), (0.04, h * 0.6), (0.0, h)], 5, 'flame', m=m, cols=['flame', 'flame', 'flame'],
                    smooth=False)
    else:
        B.lathe([(0.2, 0.0), (0.21, 0.08), (0.12, 0.28), (0.0, 0.6)], 5, 'flame', cols=['flame_core', 'flame', 'flame'],
                smooth=False)
        for k in range(3):
            a = TAU * k / 3 + 0.5
            m = M((math.cos(a) * 0.15, 0.0, -math.sin(a) * 0.15)) @ M((0, 0, 0), ry=a) @ M((0, 0, 0), rz=-0.25)
            B.lathe([(0.08, 0.0), (0.0, 0.4)], 4, 'flame', m=m, smooth=False)


def oath_tree(B, r):
    """The Oath Tree: an old broad tree, short thick trunk, limbs from 2.4 m,
    a rope ring with paper tassels at head height, a crown of big leaf masses."""
    hi = L0(B)
    segs = 10 if hi else 6
    if hi:
        prof = [(1.0, 0.0), (0.86, 0.3), (0.78, 0.8), (0.73, 1.5), (0.72, 2.1), (0.7, 2.45), (0.56, 3.0), (0.4, 3.6),
                (0.0, 3.75)]
    else:
        prof = [(0.98, 0.0), (0.74, 0.9), (0.7, 2.4), (0.42, 3.5), (0.0, 3.7)]
    B.lathe(prof, segs, 'bark', jitter=0.07 if hi else 0.03, phase=0.2)
    # root buttresses
    nroot = 6 if hi else 4
    for k in range(nroot):
        a = TAU * k / nroot + 0.35
        c, s = math.cos(a), -math.sin(a)
        B.limb((c * 0.5, 0.75, s * 0.5), (c * 1.45, -0.05, s * 1.45), 0.26, 0.08, 6 if hi else 4, 'bark', smooth=False)
    # heavy limbs from 2.4 m, then secondary branches into the crown
    limbs = [(0.3, 3.3, 5.0), (1.85, 3.0, 5.3), (3.3, 3.2, 4.9), (4.9, 3.1, 5.2)]
    for i, (a, rr, y) in enumerate(limbs):
        c, s = math.cos(a), -math.sin(a)
        start = (c * 0.35, 2.4 + 0.15 * (i % 2), s * 0.35)
        end = (c * rr, y, s * rr)
        B.limb(start, end, 0.42, 0.2, 8 if hi else 5, 'bark', mid=0.3)
        if hi:
            for da, dr, dy in ((0.35, 1.2, 1.2), (-0.4, 1.0, 1.6)):
                c2, s2 = math.cos(a + da), -math.sin(a + da)
                B.limb(end, (end[0] + c2 * dr, end[1] + dy, end[2] + s2 * dr), 0.18, 0.08, 6, 'bark')
    B.limb((0, 3.4, 0), (0.2, 6.8, -0.1), 0.38, 0.14, 8 if hi else 5, 'bark')
    # rope ring at head height with paper tassels
    if hi:
        B.ring((0, 1.7, 0), 0.7, 0.82, 0.12, 14, 'rope', phase=0.1)
        for k in range(4):
            a = TAU * k / 4 + 0.6
            c, s = math.cos(a), -math.sin(a)
            q = []
            for (dy, w) in ((0.0, 0.08), (-0.18, 0.1), (-0.36, 0.08)):
                for t in (-1, 1):
                    q.append((c * 0.83 + s * w * t, 1.7 + dy, s * 0.83 - c * w * t))
                    q.append((c * 0.86 + s * w * t, 1.7 + dy, s * 0.86 - c * w * t))
            B.hull(q, 'paper')
    else:
        B.ring((0, 1.7, 0), 0.68, 0.8, 0.12, 6, 'rope', smooth=False)
    # the crown: a dome of big masses, underside about 4.4 m
    n = 60 if hi else 22
    blobs = [((0.0, 9.0, 0.0), (3.3, 2.0, 3.3), 'leaf')]
    for k in range(6):
        a = TAU * k / 6 + 0.25
        blobs.append(((math.cos(a) * 3.0, 7.4 + 0.3 * (k % 2), -math.sin(a) * 3.0), (2.15, 1.45, 2.15), 'leaf'))
    lower = 5 if hi else 3
    for k in range(lower):
        a = TAU * k / lower + 0.9
        blobs.append(((math.cos(a) * 3.5, 6.0, -math.sin(a) * 3.5), (1.55, 1.05, 1.55), 'leaf_dk'))
    for (cpos, rad, col) in blobs:
        B.rock(cpos, rad, col, n=n, smooth=True, flat_bottom=False)


# Companions shown with a piece on the contact sheets, at their mounted place.
COMBO = {
    'windmill_sails': [('windmill_body_LOD{l}', (0, 0, 0)), ('windmill_sails_LOD{l}', (0, 8.5, 3.25))],
    'wagon_cover': [('wagon_LOD{l}', (0, 0, 0)), ('wagon_cover_LOD{l}', (0, 0, 0))],
    'fire_basket_flame': [('fire_basket_LOD{l}', (0, 0, 0)), ('fire_basket_flame_LOD{l}', (0, 0, 0))],
    'paper_lantern': [('lantern_post_LOD{l}', (0, 0, 0)), ('paper_lantern_LOD{l}', (0, 2.27, 0.15))],
    'banner_cloth': [('banner_cloth_LOD{l}', (0, 3.5, 0))],
    'ribbon': [('ribbon_LOD{l}', (0, 1.3, 0))],
}

# Bark is drawn from one uniform atlas tile: the tree's many narrow trunk and limb
# strips otherwise blur into their neighbours at lower mip levels in the game.
TILE_KEYS = ('bark',)
# Texel density factors (1 = the kit's normal density).
TEXEL = {'barrow_mound': 0.5, 'hedgerow_4m': 0.75}

BUILDERS = {name: fn for name, fn in globals().items() if callable(fn) and name in BOX_KEYS}
assert len(BUILDERS) == 38, sorted(set(BOX_KEYS) - set(BUILDERS))
