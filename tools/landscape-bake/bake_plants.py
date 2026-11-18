"""High-poly plants -> baked card atlas for Wolfveil (Blender 5.x, headless).

Twelve plants are modelled as real geometry (thousands of individual leaves,
pinnae, petals, blades and stems; numpy-built meshes) and rendered side-on
with an orthographic camera into one 4x4 card atlas:
  shrub, shrub_dry, shrub_flowering, fern, reeds, flower_white (daisy),
  flower_yellow (buttercup), flower_purple (lupine), flower_red (poppy),
  flower_pink (clover), tuft_green, tuft_dry
Three unlit passes per plant (emission overrides, 2x supersampled, float EXR):
albedo + alpha, camera-space normal (back faces flipped toward the camera =
tangent space of a card) and ambient occlusion (multiplied into the albedo).
Transparent texels are dilated from their neighbours so alpha-tested cards
never get dark halos.

Output (default public/game3d/landscape):
  wv_plants_albedo.webp  RGBA (sRGB colour, alpha cut-out)
  wv_plants_normal.webp  RGB tangent normal (card: +X right, +Y up)
  wv_plants.json         cell rects (u0, v0, u1, v1; v from the bottom) and
                         card size in metres (square, base on the ground)
Optional --preview DIR: a lit render of every high-poly plant + atlas preview.

  blender -b --factory-startup -P tools/landscape-bake/bake_plants.py -- <out_dir> [--preview <dir>]
"""
import bpy
import json
import math
import os
import sys
import time
import numpy as np

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGV[0]) if ARGV else os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'game3d', 'landscape'))
PREVIEW = None
if '--preview' in ARGV:
    PREVIEW = os.path.abspath(ARGV[ARGV.index('--preview') + 1])
CELL, SS, GRID = 512, 2, 4
TMP = os.path.join(OUT, '_plant_bake_tmp')


def lin(c):
    c = np.asarray(c, np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def norm(v):
    return v / np.maximum(1e-9, np.linalg.norm(v, axis=-1, keepdims=True))


# --------------------------------------------------------------- geometry --
class Builder:
    """Collects triangles + per-vertex colours for one plant."""

    def __init__(self):
        self.v, self.f, self.c, self.n = [], [], [], 0

    def add(self, verts, faces, cols):
        self.v.append(np.asarray(verts, np.float32).reshape(-1, 3))
        self.f.append(np.asarray(faces, np.int64).reshape(-1, 3) + self.n)
        self.c.append(np.asarray(cols, np.float32).reshape(-1, 3))
        self.n += len(self.v[-1])

    def leaves(self, P, D, N, L, W, cols, rows=5, fold=.22, curl=None, shape='leaf'):
        """Instanced leaf strips: P base, D length dir, N face normal hint."""
        K = len(P)
        if K == 0:
            return
        ts = np.linspace(0, 1, rows, dtype=np.float32)
        if shape == 'leaf':
            prof = (ts ** .6) * (1 - ts) ** .9 * 2.4
        elif shape == 'blade':
            prof = (1 - ts ** 1.4) * .9 + .1 * (ts < 1)
            prof[-1] = 0.02
        elif shape == 'petal':
            # Clamp: float32 pi rounds up, so sin(pi) is a tiny negative (NaN under **.7).
            prof = np.clip(np.sin(np.pi * np.clip(ts * .95 + .05, 0, 1)), 0, None) ** .7
        else:
            prof = np.ones_like(ts)
        tx = np.repeat(ts, 3)
        sx = np.tile(np.array([-.5, 0, .5], np.float32), rows)
        lx = sx * np.repeat(prof, 3)
        tri = []
        for r in range(rows - 1):
            for c in range(2):
                a = r * 3 + c
                tri += [[a, a + 1, a + 4], [a, a + 4, a + 3]]
        tri = np.array(tri, np.int64)
        D, N = norm(np.asarray(D, np.float32)), norm(np.asarray(N, np.float32))
        X = norm(np.cross(D, N))
        Z = np.cross(X, D)
        cu = np.zeros(K, np.float32) if curl is None else np.asarray(curl, np.float32)
        lxw = lx[None, :] * W[:, None]
        ly = tx[None, :] * L[:, None]
        lz = (np.abs(lx)[None, :] * fold * W[:, None] + (tx[None, :] ** 2) * cu[:, None] * L[:, None])
        V = (P[:, None, :] + lxw[..., None] * X[:, None, :] + ly[..., None] * D[:, None, :] +
             lz[..., None] * Z[:, None, :])
        shade = (.72 + .38 * tx)[None, :, None] * np.where(sx == 0, .9, 1.)[None, :, None]
        C = np.asarray(cols, np.float32)[:, None, :] * shade
        F = tri[None] + (np.arange(K) * len(tx))[:, None, None]
        self.add(V, F, C)

    def tube(self, pts, radius, col, sides=6):
        pts = np.asarray(pts, np.float32)
        n = len(pts)
        radius = np.broadcast_to(np.asarray(radius, np.float32), (n,))
        T = np.gradient(pts, axis=0)
        T = norm(T)
        ref = np.where(np.abs(T[:, 2:3]) < .9, np.array([0, 0, 1], np.float32), np.array([1, 0, 0], np.float32))
        A = norm(np.cross(T, ref))
        B = np.cross(T, A)
        ang = np.linspace(0, 2 * np.pi, sides, endpoint=False)
        ring = (np.cos(ang)[None, :, None] * A[:, None, :] + np.sin(ang)[None, :, None] * B[:, None, :])
        V = pts[:, None, :] + ring * radius[:, None, None]
        faces = []
        for i in range(n - 1):
            for k in range(sides):
                a, b = i * sides + k, i * sides + (k + 1) % sides
                c, d = a + sides, b + sides
                faces += [[a, b, d], [a, d, c]]
        cols = np.broadcast_to(np.asarray(col, np.float32), (n * sides, 3))
        self.add(V.reshape(-1, 3), faces, cols)

    def blob(self, center, radii, col, sub=2):
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        bm.verts.index_update()
        v = np.array([vv.co[:] for vv in bm.verts], np.float32)
        f = np.array([[vv.index for vv in face.verts] for face in bm.faces], np.int64)
        bm.free()
        self.add(np.asarray(center, np.float32) + v * np.asarray(radii, np.float32), f,
                 np.broadcast_to(np.asarray(col, np.float32), v.shape))

    def mesh(self, name):
        V = np.concatenate(self.v)
        F = np.concatenate(self.f)
        C = np.concatenate(self.c)
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(V))
        me.vertices.foreach_set('co', V.ravel())
        me.loops.add(len(F) * 3)
        me.loops.foreach_set('vertex_index', F.astype(np.int32).ravel())
        me.polygons.add(len(F))
        me.polygons.foreach_set('loop_start', np.arange(0, len(F) * 3, 3, dtype=np.int32))
        me.update(calc_edges=True)
        me.validate(clean_customdata=False)
        me.shade_smooth()
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        attr.data.foreach_set('color', np.concatenate([C, np.ones((len(C), 1), np.float32)], 1).ravel())
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        return obj, V


def pal(rng, K, colours, lo=.85, hi=1.1):
    p = lin(np.array(colours, np.float32))
    return (p[rng.integers(0, len(p), K)] * rng.uniform(lo, hi, (K, 1)) ** 2.2).astype(np.float32)


def sphere_dirs(rng, K, zmin=-.2):
    d = norm(rng.normal(size=(K * 3, 3)).astype(np.float32))
    d = d[d[:, 2] > zmin][:K]
    return d


BARK = lin([.27, .20, .14])
STEM = lin([.25, .34, .14])


def plant_shrub(rng, kind='green'):
    b = Builder()
    K = 1900 if kind != 'dry' else 1300
    # A bush, not a small tree: foliage reaches down to the ground.
    d = sphere_dirs(rng, K, -.85)
    r = .55 + .45 * rng.random(len(d)) ** .5
    radii = np.array([.64, .57, .48], np.float32)
    c = np.array([0, 0, .44], np.float32)
    P = c + d * radii * r[:, None]
    P[:, 2] = np.where(P[:, 2] < .12, .03 + P[:, 2] * .55, P[:, 2])
    keep = P[:, 2] > .02
    P, d, r = P[keep], d[keep], r[keep]
    K = len(P)
    D = norm(d * .8 + rng.normal(size=(K, 3)) * .55 + np.array([0, 0, .35]))
    N = norm(np.array([0, 0, 1]) * .6 + d * .6 + rng.normal(size=(K, 3)) * .4)
    L = rng.uniform(.07, .125, K).astype(np.float32)
    W = L * rng.uniform(.55, .75, K)
    if kind == 'dry':
        cols = pal(rng, K, [(.47, .39, .17), (.54, .42, .19), (.39, .31, .15), (.31, .34, .13), (.58, .46, .22)])
    else:
        cols = pal(rng, K, [(.15, .31, .08), (.21, .39, .10), (.27, .45, .12), (.12, .25, .07), (.33, .48, .15)])
    cols = cols * (.7 + .4 * r[:, None])
    b.leaves(P, D, N, L, W, cols, curl=rng.uniform(-.25, .2, K))
    for i in range(9):
        a = rng.uniform(0, 2 * np.pi)
        end = c + np.array([np.cos(a) * .35, np.sin(a) * .3, rng.uniform(-.1, .15)])
        mid = (end * .5) + np.array([0, 0, .05])
        pts = np.stack([np.array([np.cos(a) * .03, np.sin(a) * .03, 0]), mid, end])
        b.tube(pts, np.array([.022, .014, .007]), BARK, 6)
    if kind == 'flowering':
        F = 160
        d2 = sphere_dirs(rng, F, 0)
        P2 = c + d2 * radii * rng.uniform(.92, 1.02, (len(d2), 1))
        for k in range(5):
            ang = k * 2 * np.pi / 5
            Dp = norm(np.cross(d2, np.array([0, 0, 1])) * np.cos(ang) + np.cross(d2, np.cross(d2, np.array([0, 0, 1]))) * np.sin(ang) + d2 * .3)
            b.leaves(P2, Dp, d2, np.full(len(d2), .022, np.float32), np.full(len(d2), .02, np.float32),
                     pal(rng, len(d2), [(.97, .95, .9), (.96, .9, .93)], .95, 1.02), rows=3, fold=.1, shape='petal')
    return b


def plant_fern(rng):
    b = Builder()
    fronds = 10
    for i in range(fronds):
        a = i * 2 * np.pi / fronds + rng.uniform(-.25, .25)
        dirh = np.array([np.cos(a), np.sin(a), 0], np.float32)
        length = rng.uniform(.62, .85)
        n = 26
        el0, el1 = np.radians(rng.uniform(62, 75)), np.radians(rng.uniform(-35, -15))
        pts = [np.zeros(3, np.float32)]
        for k in range(1, n):
            s = (k - .5) / (n - 1)
            el = el0 + (el1 - el0) * s ** 1.3
            step = length / (n - 1)
            pts.append(pts[-1] + step * (dirh * np.cos(el) + np.array([0, 0, 1]) * np.sin(el)))
        pts = np.array(pts, np.float32)
        b.tube(pts, np.linspace(.006, .0015, n), lin([.30, .38, .15]), 5)
        T = norm(np.gradient(pts, axis=0))
        side = norm(np.cross(T, np.array([0, 0, 1], np.float32)))
        up = norm(np.cross(side, T))
        s = np.linspace(0, 1, n)
        sel = s > .14
        for sgn in (-1, 1):
            Dp = norm(side[sel] * sgn * .85 + T[sel] * .5)
            Lp = (.15 * (1 - s[sel]) ** .55 + .02).astype(np.float32)
            b.leaves(pts[sel], Dp, up[sel], Lp, Lp * .3, pal(rng, int(sel.sum()), [(.17, .37, .10), (.22, .42, .12), (.15, .32, .09)], .9, 1.06),
                     rows=4, fold=.15, curl=np.full(int(sel.sum()), .12, np.float32))
    return b


def plant_reeds(rng):
    b = Builder()
    K = 46
    a = rng.uniform(0, 2 * np.pi, K)
    r = rng.uniform(0, .12, K)
    P = np.stack([np.cos(a) * r, np.sin(a) * r, np.zeros(K)], 1).astype(np.float32)
    lean = rng.uniform(.03, .22, K)
    D = norm(np.stack([np.cos(a) * lean, np.sin(a) * lean, np.ones(K)], 1))
    N = norm(np.stack([-np.sin(a), np.cos(a), np.zeros(K)], 1))
    L = rng.uniform(.85, 1.45, K).astype(np.float32)
    b.leaves(P, D, N, L, rng.uniform(.012, .022, K).astype(np.float32),
             pal(rng, K, [(.40, .45, .20), (.48, .50, .24), (.33, .41, .18), (.55, .52, .30)]), rows=7, fold=.3,
             curl=rng.uniform(.05, .3, K), shape='blade')
    for i in range(6):
        aa = rng.uniform(0, 2 * np.pi)
        h = rng.uniform(1.25, 1.55)
        base = np.array([np.cos(aa) * .05, np.sin(aa) * .05, 0])
        top = base + np.array([np.cos(aa) * .08, np.sin(aa) * .08, h])
        pts = np.linspace(base, top, 8)
        b.tube(pts, np.linspace(.006, .004, 8), lin([.42, .45, .22]), 5)
        head = np.linspace(top - np.array([0, 0, .16]), top - np.array([0, 0, .03]), 6)
        b.tube(head, np.full(6, .02), lin([.32, .19, .10]), 8)
    return b


BLOOM = {'white': .32, 'yellow': .27, 'purple': .55, 'red': .38, 'pink': .22}


def plant_flower(rng, species):
    b = Builder()
    H = BLOOM[species]
    # Basal rosette.
    K = 14
    a = rng.uniform(0, 2 * np.pi, K)
    P = np.zeros((K, 3), np.float32)
    D = norm(np.stack([np.cos(a), np.sin(a), rng.uniform(.4, 1.1, K)], 1))
    b.leaves(P, D, np.tile([0, 0, 1], (K, 1)), rng.uniform(.08, .14, K).astype(np.float32),
             rng.uniform(.025, .04, K).astype(np.float32), pal(rng, K, [(.20, .38, .11), (.25, .43, .13)]),
             curl=rng.uniform(-.2, .1, K))
    stems = rng.integers(5, 9)
    toward = np.array([0, -1, .9], np.float32)
    for i in range(stems):
        aa = rng.uniform(0, 2 * np.pi)
        h = H * rng.uniform(.8, 1.2)
        lean = rng.uniform(.03, .1)
        base = np.array([np.cos(aa) * .03, np.sin(aa) * .03, 0], np.float32)
        top = base + np.array([np.cos(aa) * lean, np.sin(aa) * lean, h], np.float32)
        pts = np.stack([base + (top - base) * t + np.array([0, 0, 0]) for t in np.linspace(0, 1, 7)])
        pts[:, :2] += np.sin(np.linspace(0, np.pi, 7))[:, None] * rng.normal(0, .015, 2)
        b.tube(pts, np.linspace(.004, .0025, 7), STEM, 5)
        face = norm(toward + rng.normal(0, .25, 3))
        if species == 'white':
            k = 16
            ang = np.linspace(0, 2 * np.pi, k, endpoint=False)
            u = norm(np.cross(face, [0, 0, 1]))
            v = np.cross(face, u)
            Dp = norm(np.cos(ang)[:, None] * u + np.sin(ang)[:, None] * v + face * .1)
            b.leaves(np.tile(top, (k, 1)), Dp, np.tile(face, (k, 1)), np.full(k, .026, np.float32),
                     np.full(k, .009, np.float32), pal(rng, k, [(.97, .96, .92)], .96, 1.0), rows=3, fold=.1, shape='petal')
            b.blob(top + face * .004, (.009, .009, .005), lin([.95, .72, .12]), 1)
        elif species == 'yellow':
            k = 5
            ang = np.linspace(0, 2 * np.pi, k, endpoint=False)
            u = norm(np.cross(face, [0, 0, 1]))
            v = np.cross(face, u)
            Dp = norm(np.cos(ang)[:, None] * u + np.sin(ang)[:, None] * v + face * .7)
            b.leaves(np.tile(top, (k, 1)), Dp, np.tile(face, (k, 1)), np.full(k, .016, np.float32),
                     np.full(k, .016, np.float32), pal(rng, k, [(.98, .80, .10), (.96, .84, .16)], .97, 1.0), rows=3, fold=.3, shape='petal')
        elif species == 'red':
            k = 4
            ang = np.linspace(0, 2 * np.pi, k, endpoint=False) + rng.uniform(0, 1)
            u = norm(np.cross(face, [0, 0, 1]))
            v = np.cross(face, u)
            Dp = norm(np.cos(ang)[:, None] * u + np.sin(ang)[:, None] * v + face * .5)
            b.leaves(np.tile(top, (k, 1)), Dp, np.tile(face, (k, 1)), np.full(k, .034, np.float32),
                     np.full(k, .038, np.float32), pal(rng, k, [(.84, .14, .08), (.78, .10, .07)], .95, 1.02), rows=4, fold=.35, shape='petal')
            b.blob(top + face * .006, (.008, .008, .008), lin([.10, .08, .07]), 1)
        elif species == 'pink':
            k = 46
            d = norm(rng.normal(size=(k, 3)) + np.array([0, 0, .3]))
            b.leaves(top + d * .004, d, np.tile([0, 0, 1], (k, 1)), np.full(k, .016, np.float32),
                     np.full(k, .005, np.float32), pal(rng, k, [(.84, .45, .66), (.74, .38, .62), (.92, .62, .78)]), rows=3, shape='petal')
        elif species == 'purple':
            n = 26
            for j in range(n):
                t = .55 + .45 * j / (n - 1)
                p = base + (top - base) * t
                k = 3
                ang = rng.uniform(0, 2 * np.pi) + np.linspace(0, 2 * np.pi, k, endpoint=False)
                Dp = norm(np.stack([np.cos(ang), np.sin(ang), np.full(k, .35)], 1))
                col = lin([.42, .30, .78]) * (.75 + .5 * t)
                b.leaves(np.tile(p, (k, 1)), Dp, np.tile(face, (k, 1)), np.full(k, .016 * (1.3 - t * .5), np.float32),
                         np.full(k, .011, np.float32), np.tile(col, (k, 1)), rows=3, fold=.3, shape='petal')
    return b


def plant_tuft(rng, dry=False):
    b = Builder()
    K = 46
    a = rng.uniform(0, 2 * np.pi, K)
    r = rng.uniform(0, .05, K)
    P = np.stack([np.cos(a) * r, np.sin(a) * r, np.zeros(K)], 1).astype(np.float32)
    lean = rng.uniform(.15, .65, K)
    D = norm(np.stack([np.cos(a) * lean, np.sin(a) * lean, np.ones(K)], 1))
    N = norm(np.stack([-np.sin(a), np.cos(a), np.zeros(K)], 1))
    colours = [(.55, .50, .28), (.62, .55, .32), (.47, .42, .24), (.36, .40, .20)] if dry else \
        [(.20, .40, .10), (.27, .47, .13), (.34, .50, .16), (.16, .33, .08)]
    b.leaves(P, D, N, rng.uniform(.22, .5, K).astype(np.float32), rng.uniform(.008, .015, K).astype(np.float32),
             pal(rng, K, colours), rows=6, fold=.3, curl=rng.uniform(.15, .65, K), shape='blade')
    return b


PLANTS = [
    ('shrub', lambda r: plant_shrub(r, 'green')),
    ('shrub_dry', lambda r: plant_shrub(r, 'dry')),
    ('shrub_flowering', lambda r: plant_shrub(r, 'flowering')),
    ('fern', plant_fern),
    ('reeds', plant_reeds),
    ('flower_white', lambda r: plant_flower(r, 'white')),
    ('flower_yellow', lambda r: plant_flower(r, 'yellow')),
    ('flower_purple', lambda r: plant_flower(r, 'purple')),
    ('flower_red', lambda r: plant_flower(r, 'red')),
    ('flower_pink', lambda r: plant_flower(r, 'pink')),
    ('tuft_green', lambda r: plant_tuft(r, False)),
    ('tuft_dry', lambda r: plant_tuft(r, True)),
]


# --------------------------------------------------------------- materials --
def emission_mat(name, build):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(build(nt), em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return m


def albedo_socket(nt):
    a = nt.nodes.new('ShaderNodeAttribute')
    a.attribute_name = 'Col'
    return a.outputs['Color']


def normal_socket(nt):
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    vt = nt.nodes.new('ShaderNodeVectorTransform')
    vt.vector_type = 'NORMAL'
    vt.convert_from = 'WORLD'
    vt.convert_to = 'CAMERA'
    nt.links.new(geo.outputs['Normal'], vt.inputs['Vector'])
    neg = nt.nodes.new('ShaderNodeVectorMath')
    neg.operation = 'SCALE'
    neg.inputs['Scale'].default_value = -1.0
    nt.links.new(vt.outputs['Vector'], neg.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'VECTOR'
    nt.links.new(geo.outputs['Backfacing'], mix.inputs[0])
    nt.links.new(vt.outputs['Vector'], mix.inputs[4])
    nt.links.new(neg.outputs['Vector'], mix.inputs[5])
    enc = nt.nodes.new('ShaderNodeVectorMath')
    enc.operation = 'MULTIPLY_ADD'
    nt.links.new(mix.outputs[1], enc.inputs[0])
    enc.inputs[1].default_value = (.5, .5, .5)
    enc.inputs[2].default_value = (.5, .5, .5)
    return enc.outputs['Vector']


def ao_socket(nt):
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
    ao.samples = 24
    ao.inputs['Distance'].default_value = .14
    return ao.outputs['AO']


# ------------------------------------------------------------------ render --
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.use_denoising = False
    s.render.film_transparent = True
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'None'
    s.render.resolution_x = s.render.resolution_y = CELL * SS
    s.render.image_settings.file_format = 'OPEN_EXR'
    s.render.image_settings.color_mode = 'RGBA'
    s.render.image_settings.color_depth = '32'
    w = bpy.data.worlds.new('w')
    s.world = w
    return s


def render_pass(scene, obj, mat, path, samples):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    scene.cycles.samples = samples
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path, check_existing=False)
    buf = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    return buf.reshape(CELL * SS, CELL * SS, 4)


def down2(a):
    return (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2]) * .25


def dilate(rgb, alpha, iters=10):
    """Fill transparent texels from opaque neighbours (no dark halos)."""
    rgb = rgb.copy()
    have = alpha > .02
    for _ in range(iters):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(alpha.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(have, dy, 0), dx, 1)
            acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * sh[..., None]
            cnt += sh
        grow = (~have) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        have = have | grow
    return rgb


def bake_plant(name, build, index):
    scene = reset_scene()
    rng = np.random.default_rng(900 + index)
    b = build(rng)
    obj, V = b.mesh(name)
    xmin, xmax = float(V[:, 0].min()), float(V[:, 0].max())
    zmax = float(V[:, 2].max())
    size = max(xmax - xmin, zmax) * 1.06
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = size
    cam.location = ((xmin + xmax) / 2, -20, size / 2 - .004)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    os.makedirs(TMP, exist_ok=True)
    alb = render_pass(scene, obj, emission_mat('alb', albedo_socket), os.path.join(TMP, name + '_a.exr'), 16)
    nrm = render_pass(scene, obj, emission_mat('nrm', normal_socket), os.path.join(TMP, name + '_n.exr'), 16)
    ao = render_pass(scene, obj, emission_mat('ao', ao_socket), os.path.join(TMP, name + '_o.exr'), 32)
    a = alb[..., 3:4]
    # Premultiplied 2x2 average, then un-premultiply.
    A = down2(a)
    col = down2(alb[..., :3] * a) / np.maximum(A, 1e-4)
    occ = down2(ao[..., :1] * a) / np.maximum(A, 1e-4)
    nn = down2((nrm[..., :3] * 2 - 1) * a) / np.maximum(A, 1e-4)
    nn = nn / np.maximum(1e-6, np.linalg.norm(nn, axis=-1, keepdims=True))
    col = col * (.45 + .55 * np.clip(occ, 0, 1))
    A = A[..., 0]
    col = dilate(col, A)
    nn = dilate(nn * .5 + .5, A)
    tris = sum(len(f) for f in b.f)
    print('PLANT', name, 'triangles', tris, 'card', round(size, 3), 'm')
    return dict(name=name, rgb=col, alpha=A, normal=nn, size=size, triangles=tris,
                width=xmax - xmin, height=zmax)


def save_rgba(path, rgba, srgb):
    img = bpy.data.images.new(os.path.basename(path), rgba.shape[1], rgba.shape[0], alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    img.pixels.foreach_set(np.clip(rgba, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'WEBP'
    img.save(quality=92)
    bpy.data.images.remove(img)
    return os.path.getsize(path)


def preview(plants, path):
    """Lit render of every high-poly plant in a row (documentation)."""
    scene = reset_scene()
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    x = 0
    for i, (name, build) in enumerate(PLANTS):
        b = build(np.random.default_rng(900 + i))
        obj, V = b.mesh(name)
        w = float(V[:, 0].max() - V[:, 0].min())
        obj.location = (x - float(V[:, 0].min()), 0, 0)
        x += w + .15
        m = bpy.data.materials.new('lit')
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        nt.links.new(albedo_socket(nt), bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = .7
        obj.data.materials.append(m)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = x + .2
    cam.location = (x / 2, -20, .78)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-30))
    scene.collection.objects.link(sun)
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (.55, .62, .70, 1)
    bg.inputs['Strength'].default_value = .5
    scene.render.resolution_x, scene.render.resolution_y = 2000, int(2000 * 1.7 / (x + .2))
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 86
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    N = CELL * GRID
    albedo = np.zeros((N, N, 4), np.float32)
    normal = np.zeros((N, N, 4), np.float32)
    normal[..., :3] = (.5, .5, 1.)
    normal[..., 3] = 1
    cells = {}
    for i, (name, build) in enumerate(PLANTS):
        p = bake_plant(name, build, i)
        col, row = i % GRID, i // GRID
        y0, x0 = row * CELL, col * CELL
        albedo[y0:y0 + CELL, x0:x0 + CELL, :3] = to_srgb(p['rgb'])
        albedo[y0:y0 + CELL, x0:x0 + CELL, 3] = p['alpha']
        normal[y0:y0 + CELL, x0:x0 + CELL, :3] = p['normal']
        cells[name] = dict(rect=[col / GRID, row / GRID, (col + 1) / GRID, (row + 1) / GRID],
                           size=round(p['size'], 4), width=round(p['width'], 4), height=round(p['height'], 4),
                           highPolyTriangles=int(p['triangles']))
    sa = save_rgba(os.path.join(OUT, 'wv_plants_albedo.webp'), albedo, True)
    sn = save_rgba(os.path.join(OUT, 'wv_plants_normal.webp'), normal, False)
    meta = dict(revision='wolfveil-plants-v1-20261118', generatedBy='tools/landscape-bake/bake_plants.py',
                grid=GRID, cellPixels=CELL, vOrigin='bottom', cells=cells, bytes=dict(albedo=sa, normal=sn))
    with open(os.path.join(OUT, 'wv_plants.json'), 'w') as f:
        json.dump(meta, f, indent=2)
        f.write('\n')
    for fn in os.listdir(TMP):
        os.remove(os.path.join(TMP, fn))
    os.rmdir(TMP)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        preview(PLANTS, os.path.join(PREVIEW, 'plants-highpoly.jpg'))
        img = bpy.data.images.new('atlas_preview', N // 2, N // 2, alpha=False, float_buffer=False)
        a = albedo[::2, ::2]
        bg = np.array([.24, .27, .30], np.float32)
        rgb = a[..., :3] * a[..., 3:4] + bg * (1 - a[..., 3:4])
        img.pixels.foreach_set(np.concatenate([rgb, np.ones(rgb.shape[:2] + (1,), np.float32)], -1).ravel())
        img.filepath_raw = os.path.join(PREVIEW, 'plants-atlas.jpg')
        img.file_format = 'JPEG'
        img.save(quality=86)
    print('ATLAS', sa, sn, 'cells', len(cells), round(time.time() - t0, 1), 's')


main()
