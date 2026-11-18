"""High-poly ground-material bakes for Wolfveil (Blender 5.x, headless).

Each material is modelled as a real high-poly, seamlessly tiling patch and
baked top-down onto a flat game plane (Cycles, selected -> active):
  dirt    packed trail earth + ~2,600 embedded pebbles + straw   (3.4 m tile)
  grass   soil + ~42,000 individual curved blades in tufts       (3.2 m tile)
  cobble  rounded granite setts in running-bond rows, sand/moss  (2.34 m tile)
  brick   chipped clay pavers in herringbone, mossy sand joints  (2.1 m tile)
Every instance that crosses a tile edge is duplicated on the opposite edge and
all colour variation is periodic, so the maps tile without seams.
Bakes: tangent normal, diffuse colour, ambient occlusion, height (emission),
at 2x resolution and averaged down (4x supersampling).
Output (same layout as bake_textures.py; read by WolfveilTerrainSplat.js and
the path surfaces):
  wv_<name>_albedo.webp  sRGB, AO multiplied in
  wv_<name>_normal.webp  RGB tangent normal (OpenGL +Y), A = height
Optional previews (--preview DIR): lit render of each high-poly patch and the
baked maps side by side.

  blender -b --factory-startup -P tools/landscape-bake/bake_materials.py -- <out_dir>
          [--preview <dir>] [--size 1024] [names...]
"""
import bpy
import math
import os
import sys
import time
import numpy as np

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGV[0]) if ARGV else os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'game3d', 'landscape'))
PREVIEW, FINAL, ONLY = None, 1024, []
_i = 1
while _i < len(ARGV):
    if ARGV[_i] == '--preview':
        PREVIEW = os.path.abspath(ARGV[_i + 1]); _i += 2
    elif ARGV[_i] == '--size':
        FINAL = int(ARGV[_i + 1]); _i += 2
    else:
        ONLY.append(ARGV[_i]); _i += 1
BAKE = FINAL * 2


# ----------------------------------------------------------------- helpers --
def srgb_to_linear(c):
    c = np.asarray(c, np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def pnoise(n, period, rng):
    """Periodic value noise on an n x n grid ([row=y, col=x]), 0..1."""
    g = rng.random((period, period)).astype(np.float32)
    t = (np.arange(n, dtype=np.float32) + 0.5) / n * period
    i0 = np.floor(t).astype(np.int64)
    f = t - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % period
    i0 = i0 % period
    a, b = g[np.ix_(i0, i0)], g[np.ix_(i0, i1)]
    c, d = g[np.ix_(i1, i0)], g[np.ix_(i1, i1)]
    fx, fy = f[None, :], f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def paniso(n, px, py, octaves, seed, gain=0.5):
    """Periodic anisotropic fbm: px cells across x, py across y (0..1)."""
    rng = np.random.default_rng(seed)
    s = np.zeros((n, n), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        qx, qy = px * 2 ** o, py * 2 ** o
        g = rng.random((qy, qx)).astype(np.float32)
        tx = (np.arange(n, dtype=np.float32) + 0.5) / n * qx
        ty = (np.arange(n, dtype=np.float32) + 0.5) / n * qy
        ix, iy = np.floor(tx).astype(np.int64), np.floor(ty).astype(np.int64)
        fx, fy = tx - ix, ty - iy
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        ix1, iy1, ix, iy = (ix + 1) % qx, (iy + 1) % qy, ix % qx, iy % qy
        a, b = g[np.ix_(iy, ix)], g[np.ix_(iy, ix1)]
        c, d = g[np.ix_(iy1, ix)], g[np.ix_(iy1, ix1)]
        s += amp * ((a * (1 - fx[None]) + b * fx[None]) * (1 - fy[:, None]) +
                    (c * (1 - fx[None]) + d * fx[None]) * fy[:, None])
        tot += amp
        amp *= gain
    return s / tot


def pfbm(n, period, octaves, seed, gain=0.5):
    rng = np.random.default_rng(seed)
    s = np.zeros((n, n), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s += amp * pnoise(n, period * 2 ** o, rng)
        tot += amp
        amp *= gain
    return s / tot


def sample(field, x, y, S):
    """Bilinear, wrapping sample of a periodic field at tile coords (metres)."""
    n = field.shape[0]
    u = (np.asarray(x, np.float64) / S * n - 0.5) % n
    v = (np.asarray(y, np.float64) / S * n - 0.5) % n
    i0, j0 = np.floor(u).astype(np.int64), np.floor(v).astype(np.int64)
    fu, fv = u - i0, v - j0
    i1, j1 = (i0 + 1) % n, (j0 + 1) % n
    return ((field[j0, i0] * (1 - fu) + field[j0, i1] * fu) * (1 - fv) +
            (field[j1, i0] * (1 - fu) + field[j1, i1] * fu) * fv)


def mesh_from_arrays(name, verts, faces, colors=None, loc=None, smooth_shade=True):
    me = bpy.data.meshes.new(name)
    nv, nf, k = len(verts), len(faces), faces.shape[1]
    me.vertices.add(nv)
    me.vertices.foreach_set('co', np.ascontiguousarray(verts, np.float32).ravel())
    me.loops.add(nf * k)
    me.loops.foreach_set('vertex_index', np.ascontiguousarray(faces, np.int32).ravel())
    me.polygons.add(nf)
    me.polygons.foreach_set('loop_start', np.arange(0, nf * k, k, dtype=np.int32))
    me.update(calc_edges=True)
    me.validate(clean_customdata=False)
    if smooth_shade:
        me.shade_smooth()
    if colors is not None:
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        attr.data.foreach_set('color', np.ascontiguousarray(colors, np.float32).ravel())
    if loc is not None:
        attr = me.attributes.new('Loc', 'FLOAT_VECTOR', 'POINT')
        attr.data.foreach_set('vector', np.ascontiguousarray(loc, np.float32).ravel())
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def grid(name, S, N, zfun, colfun):
    xs = np.linspace(0, S, N + 1, dtype=np.float32)
    X, Y = np.meshgrid(xs, xs)
    Z = zfun(X, Y).astype(np.float32)
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    idx = np.arange((N + 1) * (N + 1)).reshape(N + 1, N + 1)
    faces = np.stack([idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]], -1).reshape(-1, 4)
    cols = colfun(X, Y, Z).reshape(-1, 3)
    cols = np.concatenate([cols, np.ones((len(cols), 1), np.float32)], 1)
    return mesh_from_arrays(name, verts, faces, cols, smooth_shade=True)


_ICO = {}


def ico(sub):
    if sub not in _ICO:
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        bm.verts.index_update()
        v = np.array([vv.co[:] for vv in bm.verts], np.float32)
        f = np.array([[vv.index for vv in face.verts] for face in bm.faces], np.int64)
        bm.free()
        _ICO[sub] = (v, f)
    return _ICO[sub]


def rotations(yaw, tilt_x, tilt_y):
    cz, sz = np.cos(yaw), np.sin(yaw)
    cx, sx = np.cos(tilt_x), np.sin(tilt_x)
    cy, sy = np.cos(tilt_y), np.sin(tilt_y)
    K = len(yaw)
    Rz = np.zeros((K, 3, 3), np.float32); Rz[:, 0, 0] = cz; Rz[:, 0, 1] = -sz; Rz[:, 1, 0] = sz; Rz[:, 1, 1] = cz; Rz[:, 2, 2] = 1
    Rx = np.zeros((K, 3, 3), np.float32); Rx[:, 0, 0] = 1; Rx[:, 1, 1] = cx; Rx[:, 1, 2] = -sx; Rx[:, 2, 1] = sx; Rx[:, 2, 2] = cx
    Ry = np.zeros((K, 3, 3), np.float32); Ry[:, 0, 0] = cy; Ry[:, 0, 2] = sy; Ry[:, 1, 1] = 1; Ry[:, 2, 0] = -sy; Ry[:, 2, 2] = cy
    return Rz @ Rx @ Ry


def wrap_copies(px, py, radius, S):
    """Indices + offsets so every instance crossing a tile edge also appears
    on the opposite edge (identical parameters => seamless tiling)."""
    idx, ox, oy = [], [], []
    for dx in (-S, 0.0, S):
        for dy in (-S, 0.0, S):
            x, y = px + dx, py + dy
            keep = (x + radius > 0) & (x - radius < S) & (y + radius > 0) & (y - radius < S)
            sel = np.nonzero(keep)[0]
            idx.append(sel); ox.append(np.full(len(sel), dx)); oy.append(np.full(len(sel), dy))
    return np.concatenate(idx), np.concatenate(ox), np.concatenate(oy)


def stones(name, S, P, sub, shape_n=None, smooth_shade=True):
    """Instanced lumpy ellipsoids / superellipsoids from parameter arrays P:
    x, y, z, sx, sy, sz, yaw, tx, ty, amp, color (K,3 linear), seed."""
    tv, tf = ico(sub)
    K = len(P['x'])
    rng = np.random.default_rng(P['seed'])
    W = rng.normal(size=(K, 4, 3)).astype(np.float32)
    ph = rng.random((K, 4)).astype(np.float32) * 6.283
    fr = rng.uniform(1.2, 3.4, (K, 4)).astype(np.float32)
    gain = rng.uniform(0.6, 1.0, (K, 4)).astype(np.float32)
    off = rng.uniform(-50, 50, (K, 3)).astype(np.float32)
    radius = np.maximum(P['sx'], P['sy']) * (1 + np.abs(P['amp'])) * 1.05
    idx, ox, oy = wrap_copies(P['x'], P['y'], radius, S)
    proj = np.einsum('kwj,vj->kwv', W[idx], tv)
    lump = (np.cos(proj * fr[idx][:, :, None] + ph[idx][:, :, None]) * gain[idx][:, :, None]).sum(1) / 2.6
    radial = 1 + P['amp'][idx][:, None] * lump
    if shape_n is not None:
        # Radial projection of the sphere onto a superellipsoid (rounded box).
        n = shape_n[idx][:, None]
        a = np.abs(tv)[None]
        radial = radial * (a[..., 0] ** n + a[..., 1] ** n + a[..., 2] ** n) ** (-1 / n)
    local = tv[None] * radial[..., None] * np.stack([P['sx'], P['sy'], P['sz']], -1)[idx][:, None, :]
    R = rotations(P['yaw'][idx], P['tx'][idx], P['ty'][idx])
    pos = np.stack([P['x'][idx] + ox, P['y'][idx] + oy, P['z'][idx]], -1).astype(np.float32)
    V = np.einsum('kij,kvj->kvi', R, local) + pos[:, None, :]
    F = tf[None] + (np.arange(len(idx)) * len(tv))[:, None, None]
    col = np.repeat(np.concatenate([P['color'][idx], np.ones((len(idx), 1), np.float32)], 1), len(tv), 0)
    # Per-stone texture space in centimetres (+ a random offset per stone):
    # identical on wrapped copies, so speckle never seams at the tile edge.
    loc = (local * 100.0 + off[idx][:, None, :]).reshape(-1, 3)
    return mesh_from_arrays(name, V.reshape(-1, 3), F.reshape(-1, 3), col, loc, smooth_shade)


def faceted(name, S, P, sub, seed, vertex_color=None):
    """Fractured blocks: each is a random convex polyhedron (radial distance
    to the nearest of 6 box planes + 8 random cutting planes) with fine
    roughness. vertex_color(world_xy (n,2) wrapped to the tile) -> (n,3)
    multiplier lets streaks run continuously across blocks and tile edges."""
    tv, tf = ico(sub)
    K = len(P['x'])
    rng = np.random.default_rng(seed)
    axes = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], np.float32)
    rnd = rng.normal(size=(K, 8, 3)).astype(np.float32)
    rnd /= np.linalg.norm(rnd, axis=-1, keepdims=True)
    Nrm = np.concatenate([np.broadcast_to(axes, (K, 6, 3)), rnd], 1)
    H = np.concatenate([rng.uniform(0.9, 1.1, (K, 6)), rng.uniform(0.68, 0.97, (K, 8))], 1).astype(np.float32)
    W = rng.normal(size=(K, 3, 3)).astype(np.float32)
    ph = (rng.random((K, 3)) * 6.283).astype(np.float32)
    fr = rng.uniform(4, 10, (K, 3)).astype(np.float32)
    off = rng.uniform(-500, 500, (K, 3)).astype(np.float32)
    radius = np.maximum(P['sx'], P['sy']) * 1.25
    idx, ox, oy = wrap_copies(P['x'], P['y'], radius, S)
    d = np.einsum('kpj,vj->kpv', Nrm[idx], tv)
    r = np.where(d > 0.05, H[idx][:, :, None] / np.maximum(d, 0.05), 9.0).min(1)
    proj = np.einsum('kwj,vj->kwv', W[idx], tv)
    r = r * (1 + 0.03 * np.cos(proj * fr[idx][:, :, None] + ph[idx][:, :, None]).sum(1) / 3)
    local = tv[None] * r[..., None] * np.stack([P['sx'], P['sy'], P['sz']], -1)[idx][:, None, :]
    R = rotations(P['yaw'][idx], P['tx'][idx], P['ty'][idx])
    pos = np.stack([P['x'][idx] + ox, P['y'][idx] + oy, P['z'][idx]], -1).astype(np.float32)
    V = np.einsum('kij,kvj->kvi', R, local) + pos[:, None, :]
    F = tf[None] + (np.arange(len(idx)) * len(tv))[:, None, None]
    col = np.repeat(P['color'][idx], len(tv), 0)
    Vf = V.reshape(-1, 3)
    if vertex_color is not None:
        col = col * vertex_color(np.mod(Vf[:, :2], S))
    col = np.concatenate([col, np.ones((len(col), 1), np.float32)], 1)
    loc = (local * 100.0 + off[idx][:, None, :]).reshape(-1, 3)
    return mesh_from_arrays(name, Vf, F.reshape(-1, 3), col, loc)


def blades(name, S, B, seed):
    """Curved, tapering grass blades. B: x, y, z, length, width, yaw, phi0, phi1, color."""
    rows = 5
    K = len(B['x'])
    rng = np.random.default_rng(seed)
    radius = B['length'] * 1.05
    idx, ox, oy = wrap_copies(B['x'], B['y'], radius, S)
    n = len(idx)
    L, w0 = B['length'][idx], B['width'][idx]
    yaw = B['yaw'][idx]
    dirx, diry = np.cos(yaw), np.sin(yaw)
    side = np.stack([-diry, dirx], -1) * 1.0
    phi0, phi1 = B['phi0'][idx], B['phi1'][idx]
    base = np.stack([B['x'][idx] + ox, B['y'][idx] + oy, B['z'][idx]], -1)
    pts = [base]
    for r in range(1, rows):
        tm = (r - 0.5) / (rows - 1)
        phi = phi0 + (phi1 - phi0) * tm
        step = L / (rows - 1)
        d = np.stack([np.sin(phi) * dirx * step, np.sin(phi) * diry * step, np.cos(phi) * step], -1)
        pts.append(pts[-1] + d)
    V = np.zeros((n, rows * 2, 3), np.float32)
    C = np.zeros((n, rows * 2, 4), np.float32)
    col = B['color'][idx]
    tip = np.array(srgb_to_linear([0.62, 0.66, 0.30]), np.float32)
    for r in range(rows):
        t = r / (rows - 1)
        half = w0 * (1 - 0.86 * t ** 1.4) * 0.5
        sx, sy = side[:, 0] * half, side[:, 1] * half
        V[:, 2 * r, :] = pts[r] + np.stack([sx, sy, np.zeros(n)], -1)
        V[:, 2 * r + 1, :] = pts[r] - np.stack([sx, sy, np.zeros(n)], -1)
        c = col * (0.42 + 0.58 * t)
        c = c * (1 - 0.25 * t ** 3) + tip[None] * 0.25 * t ** 3 * col.mean(1, keepdims=True) / max(1e-4, tip.mean())
        C[:, 2 * r, :3] = c
        C[:, 2 * r + 1, :3] = c
    C[..., 3] = 1
    faces = []
    for r in range(rows - 1):
        faces.append([2 * r, 2 * r + 1, 2 * r + 3, 2 * r + 2])
    faces = np.array(faces, np.int64)
    F = faces[None] + (np.arange(n) * rows * 2)[:, None, None]
    return mesh_from_arrays(name, V.reshape(-1, 3), F.reshape(-1, 4), C.reshape(-1, 4))


def pick_colors(rng, K, palette, lo=0.8, hi=1.08):
    pal = srgb_to_linear(np.array(palette, np.float32))
    c = pal[rng.integers(0, len(pal), K)] * rng.uniform(lo, hi, (K, 1)).astype(np.float32) ** 2.2
    return c.astype(np.float32)


# --------------------------------------------------------------- materials --
def node_mat(name, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = rough
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return m, nt, bsdf


def attr_node(nt, name):
    a = nt.nodes.new('ShaderNodeAttribute')
    a.attribute_name = name
    return a


def mix_rgb(nt, fac, a, b, blend='MIX'):
    mx = nt.nodes.new('ShaderNodeMix')
    mx.data_type = 'RGBA'
    mx.blend_type = blend
    if isinstance(fac, float):
        mx.inputs[0].default_value = fac
    else:
        nt.links.new(fac, mx.inputs[0])
    for socket, val in ((6, a), (7, b)):
        if isinstance(val, tuple):
            mx.inputs[socket].default_value = val
        else:
            nt.links.new(val, mx.inputs[socket])
    return mx.outputs[2]


def vertex_color_mat(name, rough=0.92):
    m, nt, bsdf = node_mat(name, rough)
    nt.links.new(attr_node(nt, 'Col').outputs['Color'], bsdf.inputs['Base Color'])
    return m


def stone_mat(name, speckle=0.18, wear=0.22, speck=2.5, mottle=0.12, rough=0.8):
    """Per-stone colour x granite speckle x mottling (seamless: driven by the
    per-stone 'Loc' attribute in cm, identical on wrapped copies) x edge wear
    (pointiness). speck / mottle are cells per centimetre."""
    m, nt, bsdf = node_mat(name, rough)
    col = attr_node(nt, 'Col').outputs['Color']
    loc = attr_node(nt, 'Loc').outputs['Vector']
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.inputs['Scale'].default_value = speck
    nt.links.new(loc, vor.inputs['Vector'])
    spk = nt.nodes.new('ShaderNodeValToRGB')
    spk.color_ramp.elements[0].position = 0.0
    spk.color_ramp.elements[0].color = (1 - speckle, 1 - speckle, 1 - speckle, 1)
    spk.color_ramp.elements[1].position = 0.55
    spk.color_ramp.elements[1].color = (1 + speckle * 0.4, 1 + speckle * 0.4, 1 + speckle * 0.4, 1)
    nt.links.new(vor.outputs['Distance'], spk.inputs['Fac'])
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = mottle
    noise.inputs['Detail'].default_value = 6.0
    nt.links.new(loc, noise.inputs['Vector'])
    mott = nt.nodes.new('ShaderNodeValToRGB')
    mott.color_ramp.elements[0].color = (0.78, 0.78, 0.76, 1)
    mott.color_ramp.elements[1].color = (1.12, 1.1, 1.06, 1)
    nt.links.new(noise.outputs['Fac'], mott.inputs['Fac'])
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    edge = nt.nodes.new('ShaderNodeValToRGB')
    edge.color_ramp.elements[0].position = 0.5
    edge.color_ramp.elements[0].color = (1, 1, 1, 1)
    edge.color_ramp.elements[1].position = 0.62
    edge.color_ramp.elements[1].color = (1 + wear, 1 + wear, 1 + wear * 0.9, 1)
    nt.links.new(geo.outputs['Pointiness'], edge.inputs['Fac'])
    c = mix_rgb(nt, 1.0, col, spk.outputs['Color'], 'MULTIPLY')
    c = mix_rgb(nt, 1.0, c, mott.outputs['Color'], 'MULTIPLY')
    c = mix_rgb(nt, 1.0, c, edge.outputs['Color'], 'MULTIPLY')
    nt.links.new(c, bsdf.inputs['Base Color'])
    return m


def add_micro_relief(m, strength, rough_cells, crack_cells, crack_depth):
    """Shader bump (baked into the normal map by Cycles): fractal roughness
    plus fine cracks, both driven by the seamless per-stone 'Loc' (cm)."""
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    loc = attr_node(nt, 'Loc').outputs['Vector']
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = rough_cells
    noise.inputs['Detail'].default_value = 10.0
    noise.inputs['Roughness'].default_value = 0.62
    nt.links.new(loc, noise.inputs['Vector'])
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.feature = 'DISTANCE_TO_EDGE'
    vor.inputs['Scale'].default_value = crack_cells
    nt.links.new(loc, vor.inputs['Vector'])
    crack = nt.nodes.new('ShaderNodeMapRange')
    crack.inputs['From Min'].default_value = 0.0
    crack.inputs['From Max'].default_value = 0.06
    crack.inputs['To Min'].default_value = -crack_depth
    crack.inputs['To Max'].default_value = 0.0
    nt.links.new(vor.outputs['Distance'], crack.inputs['Value'])
    add = nt.nodes.new('ShaderNodeMath')
    add.operation = 'ADD'
    nt.links.new(noise.outputs['Fac'], add.inputs[0])
    nt.links.new(crack.outputs['Result'], add.inputs[1])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = 0.02
    nt.links.new(add.outputs['Value'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def height_mat(z0, z1):
    m = bpy.data.materials.new('height_emit')
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], sep.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = z0
    mr.inputs['From Max'].default_value = z1
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(mr.outputs['Result'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return m


# ----------------------------------------------------------------- recipes --
def recipe_dirt(S):
    N = 1024
    rng = np.random.default_rng(301)
    broad, lumps, fine = pfbm(1024, 3, 4, 311), pfbm(1024, 24, 3, 312), pfbm(1024, 96, 2, 313)
    damp, dust, fleck = pfbm(1024, 4, 4, 314), pfbm(1024, 6, 4, 315), pfbm(1024, 160, 1, 316)
    hfield = (broad - 0.5) * 0.014 + (lumps - 0.5) * 0.007 + (fine - 0.5) * 0.0022
    soil_col = srgb_to_linear([0.43, 0.33, 0.22])
    wet_col, dust_col = srgb_to_linear([0.25, 0.18, 0.12]), srgb_to_linear([0.55, 0.46, 0.35])

    def colfun(X, Y, Z):
        d = sample(damp, X, Y, S)[..., None]
        u = sample(dust, X, Y, S)[..., None]
        f = sample(fleck, X, Y, S)[..., None]
        hl = sample(broad, X, Y, S)[..., None]
        c = soil_col * (1 - smooth(0.52, 0.8, d) * 0.55 - smooth(0.6, 0.2, hl) * 0.25) + wet_col * smooth(0.52, 0.8, d) * 0.55
        c = c * (1 - smooth(0.55, 0.8, u) * 0.5) + dust_col * smooth(0.55, 0.8, u) * 0.5
        return (c * (0.9 + 0.2 * f)).astype(np.float32)

    soil = grid('dirt_soil', S, N, lambda X, Y: sample(hfield, X, Y, S), colfun)
    soil.data.materials.append(vertex_color_mat('dirt_soil', 0.95))
    objs = [soil]
    palette = [(0.47, 0.45, 0.42), (0.38, 0.36, 0.34), (0.53, 0.48, 0.41), (0.33, 0.29, 0.25),
               (0.58, 0.53, 0.46), (0.30, 0.30, 0.31), (0.46, 0.39, 0.31), (0.24, 0.22, 0.21)]
    for label, count, r0, r1, sub, amp in (('grit', 6000, 0.0015, 0.004, 1, 0.25),
                                            ('small', 2300, 0.004, 0.012, 2, 0.22),
                                            ('medium', 300, 0.012, 0.032, 3, 0.2),
                                            ('large', 14, 0.036, 0.075, 3, 0.18)):
        K = count
        r = np.exp(rng.uniform(np.log(r0), np.log(r1), K)).astype(np.float32)
        x, y = rng.uniform(0, S, K), rng.uniform(0, S, K)
        sx = r * rng.uniform(0.85, 1.25, K)
        sy = r * rng.uniform(0.7, 1.05, K)
        sz = r * rng.uniform(0.42, 0.8, K)
        z = sample(hfield, x, y, S) + sz * (0.3 - 0.85 * rng.random(K))
        P = dict(x=x, y=y, z=z, sx=sx, sy=sy, sz=sz, yaw=rng.uniform(0, 6.283, K),
                 tx=rng.normal(0, 0.12, K), ty=rng.normal(0, 0.12, K),
                 amp=np.full(K, amp, np.float32), color=pick_colors(rng, K, palette, 0.72, 1.06),
                 seed=int(rng.integers(1 << 30)))
        o = stones('dirt_pebbles_' + label, S, P, sub, smooth_shade=label != 'grit')
        o.data.materials.append(stone_mat('dirt_pebble_' + label, 0.16, 0.18, 3.0, 0.35, 0.75))
        objs.append(o)
    # Straw and twig litter lying on the earth.
    K = 140
    x, y = rng.uniform(0, S, K), rng.uniform(0, S, K)
    B = dict(x=x, y=y, z=sample(hfield, x, y, S) + 0.0012, length=rng.uniform(0.03, 0.09, K),
             width=rng.uniform(0.0018, 0.0035, K), yaw=rng.uniform(0, 6.283, K),
             phi0=np.full(K, 1.52), phi1=np.full(K, 1.57),
             color=pick_colors(rng, K, [(0.62, 0.55, 0.38), (0.48, 0.40, 0.27), (0.36, 0.30, 0.21)], 0.85, 1.05))
    straw = blades('dirt_straw', S, B, 317)
    straw.data.materials.append(vertex_color_mat('dirt_straw', 0.9))
    objs.append(straw)
    return objs, dict(ao=0.85, ao_dist=0.05)


def recipe_grass(S):
    N = 768
    rng = np.random.default_rng(401)
    hfield = (pfbm(1024, 4, 4, 411) - 0.5) * 0.02 + (pfbm(1024, 32, 3, 412) - 0.5) * 0.006
    moss, tone, dry = pfbm(1024, 5, 4, 413), pfbm(1024, 3, 4, 414), pfbm(1024, 7, 3, 415)
    loam, moss_c = srgb_to_linear([0.20, 0.15, 0.10]), srgb_to_linear([0.20, 0.27, 0.10])

    def colfun(X, Y, Z):
        m = smooth(0.5, 0.75, sample(moss, X, Y, S))[..., None]
        return (loam * (1 - m) + moss_c * m).astype(np.float32)

    soil = grid('grass_soil', S, N, lambda X, Y: sample(hfield, X, Y, S), colfun)
    soil.data.materials.append(vertex_color_mat('grass_soil', 0.95))
    # Tufts: most blades grow in clumps, a few stand alone.
    T = 6000
    tx, ty = rng.uniform(0, S, T), rng.uniform(0, S, T)
    per = rng.integers(6, 15, T)
    cx, cy = np.repeat(tx, per), np.repeat(ty, per)
    K0 = len(cx)
    spread = np.repeat(rng.uniform(0.006, 0.02, T), per)
    x = (cx + rng.normal(0, 1, K0) * spread) % S
    y = (cy + rng.normal(0, 1, K0) * spread) % S
    lone = 7000
    x = np.concatenate([x, rng.uniform(0, S, lone)])
    y = np.concatenate([y, rng.uniform(0, S, lone)])
    K = len(x)
    t = sample(tone, x, y, S)
    d = smooth(0.62, 0.85, sample(dry, x, y, S))
    pal = srgb_to_linear(np.array([[0.13, 0.30, 0.07], [0.20, 0.42, 0.10], [0.29, 0.48, 0.13],
                                   [0.38, 0.50, 0.16], [0.17, 0.36, 0.09]], np.float32))
    base = pal[rng.integers(0, len(pal), K)] * (0.8 + 0.35 * t[:, None])
    straw = srgb_to_linear(np.array([0.56, 0.50, 0.30], np.float32))
    isdry = (rng.random(K) < 0.05 + 0.3 * d)[:, None]
    color = np.where(isdry, straw * rng.uniform(0.75, 1.05, (K, 1)), base).astype(np.float32)
    length = rng.uniform(0.05, 0.13, K) * (0.85 + 0.3 * t)
    B = dict(x=x, y=y, z=sample(hfield, x, y, S) - 0.002, length=length,
             width=rng.uniform(0.0028, 0.0055, K), yaw=rng.uniform(0, 6.283, K),
             phi0=rng.uniform(0.15, 0.6, K), phi1=rng.uniform(0.75, 1.6, K), color=color)
    grass = blades('grass_blades', S, B, 416)
    grass.data.materials.append(vertex_color_mat('grass_blades', 0.85))
    return [soil, grass], dict(ao=0.9, ao_dist=0.06)


def joint_bed(name, S, base_z, seed):
    hfield = (pfbm(1024, 6, 4, seed) - 0.5) * 0.008 + (pfbm(1024, 40, 2, seed + 1) - 0.5) * 0.003
    moss, grit = pfbm(1024, 5, 4, seed + 2), pfbm(1024, 90, 1, seed + 3)
    sand, moss_c, dark = (srgb_to_linear([0.42, 0.37, 0.29]), srgb_to_linear([0.20, 0.29, 0.09]),
                          srgb_to_linear([0.20, 0.16, 0.12]))

    def colfun(X, Y, Z):
        m = smooth(0.5, 0.72, sample(moss, X, Y, S))[..., None]
        g = sample(grit, X, Y, S)[..., None]
        c = sand * (1 - m) + moss_c * m
        return (c * (0.62 + 0.3 * g) + dark * 0.12).astype(np.float32)

    bed = grid(name, S, 768, lambda X, Y: base_z + sample(hfield, X, Y, S), colfun)
    bed.data.materials.append(vertex_color_mat(name, 0.97))
    return bed


def recipe_cobble(S):
    rng = np.random.default_rng(501)
    rows, row_h = 18, S / 18
    xs, ys, lens, wids = [], [], [], []
    for r in range(rows):
        lengths = rng.uniform(0.11, 0.19, 40)
        c = np.cumsum(lengths)
        k = int(np.searchsorted(c, S))
        lengths = lengths[:k] * S / c[k - 1]
        start = rng.uniform(0, S)
        edges = start + np.concatenate([[0], np.cumsum(lengths)])
        for i in range(k):
            xs.append((edges[i] + edges[i + 1]) / 2 % S)
            ys.append((r + 0.5) * row_h)
            lens.append(lengths[i])
            wids.append(row_h)
    K = len(xs)
    xs, ys, lens, wids = map(lambda a: np.array(a, np.float32), (xs, ys, lens, wids))
    joint = rng.uniform(0.011, 0.02, K)
    P = dict(x=xs + rng.normal(0, 0.004, K), y=ys + rng.normal(0, 0.004, K),
             z=0.028 + rng.normal(0, 0.0035, K),
             sx=(lens - joint) / 2, sy=(wids - joint) / 2, sz=rng.uniform(0.036, 0.046, K),
             yaw=rng.normal(0, 0.06, K), tx=rng.normal(0, 0.03, K), ty=rng.normal(0, 0.03, K),
             amp=rng.uniform(0.03, 0.06, K).astype(np.float32),
             color=pick_colors(rng, K, [(0.50, 0.50, 0.50), (0.42, 0.42, 0.44), (0.56, 0.53, 0.50),
                                        (0.38, 0.37, 0.38), (0.47, 0.44, 0.41), (0.33, 0.34, 0.36),
                                        (0.55, 0.52, 0.48), (0.45, 0.47, 0.49)], 0.85, 1.06),
             seed=502)
    setts = stones('cobble_setts', S, P, 4, shape_n=rng.uniform(3.6, 5.2, K).astype(np.float32))
    setts.data.materials.append(add_micro_relief(stone_mat('cobble_sett', 0.2, 0.25, 2.6, 0.13, 0.7),
                                                 0.35, 0.45, 0.05, 0.4))
    return [joint_bed('cobble_bed', S, 0.045, 511), setts], dict(ao=0.9, ao_dist=0.05)


def recipe_brick(S):
    rng = np.random.default_rng(601)
    u = S / 20.0                        # herringbone lattice unit (S = 5 periods of 4u)
    centers, yaws = [], []
    for a in range(-24, 25):
        for b in range(-12, 13):
            bx, by = (a + 2 * b) * u, (a - 2 * b) * u
            centers.append((bx + u, by + 0.5 * u)); yaws.append(0.0)          # horizontal
            centers.append((bx + 2.5 * u, by)); yaws.append(math.pi / 2)        # vertical
    c = np.array(centers) % S
    key = np.round(c / (u * 0.25)).astype(np.int64)
    _, uniq = np.unique(key[:, 0] * 100000 + key[:, 1], return_index=True)
    c, yaws = c[uniq], np.array(yaws)[uniq]
    K = len(c)
    joint = rng.uniform(0.008, 0.012, K)
    tone = rng.random(K)
    color = pick_colors(rng, K, [(0.55, 0.28, 0.20), (0.48, 0.24, 0.18), (0.62, 0.34, 0.24),
                                 (0.42, 0.22, 0.17), (0.58, 0.40, 0.30), (0.36, 0.21, 0.17),
                                 (0.64, 0.42, 0.31)], 0.86, 1.04)
    color[tone < 0.08] *= 0.55
    P = dict(x=c[:, 0] + rng.normal(0, 0.002, K), y=c[:, 1] + rng.normal(0, 0.002, K),
             z=0.03 + rng.normal(0, 0.0022, K),
             sx=(2 * u - joint) / 2, sy=(u - joint) / 2, sz=np.full(K, 0.024, np.float32),
             yaw=yaws + rng.normal(0, 0.012, K), tx=rng.normal(0, 0.015, K), ty=rng.normal(0, 0.015, K),
             amp=rng.uniform(0.012, 0.03, K).astype(np.float32), color=color.astype(np.float32), seed=602)
    pavers = stones('brick_pavers', S, P, 4, shape_n=rng.uniform(8.0, 12.0, K).astype(np.float32))
    pavers.data.materials.append(add_micro_relief(stone_mat('brick_paver', 0.1, -0.12, 2.2, 0.16, 0.82),
                                                  0.25, 0.6, 0.04, 0.5))
    return [joint_bed('brick_bed', S, 0.041, 611), pavers], dict(ao=0.85, ao_dist=0.04)


def rock_mat(name):
    """Fractured-rock colour: vertex colour (block tint x streaks) x speckle x
    mottling, lichen on ledges (normal facing +Y = up the cliff)."""
    m = stone_mat(name, 0.12, 0.16, 1.4, 0.035, 0.85)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    base = bsdf.inputs['Base Color'].links[0].from_socket
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Normal'], sep.inputs['Vector'])
    ledge = nt.nodes.new('ShaderNodeMapRange')
    ledge.inputs['From Min'].default_value = 0.35
    ledge.inputs['From Max'].default_value = 0.8
    nt.links.new(sep.outputs['Y'], ledge.inputs['Value'])
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 0.05
    noise.inputs['Detail'].default_value = 8.0
    nt.links.new(attr_node(nt, 'Loc').outputs['Vector'], noise.inputs['Vector'])
    patchy = nt.nodes.new('ShaderNodeMapRange')
    patchy.inputs['From Min'].default_value = 0.45
    patchy.inputs['From Max'].default_value = 0.62
    nt.links.new(noise.outputs['Fac'], patchy.inputs['Value'])
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    nt.links.new(ledge.outputs['Result'], mul.inputs[0])
    nt.links.new(patchy.outputs['Result'], mul.inputs[1])
    lichen = mix_rgb(nt, mul.outputs['Value'], base, (0.30, 0.31, 0.12, 1))
    nt.links.new(lichen, bsdf.inputs['Base Color'])
    # Fractal roughness only: a crack network reads as a polygon net on cliffs.
    return add_micro_relief(m, 0.9, 0.09, 0.012, 0.0)


def recipe_rock(S):
    """Cliff face (triplanar side texture; +Y = up the cliff): a packed wall of
    fractured blocks elongated along the bedding (X), chips in the crevices."""
    rng = np.random.default_rng(701)
    bed = paniso(1024, 3, 3, 4, 711)
    streak = paniso(1024, 10, 2, 3, 712)
    grain = pfbm(1024, 24, 3, 713)
    tone = pfbm(1024, 2, 3, 714)
    hfield = (bed - 0.5) * 0.5

    def vcol(xy):
        s = smooth(0.56, 0.84, sample(streak, xy[:, 0], xy[:, 1], S))[:, None]
        g = sample(grain, xy[:, 0], xy[:, 1], S)[:, None]
        t = sample(tone, xy[:, 0], xy[:, 1], S)[:, None]
        rust = srgb_to_linear([0.86, 0.66, 0.48])
        c = (0.84 + 0.3 * g) * (1 - 0.28 * s) + 0.28 * s * rust * 0.55
        return (c * (0.92 + 0.16 * t)).astype(np.float32)

    def backc(X, Y, Z):
        return np.broadcast_to(srgb_to_linear([0.16, 0.15, 0.14]), X.shape + (3,)).astype(np.float32)

    back = grid('rock_bedrock', S, 512, lambda X, Y: sample(hfield, X, Y, S) - 0.35, backc)
    back.data.materials.append(vertex_color_mat('rock_bedrock', 0.9))
    palette = [(0.45, 0.44, 0.42), (0.40, 0.40, 0.41), (0.50, 0.47, 0.43), (0.36, 0.35, 0.34),
               (0.47, 0.45, 0.43), (0.42, 0.39, 0.36)]
    objs = [back]
    for label, count, s0, s1, sub, lift in (('big', 95, 0.9, 2.4, 4, 0.0), ('mid', 260, 0.35, 0.9, 3, 0.18),
                                            ('chip', 700, 0.08, 0.3, 2, 0.32)):
        K = count
        s = np.exp(rng.uniform(np.log(s0), np.log(s1), K)).astype(np.float32)
        x, y = rng.uniform(0, S, K), rng.uniform(0, S, K)
        sz = s * rng.uniform(0.5, 0.8, K)
        P = dict(x=x, y=y, z=sample(hfield, x, y, S) + lift + sz * (0.15 - 0.55 * rng.random(K)),
                 sx=s * rng.uniform(1.0, 1.6, K), sy=s * rng.uniform(0.55, 0.9, K), sz=sz,
                 yaw=rng.normal(0, 0.22, K), tx=rng.normal(0, 0.12, K), ty=rng.normal(0, 0.12, K),
                 color=pick_colors(rng, K, palette, 0.86, 1.06))
        o = faceted('rock_' + label, S, P, sub, 720 + sub, vcol)
        o.data.materials.append(rock_mat('rock_' + label))
        objs.append(o)
    return objs, dict(ao=0.8, ao_dist=0.5)


RECIPES = {
    'wv_rock': (11.0, recipe_rock),
    'wv_dirt': (3.4, recipe_dirt),
    'wv_grass': (3.2, recipe_grass),
    'wv_cobble': (2.34, recipe_cobble),
    'wv_brick': (2.1, recipe_brick),
}


# -------------------------------------------------------------------- bake --
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    return scene


def target_plane(S, z):
    verts = np.array([[0, 0, z], [S, 0, z], [S, S, z], [0, S, z]], np.float32)
    o = mesh_from_arrays('bake_target', verts, np.array([[0, 1, 2, 3]]), smooth_shade=False)
    uv = o.data.uv_layers.new(name='UVMap')
    uv.data.foreach_set('uv', np.array([0, 0, 1, 0, 1, 1, 0, 1], np.float32))
    return o


def pixels(img):
    buf = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(buf)
    return buf.reshape(img.size[1], img.size[0], 4)


def down2(a):
    return (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2]) * 0.25


def save_rgba(name, rgba, srgb, out_dir, quality=92):
    path = os.path.join(out_dir, name + '.webp')
    img = bpy.data.images.new(name, rgba.shape[1], rgba.shape[0], alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    img.pixels.foreach_set(np.clip(rgba, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'WEBP'
    img.save(quality=quality)
    bpy.data.images.remove(img)
    return os.path.getsize(path)


def save_jpg(path, rgb):
    img = bpy.data.images.new(os.path.basename(path), rgb.shape[1], rgb.shape[0], alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'sRGB'
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones(rgb.shape[:2] + (1,), np.float32)], -1)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'JPEG'
    img.save(quality=86)
    bpy.data.images.remove(img)


def preview_render(scene, S, objs, path):
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 50
    cam.location = (S * 0.5, -S * 0.32, S * 0.42)
    cam.rotation_euler = (math.radians(52), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.2
    sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(55), math.radians(10), math.radians(-35))
    scene.collection.objects.link(sun)
    bg = scene.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.55, 0.62, 0.72, 1)
    bg.inputs['Strength'].default_value = 0.45
    scene.render.resolution_x, scene.render.resolution_y = 960, 560
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 86
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    bpy.data.objects.remove(sun)


def bake_material(name):
    S, recipe = RECIPES[name]
    t0 = time.time()
    scene = reset_scene()
    objs, opts = recipe(S)
    zs = []
    for o in objs:
        co = np.empty(len(o.data.vertices) * 3, np.float32)
        o.data.vertices.foreach_get('co', co)
        zs.append(co[2::3])
    zs = np.concatenate(zs)
    zlo, zhi = float(zs.min()), float(zs.max())
    tris = sum(len(o.data.polygons) for o in objs)
    print('MODEL', name, 'objects', len(objs), 'faces', tris, 'z', round(zlo, 4), round(zhi, 4),
          round(time.time() - t0, 1), 's')
    if PREVIEW:
        preview_render(scene, S, objs, os.path.join(PREVIEW, name.replace('wv_', '') + '-highpoly.jpg'))
    plane = target_plane(S, zlo - 0.01)
    pm, pnt, pbsdf = node_mat('bake_target')
    plane.data.materials.append(pm)
    imgs = {}
    for k in ('albedo', 'normal', 'ao', 'height'):
        img = bpy.data.images.new(name + '_' + k, BAKE, BAKE, alpha=False, float_buffer=True)
        img.colorspace_settings.name = 'Non-Color'
        imgs[k] = img
    tex = pnt.nodes.new('ShaderNodeTexImage')
    cage = (zhi - zlo) + 0.03

    def run(kind, img, samples, **extra):
        tex.image = img
        pnt.nodes.active = tex
        scene.cycles.samples = samples
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        plane.select_set(True)
        bpy.context.view_layer.objects.active = plane
        bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=cage,
                            max_ray_distance=cage + 0.05, margin=0, use_clear=True, **extra)

    run('NORMAL', imgs['normal'], 4, normal_space='TANGENT')
    run('DIFFUSE', imgs['albedo'], 4, pass_filter={'COLOR'})
    scene.world.light_settings.distance = opts['ao_dist']
    run('AO', imgs['ao'], 32)
    hm = height_mat(zlo, zhi)
    saved = {o.name: list(o.data.materials) for o in objs}
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(hm)
    run('EMIT', imgs['height'], 4)
    for o in objs:
        o.data.materials.clear()
        for m in saved[o.name]:
            o.data.materials.append(m)
    # Combine at 2x and average down.
    alb = down2(pixels(imgs['albedo'])[..., :3])
    ao = down2(pixels(imgs['ao'])[..., :1])
    nrm = down2(pixels(imgs['normal'])[..., :3] * 2 - 1)
    nrm /= np.maximum(1e-6, np.linalg.norm(nrm, axis=-1, keepdims=True))
    hgt = down2(pixels(imgs['height'])[..., :1])
    lo, hi = np.percentile(hgt, 0.5), np.percentile(hgt, 99.5)
    hgt = np.clip((hgt - lo) / max(1e-6, hi - lo), 0, 1)
    k = opts['ao']
    alb_s = linear_to_srgb(alb * (1 - k + k * np.clip(ao, 0, 1)))
    one = np.ones(alb_s.shape[:2] + (1,), np.float32)
    sa = save_rgba(name + '_albedo', np.concatenate([alb_s, one], -1), True, OUT, 92)
    sn = save_rgba(name + '_normal', np.concatenate([nrm * 0.5 + 0.5, hgt], -1), False, OUT, 92)
    if PREVIEW:
        h, w = alb_s.shape[:2]
        pair = np.concatenate([alb_s[::2, ::2], (nrm * 0.5 + 0.5)[::2, ::2]], 1)
        save_jpg(os.path.join(PREVIEW, name.replace('wv_', '') + '-baked-maps.jpg'), pair)
    mean = alb_s.reshape(-1, 3).mean(0)
    print('BAKED', name, 'albedo', sa, 'normal', sn, 'mean', [round(float(c), 3) for c in mean],
          'faces', tris, round(time.time() - t0, 1), 's')
    return [round(float(c), 4) for c in mean]


def main():
    os.makedirs(OUT, exist_ok=True)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
    means = {}
    for name in RECIPES:
        if ONLY and name not in ONLY:
            continue
        means[name] = bake_material(name)
    print('MEANS', means)


main()
