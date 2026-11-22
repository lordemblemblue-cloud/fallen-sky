"""Remoria's kit: a marching camp (Castra Lupa). Game coordinates (see common/kitlib).

Metres, x right, y up, z toward the front. Walls face their front (+z) outward,
toward whoever approaches; the walk is behind (-z). Builders work above y = 0;
Builder.finish carries whatever touches the ground down by the table's skirt.
Our own designs from the way marching camps were built: earth bank and stakes,
timber gate towers, leather tents, the standard where the two streets cross.
No lettering anywhere: the fort's name board and the milestone are blank.
"""
import math

from kitlib import M

PI = math.pi
TAU = 2 * PI


def L0(B):
    return B.lod == 0


# --------------------------------------------------------------------------
# Shared parts
# --------------------------------------------------------------------------

# Bank cross-section: (offset along the outward normal, height), outer foot first.
BANK = [(1.3, 0.0), (0.7, 1.3), (-0.7, 1.3), (-1.3, 0.0)]
BANK_COLS = ['earth', 'turf', 'earth', 'earth']  # outer slope, top, inner slope, underside


def _sweep(B, path, normals, section, cols, cap=True):
    """Sweep a closed (offset, y) section along a path in the xz plane."""
    n = len(section)
    verts, faces, fcols = [], [], []
    for (px, pz), (nx, nz) in zip(path, normals):
        for (o, y) in section:
            verts.append((px + nx * o, y, pz + nz * o))
    for i in range(len(path) - 1):
        for j in range(n):
            j1 = (j + 1) % n
            a, b = i * n + j, i * n + j1
            faces.append((a, b, b + n, a + n))
            fcols.append(cols[j])
    if cap:
        last = (len(path) - 1) * n
        faces.append(tuple(range(n)))
        fcols.append(cols[-1])
        faces.append(tuple(last + j for j in reversed(range(n))))
        fcols.append(cols[-1])
    B.mesh(verts, faces, cols[0], cols=fcols)


def _strip(B, path, normals, o0, o1, y0, y1, col):
    """A box strip (walk, rail) following the path between offsets o0..o1, heights y0..y1."""
    _sweep(B, path, normals, [(o1, y0), (o1, y1), (o0, y1), (o0, y0)], [col] * 4)


def _stakes(B, path, normals, offset, count, y0=1.2, top=3.2):
    """Sharpened stakes standing on the bank, evenly spread along the path."""
    total = sum(math.dist(path[i], path[i + 1]) for i in range(len(path) - 1))
    step = total / count
    segs = 6 if L0(B) else 4
    for k in range(count):
        s = (k + 0.5) * step
        acc = 0.0
        for i in range(len(path) - 1):
            seg = math.dist(path[i], path[i + 1])
            if acc + seg >= s or i == len(path) - 2:
                t = (s - acc) / seg
                px = path[i][0] + (path[i + 1][0] - path[i][0]) * t
                pz = path[i][1] + (path[i + 1][1] - path[i][1]) * t
                nx = normals[i][0] + (normals[i + 1][0] - normals[i][0]) * t
                nz = normals[i][1] + (normals[i + 1][1] - normals[i][1]) * t
                break
            acc += seg
        h = top - (0.12 * ((k * 7) % 3) / 2 if L0(B) else 0)
        r = 0.1 if L0(B) else 0.11
        B.lathe([(r, y0), (r, h - 0.22), (0.0, h)], segs, 'timber_old', smooth=False,
                m=M((px + nx * offset, 0, pz + nz * offset), ry=k * 0.7), phase=0.3 * k)


def _rampart(B, path, normals, stakes):
    _sweep(B, path, normals, BANK, BANK_COLS)
    if L0(B):
        _stakes(B, path, normals, 0.45, stakes)
        _strip(B, path, normals, 0.27, 0.33, 2.2, 2.34, 'timber')  # binding rail behind the stakes
        _strip(B, path, normals, -0.75, 0.15, 1.3, 1.36, 'timber_lt')  # the walk
    else:
        _stakes(B, path, normals, 0.45, max(5, stakes // 3))
        _strip(B, path, normals, 0.36, 0.54, 1.25, 2.6, 'timber_old')  # the fence, as one board


def _flame(B):
    """Built from y 0 (it sits at y 1.1 on its brazier) to 0.6."""
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


# --------------------------------------------------------------------------
# The wall
# --------------------------------------------------------------------------

def palisade_run(B, r):
    """4 m of bank, stakes and walk; ends cut square so runs tile end to end."""
    path = [(-2.0, 0.0), (2.0, 0.0)]
    normals = [(0.0, 1.0), (0.0, 1.0)]
    _rampart(B, path, normals, 18)


def palisade_corner(B, r):
    """The rounded corner. Origin: where the two wall centrelines would cross;
    front (+z) the outward diagonal. The bank's centre line is a quarter circle
    of radius 2 m joining the ends of the two runs it meets."""
    R = 2.0
    cz = -R * math.sqrt(2)
    n = 9 if L0(B) else 5
    path, normals = [], []
    for i in range(n):
        phi = math.radians(135 - 90 * i / (n - 1))
        nx, nz = math.cos(phi), math.sin(phi)
        path.append((nx * R, cz + nz * R))
        normals.append((nx, nz))
    _rampart(B, path, normals, 17)


def gate_tower(B, r):
    hw = 1.45
    posts = [(sx * hw, sz * hw) for sx in (-1, 1) for sz in (-1, 1)]
    for (x, z) in posts:
        B.box((x, 0, z), (0.3, 7.5, 0.3), 'timber')
        if L0(B):
            B.box((x, 0, z), (0.5, 0.4, 0.5), 'stone', top=(0.8, 0.8))
    B.box((0, 3.35, 0), (3.2, 0.25, 3.2), 'timber_lt')  # the walk level (the gate span joins here)
    B.box((0, 6.3, 0), (3.2, 0.25, 3.2), 'timber_lt')  # fighting platform
    for (dx, dz, w, d) in ((0, hw, 3.2, 0.1), (0, -hw, 3.2, 0.1), (hw, 0, 0.1, 3.2), (-hw, 0, 0.1, 3.2)):
        B.box((dx, 6.55, dz), (w, 0.95, d), 'timber_old')  # parapet
    for (x, z) in posts:
        B.box((x, 7.5, z), (0.2, 0.55, 0.2), 'timber')
    B.hip_roof(0, 0, 3.2, 3.2, 8.15, 9.0, 0.3, 'shingle', thick=0.18)
    if L0(B):
        for sx in (-1, 1):  # braces on the two sides
            B.beam((sx * hw, 0.5, -hw), (sx * hw, 3.3, hw), 0.14, 0.12, 'timber_old')
            B.beam((sx * hw, 0.5, hw), (sx * hw, 3.3, -hw), 0.14, 0.12, 'timber_old')
            B.beam((sx * hw, 3.7, -hw), (sx * hw, 6.25, hw), 0.12, 0.1, 'timber_old')
        for sz in (-1, 1):
            B.box((0, 3.6, sz * hw), (3.2, 0.12, 0.14), 'timber')
            B.box((0, 6.0, sz * hw), (3.2, 0.14, 0.16), 'timber')
        for k in range(5):  # parapet planks read from outside
            x = -1.2 + 0.6 * k
            B.box((x, 6.5, hw + 0.06), (0.04, 1.0, 0.03), 'timber')
        B.box((0, 6.65, hw + 0.08), (0.9, 0.75, 0.03), 'red')  # a red cloth on the front
        B.box((0, 7.38, hw + 0.08), (1.0, 0.06, 0.05), 'brass')
        B.box((0, 3.6, -hw - 0.02), (1.0, 2.0, 0.06), 'dark')  # doorway to the walk, inside face


def gate_span(B, r):
    """The walk over the gate, built from y 0; the table centres it (mounted at y 4.2)."""
    B.box((0, 0.0, 0.0), (5.8, 0.3, 1.6), 'timber')
    B.box((0, 0.3, 0.0), (5.8, 0.12, 1.5), 'timber_lt')
    B.box((0, 0.42, 0.72), (5.8, 0.98, 0.08), 'timber_old')  # front parapet
    B.box((-0.0, 0.62, 0.79), (1.6, 0.5, 0.04), 'red')  # the fort's name board, left blank
    if L0(B):
        for x in (-2.8, -1.4, 0.0, 1.4, 2.8):
            B.box((x, 0.42, 0.7), (0.12, 0.98, 0.12), 'timber')
            B.box((x, 0.42, -0.7), (0.1, 0.65, 0.1), 'timber')
        B.box((0, 0.98, -0.7), (5.8, 0.08, 0.08), 'timber')
        for (dx, dy, w, h) in ((0, 0.6, 1.7, 0.05), (0, 1.12, 1.7, 0.05), (-0.82, 0.6, 0.05, 0.57), (0.82, 0.6, 0.05, 0.57)):
            B.box((dx, dy, 0.82), (w, h, 0.03), 'brass')
    else:
        B.box((0, 0.42, -0.7), (5.8, 0.62, 0.1), 'timber')


def stake_hedge(B, r):
    segs = 5 if L0(B) else 3
    B.cyl((-2.0, 0.55, 0), 0.13, 4.0, 8 if L0(B) else 5, 'timber_old', axis='x')
    pairs = 8 if L0(B) else 4
    for i in range(pairs):
        x = -2.0 + (i + 0.5) * 4.0 / pairs
        B.limb((x - 0.04, 0.0, -0.62), (x - 0.04, 1.3, 0.7), 0.06, 0.008, segs, 'timber_old', smooth=False)
        B.limb((x + 0.04, 0.0, 0.62), (x + 0.04, 1.3, -0.7), 0.06, 0.008, segs, 'timber_old', smooth=False)


# --------------------------------------------------------------------------
# Tents
# --------------------------------------------------------------------------

def tent_legion(B, r):
    """Leather ridge tent for eight; ridge along z, door at the front (+z)."""
    W, eave, ridge, L = 1.45, 0.55, 1.93, 1.6
    sect = [(-W, 0.0), (-W, eave), (0.0, ridge), (W, eave), (W, 0.0)]
    panels = 4 if L0(B) else 1
    for i in range(panels):
        z0 = -L + 2 * L * i / panels
        z1 = -L + 2 * L * (i + 1) / panels
        pts = [(x, y, z) for (x, y) in sect for z in (z0, z1)]
        B.hull(pts, 'leather' if i % 2 == 0 else 'leather_dk')
    B.cyl((0, 1.95, -1.8), 0.05, 3.6, 6 if L0(B) else 4, 'timber', axis='z')
    B.hull([(-0.55, 0.0, L + 0.01), (0.55, 0.0, L + 0.01), (0.0, 1.4, L + 0.01), (-0.55, 0.0, L + 0.03),
            (0.55, 0.0, L + 0.03), (0.0, 1.4, L + 0.03)], 'dark')
    if L0(B):
        for sx in (-1, 1):  # door flaps tied back
            B.hull([(sx * 0.55, 0.0, L + 0.02), (sx * 0.05, 1.42, L + 0.02), (sx * 0.95, 0.35, L + 0.18),
                    (sx * 0.55, 0.0, L + 0.06)], 'leather_dk')
        for z in (-L, L):
            for sx in (-1, 1):
                B.box((sx * 1.47, 0.0, z * 0.98), (0.06, 0.6, 0.06), 'timber')
        for z in (-0.8, 0.0, 0.8):  # seams over the roof
            B.beam((-W - 0.01, eave, z), (0.0, ridge + 0.01, z), 0.04, 0.02, 'leather_dk', up=(0, 0, 1))
            B.beam((W + 0.01, eave, z), (0.0, ridge + 0.01, z), 0.04, 0.02, 'leather_dk', up=(0, 0, 1))


def tent_command(B, r):
    """The legate's tent on a timber floor: leather walls, red drapes, an awning in front."""
    B.box((0, 0, 0), (8.0, 0.22, 6.0), 'timber_lt')  # floor
    zc, D = -1.2, 3.6
    B.box((0, 0.22, zc), (6.0, 1.75, D), 'leather')
    B.hip_roof(0, zc, 6.8, 4.3, 2.12, 3.6, 2.6, 'leather_dk', thick=0.15)
    zf = zc + D / 2
    B.box((0, 0.22, zf + 0.01), (1.4, 1.7, 0.05), 'dark')  # the open door
    for sx in (-1, 1):
        B.box((sx * 1.05, 0.22, zf + 0.03), (0.7, 1.75, 0.06), 'red')  # drapes drawn aside
    # awning: a sloped cloth on four poles
    ax, z0, z1 = 2.6, zf, 2.9
    pts = []
    for sx in (-1, 1):
        pts += [(sx * ax, 2.55, z0), (sx * ax, 2.62, z0), (sx * ax, 2.25, z1), (sx * ax, 2.32, z1)]
    B.hull(pts, 'red')
    for sx in (-1, 1):
        B.cyl((sx * (ax - 0.1), 0.22, z1 - 0.1), 0.05, 2.1, 6 if L0(B) else 4, 'timber')
    B.box((0, 1.95, z1 - 0.02), (5.2, 0.3, 0.04), 'red_dk')  # valance
    if L0(B):
        for k in range(8):  # scalloped edge
            x = -2.275 + k * 0.65
            B.hull([(x - 0.3, 1.95, z1 - 0.03), (x + 0.3, 1.95, z1 - 0.03), (x, 1.78, z1 - 0.03),
                    (x - 0.3, 1.95, z1 - 0.01), (x + 0.3, 1.95, z1 - 0.01), (x, 1.78, z1 - 0.01)], 'red_dk')
        B.box((0, 2.24, z1 - 0.02), (5.3, 0.05, 0.06), 'brass')
        for sx in (-1, 1):  # corner poles and wall drapes
            for sz in (-1, 1):
                B.cyl((sx * 3.0, 0.22, zc + sz * 1.8), 0.06, 2.0, 6, 'timber')
            B.box((sx * 3.02, 0.22, zc), (0.04, 1.7, 1.6), 'red')
        B.box((0, 0.22, z0 + 1.2), (1.4, 0.75, 0.8), 'timber')  # camp table under the awning
        B.box((0, 0.97, z0 + 1.2), (1.5, 0.04, 0.9), 'red_dk')
        B.box((-1.4, 0.22, z0 + 1.2), (0.45, 0.45, 0.45), 'timber_old')
        B.box((4.0 - 0.15, 0.0, 0), (0.3, 0.22, 6.0), 'timber')  # floor edge beams
        B.box((-4.0 + 0.15, 0.0, 0), (0.3, 0.22, 6.0), 'timber')


# --------------------------------------------------------------------------
# The crossing of the two streets
# --------------------------------------------------------------------------

def _wolf(B, y0, s=1.0):
    """A small cast wolf standing side-on (head toward +x), feet at y0, about 0.42 tall."""
    def P(x, y, z):
        return (x * s, y0 + y * s, z * s)
    n = 12 if L0(B) else 7
    B.rock(P(-0.02, 0.17, 0), (0.22 * s, 0.13 * s, 0.075 * s), 'brass', n=n, flat_bottom=False)
    B.rock(P(0.17, 0.22, 0), (0.1 * s, 0.11 * s, 0.085 * s), 'brass', n=n, flat_bottom=False)
    B.rock(P(0.26, 0.31, 0), (0.075 * s, 0.06 * s, 0.055 * s), 'brass', n=n, flat_bottom=False)
    B.beam(P(0.3, 0.3, 0), P(0.4, 0.27, 0), 0.05 * s, 0.045 * s, 'brass')
    for dz in (-0.025, 0.025):
        B.hull([P(0.24, 0.35, dz - 0.015), P(0.27, 0.35, dz + 0.015), P(0.22, 0.35, dz + 0.015), P(0.25, 0.42, dz)],
               'brass')
    for (x, z) in ((0.16, 0.04), (0.16, -0.04), (-0.16, 0.04), (-0.16, -0.04)):
        B.beam(P(x, 0.16, z), P(x + 0.02, 0.0, z), 0.035 * s, 0.035 * s, 'brass')
    B.beam(P(-0.22, 0.2, 0), P(-0.36, 0.1, 0), 0.035 * s, 0.035 * s, 'brass')


def standard_wolf(B, r):
    B.box((0, 0, 0), (1.4, 0.35, 1.4), 'stone')
    B.box((0, 0.35, 0), (1.1, 0.55, 1.1), 'stone')
    B.box((0, 0.9, 0), (1.22, 0.1, 1.22), 'stone_dk')
    segs = 8 if L0(B) else 5
    B.cyl((0, 1.0, 0), 0.05, 3.75, segs, 'timber')
    B.cyl((-0.45, 4.1, 0), 0.03, 0.9, segs, 'timber', axis='x')
    B.box((0, 3.32, 0.04), (0.8, 0.76, 0.02), 'red')  # the cloth
    B.box((0, 3.27, 0.04), (0.8, 0.07, 0.025), 'brass')  # its fringe
    B.cyl((0, 4.75, 0), 0.13, 0.04, segs, 'brass')
    _wolf(B, 4.79, 1.0)
    if L0(B):
        for y in (2.55, 2.95, 3.0 - 0.8):
            B.cyl((0, y, 0.04), 0.11, 0.03, 10, 'brass', axis='z')
        for sx in (-1, 1):
            B.lathe([(0.0, 4.07), (0.045, 4.1), (0.0, 4.13)], 6, 'brass', m=M((sx * 0.46, 0, 0)))
        B.cyl((0, 3.9, 0), 0.07, 0.06, segs, 'brass')
        B.cyl((0, 1.0, 0), 0.07, 0.12, segs, 'iron_dk')


def tribunal(B, r):
    """Turf-and-timber platform; steps at the front (+z)."""
    z0, z1 = -1.5, 0.7
    D = z1 - z0
    zc = (z0 + z1) / 2
    B.box((0, 0, zc), (4.0, 1.04, D), 'turf')
    B.box((0, 1.04, zc), (4.0, 0.06, D), 'timber_lt')
    for k, y in enumerate((0.0, 0.35, 0.7)):
        B.box((0, y, z1 + 0.8 - 0.27 * (k + 1) + 0.135), (1.6, 0.35, 0.27 + 0.27 * (2 - k)), 'timber')
    B.box((0, 0.3, z1 + 0.02), (0.9, 0.7, 0.03), 'red')  # cloth over the front edge
    if L0(B):
        for x in (-1.95, -1.3, -0.65, 0.65, 1.3, 1.95):  # revetment posts
            B.box((x, 0, z1 + 0.02), (0.12, 1.05, 0.08), 'timber_old')
            B.box((x, 0, z0 - 0.02), (0.12, 1.05, 0.08), 'timber_old')
        for sx in (-1, 1):
            for z in (-1.1, -0.4, 0.3):
                B.box((sx * 2.02, 0, z), (0.08, 1.05, 0.12), 'timber_old')
        B.box((0, 0.98, z1 + 0.03), (4.05, 0.1, 0.1), 'timber')


def brazier_iron(B, r):
    segs = 10 if L0(B) else 6
    for k in range(3):
        a = TAU * k / 3 + PI / 2
        c, s = math.cos(a), -math.sin(a)
        B.limb((c * 0.3, 0.02, s * 0.3), (c * 0.2, 0.55, s * 0.2), 0.03, 0.025, 4, 'iron_dk', smooth=False)
        B.limb((c * 0.2, 0.55, s * 0.2), (c * 0.08, 0.97, s * 0.08), 0.025, 0.02, 4, 'iron_dk', smooth=False)
        if L0(B):
            B.rock((c * 0.31, 0, s * 0.31), (0.05, 0.06, 0.05), 'iron_dk', n=8)
    B.lathe([(0.06, 0.95), (0.25, 1.04), (0.34, 1.22), (0.35, 1.3), (0.31, 1.3), (0.25, 1.2), (0.0, 1.17)], segs,
            'iron_dk', cols=['iron_dk', 'iron_dk', 'iron_dk', 'iron_dk', 'char', 'char'], smooth=False, cap=False)
    if L0(B):
        B.ring((0, 0.5, 0), 0.17, 0.2, 0.025, 8, 'iron_dk', smooth=False)
        B.lathe([(0.27, 1.18), (0.2, 1.24), (0.0, 1.27)], 8, 'ember', smooth=False)


def brazier_fire(B, r):
    _flame(B)


def _scutum(B, m, w=0.62, h=1.05):
    """A curved rectangular shield, red face with a brass boss; built standing at the origin facing +z."""
    n = 5 if L0(B) else 3
    R = 0.6
    span = w / R
    for i in range(n):
        a0 = -span / 2 + span * i / n
        a1 = -span / 2 + span * (i + 1) / n
        pts = []
        for a in (a0, a1):
            for rr in (R, R - 0.035):
                x, z = math.sin(a) * rr, math.cos(a) * rr - R
                pts += [(x, 0.0, z), (x, h, z)]
        B.hull(pts, 'red', m=m)
    B.lathe([(0.1, 0.0), (0.09, 0.03), (0.0, 0.06)], 8 if L0(B) else 5, 'brass', m=m @ M((0, h / 2, 0.0), rx=PI / 2))
    if L0(B):
        B.box((0, h - 0.03, -0.01), (w * 0.98, 0.03, 0.04), 'brass', m=m)
        B.box((0, 0.0, -0.01), (w * 0.98, 0.03, 0.04), 'brass', m=m)


def rack_arms(B, r):
    for sx in (-1, 1):
        B.box((sx * 1.13, 0, -0.25), (0.1, 1.62, 0.12), 'timber')
        B.box((sx * 1.13, 0, -0.25), (0.14, 0.06, 0.5), 'timber_old')
    B.box((0, 1.5, -0.25), (2.36, 0.08, 0.1), 'timber')
    B.box((0, 0.22, -0.25), (2.36, 0.08, 0.14), 'timber')
    n = 7 if L0(B) else 4
    for k in range(n):
        x = -0.9 + 1.8 * k / (n - 1)
        B.beam((x, 0.22, -0.2), (x, 1.42, -0.3), 0.04, 0.04, 'timber_lt')
        B.beam((x, 1.42, -0.3), (x, 1.9, -0.34), 0.02, 0.02, 'iron_dk')
    for k, x in enumerate((-0.72, 0.0, 0.72)):
        if not L0(B) and k == 1:
            continue
        m = M((x, 0.0, 0.33), ry=0.08 * (k - 1)) @ M((0, 0, 0), rx=-0.18)
        _scutum(B, m)


# --------------------------------------------------------------------------
# The colony
# --------------------------------------------------------------------------

def boundary_stone(B, r):
    j = (lambda: B.rng.uniform(-0.012, 0.012)) if L0(B) else (lambda: 0.0)
    pts = []
    for (x, z) in ((-0.25, -0.2), (0.25, -0.2), (0.25, 0.2), (-0.25, 0.2)):
        pts.append((x + j(), 0.0, z + j()))
        pts.append((x * 0.88 + j(), 1.0, z * 0.86 + j()))
        pts.append((x * 0.6, 1.2, z * 0.6))
    B.hull(pts, 'stone')
    if L0(B):
        B.box((0, 1.17, 0), (0.24, 0.035, 0.03), 'stone_dk')  # the cross cut in its head
        B.box((0, 1.17, 0), (0.03, 0.035, 0.2), 'stone_dk')


def plough(B, r):
    segs = 6 if L0(B) else 4
    B.limb((-1.15, 0.12, 0), (0.1, 0.62, 0), 0.07, 0.06, segs, 'timber')  # the beam
    B.limb((0.1, 0.62, 0), (1.2, 0.58, 0), 0.06, 0.05, segs, 'timber')
    B.hull([(-1.3, 0.0, -0.06), (-1.3, 0.0, 0.06), (-0.85, 0.0, -0.1), (-0.85, 0.0, 0.1), (-0.95, 0.2, -0.08),
            (-0.95, 0.2, 0.08), (-1.3, 0.06, 0.0)], 'brass')  # the bronze-shod share
    B.limb((-0.95, 0.15, 0), (-1.28, 1.1, 0), 0.045, 0.04, segs, 'timber_old')  # the handle
    B.cyl((1.2, 0.62, -0.45), 0.05, 0.9, segs, 'timber_old', axis='z')  # the yoke
    if L0(B):
        B.cyl((-1.25, 1.0, -0.15), 0.025, 0.3, 5, 'timber_old', axis='z')
        for sz in (-1, 1):
            for dx in (-0.12, 0.12):
                B.beam((1.2 + dx, 0.62, sz * 0.3), (1.2 + dx, 0.3, sz * 0.3), 0.03, 0.03, 'timber_old')
            B.beam((1.08, 0.3, sz * 0.3), (1.32, 0.3, sz * 0.3), 0.03, 0.03, 'timber_old')
        B.box((0.95, 0.5, 0), (0.12, 0.2, 0.1), 'rope')


def milestone(B, r):
    segs = 12 if L0(B) else 7
    B.box((0, 0, 0), (0.6, 0.25, 0.6), 'stone')
    B.lathe([(0.25, 0.25), (0.255, 0.8), (0.24, 1.4), (0.26, 1.45), (0.26, 1.5), (0.18, 1.56), (0.0, 1.6)], segs, 'stone',
            cols=['stone', 'stone', 'stone_dk', 'stone', 'stone', 'stone'])
    if L0(B):
        B.box((0, 0.8, 0.24), (0.22, 0.42, 0.03), 'stone_dk')  # the panel, left without numerals


def road_arch(B, r):
    """A plain timber arch over a 4 m road (x -2..2 is clear)."""
    for sx in (-1, 1):
        B.box((sx * 2.6, 0, 0), (1.3, 0.4, 1.4), 'stone')
        for x in (2.17, 3.03):
            for z in (-0.35, 0.35):
                B.box((sx * x, 0.4, z), (0.3, 4.65, 0.3), 'timber')
        if L0(B):
            for z in (-0.35, 0.35):
                B.beam((sx * 2.2, 0.8, z), (sx * 3.0, 4.6, z), 0.12, 0.12, 'timber_old', up=(0, 0, 1))
                B.beam((sx * 3.0, 0.8, z), (sx * 2.2, 4.6, z), 0.12, 0.12, 'timber_old', up=(0, 0, 1))
            B.box((sx * 2.6, 2.6, 0), (1.15, 0.18, 0.95), 'timber')
    for z in (-0.35, 0.35):
        B.box((0, 5.05, z), (6.4, 0.38, 0.3), 'timber')
    B.box((0, 5.43, 0), (6.4, 0.22, 1.0), 'timber_old')
    B.gable_roof(0, 0, 6.4, 1.4, 5.7, 6.0, 0.08, 'shingle', along='x')
    if L0(B):
        for x in (-1.2, 0.0, 1.2):
            B.box((x, 4.55, 0), (0.2, 0.5, 0.5), 'timber_old')
        B.box((0, 4.55, 0), (4.1, 0.12, 0.3), 'timber')


# Companions shown with a piece on the contact sheets, at their mounted place.
COMBO = {
    'gate_span': [('gate_tower_LOD{l}', (-4.5, 0, 0)), ('gate_tower_LOD{l}', (4.5, 0, 0)), ('gate_span_LOD{l}', (0, 4.2, 0))],
    'palisade_corner': [('palisade_corner_LOD{l}', (0, 0, 0))],
    'brazier_fire': [('brazier_iron_LOD{l}', (0, 0, 0)), ('brazier_fire_LOD{l}', (0, 0, 0))],
}

BUILDERS = {name: fn for name, fn in dict(globals()).items() if callable(fn) and not name.startswith('_') and name not in
            ('M', 'L0')}
