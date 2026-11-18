"""Bake tileable landscape textures from high-resolution height fields.

High -> low workflow: every material is first modelled as a 2048 x 2048
height field (4.2 million "vertices": grass blades, pebbles, rock strata,
cobbles, bricks...), then its normal map and ambient occlusion are baked from
that detail and everything is downsampled to 1024 x 1024 for the game, where
the maps light low-poly terrain and path meshes.

Run (headless, never touches an open Blender session):
  blender -b --factory-startup -P tools/landscape-bake/bake_textures.py -- <out_dir> [names...]

Writes <name>_albedo.webp (RGB, AO baked in) and <name>_normal.webp
(RGB tangent-space normal, OpenGL +Y; A = height) for each material.
All maps tile seamlessly (periodic noise only).
"""
import bpy
import math
import os
import sys
import time
import numpy as np

HI = 2048
LO = 1024

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0]) if ARGS else os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'game3d', 'landscape'))
ONLY = set(ARGS[1:])


def rng(seed):
    return np.random.default_rng(seed)


def uv_grid(n=HI):
    s = (np.arange(n, dtype=np.float32) + 0.5) / n
    u, v = np.meshgrid(s, s)  # rows = v (bottom to top), cols = u
    return u, v


U, V = uv_grid()


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def vnoise(u, v, period, seed):
    """Periodic value noise in [0,1]."""
    g = rng(seed).random((period, period), dtype=np.float32)
    x = u * period
    y = v * period
    xi = np.floor(x).astype(np.int32)
    yi = np.floor(y).astype(np.int32)
    fx = x - xi
    fy = y - yi
    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    x0, x1 = xi % period, (xi + 1) % period
    y0, y1 = yi % period, (yi + 1) % period
    a, b, c, d = g[y0, x0], g[y0, x1], g[y1, x0], g[y1, x1]
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy


def fbm(u, v, period, octaves, seed, gain=0.5):
    total = np.zeros_like(u)
    amp, norm, p = 1.0, 0.0, period
    for o in range(octaves):
        total += amp * vnoise(u, v, p, seed + o * 101)
        norm += amp
        amp *= gain
        p *= 2
    return total / norm


def worley(u, v, period, seed, jitter=0.85):
    """Periodic Worley: F1, F2, cell id (0..1) and offset to the nearest point."""
    r = rng(seed)
    pts = (r.random((period, period, 2), dtype=np.float32) - 0.5) * jitter + 0.5
    ids = r.random((period, period), dtype=np.float32)
    x = u * period
    y = v * period
    xi = np.floor(x).astype(np.int32)
    yi = np.floor(y).astype(np.int32)
    f1 = np.full(u.shape, 1e9, np.float32)
    f2 = np.full(u.shape, 1e9, np.float32)
    cid = np.zeros(u.shape, np.float32)
    ox = np.zeros(u.shape, np.float32)
    oy = np.zeros(u.shape, np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cx = xi + dx
            cy = yi + dy
            wx, wy = cx % period, cy % period
            px = cx + pts[wy, wx, 0]
            py = cy + pts[wy, wx, 1]
            ddx = x - px
            ddy = y - py
            d = np.sqrt(ddx * ddx + ddy * ddy)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            cid = np.where(closer, ids[wy, wx], cid)
            ox = np.where(closer, ddx, ox)
            oy = np.where(closer, ddy, oy)
            f1 = np.where(closer, d, f1)
    return f1, f2, cid, ox, oy


def roll(a, dy, dx):
    return np.roll(np.roll(a, dy, axis=0), dx, axis=1)


def bake_normal(h, strength):
    """Tangent-space normal from a periodic height field (OpenGL +Y = +v)."""
    dx = (roll(h, 0, -1) - roll(h, 0, 1)) * 0.5
    dy = (roll(h, -1, 0) - roll(h, 1, 0)) * 0.5
    n = np.stack([-dx * strength, -dy * strength, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n


def bake_ao(h, scale, radii=(2, 5, 11, 23), dirs=8, power=1.0):
    """Horizon-based ambient occlusion baked from the high-res height."""
    occ = np.zeros_like(h)
    for k in range(dirs):
        a = 2 * math.pi * (k + 0.5) / dirs
        for r in radii:
            ox, oy = int(round(math.cos(a) * r)), int(round(math.sin(a) * r))
            nb = roll(h, -oy, -ox)
            occ += np.clip((nb - h) * scale / r, 0.0, 1.0)
    ao = 1.0 - occ / (dirs * len(radii))
    return np.clip(ao, 0.0, 1.0) ** power


def down(a):
    """2x2 box downsample (the high -> low step), keeps channels."""
    if a.ndim == 2:
        return a.reshape(LO, 2, LO, 2).mean(axis=(1, 3))
    return a.reshape(LO, 2, LO, 2, a.shape[-1]).mean(axis=(1, 3))


def save(name, rgba, srgb):
    path = os.path.join(OUT, name + '.webp')
    img = bpy.data.images.new(name, LO, LO, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    img.pixels.foreach_set(np.clip(rgba, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'WEBP'
    img.save(quality=92)
    bpy.data.images.remove(img)
    return os.path.getsize(path)


def write(name, albedo, height, normal_strength, ao_scale, ao_power=1.0):
    """albedo (HI,HI,3) sRGB, height (HI,HI) 0..1 -> two WebP maps."""
    n = bake_normal(height * HI / 64.0, normal_strength)
    ao = bake_ao(height * HI / 64.0, ao_scale, power=ao_power)
    alb = albedo * ao[..., None]
    a_lo = down(alb)
    n_lo = down(n)
    n_lo /= np.linalg.norm(n_lo, axis=-1, keepdims=True)
    h_lo = down(height)
    rgba_a = np.concatenate([a_lo, np.ones((LO, LO, 1), np.float32)], axis=-1)
    rgba_n = np.concatenate([n_lo * 0.5 + 0.5, h_lo[..., None]], axis=-1)
    sa = save(name + '_albedo', rgba_a, True)
    sn = save(name + '_normal', rgba_n, False)
    mean = a_lo.reshape(-1, 3).mean(axis=0)
    print('BAKED', name, 'albedo', sa, 'normal', sn, 'mean', [round(float(c), 3) for c in mean])
    return mean


def strokes(height, albedo, count, seed, length, width, palette, lean=0.0, h0=0.55):
    """Rasterise tapered blade strokes (the 'high poly' grass) with max-height."""
    r = rng(seed)
    for _ in range(count):
        cx, cy = r.random() * HI, r.random() * HI
        ang = r.random() * 2 * math.pi if lean == 0 else (r.normal(0, 0.6) + math.pi / 2)
        ln = r.uniform(*length)
        wd = r.uniform(*width)
        hx, hy = math.cos(ang), math.sin(ang)
        bx0 = int(math.floor(cx - ln - wd)) - 1
        by0 = int(math.floor(cy - ln - wd)) - 1
        size = int(2 * (ln + wd)) + 3
        ys, xs = np.mgrid[by0:by0 + size, bx0:bx0 + size].astype(np.float32)
        px, py = xs + 0.5 - cx, ys + 0.5 - cy
        along = px * hx + py * hy
        across = -px * hy + py * hx
        t = along / ln
        half = wd * 0.5 * np.clip(1.0 - t, 0.0, 1.0) ** 0.8
        inside = (t >= 0) & (t <= 1) & (np.abs(across) < half)
        if not inside.any():
            continue
        prof = np.where(inside, np.sqrt(np.clip(1 - (across / np.maximum(half, 1e-3)) ** 2, 0, 1)), 0)
        bh = h0 * (0.35 + 0.65 * t) + 0.12 * prof + r.uniform(0, 0.25)
        rows = ys.astype(np.int64) % HI
        cols = xs.astype(np.int64) % HI
        cur = height[rows, cols]
        win = inside & (bh > cur)
        if not win.any():
            continue
        c = palette[r.integers(len(palette))]
        shade = (0.78 + 0.32 * t + 0.08 * prof)[..., None]
        col = np.asarray(c, np.float32)[None, None, :] * shade
        height[rows[win], cols[win]] = bh[win]
        albedo[rows[win], cols[win]] = col[win]


def cell_rand(cid, k):
    """Independent per-Voronoi-cell random values derived from the cell id."""
    x = np.sin(cid * (12.9898 + 7.13 * k) + 78.233 * k) * 43758.5453
    return x - np.floor(x)


def grass_ground():
    """Dense sod seen from above: a green thatch of overlapping blades."""
    soil = fbm(U, V, 6, 5, 11)
    thatch = fbm(U, V, 24, 4, 12)
    height = 0.08 * soil + 0.06 * thatch
    # Under-layer is old thatch and moss, not bare soil.
    under = np.stack([0.20 + 0.06 * thatch, 0.25 + 0.06 * thatch, 0.10 + 0.03 * thatch], -1)
    bare = smooth(0.70, 0.86, soil)[..., None]
    albedo = under * (1 - bare) + bare * np.stack([0.33 + 0.06 * soil, 0.26 + 0.05 * soil, 0.17 + 0.03 * soil], -1)
    greens = [(0.25, 0.42, 0.12), (0.31, 0.48, 0.15), (0.21, 0.36, 0.11), (0.37, 0.50, 0.17),
              (0.29, 0.45, 0.19), (0.43, 0.50, 0.21), (0.34, 0.44, 0.13), (0.50, 0.49, 0.25)]
    strokes(height, albedo, 26000, 21, (40, 115), (4.5, 9.5), greens)
    strokes(height, albedo, 9000, 22, (24, 60), (3.0, 6.0), greens[:5], h0=0.75)
    hue = fbm(U, V, 3, 3, 41)
    dry = smooth(0.62, 0.85, fbm(U, V, 4, 3, 42))[..., None]
    albedo = albedo * (0.9 + 0.2 * hue)[..., None]
    albedo = albedo * (1 - 0.35 * dry) + 0.35 * dry * albedo * np.array([1.35, 1.12, 0.85], np.float32)
    return write('wv_grass', albedo, height, 2.0, 3.0, 1.1)


def dirt():
    """Packed trail dirt: soil clods, drying cracks, grit and pebbles."""
    soil = fbm(U, V, 5, 6, 51)
    f1, f2, cid, ox, oy = worley(U, V, 9, 52, 0.95)
    crack = 1 - smooth(0.0, 0.035, f2 - f1)
    height = 0.30 * soil - 0.08 * crack
    grit = vnoise(U, V, 512, 53)
    height += 0.025 * grit
    albedo = np.stack([0.43 + 0.10 * soil, 0.33 + 0.08 * soil, 0.22 + 0.06 * soil], -1)
    albedo *= (0.92 + 0.12 * grit)[..., None]
    albedo *= (1 - 0.35 * crack)[..., None]
    p1, p2, pid, pox, poy = worley(U, V, 56, 54, 0.9)
    stone = (p1 < 0.30) & (pid > 0.55)
    dome = np.sqrt(np.clip(1 - (p1 / 0.30) ** 2, 0, 1))
    height = np.where(stone, np.maximum(height, 0.32 + 0.22 * dome), height)
    tone = (0.38 + 0.22 * pid)[..., None]
    pebble = np.concatenate([tone * 1.08, tone * 1.0, tone * 0.9], -1) * (0.85 + 0.25 * dome)[..., None]
    albedo = np.where(stone[..., None], pebble, albedo)
    return write('wv_dirt', albedo, height, 2.6, 3.5)


def rock():
    """Cliff rock: fractured blocks at two scales with tilted facets, faint
    intermittent bedding partings (no colour bands, which read as zebra stripes
    on distant cliffs), sparse open cracks, rain/iron streaks running down the
    face and lichen. V runs up the cliff (triplanar side faces). Every
    anisotropic noise uses integer multipliers so the tile stays seamless."""
    warp = fbm(U, V, 3, 4, 61)
    sv = V * 9.0 + 0.9 * (warp - 0.5) + 0.25 * fbm(U, V, 12, 3, 62)
    frac = sv - np.floor(sv)
    parting = np.exp(-((frac - 0.5) / 0.035) ** 2) * smooth(0.35, 0.7, fbm(U * 2.0, V, 4, 3, 69))
    # Large blocks and smaller chips, each a randomly tilted plane.
    f1, f2, cid, ox, oy = worley(U, V, 4, 63, 0.9)
    tx = (cell_rand(cid, 1) - 0.5) * 1.4
    ty = (cell_rand(cid, 2) - 0.5) * 1.4
    facet = (ox * tx + oy * ty) * 0.30 + 0.2 * cell_rand(cid, 3)
    g1, g2, cid2, ox2, oy2 = worley(U, V, 11, 64, 0.95)
    chip = ((ox2 * (cell_rand(cid2, 1) - 0.5) + oy2 * (cell_rand(cid2, 2) - 0.5)) * 0.25 +
            0.08 * cell_rand(cid2, 3))
    # Only some block edges are open cracks; the rest are tight seams.
    open_crack = cell_rand(cid, 4) > 0.55
    crack = (1 - smooth(0.0, 0.03, f2 - f1)) * np.where(open_crack, 1.0, 0.25)
    seam2 = (1 - smooth(0.0, 0.025, g2 - g1)) * 0.3
    grain = fbm(U, V, 48, 4, 65)
    pits = smooth(0.70, 0.95, fbm(U, V, 96, 3, 68))
    height = (facet + 0.45 * chip + 0.08 * grain - 0.22 * crack - 0.08 * seam2 -
              0.12 * parting - 0.04 * pits)
    height = (height - height.min()) / (height.max() - height.min())
    # One rock family with gentle, unbanded warm/cool variation.
    t = smooth(0.35, 0.65, fbm(U, V, 3, 4, 70))[..., None]
    warm = np.array([0.46, 0.42, 0.37], np.float32)
    cool = np.array([0.40, 0.41, 0.42], np.float32)
    base = cool * (1 - t) + warm * t
    base = base * (0.88 + 0.12 * cell_rand(cid, 5))[..., None]
    base *= (0.82 + 0.30 * grain)[..., None]
    # Rain/iron streaks run down the face (elongated along V).
    streak = smooth(0.58, 0.85, fbm(U * 6.0, V, 4, 3, 66))[..., None]
    base = base * (1 - 0.22 * streak) + 0.22 * streak * np.array([0.40, 0.31, 0.22], np.float32)
    lichen = smooth(0.70, 0.82, fbm(U, V, 9, 4, 67)) * (1 - crack)
    lich = np.array([0.56, 0.55, 0.32], np.float32)
    base = base * (1 - 0.45 * lichen[..., None]) + 0.45 * lichen[..., None] * lich
    base *= (1 - 0.35 * crack - 0.15 * seam2 - 0.2 * parting)[..., None]
    return write('wv_rock', base, height, 3.2, 4.0, 1.15)


def snow():
    """Wind-packed snow: sastrugi ripples, soft drifts, faint sparkle."""
    drift = fbm(U, V, 3, 5, 71)
    rip = np.sin((U * 18 + V * 6 + 2.2 * drift) * 2 * math.pi) * 0.5 + 0.5
    height = 0.55 * drift + 0.08 * rip + 0.02 * vnoise(U, V, 256, 72)
    sparkle = (vnoise(U, V, 700, 73) > 0.93).astype(np.float32)
    albedo = np.stack([0.86 + 0.04 * drift, 0.89 + 0.04 * drift, 0.94 + 0.03 * drift], -1)
    albedo = np.clip(albedo + 0.06 * sparkle[..., None], 0, 1)
    return write('wv_snow', albedo, height, 1.3, 2.0)


def cobble():
    """Rounded cobblestones bedded in dirt joints with moss."""
    f1, f2, cid, ox, oy = worley(U, V, 9, 81, 0.8)
    edge = f2 - f1
    wobble = fbm(U, V, 40, 3, 82)
    # Irregular stone outlines: the joint width wanders around each stone.
    stone = smooth(0.035, 0.11 + 0.05 * (wobble - 0.5), edge)
    # Rounded setts: the crown follows each stone's own outline (edge distance).
    dome = smooth(0.0, 0.34, edge) ** 0.7
    top = 0.55 + 0.25 * cell_rand(cid, 1) + 0.05 * (wobble - 0.5)
    height = stone * (top * (0.40 + 0.60 * dome)) + (1 - stone) * 0.10 * fbm(U, V, 30, 3, 83)
    tone = cell_rand(cid, 2)
    warmth = cell_rand(cid, 3) - 0.5
    sc = (0.34 + 0.20 * tone)[..., None] * np.array([1.0, 0.98, 0.94], np.float32)
    sc = sc + warmth[..., None] * np.array([0.06, 0.03, -0.03], np.float32)
    sc *= (0.86 + 0.24 * wobble)[..., None]
    # Polished, lighter crowns where feet wear the stones.
    wear = smooth(0.45, 0.85, dome * stone)[..., None]
    sc = sc * (1 - 0.18 * wear) + 0.18 * wear * np.array([0.62, 0.60, 0.56], np.float32)
    joint = np.array([0.24, 0.20, 0.15], np.float32) * (0.8 + 0.3 * fbm(U, V, 20, 3, 85))[..., None]
    moss = smooth(0.60, 0.78, fbm(U, V, 14, 3, 86))[..., None]
    joint = joint * (1 - 0.6 * moss) + 0.6 * moss * np.array([0.17, 0.25, 0.10], np.float32)
    albedo = sc * stone[..., None] + joint * (1 - stone[..., None])
    return write('wv_cobble', albedo, height, 3.0, 4.0, 1.2)


def brick():
    """Running-bond brick pavers: bevels, chips, per-brick colour, sand joints."""
    rows, cols = 16, 8
    y = V * rows
    row = np.floor(y).astype(np.int32)
    x = U * cols + 0.5 * (row % 2)
    col = np.floor(x).astype(np.int32)
    fx = x - col
    fy = y - row
    bev = np.minimum(np.minimum(fx, 1 - fx) * 2.0 / 0.5, np.minimum(fy, 1 - fy) * 1.0 / 0.5)
    joint = 1 - smooth(0.03, 0.10, bev)
    r = rng(91)
    bid = r.random((rows, cols + 1, 4)).astype(np.float32)
    b = bid[row % rows, col % (cols + 1)]
    chip = fbm(U, V, 64, 3, 92)
    top = smooth(0.0, 0.22, bev) * (0.78 + 0.08 * b[..., 0]) - 0.05 * smooth(0.6, 0.8, chip)
    height = np.where(joint > 0.5, 0.15 + 0.05 * fbm(U, V, 50, 2, 93), top)
    red = np.array([0.55, 0.30, 0.20], np.float32)
    brown = np.array([0.46, 0.33, 0.24], np.float32)
    grey = np.array([0.42, 0.40, 0.37], np.float32)
    mixc = red * (1 - b[..., 1:2]) + brown * b[..., 1:2]
    mixc = mixc * (1 - 0.35 * (b[..., 2:3] > 0.85)) + grey * 0.35 * (b[..., 2:3] > 0.85)
    mixc *= (0.82 + 0.25 * fbm(U, V, 24, 3, 94))[..., None]
    sand = np.array([0.58, 0.52, 0.40], np.float32) * (0.85 + 0.2 * chip)[..., None]
    albedo = mixc * (1 - joint[..., None]) + sand * joint[..., None]
    return write('wv_brick', albedo, height, 2.8, 3.5, 1.1)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [('wv_grass', grass_ground), ('wv_dirt', dirt), ('wv_rock', rock),
            ('wv_snow', snow), ('wv_cobble', cobble), ('wv_brick', brick)]
    means = {}
    for name, fn in jobs:
        if ONLY and name not in ONLY:
            continue
        t = time.time()
        means[name] = [round(float(c), 4) for c in fn()]
        print('TIME', name, round(time.time() - t, 1), 's')
    print('MEANS', means)


main()
