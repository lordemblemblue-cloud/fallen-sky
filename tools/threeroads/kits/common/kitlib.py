"""Geometry helpers for the valley kit (Blender's own Python, headless).

Everything is modelled in GAME coordinates: metres, x right, y up, z toward
the piece's front. `Builder.finish` fits the piece to its table size, puts the
pivot where the table says, converts to Blender's Z-up frame (game +z ->
Blender -y, so the glTF exporter turns it back into +Z) and makes the object.

Each face carries a colour key (a name in PALETTE). In the flat pass the key
picks a swatch in the atlas; in the baked pass it picks a procedural
hand-painted material that is baked into the one shared atlas.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

# sRGB, 0..1. Muted earth colours in the spirit of ink painting.
PALETTE = {
    'timber': (0.33, 0.23, 0.15),
    'timber_lt': (0.52, 0.39, 0.25),
    'timber_old': (0.43, 0.37, 0.30),
    'thatch': (0.66, 0.55, 0.33),
    'thatch_dk': (0.47, 0.39, 0.24),
    'shingle': (0.34, 0.31, 0.29),
    'plaster': (0.86, 0.82, 0.72),
    'stone': (0.57, 0.55, 0.50),
    'stone_dk': (0.41, 0.40, 0.37),
    'old_stone': (0.46, 0.47, 0.43),
    'moss': (0.35, 0.41, 0.25),
    'cloth': (0.80, 0.74, 0.60),
    'cloth_dk': (0.52, 0.46, 0.37),
    'iron': (0.42, 0.26, 0.16),
    'iron_dk': (0.20, 0.18, 0.17),
    'bronze': (0.38, 0.41, 0.31),
    'straw': (0.79, 0.67, 0.39),
    'grass': (0.38, 0.46, 0.25),
    'hedge': (0.26, 0.35, 0.18),
    'earth': (0.43, 0.34, 0.25),
    'char': (0.14, 0.12, 0.11),
    'ember': (0.80, 0.32, 0.10),
    'paper': (0.93, 0.87, 0.70),
    'paper_glow': (1.00, 0.80, 0.50),
    'flame': (1.00, 0.52, 0.14),
    'flame_core': (1.00, 0.88, 0.52),
    'white': (0.93, 0.92, 0.89),
    'white_dk': (0.80, 0.79, 0.76),
    'vermilion': (0.60, 0.27, 0.18),
    'water': (0.11, 0.14, 0.15),
    'dark': (0.10, 0.09, 0.08),
    'honey': (0.68, 0.52, 0.26),
    'rope': (0.62, 0.53, 0.38),
    'bark': (0.31, 0.27, 0.23),
    'leaf': (0.29, 0.40, 0.21),
    'leaf_dk': (0.20, 0.30, 0.17),
    # the empire kits
    'red': (0.56, 0.17, 0.13),
    'red_dk': (0.38, 0.12, 0.10),
    'leather': (0.47, 0.32, 0.20),
    'leather_dk': (0.33, 0.22, 0.14),
    'brass': (0.70, 0.55, 0.27),
    'linen': (0.87, 0.83, 0.71),
    'mudbrick': (0.63, 0.49, 0.35),
    'reed': (0.60, 0.57, 0.33),
    'papyrus': (0.52, 0.55, 0.30),
    'eg_blue': (0.22, 0.42, 0.54),
    'canvas': (0.91, 0.90, 0.86),
    'navy': (0.16, 0.21, 0.34),
    'khaki': (0.56, 0.51, 0.37),
    'lacquer': (0.12, 0.10, 0.10),
    'turf': (0.36, 0.41, 0.23),
    'sand': (0.72, 0.64, 0.47),
}
PALETTE_KEYS = list(PALETTE.keys())


def lin(c):
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def M(t=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, s=1.0):
    """Game-space transform: scale, then rotate z, x, y, then translate."""
    if not isinstance(s, (tuple, list)):
        s = (s, s, s)
    return (Matrix.Translation(Vector(t)) @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X')
            @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Diagonal((s[0], s[1], s[2], 1.0)))


# game (x, y up, z front) -> Blender (x, -z, y): a proper rotation (det +1)
GAME_TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


# Pieces that sit on another piece: the height their own geometry starts at.
PIVOT_LIFT = {'wagon': 1.2, 'basket': 1.2, 'bowl': 1.1, 'brazier': 1.1, 'kettle': 0.0}


class Builder:
    def __init__(self, lod, seed=7):
        self.below = 0.0
        self.reach = 0.0
        self.bm = bmesh.new()
        self.lod = lod
        self.keys = []
        self.rng = random.Random(seed)

    # ---- low level -------------------------------------------------------
    def _idx(self, col):
        if col not in PALETTE:
            raise KeyError(f'unknown colour key {col}')
        if col not in self.keys:
            self.keys.append(col)
        return self.keys.index(col)

    def mesh(self, verts, faces, col, m=None, smooth=False, cols=None):
        """verts: game-space points; faces: index tuples; cols: per-face keys."""
        bm = self.bm
        vs = [bm.verts.new((m @ Vector(v)) if m is not None else Vector(v)) for v in verts]
        out = []
        for i, f in enumerate(faces):
            try:
                face = bm.faces.new([vs[j] for j in f])
            except ValueError:
                continue
            face.material_index = self._idx(cols[i] if cols else col)
            face.smooth = smooth
            out.append(face)
        return out

    # ---- primitives ------------------------------------------------------
    def hexa(self, c8, col, m=None, smooth=False):
        """8 corners: bottom 4 then top 4, both in the same winding."""
        faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        return self.mesh(c8, faces, col, m, smooth)

    def box(self, base, size, col, m=None, top=(1.0, 1.0), shift=(0.0, 0.0)):
        """Footprint centre (x, z) at height y = base[1]; size (w, h, d).
        top scales the top face (taper); shift moves it (lean)."""
        x, y, z = base
        w, h, d = size
        hw, hd = w / 2, d / 2
        tw, td = hw * top[0], hd * top[1]
        sx, sz = shift
        c = [(x - hw, y, z - hd), (x + hw, y, z - hd), (x + hw, y, z + hd), (x - hw, y, z + hd),
             (x - tw + sx, y + h, z - td + sz), (x + tw + sx, y + h, z - td + sz),
             (x + tw + sx, y + h, z + td + sz), (x - tw + sx, y + h, z + td + sz)]
        return self.hexa(c, col, m)

    def beam(self, p0, p1, w, h, col, m=None, up=(0, 1, 0)):
        """A square-section member from p0 to p1 (w across, h along `up`)."""
        a, b = Vector(p0), Vector(p1)
        d = (b - a)
        if d.length < 1e-6:
            return []
        d.normalize()
        u = Vector(up)
        if abs(d.dot(u)) > 0.95:
            u = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 0, 1))
        s = d.cross(u).normalized() * (w / 2)
        u2 = s.cross(d).normalized() * (h / 2)
        c = [a - s - u2, a + s - u2, a + s + u2, a - s + u2, b - s - u2, b + s - u2, b + s + u2, b - s + u2]
        return self.hexa([tuple(v) for v in c], col, m)

    def lathe(self, profile, segs, col, m=None, smooth=True, cols=None, sx=1.0, sz=1.0, phase=0.0,
              jitter=0.0, cap=True):
        """Revolve (r, y) pairs about the y axis. cols: one key per profile span."""
        rings = []
        verts = []
        for (r, y) in profile:
            if r <= 1e-6:
                rings.append([len(verts)])
                verts.append((0.0, y, 0.0))
                continue
            ring = []
            for k in range(segs):
                a = phase + 2 * math.pi * k / segs
                rr = r * (1 + (self.rng.uniform(-jitter, jitter) if jitter else 0))
                ring.append(len(verts))
                verts.append((math.cos(a) * rr * sx, y, -math.sin(a) * rr * sz))
            rings.append(ring)
        faces, fcols = [], []
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            key = cols[i] if cols else col
            if len(a) == 1 and len(b) == 1:
                continue
            for k in range(segs):
                k1 = (k + 1) % segs
                if len(a) == 1:
                    faces.append((a[0], b[k], b[k1]))
                elif len(b) == 1:
                    faces.append((a[k], b[0], a[k1]))
                else:
                    faces.append((a[k], b[k], b[k1], a[k1]))
                fcols.append(key)
        if cap:
            if len(rings[0]) > 1:
                faces.append(tuple(reversed(rings[0])))
                fcols.append(cols[0] if cols else col)
            if len(rings[-1]) > 1:
                faces.append(tuple(rings[-1]))
                fcols.append(cols[-1] if cols else col)
        return self.mesh(verts, faces, col, m, smooth, fcols)

    def cyl(self, base, r, h, segs, col, m=None, r_top=None, smooth=True, axis='y'):
        rt = r if r_top is None else r_top
        mm = Matrix.Translation(Vector(base))
        if axis == 'x':
            mm = mm @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
        elif axis == 'z':
            mm = mm @ Matrix.Rotation(math.pi / 2, 4, 'X')
        if m is not None:
            mm = m @ mm
        return self.lathe([(r, 0), (rt, h)], segs, col, mm, smooth)

    def ring(self, base, r_in, r_out, h, segs, col, m=None, axis='y', smooth=True, cols=None, phase=0.0):
        """A flat ring (tyre, hoop). cols: bottom, outer wall, top, inner wall."""
        mm = Matrix.Translation(Vector(base))
        if axis == 'x':
            mm = mm @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
        elif axis == 'z':
            mm = mm @ Matrix.Rotation(math.pi / 2, 4, 'X')
        if m is not None:
            mm = m @ mm
        prof = [(r_in, 0), (r_out, 0), (r_out, h), (r_in, h), (r_in, 0)]
        return self.lathe(prof, segs, col, mm, smooth, cols=cols, cap=False, phase=phase)

    def limb(self, p0, p1, r0, r1, segs, col, smooth=True, mid=None):
        """A tapered round branch from p0 to p1 (optionally bent through a mid radius)."""
        a, b = Vector(p0), Vector(p1)
        d = b - a
        rot = Vector((0, 1, 0)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        m = Matrix.Translation(a) @ rot
        L = d.length
        prof = [(r0, 0.0), (r1, L)] if mid is None else [(r0, 0.0), (mid, L * 0.5), (r1, L)]
        return self.lathe(prof, segs, col, m, smooth)

    def hull(self, points, col, m=None, smooth=False):
        bm = self.bm
        vs = [bm.verts.new((m @ Vector(p)) if m is not None else Vector(p)) for p in points]
        res = bmesh.ops.convex_hull(bm, input=vs, use_existing_faces=False)
        drop = list({g for g in res['geom_interior'] + res['geom_unused'] if isinstance(g, bmesh.types.BMVert)})
        faces = [g for g in res['geom'] if isinstance(g, bmesh.types.BMFace)]
        if drop:
            bmesh.ops.delete(bm, geom=drop, context='VERTS')
        idx = self._idx(col)
        faces = [f for f in faces if f.is_valid]
        for f in faces:
            f.material_index = idx
            f.smooth = smooth
        return faces

    def rock(self, center, radii, col, n=14, m=None, flat_bottom=True, smooth=False, squash=1.0):
        """A rounded field stone: hull of jittered points on an ellipsoid."""
        cx, cy, cz = center
        rx, ry, rz = radii
        pts = []
        golden = math.pi * (3 - math.sqrt(5))
        for i in range(n):
            yy = 1 - 2 * (i + 0.5) / n
            rad = math.sqrt(max(0.0, 1 - yy * yy))
            th = golden * i + self.rng.uniform(0, 0.6)
            j = self.rng.uniform(0.82, 1.08)
            px, py, pz = math.cos(th) * rad * j, yy * j * squash, math.sin(th) * rad * j
            if flat_bottom:
                # bottom flattened, base at cy, total height ry
                py = max(py, -0.55)
                yy_out = cy + (py + 0.55) / 1.55 * ry
            else:
                yy_out = cy + py * ry
            pts.append((cx + px * rx, yy_out, cz + pz * rz))
        return self.hull(pts, col, m, smooth)

    def gable_roof(self, cx, cz, w, d, eave_y, ridge_y, thick, col, along='x', overhang=0.0, ridge_col=None,
                   m=None, ridge_w=0.0):
        """Two sloping slabs meeting at a ridge running along `along`.
        w, d: outer size of the roof including overhang."""
        if along == 'x':
            L, S = w / 2, d / 2
        else:
            L, S = d / 2, w / 2

        def P(l, s, y):
            return (cx + l, y, cz + s) if along == 'x' else (cx + s, y, cz + l)
        for side in (1, -1):
            top = [P(-L, side * S, eave_y), P(L, side * S, eave_y), P(L, 0, ridge_y), P(-L, 0, ridge_y)]
            # slab thickness straight down
            bot = [(p[0], p[1] - thick, p[2]) for p in top]
            if side == 1:
                c8 = [bot[0], bot[1], bot[2], bot[3], top[0], top[1], top[2], top[3]]
            else:
                c8 = [bot[1], bot[0], bot[3], bot[2], top[1], top[0], top[3], top[2]]
            self.hexa(c8, col, m)
        if ridge_col and ridge_w > 0:
            if along == 'x':
                self.box((cx, ridge_y - ridge_w * 0.6, cz), (w * 1.0, ridge_w, ridge_w), ridge_col, m)
            else:
                self.box((cx, ridge_y - ridge_w * 0.6, cz), (ridge_w, ridge_w, d * 1.0), ridge_col, m)

    def hip_roof(self, cx, cz, w, d, eave_y, ridge_y, ridge_len, col, thick=0.3, m=None, along='x'):
        """A solid hipped roof block: eave rectangle w x d, ridge of ridge_len."""
        hw, hd, rl = w / 2, d / 2, ridge_len / 2
        pts = []
        for sx in (-1, 1):
            for sz in (-1, 1):
                pts.append((cx + sx * hw, eave_y - thick, cz + sz * hd))
                pts.append((cx + sx * hw, eave_y, cz + sz * hd))
        if along == 'x':
            pts += [(cx - rl, ridge_y, cz), (cx + rl, ridge_y, cz)]
        else:
            pts += [(cx, ridge_y, cz - rl), (cx, ridge_y, cz + rl)]
        return self.hull(pts, col, m)

    # ---- finishing -------------------------------------------------------
    def finish(self, name, size, pivot, smooth_angle=38.0, warn=None, skirt=0.0):
        """Fit to the table and set the pivot.

        size [w, d, h] is the part above y = 0. Extras a builder may set:
          self.below  metres of hull under the waterline (pivot 'waterline')
          self.reach  metres the piece reaches beyond its footprint toward +z (pivot 'frame')
        skirt: every vertex left on the ground (y ~ 0) is pulled down to -skirt, so
        posts, plinths and banks carry on below the ground on a slope.
        """
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        lo = Vector((min(v.co.x for v in bm.verts), min(v.co.y for v in bm.verts), min(v.co.z for v in bm.verts)))
        hi = Vector((max(v.co.x for v in bm.verts), max(v.co.y for v in bm.verts), max(v.co.z for v in bm.verts)))
        ext = hi - lo
        w, d, h = size
        below, reach = self.below, self.reach
        sc = Vector((w / ext.x, (h + below) / ext.y, (d + reach) / ext.z))
        if warn is not None:
            for axis, s in zip('xyz', sc):
                if abs(s - 1) > 0.10:
                    warn.append(f'{name}: fitted {axis} by {s:.2f}')
        ctr = (lo + hi) / 2
        for v in bm.verts:
            p = v.co - Vector((ctr.x, lo.y, lo.z if reach else ctr.z))
            v.co = Vector((p.x * sc.x, p.y * sc.y, p.z * sc.z))
        # now footprint centred (or starting at z 0 for a reaching piece), bottom at y 0
        dy = -below
        if pivot == 'top':
            dy = -h
        elif pivot in ('hub', 'centre'):
            dy = -h / 2
        elif pivot in PIVOT_LIFT:
            dy = PIVOT_LIFT[pivot]
        dz = -d / 2 if reach else 0.0
        for v in bm.verts:
            v.co.y += dy
            v.co.z += dz
            if skirt > 0 and v.co.y < 0.02:
                v.co.y = -skirt
        bmesh.ops.transform(bm, matrix=GAME_TO_BLENDER, verts=bm.verts)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        try:
            me.set_sharpness_by_angle(angle=math.radians(smooth_angle))
        except Exception:
            pass
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob['keys'] = ','.join(self.keys)
        return ob


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)
