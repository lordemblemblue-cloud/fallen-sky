"""Turn a Rokoko video capture (FBX, "Newton" skeleton) into sword moves the game can bake on any body.

The game does not play these captures bone for bone: its combo baker (weaponComboClips.js) poses each body
from keys written in body space and solves the hands onto the held weapon's own grip. This tool reads the
capture, measures the same things the baker is keyed with (hips, spine, wrists, elbows, feet, knees and the
line of the blade through the two hands) and writes them as keys, so a captured cut fits every body and
every sword, with both hands on the hilt.

  python3 sword_moves_from_capture.py strokes <capture.fbx>
      list the fast hand movements in a capture: where each stroke starts, lands and ends

  python3 sword_moves_from_capture.py moves <cuts.json> --captures <folder> --out <moves.mjs>
      write the moves named in cuts.json (see katana-cuts.json) as a generated JS data module

Needs numpy. Reads the captures only; never writes next to them.
"""
import sys, os, json, math, argparse
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fbx_skeleton_take import load, world

BODY_HEAD_METRES = 1.55      # the baker's scale: head bone 1.55 m above the ground for a 1.7 m body
TWO_HANDED_CM = 24.0         # hands closer than this hold one hilt
KEY_EVERY = 2                # frames between keys (30 fps capture -> 15 keys a second)


def smooth(x, passes=1):
    """1-2-1 smoothing along time, ends kept."""
    x = np.array(x, dtype=float)
    for _ in range(passes):
        y = x.copy(); y[1:-1] = (x[:-2] + 2 * x[1:-1] + x[2:]) / 4; x = y
    return x


def unit(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-9)


class Capture:
    def __init__(self, path):
        a = load(path)
        self.fps = a['fps']; self.times = a['times']; self.names = a['names']
        self.ix = {n: i for i, n in enumerate(a['names'])}
        self.wr, self.wp = world(a['parents'], a['local_r'], a['local_t'])
        self.rest_wr, self.rest_wp = world(a['parents'], a['rest_r'][None], a['rest_t'][None])
        need = ['Hips', 'Spine4', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand',
                'RightThigh', 'RightShin', 'RightFoot', 'RightToe', 'LeftThigh', 'LeftShin', 'LeftFoot', 'LeftToe']
        missing = [n for n in need if n not in self.ix]
        if missing:
            raise SystemExit('not a Rokoko Newton skeleton, missing: ' + ', '.join(missing))
        rp = self.rest_wp[0]
        self.rest_head = rp[self.ix['Head'], 1]; self.rest_hips = rp[self.ix['Hips'], 1]
        self.rest_ankle = (rp[self.ix['LeftFoot'], 1] + rp[self.ix['RightFoot'], 1]) / 2
        # centimetres of this skeleton -> metres of the baker's 1.7 m body
        self.scale = BODY_HEAD_METRES / (self.rest_head - 0.0)
        arm = lambda s: np.linalg.norm(rp[self.ix[s + 'ForeArm']] - rp[self.ix[s + 'Arm']]) + np.linalg.norm(rp[self.ix[s + 'Hand']] - rp[self.ix[s + 'ForeArm']])
        self.arm_length = (arm('Left') + arm('Right')) / 2 * self.scale
        low = np.minimum(self.p('LeftFoot')[:, 1], self.p('RightFoot')[:, 1])
        self.ground_ankle = float(np.median(low[1:]))   # frame 0 is the T-pose

    def p(self, name):
        return self.wp[:, self.ix[name]]

    def delta(self, name):
        """World rotation of a bone away from its rest pose."""
        i = self.ix[name]
        return self.wr[:, i] @ np.linalg.inv(self.rest_wr[0, i])

    def yaw(self, name):
        f = self.delta(name) @ np.array([0.0, 0.0, 1.0])
        return np.degrees(np.unwrap(np.arctan2(f[:, 0], f[:, 2])))

    def frame(self, t):
        return int(min(len(self.times) - 1, max(1, round(t * self.fps))))

    def hand_speed(self):
        out = []
        for side in ('Right', 'Left'):
            v = np.gradient(smooth(self.p(side + 'Hand'), 2), 1 / self.fps, axis=0)
            out.append(np.linalg.norm(v, axis=1) / 100.0)
        return np.maximum(*out)


def list_strokes(path):
    c = Capture(path); s = c.hand_speed(); t = c.times
    peaks = [i for i in range(2, len(s) - 2) if s[i] >= 2.8 and s[i] == s[max(0, i - 5):i + 6].max()]
    valleys = [1] + [i for i in range(2, len(s) - 2) if s[i] == s[max(0, i - 3):i + 4].min() and s[i] < 2.2] + [len(s) - 1]
    gap = np.linalg.norm(c.p('RightHand') - c.p('LeftHand'), axis=1)
    mid = (c.p('RightHand') + c.p('LeftHand')) / 2
    pelvis = c.yaw('Hips'); hips = c.p('Hips')
    print('%s: %.2f s, %d frames at %g a second; frame 0 is the T-pose' % (os.path.basename(path), t[-1], len(t), c.fps))
    print('stroke | start   hit    end | peak m/s | hands height start > end cm | hips height | turn start > end | hands apart cm')
    for n, pk in enumerate(peaks):
        a = max(v for v in valleys if v < pk); b = min(v for v in valleys if v > pk)
        print('%5d  | %5.2f %5.2f %5.2f | %7.1f | %5.0f > %-5.0f              | %3.0f > %-3.0f   | %5.0f > %-5.0f    | %4.0f' % (
            n + 1, t[a], t[pk], t[b], s[pk], mid[a, 1], mid[b, 1], hips[a, 1], hips[b, 1], pelvis[a], pelvis[b], gap[pk]))


def rot_axis(axis, deg):
    a = np.radians(deg); x, y, z = unit(np.array(axis, dtype=float)); c, s = math.cos(a), math.sin(a); C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


def root_of(m, n):
    """The rotation that applied n times gives m."""
    angle = math.acos(max(-1.0, min(1.0, (np.trace(m) - 1) / 2)))
    if angle < 1e-8:
        return np.eye(3)
    axis = np.array([m[2, 1] - m[1, 2], m[0, 2] - m[2, 0], m[1, 0] - m[0, 1]]) / (2 * math.sin(angle))
    return rot_axis(axis, math.degrees(angle) / n)


def spine_angles(m, F, U, R, bones=3):
    """Twist / bend / lean (the baker's spine key) whose per-bone turns, applied to `bones` spine bones,
    add up to the world rotation m. The baker turns each bone about U, then R, then F."""
    a = root_of(m, bones)
    B = np.stack([R, U, F], 1)             # columns: body axes in the capture's world
    l = B.T @ a @ B                        # the per-bone turn in body axes (x = R, y = U, z = F)
    # l = Rz(lean) * Rx(-bend) * Ry(-twist)
    rx = math.asin(max(-1.0, min(1.0, l[2, 1])))
    rz = math.atan2(-l[0, 1], l[1, 1]); ry = math.atan2(-l[2, 0], l[2, 2])
    return [-math.degrees(ry) * bones, -math.degrees(rx) * bones, math.degrees(rz) * bones]


def extract(c, spec, facing, origin):
    """Keys for one move, in the baker's format. facing: degrees about up in the capture; origin: (x, z) cm."""
    yawF = math.radians(facing)
    F = np.array([math.sin(yawF), 0.0, math.cos(yawF)]); U = np.array([0.0, 1.0, 0.0]); R = np.cross(F, U)
    s = c.scale
    def body(v):     # capture vector (cm) -> [forward, up, right] in body metres
        return [float(v @ F * s), float(v @ U * s), float(v @ R * s)]
    f0, f1 = c.frame(spec['start']), c.frame(spec['end'])
    frames = sorted(set(list(range(f0, f1, KEY_EVERY)) + [f1]))
    pelvis_yaw = c.yaw('Hips'); chest = c.delta('Spine4'); chest_yaw = c.yaw('Spine4'); head_yaw = c.yaw('Head')
    rh, lh = smooth(c.p('RightHand'), 1), smooth(c.p('LeftHand'), 1)
    line = unit(smooth(rh - lh, 2))                    # from the lower hand to the hand under the guard
    chest_p = c.p('Spine4')
    keys = []
    for f in frames:
        key = {'t': round((f - f0) / c.fps, 4)}
        hips = c.p('Hips')[f]
        twist = -((pelvis_yaw[f] - facing + 180) % 360 - 180)
        off = np.array([hips[0] - origin[0], 0.0, hips[2] - origin[1]])
        key['hips'] = [round((c.rest_hips + (c.ground_ankle - c.rest_ankle) - hips[1]) * s, 3), round(twist, 1),
                       round(float(off @ F * s), 3), round(float(off @ R * s), 3)]
        key['spine'] = [round(v, 1) for v in spine_angles(chest[f] @ np.linalg.inv(rot_axis(U, pelvis_yaw[f])), F, U, R)]
        key['look'] = round(float(max(-75.0, min(75.0, -((head_yaw[f] - chest_yaw[f] + 180) % 360 - 180)))), 0)
        two = np.linalg.norm(rh[f] - lh[f]) <= TWO_HANDED_CM
        for side, S, hand, sign in (('r', 'Right', rh, 1), ('l', 'Left', lh, -1)):
            shoulder = c.p(S + 'Arm')[f]; elbow = c.p(S + 'ForeArm')[f]
            arm = body(hand[f] - shoulder); pole = body(unit(elbow - (shoulder + hand[f]) / 2) * 60 + (elbow - shoulder))
            arm[2] *= sign; pole[2] *= sign
            out = {'pole': [round(v, 2) for v in pole]}
            if side == 'l' and two:
                out['hilt'] = round(float(min(0.2, max(0.1, np.linalg.norm(rh[f] - lh[f]) * s))), 3)
            else:
                out['arm'] = [round(v, 3) for v in arm]
            if side == 'r':
                # the blade: the line through both hands while they share the hilt, pulled a little towards
                # straight out from the chest (a wrist is only tracked to a couple of centimetres)
                reach = unit(hand[f] - chest_p[f])
                blade = unit(line[f] * 0.75 + reach * 0.25) if two else reach
                out['blade'] = [round(v, 3) for v in (float(blade @ F), float(blade @ U), float(blade @ R))]
            key[side] = out
        feet = {}
        for side, S in (('l', 'Left'), ('r', 'Right')):
            ankle = c.p(S + 'Foot')[f]; toe = c.p(S + 'Toe')[f]; knee = c.p(S + 'Shin')[f]; hip = c.p(S + 'Thigh')[f]
            rel = np.array([ankle[0] - origin[0], 0.0, ankle[2] - origin[1]])
            d = toe - ankle; toe_yaw = math.degrees(math.atan2(d[0], d[2]))
            turn = -((toe_yaw - facing + 180) % 360 - 180)
            lift = max(0.0, (ankle[1] - c.ground_ankle - 2.0) * s)
            bend = unit(knee - (hip + ankle) / 2)
            pole = body((knee - hips) + bend * 70)
            feet[side] = [round(float(rel @ F * s), 3), round(float(rel @ R * s), 3), round(turn, 0), round(lift, 3), [round(v, 2) for v in pole]]
        key['feet'] = feet
        keys.append(key)
    hit = round((c.frame(spec['hit']) - f0) / c.fps, 4)
    duration = keys[-1]['t']
    sweep = spec.get('sweep') or [spec['hit'] - 0.13, spec['hit'] + 0.1]
    return {
        'id': spec['id'], 'name': spec['name'], 'source': {'capture': spec['capture'], 'seconds': [spec['start'], spec['end']]},
        'hit': hit, 'sweep': [round(max(0.0, sweep[0] - spec['start']), 3), round(min(duration, sweep[1] - spec['start']), 3)],
        'cancel': round(min(duration, max(hit + 0.08, duration - spec.get('recover', 0.06))), 3),
        'ease': 'linear', 'steps': 2, 'armLength': round(c.arm_length, 3), 'keys': keys,
    }


def write_moves(cuts_path, captures_dir, out_path):
    cuts = json.load(open(cuts_path))
    cache = {}; moves = []
    for group in cuts['groups']:
        path = os.path.join(captures_dir, group['capture'])
        if path not in cache:
            cache[path] = Capture(path)
        c = cache[path]
        f = c.frame(group['origin'])
        origin = (c.p('Hips')[f, 0], c.p('Hips')[f, 2])
        for spec in group['moves']:
            spec = dict(spec, capture=group['capture'])
            moves.append(extract(c, spec, group['facing'], origin))
    body = json.dumps(moves, separators=(',', ':'))
    with open(out_path, 'w') as fh:
        fh.write('// Generated by tools/game3d-mocap/sword_moves_from_capture.py from the cut list katana-cuts.json.\n')
        fh.write('// Do not edit by hand: change the cut list and run the tool again (tools/game3d-mocap/README.md).\n')
        fh.write('// Sword moves measured from the owner\'s Rokoko captures, in the combo baker\'s key format.\n')
        fh.write('export const KATANA_CAPTURED_MOVES = Object.freeze(JSON.parse(%s));\n' % json.dumps(body))
    print('wrote', out_path, len(moves), 'moves,', sum(len(m['keys']) for m in moves), 'keys,', os.path.getsize(out_path), 'bytes')
    return moves


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    a = sub.add_parser('strokes'); a.add_argument('capture')
    b = sub.add_parser('moves'); b.add_argument('cuts'); b.add_argument('--captures', required=True); b.add_argument('--out', required=True)
    args = ap.parse_args()
    if args.cmd == 'strokes':
        list_strokes(args.capture)
    else:
        write_moves(args.cuts, args.captures, args.out)
