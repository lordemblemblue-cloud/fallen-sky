"""Read a skeleton and its one animation take from a binary FBX into numpy arrays.

Returns per-bone local rotation (as 3x3 matrices) and translation for each frame,
with FBX pre-rotation and rotation order applied, plus world matrices from forward
kinematics. Read-only; knows only what a Rokoko or Mixamo export needs.
"""
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fbx_read import read_fbx

KTIME = 46186158000  # FBX time units per second


def euler_matrix(deg, order='XYZ'):
    """FBX euler: order 'XYZ' means R = Rz * Ry * Rx (X applied first)."""
    x, y, z = np.radians(deg[..., 0]), np.radians(deg[..., 1]), np.radians(deg[..., 2])
    def rx(a):
        c, s = np.cos(a), np.sin(a); o = np.ones_like(a); n = np.zeros_like(a)
        return np.stack([np.stack([o, n, n], -1), np.stack([n, c, -s], -1), np.stack([n, s, c], -1)], -2)
    def ry(a):
        c, s = np.cos(a), np.sin(a); o = np.ones_like(a); n = np.zeros_like(a)
        return np.stack([np.stack([c, n, s], -1), np.stack([n, o, n], -1), np.stack([-s, n, c], -1)], -2)
    def rz(a):
        c, s = np.cos(a), np.sin(a); o = np.ones_like(a); n = np.zeros_like(a)
        return np.stack([np.stack([c, -s, n], -1), np.stack([s, c, n], -1), np.stack([n, n, o], -1)], -2)
    m = {'X': rx(x), 'Y': ry(y), 'Z': rz(z)}
    out = m[order[0]]
    for axis in order[1:]:
        out = m[axis] @ out
    return out

ORDERS = ['XYZ', 'XZY', 'YZX', 'YXZ', 'ZXY', 'ZYX']


def props70(node):
    out = {}
    p = node.first('Properties70')
    if p:
        for c in p.find('P'):
            out[c.props[0]] = c.props[4:]
    return out


def load(path, fps=30.0):
    version, root = read_fbx(path)
    objects = root.first('Objects')
    conns = root.first('Connections')
    settings = props70(root.first('GlobalSettings'))

    models = {}
    for m in objects.find('Model'):
        uid = m.props[0]
        name = m.props[1].split('\x00')[0]
        kind = m.props[2]
        models[uid] = {'name': name, 'kind': kind, 'props': props70(m), 'parent': None}
    curve_nodes = {n.props[0]: {'name': n.props[1].split('\x00')[0], 'props': props70(n), 'curves': {}}
                   for n in objects.find('AnimationCurveNode')}
    curves = {}
    for c in objects.find('AnimationCurve'):
        times = np.array(c.first('KeyTime').props[0], dtype=np.float64) / KTIME
        values = np.array(c.first('KeyValueFloat').props[0], dtype=np.float64)
        curves[c.props[0]] = (times, values)

    node_target = {}
    for c in conns.find('C'):
        kind, child, parent = c.props[0], c.props[1], c.props[2]
        if kind == 'OO' and child in models and parent in models:
            models[child]['parent'] = parent
        elif kind == 'OP' and child in curve_nodes and parent in models:
            node_target[child] = (parent, c.props[3])
        elif kind == 'OP' and child in curves and parent in curve_nodes:
            curve_nodes[parent]['curves'][c.props[3]] = curves[child]

    # order bones parents-first
    order, seen = [], set()
    def visit(uid):
        if uid in seen: return
        p = models[uid]['parent']
        if p is not None: visit(p)
        seen.add(uid); order.append(uid)
    for uid in models: visit(uid)
    index = {uid: i for i, uid in enumerate(order)}
    names = [models[u]['name'] for u in order]
    parents = [index[models[u]['parent']] if models[u]['parent'] is not None else -1 for u in order]

    end = max((t[-1] for t, _ in curves.values() if len(t)), default=0.0)
    frames = int(round(end * fps)) + 1
    times = np.arange(frames) / fps

    n = len(order)
    lt = np.zeros((frames, n, 3)); lr_deg = np.zeros((frames, n, 3)); ls = np.ones((frames, n, 3))
    pre = np.tile(np.eye(3), (n, 1, 1)); post = np.tile(np.eye(3), (n, 1, 1))
    rot_order = ['XYZ'] * n
    animated = np.zeros(n, dtype=bool)
    for uid in order:
        i = index[uid]; p = models[uid]['props']
        lt[:, i] = p.get('Lcl Translation', [0, 0, 0])[:3]
        lr_deg[:, i] = p.get('Lcl Rotation', [0, 0, 0])[:3]
        ls[:, i] = p.get('Lcl Scaling', [1, 1, 1])[:3]
        if 'PreRotation' in p:
            pre[i] = euler_matrix(np.array(p['PreRotation'][:3], dtype=float))
        if 'PostRotation' in p:
            post[i] = euler_matrix(np.array(p['PostRotation'][:3], dtype=float))
        if 'RotationOrder' in p:
            rot_order[i] = ORDERS[int(p['RotationOrder'][0])] if int(p['RotationOrder'][0]) < 6 else 'XYZ'
    rest_t = lt[0].copy(); rest_deg = lr_deg[0].copy()

    for nid, (uid, prop) in node_target.items():
        i = index[uid]
        target = {'Lcl Translation': lt, 'Lcl Rotation': lr_deg, 'Lcl Scaling': ls}.get(prop)
        if target is None: continue
        for axis, (ct, cv) in curve_nodes[nid]['curves'].items():
            k = {'d|X': 0, 'd|Y': 1, 'd|Z': 2}.get(axis)
            if k is None or not len(ct): continue
            target[:, i, k] = np.interp(times, ct, cv)
            if prop == 'Lcl Rotation': animated[i] = True

    # euler curves can jump by 360 between keys; unwrap is not needed for sampling at keys
    lr = np.zeros((frames, n, 3, 3)); rest_r = np.zeros((n, 3, 3))
    for i in range(n):
        lr[:, i] = pre[i] @ euler_matrix(lr_deg[:, i], rot_order[i]) @ np.linalg.inv(post[i])
        rest_r[i] = pre[i] @ euler_matrix(rest_deg[i][None], rot_order[i])[0] @ np.linalg.inv(post[i])

    return {
        'version': version, 'names': names, 'parents': parents, 'times': times, 'fps': fps,
        'local_t': lt, 'local_r': lr, 'local_s': ls, 'rest_t': rest_t, 'rest_r': rest_r,
        'animated': animated, 'settings': settings, 'kinds': [models[u]['kind'] for u in order],
        'pre': pre,
    }


def world(parents, local_r, local_t):
    """Forward kinematics. local_r (F,N,3,3), local_t (F,N,3) -> world rotation and position."""
    wr = np.zeros_like(local_r); wp = np.zeros_like(local_t)
    for i, p in enumerate(parents):
        if p < 0:
            wr[:, i] = local_r[:, i]; wp[:, i] = local_t[:, i]
        else:
            wr[:, i] = wr[:, p] @ local_r[:, i]
            wp[:, i] = wp[:, p] + np.einsum('fij,fj->fi', wr[:, p], local_t[:, i])
    return wr, wp


if __name__ == '__main__':
    a = load(sys.argv[1])
    print('fbx', a['version'], 'frames', len(a['times']), 'bones', len(a['names']))
    print({k: v for k, v in a['settings'].items() if k in ('UpAxis', 'UpAxisSign', 'FrontAxis', 'FrontAxisSign', 'CoordAxis', 'CoordAxisSign', 'UnitScaleFactor', 'TimeMode', 'CustomFrameRate')})
    wr, wp = world(a['parents'], a['rest_r'][None], a['rest_t'][None])
    for i, nm in enumerate(a['names']):
        par = a['names'][a['parents'][i]] if a['parents'][i] >= 0 else '-'
        print('%-22s parent %-18s kind %-9s anim %d rest world %s' % (nm, par, a['kinds'][i], a['animated'][i], np.round(wp[0, i], 1)))
