"""Atlas for the valley kit: flat swatches (fast pass) or the baked atlas."""
import numpy as np

import bpy

from kitlib import PALETTE, PALETTE_KEYS

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


def bake_atlas(objs, size, samples=64):
    raise NotImplementedError('the baked atlas comes in the third pass')
