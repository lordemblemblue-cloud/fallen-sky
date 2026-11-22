"""Atlas for the valley kit: flat swatches (fast pass) or the baked atlas.

The baked atlas: every piece and LOD is unwrapped into one 2048 sheet (one
texel density, LOD1 and the big grass mound at lower density, small pieces at
higher), then two Cycles bakes are combined:
  colour  each colour key is a procedural "hand-painted" emission material
          (grain, thatch streaks, field-stone joints, moss, rust, ground grime)
  AO      ambient occlusion over a ground plane, so pieces sit on the ground
final = colour * mix(1, AO, strength); glow pieces take little AO.
Pieces are spread on a grid for the bake (25 m apart, AO distance 1.4 m) so no
piece darkens another; hanging pieces are lifted well above the ground.
"""
import math

import bmesh
import bpy
import numpy as np

from kitlib import PALETTE, PALETTE_KEYS, lin

CELLS = 16


def flat_atlas(size):
    img = bpy.data.images.new('valley_atlas', size, size, alpha=False)
    c = size // CELLS
    a = np.zeros((size, size, 4), np.float32)
    a[..., 3] = 1
    a[..., :3] = 0.5
    for i, k in enumerate(PALETTE_KEYS):
        col, row = i % CELLS, i // CELLS
        a[row * c:(row + 1) * c, col * c:(col + 1) * c, :3] = PALETTE[k]
    img.pixels.foreach_set(a.ravel())
    img.pack()
    return img


def flat_uvs(ob):
    me = ob.data
    keys = ob['keys'].split(',')
    uv = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        i = PALETTE_KEYS.index(keys[p.material_index])
        u = (i % CELLS + 0.5) / CELLS
        v = (i // CELLS + 0.5) / CELLS
        for li in p.loop_indices:
            uv.data[li].uv = (u, v)


def save_png(img, path):
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()


# ---------------------------------------------------------------------------
# Procedural colour per key
# ---------------------------------------------------------------------------

def rgba_in(n):
    s = [x for x in n.inputs if x.type == 'RGBA' and x.enabled]
    return s[0], s[1]


def rgba_out(n):
    return [x for x in n.outputs if x.type == 'RGBA' and x.enabled][0]


class NodeKit:
    def __init__(self, mat):
        self.nt = mat.node_tree
        for n in list(self.nt.nodes):
            self.nt.nodes.remove(n)
        self.N = self.nt.nodes
        self.L = self.nt.links

    def node(self, kind, **props):
        n = self.N.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def link(self, a, b):
        self.L.new(a, b)

    def rgb(self, c):
        n = self.node('ShaderNodeRGB')
        n.outputs[0].default_value = (*c, 1)
        return n.outputs[0]

    def val(self, v):
        n = self.node('ShaderNodeValue')
        n.outputs[0].default_value = v
        return n.outputs[0]

    def math(self, op, a, b=None, c=None, clamp=False):
        n = self.node('ShaderNodeMath', operation=op)
        n.use_clamp = clamp
        for i, x in enumerate((a, b, c)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                n.inputs[i].default_value = x
            else:
                self.link(x, n.inputs[i])
        return n.outputs[0]

    def mix(self, fac, a, b):
        n = self.node('ShaderNodeMix', data_type='RGBA', blend_type='MIX')
        n.clamp_factor = True
        if isinstance(fac, (int, float)):
            n.inputs['Factor'].default_value = fac
        else:
            self.link(fac, n.inputs['Factor'])
        A, Bc = rgba_in(n)
        self.link(a, A)
        self.link(b, Bc)
        return rgba_out(n)

    def scale_col(self, c, f):
        n = self.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
        n.inputs['Factor'].default_value = 1.0
        A, Bc = rgba_in(n)
        self.link(c, A)
        if isinstance(f, (int, float)):
            Bc.default_value = (f, f, f, 1)
        else:
            cv = self.node('ShaderNodeCombineColor')
            for i in range(3):
                self.link(f, cv.inputs[i])
            self.link(cv.outputs[0], Bc)
        return rgba_out(n)

    def coords(self, scale=(1, 1, 1), space='Object'):
        tc = self.node('ShaderNodeTexCoord')
        mp = self.node('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = scale
        self.link(tc.outputs[space], mp.inputs['Vector'])
        return mp.outputs[0]

    def noise(self, scale, vec=None, detail=3.0, rough=0.55, dist=0.0):
        n = self.node('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        n.inputs['Distortion'].default_value = dist
        if vec is not None:
            self.link(vec, n.inputs['Vector'])
        return n.outputs['Fac']

    def ramp(self, x, lo, hi):
        """smoothstep(lo, hi, x)"""
        n = self.node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP')
        self.link(x, n.inputs['Value'])
        n.inputs['From Min'].default_value = lo
        n.inputs['From Max'].default_value = hi
        return n.outputs['Result']

    def sep(self, vec, i):
        n = self.node('ShaderNodeSeparateXYZ')
        self.link(vec, n.inputs[0])
        return n.outputs[i]


def _jitter(K, c, scale=1.3, amount=0.14):
    """Broad hand-painted value variation."""
    v = K.noise(scale, K.coords(), detail=2.5)
    f = K.math('MULTIPLY_ADD', v, 2 * amount, 1 - amount)
    return K.scale_col(c, f)


def colour_material(key, img):
    mat = bpy.data.materials.new('bake_' + key)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    K = NodeKit(mat)
    base = K.rgb(lin(PALETTE[key]))
    c = base
    world = K.node('ShaderNodeNewGeometry')
    wz = K.sep(world.outputs['Position'], 2)
    nz = K.sep(world.outputs['Normal'], 2)

    if key.startswith('timber') or key == 'bark':
        wave = K.node('ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z')
        wave.inputs['Scale'].default_value = 2.2
        wave.inputs['Distortion'].default_value = 6.0
        wave.inputs['Detail'].default_value = 2.0
        K.link(K.coords((1, 1, 0.25)), wave.inputs['Vector'])
        dark = K.scale_col(base, 0.72)
        c = K.mix(K.math('MULTIPLY', wave.outputs['Fac'], 0.55), base, dark)
        c = _jitter(K, c, 1.6, 0.12)
    elif key in ('thatch', 'thatch_dk', 'straw', 'hedge', 'grass', 'honey', 'leaf', 'leaf_dk'):
        streak = K.noise(1.0, K.coords((16, 16, 2.5) if key not in ('grass', 'leaf', 'leaf_dk') else (1.2, 1.2, 1.2)), detail=3, rough=0.6)
        light = K.scale_col(base, 1.18)
        dark = K.scale_col(base, 0.68)
        c = K.mix(K.ramp(streak, 0.35, 0.7), dark, light)
        if key == 'grass':
            dry = K.rgb(lin((0.55, 0.52, 0.32)))
            patch = K.ramp(K.noise(0.35, K.coords(), detail=2), 0.52, 0.68)
            c = K.mix(K.math('MULTIPLY', patch, 0.55), c, dry)
        if key in ('hedge', 'leaf', 'leaf_dk'):
            lighttop = K.ramp(nz, 0.2, 0.9)
            c = K.mix(K.math('MULTIPLY', lighttop, 0.35), c, K.scale_col(base, 1.35))
    elif key in ('stone', 'stone_dk', 'old_stone'):
        vor = K.node('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE')
        vor.inputs['Scale'].default_value = 2.6
        vor.inputs['Randomness'].default_value = 0.85
        K.link(K.coords(), vor.inputs['Vector'])
        vor2 = K.node('ShaderNodeTexVoronoi', feature='F1')
        vor2.inputs['Scale'].default_value = 2.6
        vor2.inputs['Randomness'].default_value = 0.85
        K.link(K.coords(), vor2.inputs['Vector'])
        stone_var = K.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
        stone_var.inputs['Factor'].default_value = 0.22
        A, Bc = rgba_in(stone_var)
        K.link(base, A)
        K.link(vor2.outputs['Color'], Bc)
        c = K.mix(0.5, base, rgba_out(stone_var))
        joint = K.math('SUBTRACT', 1.0, K.ramp(vor.outputs['Distance'], 0.0, 0.07))
        c = K.mix(K.math('MULTIPLY', joint, 0.55), c, K.scale_col(base, 0.55))
        c = _jitter(K, c, 1.1, 0.1)
        if key == 'old_stone':
            moss = K.rgb(lin(PALETTE['moss']))
            m = K.math('MULTIPLY', K.ramp(K.noise(1.4, K.coords(), detail=4), 0.5, 0.62), K.ramp(nz, -0.1, 0.8))
            c = K.mix(K.math('MULTIPLY', m, 0.8), c, moss)
    elif key == 'plaster':
        c = _jitter(K, base, 0.9, 0.06)
        stain = K.ramp(K.noise(2.5, K.coords((1, 1, 0.3)), detail=3), 0.55, 0.75)
        c = K.mix(K.math('MULTIPLY', stain, 0.35), c, K.scale_col(base, 0.82))
    elif key == 'shingle':
        wave = K.node('ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z')
        wave.inputs['Scale'].default_value = 1.6
        wave.inputs['Distortion'].default_value = 0.6
        K.link(K.coords(), wave.inputs['Vector'])
        c = K.mix(K.math('MULTIPLY', K.ramp(wave.outputs['Fac'], 0.75, 0.95), 0.6), base, K.scale_col(base, 0.6))
        c = _jitter(K, c, 3.0, 0.12)
    elif key in ('iron', 'iron_dk'):
        rust = K.rgb(lin((0.5, 0.28, 0.14)))
        m = K.ramp(K.noise(4.0, K.coords(), detail=4), 0.45, 0.65)
        c = K.mix(K.math('MULTIPLY', m, 0.6 if key == 'iron_dk' else 0.4), base, rust)
    elif key == 'bronze':
        pat = K.rgb(lin((0.32, 0.47, 0.40)))
        m = K.ramp(K.noise(3.0, K.coords(), detail=3), 0.4, 0.7)
        c = K.mix(m, base, pat)
        c = _jitter(K, c, 2.0, 0.1)
    elif key in ('flame', 'flame_core'):
        oz = K.sep(K.coords(), 2)  # object z (Blender up) of the flame: 1.2..1.8
        top = K.rgb(lin((0.92, 0.3, 0.07)))
        if key == 'flame_core':
            c = K.mix(K.ramp(oz, 1.32, 1.8), base, K.rgb(lin(PALETTE['flame'])))
        else:
            c = K.mix(K.ramp(oz, 1.35, 1.78), base, top)
    elif key in ('white', 'white_dk', 'cloth', 'cloth_dk', 'paper', 'paper_glow'):
        c = _jitter(K, base, 1.5, 0.05)
    else:
        c = _jitter(K, base, 2.0, 0.1)

    # ground grime: the lowest half-metre of anything standing on the ground
    if key not in ('flame', 'flame_core', 'paper_glow', 'grass', 'earth', 'moss', 'water'):
        g = K.math('SUBTRACT', 1.0, K.ramp(wz, 0.0, 0.55))
        grime = K.scale_col(K.rgb(lin(PALETTE['earth'])), 0.85)
        c = K.mix(K.math('MULTIPLY', g, 0.32), c, grime)

    em = K.node('ShaderNodeEmission')
    K.link(c, em.inputs['Color'])
    out = K.node('ShaderNodeOutputMaterial')
    K.link(em.outputs[0], out.inputs['Surface'])
    tex = K.node('ShaderNodeTexImage')
    tex.image = img
    K.N.active = tex
    mat['tex'] = tex.name
    return mat


# ---------------------------------------------------------------------------
# Unwrap and pack
# ---------------------------------------------------------------------------

def texel_factor(ob):
    pid = ob['piece']
    size = max(ob.dimensions)
    f = 1.0
    if pid == 'barrow_mound':
        f = 0.5
    elif pid == 'hedgerow_4m':
        f = 0.75
    elif size < 1.0:
        f = 1.9
    elif size < 2.0:
        f = 1.45
    if ob['lod'] == 1:
        f *= 0.42
    return f


def unwrap_and_pack(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        if not ob.data.uv_layers:
            ob.data.uv_layers.new(name='UVMap')
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    arrays = {}
    for ob in objs:
        uv = ob.data.uv_layers.active.data
        a = np.empty(len(uv) * 2, np.float32)
        uv.foreach_get('uv', a)
        arrays[ob.name] = a * texel_factor(ob)
    # bring everything into the 0..1 tile first, or the packer spreads islands
    # over neighbouring UDIM tiles and they wrap onto other pieces' texels
    lo = min(float(a.min()) for a in arrays.values())
    hi = max(float(a.max()) for a in arrays.values())
    for ob in objs:
        a = (arrays[ob.name] - lo) / (hi - lo) * 0.98 + 0.01
        ob.data.uv_layers.active.data.foreach_set('uv', a)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, scale=True, margin_method='FRACTION',
                            margin=0.004, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    for ob in objs:
        uv = ob.data.uv_layers.active.data
        a = np.empty(len(uv) * 2, np.float32)
        uv.foreach_get('uv', a)
        if a.min() < 0 or a.max() > 1:
            raise RuntimeError(f'{ob.name}: UVs outside the atlas ({a.min():.3f}..{a.max():.3f})')


# ---------------------------------------------------------------------------
# Bake
# ---------------------------------------------------------------------------

def bake_atlas(objs, size, samples=64):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.render.bake.margin = 8
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.use_clear = True

    col_img = bpy.data.images.new('bake_colour', size, size, alpha=False)
    ao_img = bpy.data.images.new('bake_ao', size, size, alpha=False)
    ao_img.colorspace_settings.name = 'Non-Color'
    mats = {k: colour_material(k, col_img) for k in PALETTE_KEYS}
    for ob in objs:
        me = ob.data
        idx = np.empty(len(me.polygons), np.int32)
        me.polygons.foreach_get('material_index', idx)
        me.materials.clear()  # (Blender 5.2 resets the face indices here)
        for k in ob['keys'].split(','):
            me.materials.append(mats[k])
        me.polygons.foreach_set('material_index', idx)
    # slots first: entering edit mode clamps face material indices to the slot count
    unwrap_and_pack(objs)

    # spread the pieces out over a ground plane
    homes = {}
    cols = 10
    for i, ob in enumerate(objs):
        gx, gy = i % cols, i // cols
        lift = 30.0 if ob['pivot'] in ('top', 'hub') else 0.0
        ob.location = (gx * 25.0, gy * 25.0, lift)
        homes[ob.name] = ob.location.copy()
    bpy.ops.mesh.primitive_plane_add(size=1000, location=(110, 90, 0))
    ground = bpy.context.active_object
    ground.name = 'bake_ground'
    gm = bpy.data.materials.new('bake_ground')
    ground.data.materials.append(gm)

    if scene.world is None:
        scene.world = bpy.data.worlds.new('bake_world')
    scene.world.light_settings.distance = 1.4

    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    scene.cycles.samples = 1
    bpy.ops.object.bake(type='EMIT', margin=8)
    for m in mats.values():
        m.node_tree.nodes[m['tex']].image = ao_img
    scene.cycles.samples = samples
    bpy.ops.object.bake(type='AO', margin=8)

    c = np.empty(size * size * 4, np.float32)
    col_img.pixels.foreach_get(c)
    c = c.reshape(size, size, 4)
    ao = np.empty(size * size * 4, np.float32)
    ao_img.pixels.foreach_get(ao)
    ao = ao.reshape(size, size, 4)[..., :1]

    # per-pixel AO strength: glow pieces keep their light
    strength = np.full((size, size, 1), 0.85, np.float32)
    glow_mask = _mask(objs, size, lambda ob: ob['glow'])
    strength[glow_mask] = 0.2
    out = c.copy()
    out[..., :3] = c[..., :3] * (1 - strength + strength * np.clip(ao, 0, 1) ** 0.9)
    out[..., 3] = 1
    img = bpy.data.images.new('valley_atlas', size, size, alpha=False)
    img.pixels.foreach_set(out.ravel())
    img.pack()

    bpy.data.objects.remove(ground, do_unlink=True)
    for ob in objs:
        ob.location = (0, 0, 0)
    return img


def _mask(objs, size, pred):
    """Pixels covered by the UV triangles of the objects for which pred(ob) holds."""
    m = np.zeros((size, size), bool)
    for ob in objs:
        if not pred(ob):
            continue
        uv = ob.data.uv_layers.active.data
        for p in ob.data.polygons:
            pts = np.array([uv[li].uv for li in p.loop_indices]) * size
            x0, y0 = np.floor(pts.min(0)).astype(int) - 6
            x1, y1 = np.ceil(pts.max(0)).astype(int) + 6
            m[max(0, y0):min(size, y1), max(0, x0):min(size, x1)] = True
    return m[..., None].repeat(1, axis=2)[..., 0]
