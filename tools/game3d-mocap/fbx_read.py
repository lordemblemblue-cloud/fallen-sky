"""Minimal binary FBX reader: the node tree, with arrays decoded. Read-only."""
import struct, zlib, sys

class Node:
    __slots__ = ('name', 'props', 'children')
    def __init__(self, name, props, children):
        self.name, self.props, self.children = name, props, children
    def find(self, name):
        return [c for c in self.children if c.name == name]
    def first(self, name):
        for c in self.children:
            if c.name == name:
                return c
        return None

def read_fbx(path):
    data = open(path, 'rb').read()
    if data[:20] != b'Kaydara FBX Binary  ':
        raise ValueError('not a binary FBX')
    version = struct.unpack_from('<I', data, 23)[0]
    wide = version >= 7500
    head = '<QQQB' if wide else '<IIIB'
    head_size = struct.calcsize(head)
    null = 25 if wide else 13

    def prop(off):
        t = chr(data[off]); off += 1
        if t == 'Y': return struct.unpack_from('<h', data, off)[0], off + 2
        if t == 'C': return bool(data[off]), off + 1
        if t == 'I': return struct.unpack_from('<i', data, off)[0], off + 4
        if t == 'F': return struct.unpack_from('<f', data, off)[0], off + 4
        if t == 'D': return struct.unpack_from('<d', data, off)[0], off + 8
        if t == 'L': return struct.unpack_from('<q', data, off)[0], off + 8
        if t in 'fdlib':
            n, enc, clen = struct.unpack_from('<III', data, off); off += 12
            raw = data[off:off + clen]; off += clen
            if enc == 1: raw = zlib.decompress(raw)
            fmt = {'f': 'f', 'd': 'd', 'l': 'q', 'i': 'i', 'b': 'b'}[t]
            return list(struct.unpack('<%d%s' % (n, fmt), raw)), off
        if t in 'SR':
            n = struct.unpack_from('<I', data, off)[0]; off += 4
            raw = data[off:off + n]; off += n
            return (raw.decode('utf-8', 'replace') if t == 'S' else raw), off
        raise ValueError('unknown property type ' + t)

    def node(off):
        end, count, plen, nlen = struct.unpack_from(head, data, off)
        if end == 0:
            return None, off + null
        off += head_size
        name = data[off:off + nlen].decode('ascii', 'replace'); off += nlen
        props = []
        for _ in range(count):
            p, off = prop(off)
            props.append(p)
        children = []
        while off < end:
            child, off = node(off)
            if child is None: break
            children.append(child)
        return Node(name, props, children), end

    off = 27
    roots = []
    while off < len(data) - null:
        n, off = node(off)
        if n is None: break
        roots.append(n)
    return version, Node('', [], roots)

if __name__ == '__main__':
    v, root = read_fbx(sys.argv[1])
    print('version', v, [c.name for c in root.children])
