"""Prepares weapon models that are already light enough to ship (no Blender needed): puts each in the
weapon pack's frame, shrinks its textures, writes the GLB and an inventory picture.

    python3 tools/game3d-weapons/prepare_lowpoly_weapons.py --source-dir <folder with the source GLBs> [--out public/game3d/weapons]

Frame (the pack's convention, see manifest.json): origin at the centre of the grip, +Y to the tip, +Z the
blade's edge, metres for a 1.7 m body.

  fantasy_sword   "fantasy sword 3d model.glb" (19,357 triangles as it comes). Placed so its tip is where the
                  pack manifest already says it is, so the grips solved for it there still fit.
  curved_daggers  "fantasy curved blades 3d model.glb": one file holding a pair. Split into its two blades,
                  each given its own frame, written as one GLB with the nodes DaggerRight and DaggerLeft.

Heavier sources (the odachi, the energy sword, the other bows) still need build-weapons.mjs and Blender.
Needs numpy and Pillow. Sources are only read.
"""
import argparse, io, json, os, struct, sys
import numpy as np
from PIL import Image


# ---------- GLB in and out ----------
def read_glb(path):
    data = open(path, 'rb').read()
    magic, _, length = struct.unpack_from('<4sII', data, 0)
    if magic != b'glTF': raise SystemExit(path + ' is not a GLB')
    off, doc, blob = 12, None, b''
    while off < length:
        clen, ctype = struct.unpack_from('<I4s', data, off); off += 8
        if ctype == b'JSON': doc = json.loads(data[off:off + clen])
        elif ctype == b'BIN\x00': blob = data[off:off + clen]
        off += clen
    return doc, blob


def accessor(doc, blob, index):
    a = doc['accessors'][index]; view = doc['bufferViews'][a['bufferView']]
    comp = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[a['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    arr = np.frombuffer(blob, dtype='<' + comp, count=a['count'] * width, offset=view.get('byteOffset', 0) + a.get('byteOffset', 0))
    return arr.reshape(a['count'], width) if width > 1 else arr.copy()


def load_source(path):
    doc, blob = read_glb(path)
    prim = doc['meshes'][0]['primitives'][0]
    get = lambda name: accessor(doc, blob, prim['attributes'][name]).astype(np.float64)
    images = []
    for img in doc.get('images', []):
        v = doc['bufferViews'][img['bufferView']]
        images.append(Image.open(io.BytesIO(blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])))
    return {'doc': doc, 'P': get('POSITION'), 'N': get('NORMAL'), 'UV': get('TEXCOORD_0'),
            'I': accessor(doc, blob, prim['indices']).astype(np.int64).reshape(-1, 3), 'images': images,
            'material': doc['materials'][prim.get('material', 0)]}


def write_glb(path, parts, source, base_size=2048, other_size=1024):
    """parts: [(node name, P, N, UV, I)]. One material and its textures, shared by every part."""
    doc_in = source['doc']; mat_in = source['material']
    pbr = mat_in.get('pbrMetallicRoughness', {})
    base_tex = pbr.get('baseColorTexture', {}).get('index')
    chunks, views, accessors = [], [], []
    def push(raw, target=None):
        pad = (4 - sum(len(c) for c in chunks) % 4) % 4
        if pad: chunks.append(b'\x00' * pad)
        offset = sum(len(c) for c in chunks); chunks.append(raw)
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(raw)}
        if target: view['target'] = target
        views.append(view); return len(views) - 1
    def acc(arr, kind, comp, target, bounds=False):
        a = {'bufferView': push(arr.tobytes(), target), 'componentType': comp, 'count': len(arr), 'type': kind}
        if bounds: a['min'] = [float(v) for v in arr.min(0)]; a['max'] = [float(v) for v in arr.max(0)]
        accessors.append(a); return len(accessors) - 1
    meshes, nodes = [], []
    for name, P, N, UV, I in parts:
        wide = len(P) > 65535
        prim = {'attributes': {'POSITION': acc(P.astype('<f4'), 'VEC3', 5126, 34962, True), 'NORMAL': acc(N.astype('<f4'), 'VEC3', 5126, 34962),
                               'TEXCOORD_0': acc(UV.astype('<f4'), 'VEC2', 5126, 34962)},
                'indices': acc(I.reshape(-1).astype('<u4' if wide else '<u2'), 'SCALAR', 5125 if wide else 5123, 34963), 'material': 0}
        meshes.append({'name': name, 'primitives': [prim]}); nodes.append({'name': name, 'mesh': len(meshes) - 1})
    images = []
    for index, image in enumerate(source['images']):
        is_base = base_tex is not None and doc_in['textures'][base_tex]['source'] == index
        cap = base_size if is_base else other_size
        image = image.convert('RGB')
        if max(image.size) > cap: image = image.resize((cap, cap), Image.LANCZOS)
        raw = io.BytesIO(); image.save(raw, 'JPEG', quality=88 if is_base else 90, optimize=True)
        images.append({'bufferView': push(raw.getvalue()), 'mimeType': 'image/jpeg'})
    material = {k: v for k, v in mat_in.items() if k != 'extensions'}
    doc = {'asset': {'version': '2.0', 'generator': 'fallen-sky tools/game3d-weapons/prepare_lowpoly_weapons.py'},
           'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes, 'materials': [material],
           'textures': doc_in.get('textures', []), 'images': images, 'samplers': doc_in.get('samplers', []),
           'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': sum(len(c) for c in chunks)}]}
    if not doc['samplers']: del doc['samplers']
    blob = b''.join(chunks); blob += b'\x00' * ((4 - len(blob) % 4) % 4)
    text = json.dumps(doc, separators=(',', ':')).encode(); text += b' ' * ((4 - len(text) % 4) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 28 + len(text) + len(blob)))
        f.write(struct.pack('<I4s', len(text), b'JSON') + text + struct.pack('<I4s', len(blob), b'BIN\x00') + blob)
    return os.path.getsize(path)


# ---------- a picture of a mesh (inventory icons, and checking the work by eye) ----------
def render(P, I, UV, tex, view, size=256, pad=0.05, bg=(0, 0, 0, 0), light=(0.35, 0.75, 0.55)):
    """Orthographic, z-buffered. view rows: image right, image up, towards the viewer."""
    V = P @ np.asarray(view, dtype=float).T
    lo, hi = V[:, :2].min(0), V[:, :2].max(0)
    span = (hi - lo).max() * (1 + 2 * pad); c = (lo + hi) / 2
    S = np.column_stack([(V[:, 0] - c[0]) / span * size + size / 2, size / 2 - (V[:, 1] - c[1]) / span * size, V[:, 2]])
    img = np.zeros((size, size, 4), np.uint8); img[:] = bg
    zbuf = np.full((size, size), -1e9)
    T = np.asarray(tex.convert('RGB').resize((512, 512)), dtype=np.float64) if tex is not None else None
    L = np.asarray(light, dtype=float); L /= np.linalg.norm(L)
    nrm = np.cross(V[I[:, 1]] - V[I[:, 0]], V[I[:, 2]] - V[I[:, 0]])
    shade = 0.5 + 0.5 * np.abs(nrm / np.maximum(np.linalg.norm(nrm, axis=1), 1e-12)[:, None] @ L)
    for k, (a, b, c3) in enumerate(S[I]):
        xa, xb = int(max(0, np.floor(min(a[0], b[0], c3[0])))), int(min(size - 1, np.ceil(max(a[0], b[0], c3[0]))))
        ya, yb = int(max(0, np.floor(min(a[1], b[1], c3[1])))), int(min(size - 1, np.ceil(max(a[1], b[1], c3[1]))))
        den = (b[1] - c3[1]) * (a[0] - c3[0]) + (c3[0] - b[0]) * (a[1] - c3[1])
        if xa > xb or ya > yb or abs(den) < 1e-12: continue
        xs, ys = np.meshgrid(np.arange(xa, xb + 1) + 0.5, np.arange(ya, yb + 1) + 0.5)
        w0 = ((b[1] - c3[1]) * (xs - c3[0]) + (c3[0] - b[0]) * (ys - c3[1])) / den
        w1 = ((c3[1] - a[1]) * (xs - c3[0]) + (a[0] - c3[0]) * (ys - c3[1])) / den
        w2 = 1 - w0 - w1
        z = w0 * a[2] + w1 * b[2] + w2 * c3[2]
        sub = zbuf[ya:yb + 1, xa:xb + 1]
        hit = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6) & (z > sub)
        if not hit.any(): continue
        sub[hit] = z[hit]
        if T is not None:
            uv = w0[..., None] * UV[I[k, 0]] + w1[..., None] * UV[I[k, 1]] + w2[..., None] * UV[I[k, 2]]
            col = T[np.clip((uv[..., 1] % 1.0) * 511, 0, 511).astype(int), np.clip((uv[..., 0] % 1.0) * 511, 0, 511).astype(int)] * shade[k]
        else:
            col = np.full(w0.shape + (3,), 190.0) * shade[k]
        px = img[ya:yb + 1, xa:xb + 1]
        px[hit, :3] = np.clip(col[hit], 0, 255).astype(np.uint8); px[hit, 3] = 255
    return Image.fromarray(img, 'RGBA')


def icon(P, I, UV, tex, view, path, size=256):
    """Rendered at four times the size and shrunk, so edges are smooth."""
    render(P, I, UV, tex, view, size=size * 4).resize((size, size), Image.LANCZOS).save(path, optimize=True)


def base_color(source):
    tex = source['material'].get('pbrMetallicRoughness', {}).get('baseColorTexture')
    return source['images'][source['doc']['textures'][tex['index']]['source']] if tex else None


# ---------- the sword: the frame the manifest already describes ----------
def prepare_sword(source, manifest_weapon):
    # tip towards -Y and edge along +X in the source (weapons.config.json: tipHint [0,-1,0], edgeHint [1,0,0])
    R = np.array([[0, 0, 1], [0, -1, 0], [1, 0, 0]], dtype=float)   # rows: where the frame's X, Y, Z lie in the source
    P = source['P'] @ R.T; N = source['N'] @ R.T
    P *= manifest_weapon['length'] / (P[:, 1].max() - P[:, 1].min())
    tip = manifest_weapon['points']['tip']
    P[:, 1] += tip[1] - P[:, 1].max()                    # the tip as far above the grip as the manifest says
    grip = P[np.abs(P[:, 1]) < 0.01]                     # the handle where the hand holds it
    P[:, 0] -= (grip[:, 0].min() + grip[:, 0].max()) / 2; P[:, 2] -= (grip[:, 2].min() + grip[:, 2].max()) / 2
    top = P[P[:, 1] > P[:, 1].max() - 0.002].mean(0)
    radius = float(np.hypot(grip[:, 0], grip[:, 2]).mean())
    return P, N, {'tip': [round(float(v), 4) for v in top], 'pommel': round(float(P[:, 1].min()), 4), 'handleRadius': round(radius, 4)}


# ---------- the dagger pair ----------
def components(I, count):
    parent = np.arange(count)
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for a, b, c in I:
        ra, rb, rc = find(a), find(b), find(c)
        parent[rb] = ra; parent[rc] = ra
    return np.array([find(i) for i in range(count)])


def weld_labels(P, I):
    """Connected pieces, joining vertices that sit at the same place (a mesh is split along its texture seams)."""
    key = np.round(P / 1e-5).astype(np.int64)
    _, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    labels = components(inverse.reshape(-1)[I], len(first))
    return labels[inverse.reshape(-1)]


def prepare_dagger(P, N, grip_to_tip=0.38, report=None):
    """One dagger's vertices -> the weapon frame. Finds the handle (round) and the blade (flat) along its length."""
    c = P.mean(0); Q = P - c
    _, _, axes = np.linalg.svd(Q, full_matrices=False)
    u, v, w = axes                                       # long, across the blade, through the blade
    t = Q @ u
    edges = np.linspace(t.min(), t.max(), 33)
    round_, centre, width = [], [], []
    for a, b in zip(edges, edges[1:]):
        s = Q[(t >= a) & (t <= b)]
        ev, ew = np.ptp(s @ v) + 1e-9, np.ptp(s @ w) + 1e-9
        round_.append(min(ev, ew) / max(ev, ew)); centre.append(s.mean(0)); width.append(max(ev, ew))
    round_, width, centre = np.array(round_), np.array(width), np.array(centre)
    # the handle end is the rounder half; the blade end is flat and runs out to a point
    handle_first = round_[:10].mean() > round_[-10:].mean()
    if not handle_first:
        u, t, edges = -u, -t, -edges[::-1]; round_, width, centre = round_[::-1], width[::-1], centre[::-1]
    # the grip: the run of slender, round slabs before the guard flares out
    slender = np.median(width[:12]) * 1.35
    run = [i for i in range(1, 16) if width[i] <= slender]
    grip_slabs = [i for i in run if i - run[0] == run.index(i)] or run   # the first unbroken run
    a, b = grip_slabs[0], grip_slabs[-1]
    # the handle's own axis: the long direction of the grip's vertices (steadier than joining two slab centres)
    in_grip = (t >= edges[a]) & (t <= edges[b + 1])
    _, _, grip_axes = np.linalg.svd(Q[in_grip] - Q[in_grip].mean(0), full_matrices=False)
    Y = grip_axes[0] if grip_axes[0] @ u > 0 else -grip_axes[0]
    origin = Q[in_grip].mean(0)
    origin = origin + (((centre[a] + centre[b]) / 2 - origin) @ Y) * Y   # halfway along the grip, on its axis
    tip_point = Q[np.argmax(t)]
    off = (tip_point - origin) - ((tip_point - origin) @ Y) * Y
    Z = -off / np.linalg.norm(off)                       # a curved blade cuts with its outer curve: the point sweeps back from the edge
    X = np.cross(Y, Z)
    R = np.stack([X, Y, Z])
    out = (Q - origin) @ R.T
    scale = grip_to_tip / out[np.argmax(t), 1]
    out *= scale
    grip = out[np.abs(out[:, 1]) < 0.012]
    meta = {'tip': [round(float(x), 4) for x in out[np.argmax(t)]], 'pommel': round(float(out[:, 1].min()), 4),
            'handleRadius': round(float(np.hypot(grip[:, 0], grip[:, 2]).mean()), 4),
            'gripLength': round(float((edges[b + 1] - edges[a]) * scale), 4), 'length': round(float(np.ptp(out[:, 1])), 4)}
    if report is not None:
        report.append('  roundness along the length (handle first): ' + ' '.join('%.1f' % r for r in round_))
        report.append('  width (cm):                                ' + ' '.join('%.0f' % (x * scale * 100) for x in width))
        report.append('  grip slabs %d..%d  %s' % (a, b, meta))
    return out, N @ R.T, meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source-dir', required=True); ap.add_argument('--out', default='public/game3d/weapons')
    args = ap.parse_args()
    os.makedirs(os.path.join(args.out, 'icons'), exist_ok=True)
    manifest = json.load(open(os.path.join(args.out, 'manifest.json'), encoding='utf-8'))
    result = {}

    sword = load_source(os.path.join(args.source_dir, 'fantasy sword 3d model.glb'))
    entry = next(w for w in manifest['weapons'] if w['id'] == 'fantasy_sword')
    P, N, meta = prepare_sword(sword, entry)
    size = write_glb(os.path.join(args.out, 'fantasy_sword.glb'), [('fantasy_sword', P, N, sword['UV'], sword['I'])], sword)
    # the picture: blade up and leaning, seen from its flat side
    lean = np.radians(40); view = [[0, np.sin(lean), np.cos(lean)], [0, np.cos(lean), -np.sin(lean)], [1, 0, 0]]
    icon(P, sword['I'], sword['UV'], base_color(sword), view, os.path.join(args.out, 'icons', 'fantasy_sword.png'))
    result['fantasy_sword'] = dict(meta, bytes=size, tris=len(sword['I']), manifestTip=entry['points']['tip'])
    print('fantasy_sword', json.dumps(result['fantasy_sword']))

    pair = load_source(os.path.join(args.source_dir, 'fantasy curved blades 3d model.glb'))
    labels = weld_labels(pair['P'], pair['I'])
    ids, counts = np.unique(labels, return_counts=True)
    big = ids[np.argsort(-counts)][:2]
    print('curved blades: pieces', len(ids), 'largest', sorted(counts.tolist())[-4:])
    parts, metas, report = [], {}, []
    # every small loose piece (a spike, a gem) goes with the dagger it is nearest to
    centres = [pair['P'][labels == b].mean(0) for b in big]
    owner = np.array([int(np.argmin([np.linalg.norm(pair['P'][labels == l].mean(0) - c) for c in centres])) for l in ids])
    owner_of = dict(zip(ids.tolist(), owner.tolist()))
    vert_owner = np.array([owner_of[l] for l in labels.tolist()])
    order = np.argsort([c[0] for c in centres])          # lower x first
    for name, which in zip(('DaggerLeft', 'DaggerRight'), order):
        mask = vert_owner == which
        remap = -np.ones(len(mask), dtype=np.int64); remap[mask] = np.arange(mask.sum())
        tris = pair['I'][mask[pair['I']].all(1)]
        report.append(name)
        P, N, meta = prepare_dagger(pair['P'][mask], pair['N'][mask], report=report)
        parts.append((name, P, N, pair['UV'][mask], remap[tris])); metas[name] = dict(meta, tris=len(tris))
    print('\n'.join(report))
    size = write_glb(os.path.join(args.out, 'curved_daggers.glb'), parts, pair, base_size=1024, other_size=512)
    # the picture: the pair as the artist laid them out, crossed
    icon(pair['P'], pair['I'], pair['UV'], base_color(pair), [[1, 0, 0], [0, 1, 0], [0, 0, 1]], os.path.join(args.out, 'icons', 'curved_daggers.png'))
    result['curved_daggers'] = dict(metas, bytes=size)
    print('curved_daggers', json.dumps(result['curved_daggers']))
    # the pack bow that is already here only needs its picture: side on, leaning
    bow = load_source(os.path.join(args.out, 'violet_bow.glb'))
    lean = np.radians(28)
    icon(bow['P'], bow['I'], bow['UV'], base_color(bow), [[0, np.sin(lean), np.cos(lean)], [0, np.cos(lean), -np.sin(lean)], [1, 0, 0]],
         os.path.join(args.out, 'icons', 'violet_bow.png'))
    json.dump(result, open(os.path.join(args.out, 'lowpoly-weapons.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
