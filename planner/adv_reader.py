"""Reads Advisor .adv stone files: rough model, inclusions and the saved plan."""
import math
import re
import struct

import numpy as np

MESH_TAG = bytes.fromhex("95f2b28927963b48a7a200cba02f27ab")
PLAN_MARK = struct.pack("<d", -12345.0)
COORD_LIMIT = 20000.0


def _double(b, p):
    return struct.unpack_from("<d", b, p)[0]


def _parse_mesh(b, p):
    """Returns (vertices, triangles, damaged vertex count) or None."""
    size, nv = struct.unpack_from("<II", b, p + 20)
    end = p + 24 + size
    if nv < 3 or nv * 24 + 8 > size or end > len(b):
        return None
    v = np.frombuffer(b, dtype="<f8", count=nv * 3, offset=p + 28).reshape(-1, 3)
    bad = ~(np.abs(v) < COORD_LIMIT).all(axis=1)
    tris = []
    q = p + 28 + 24 * nv + 4
    while q + 4 <= end:
        n = struct.unpack_from("<I", b, q)[0]
        if 3 <= n <= 200 and q + 4 + 4 * n <= end:
            idx = struct.unpack_from(f"<{n}I", b, q + 4)
            if all(i < nv for i in idx):
                if not any(bad[i] for i in idx):
                    for i in range(1, n - 1):
                        tris.append((idx[0], idx[i], idx[i + 1]))
                q += 4 + 4 * n
                continue
        q += 4
    return v, np.array(tris, dtype=np.int64).reshape(-1, 3), int(bad.sum()), p


def _box(mesh):
    used = mesh[0][np.unique(mesh[1])]
    return used.min(axis=0), used.max(axis=0)


def _read_proportions(b, q):
    for o in (q - 248, q + 248):
        g, t, ca, pa, c, p, total = struct.unpack_from("<7d", b, o)
        star, half = struct.unpack_from("<2d", b, o + 136)
        if not (0 < g < 0.12 and 0.05 < c < 0.3 and 0.3 < p < 0.6 and 0.4 < t < 0.8):
            continue
        if abs(c + g + p - total) > 1e-6 or abs(math.tan(ca) - 2 * c / (1 - t)) > 0.004:
            continue
        if 0.3 < star < 0.8 and 0.5 < half < 0.95:
            return dict(girdle=g, table=t, crown=c, pavilion=p, star=star, half=half)
    return None


def _read_plan(b, count):
    plans = []
    for m in re.finditer(re.escape(PLAN_MARK), b):
        q = m.start() - 92
        if q < 56 or len(plans) >= count:
            continue
        diameter = _double(b, q)
        if not 100 < diameter < 6000:
            continue
        normal = struct.unpack_from("<3d", b, q + 32)
        if abs(sum(x * x for x in normal) - 1) > 1e-3:
            continue
        plans.append(dict(
            diameter=diameter,
            angles=struct.unpack_from("<3d", b, q - 56),
            center=np.array(struct.unpack_from("<3d", b, q - 24)),
            proportions=_read_proportions(b, q),
        ))
    return plans


def _plan_count(b):
    # Advisor keeps weights for two stones in the header; any remainder is a third.
    weights = [w for w in struct.unpack_from("<2d", b, 104) if w > 0]
    total = _double(b, 76)
    extra = total - sum(weights)
    if extra > 0.0005:
        weights.append(extra)
    return sorted(weights, reverse=True)


def load(path):
    b = open(path, "rb").read()
    tags = [m.start() for m in re.finditer(re.escape(MESH_TAG), b)]
    meshes = [m for m in (_parse_mesh(b, p) for p in tags) if m is not None and len(m[1])]
    clean = [m for m in meshes if m[2] == 0 and len(m[0]) > 800]
    repaired = not clean
    if clean:
        stone = max(clean, key=lambda m: len(m[1]))
    else:
        simple = [m for m in meshes if m[2] == 0 and 40 <= len(m[0]) <= 800]
        stone = max(simple, key=lambda m: np.linalg.norm(_box(m)[1] - _box(m)[0]))
    lo, hi = _box(stone)
    size = np.linalg.norm(hi - lo)

    starts = [m.start() for m in re.finditer(rb" - \(3D\)", b)]
    offsets = np.array([m[3] for m in meshes])
    pieces = []
    for n, start in enumerate(starts):
        stop = starts[n + 1] if n + 1 < len(starts) else start + 300000
        state = b[start + 7 + 47]
        kept = []
        for i in np.nonzero((offsets >= start) & (offsets < stop))[0]:
            m = meshes[i]
            if m is stone or m[2] or len(m[1]) < 1:
                continue
            a, z = _box(m)
            if np.linalg.norm(z - a) > size * 0.6 or (a < lo - size * 0.05).any() or (z > hi + size * 0.05).any():
                continue
            # A mesh whose box holds an earlier piece is a merged copy of pieces.
            if any((a - 1 <= ka).all() and (z + 1 >= kz).all() for ka, kz in kept):
                continue
            kept.append((a, z))
            pieces.append(dict(points=m[0], state=state))

    weights = _plan_count(b)
    return dict(
        name=path.rsplit("/", 1)[-1].replace(".adv", ""),
        rough_ct=_double(b, 68),
        polished_ct=_double(b, 76),
        polished=weights,
        stone_vertices=stone[0],
        stone_triangles=stone[1],
        repaired=repaired,
        pieces=pieces,
        plan=_read_plan(b, len(weights)),
    )
