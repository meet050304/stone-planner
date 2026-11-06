"""Automatic round-cut planner: places polished stones in a rough to maximise profit."""
import json
import math
import multiprocessing
import os
import sys
import time

for _name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ[_name] = "1"

import numpy as np

import adv_reader

VOXEL = 30.0          # micrometres
SAW_WIDTH = 25.0      # micrometres, the plate thickness set by the user
WORKERS = 9
MIN_DIAMETER = 700.0  # micrometres
DENSITY_FACTOR = 3.508 / 200 / 1e9  # carats per cubic micrometre

# Two cuts seen in Advisor's MARUTI V.G. plans. "k" is carats per cubic millimetre of diameter.
PROFILES = [
    dict(name="table 60.8", table=0.608, crown=0.145, girdle=0.03, pavilion=0.4362, k=0.003742),
    dict(name="table 58.0", table=0.58, crown=0.1554, girdle=0.035, pavilion=0.4397, k=0.003865),
]
RATES = dict(limit=1250.0, small=23250.0, large=13950.0, labour=70.0)
# Inclusion vertices allowed inside a stone. Calibrated on Advisor's plan for stone 104, whose
# VS2 and SI1 stones hold about 62 and 1,075. These stand in for clarity until prices are known.
CLARITY_LIMITS = dict(clean=0, vs2_like=62, si1_like=1075)


def value_of(diameter, profile, rates):
    ct = profile["k"] * (diameter / 1000) ** 3
    rate = rates["small"] if diameter < rates["limit"] else rates["large"]
    return ct * rate, ct


class Rough:
    def __init__(self, stone):
        self.points = stone["stone_vertices"]
        tris = stone["stone_triangles"]
        self.lo = self.points[np.unique(tris)].min(axis=0) - VOXEL
        hi = self.points[np.unique(tris)].max(axis=0) + VOXEL
        self.shape = np.ceil((hi - self.lo) / VOXEL).astype(int)
        self.mask = self._fill(tris)
        used = [p["points"] for p in stone["pieces"] if p["state"] != 0]
        self.inclusions = np.vstack(used) if used else np.zeros((0, 3))
        self.interior = np.argwhere(self.mask)

    def _fill(self, tris):
        nx, ny, nz = self.shape
        hits = {}
        v = (self.points - self.lo) / VOXEL
        for t in tris:
            a, b, c = v[t]
            x0, x1 = int(math.ceil(min(a[0], b[0], c[0]) - 0.5)), int(math.floor(max(a[0], b[0], c[0]) - 0.5))
            y0, y1 = int(math.ceil(min(a[1], b[1], c[1]) - 0.5)), int(math.floor(max(a[1], b[1], c[1]) - 0.5))
            d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(d) < 1e-12:
                continue
            for x in range(max(x0, 0), min(x1, nx - 1) + 1):
                for y in range(max(y0, 0), min(y1, ny - 1) + 1):
                    px, py = x + 0.5, y + 0.5
                    w0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d
                    w1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d
                    w2 = 1 - w0 - w1
                    if w0 >= 0 and w1 >= 0 and w2 >= 0:
                        hits.setdefault((x, y), []).append(w0 * a[2] + w1 * b[2] + w2 * c[2])
        mask = np.zeros(self.shape, dtype=bool)
        for (x, y), zs in hits.items():
            zs.sort()
            for z0, z1 in zip(zs[0::2], zs[1::2]):
                mask[x, y, int(max(z0, 0)):int(min(z1, nz)) + 1] = True
        return mask

    def inside(self, pts):
        i = ((pts - self.lo) / VOXEL).astype(int)
        ok = ((i >= 0) & (i < self.shape)).all(axis=1)
        out = np.zeros(len(pts), dtype=bool)
        out[ok] = self.mask[i[ok, 0], i[ok, 1], i[ok, 2]]
        return out


AZ = np.linspace(0, 2 * np.pi, 24, endpoint=False)
UNIT_RING = np.stack([np.cos(AZ), np.sin(AZ)], axis=1)


def basis(axis):
    seed = np.array([1.0, 0, 0]) if abs(axis[0]) < 0.9 else np.array([0, 1.0, 0])
    u = np.cross(axis, seed)
    u /= np.linalg.norm(u)
    return u, np.cross(axis, u)


def outline(center, axis, diameter, p):
    """Surface sample of a polished stone; +axis runs from the crown to the culet."""
    u, v = basis(axis)
    R = diameter / 2
    rows = [
        (p["table"] * R, -p["crown"] * diameter),
        (R, 0.0),
        (R, p["girdle"] * diameter),
        (R / 2, (p["girdle"] + p["pavilion"] / 2) * diameter),
    ]
    pts = [center + (p["girdle"] + p["pavilion"]) * diameter * axis]
    for r, z in rows:
        pts.append(center + z * axis + r * UNIT_RING[:, :1] * u + r * UNIT_RING[:, 1:] * v)
    return np.vstack(pts)


def hits_inclusion(rough, center, axis, diameter, p):
    if not len(rough.inclusions):
        return 0
    d = rough.inclusions - center
    z = d @ axis
    R = diameter / 2
    top, cul, gird = -p["crown"] * diameter, (p["girdle"] + p["pavilion"]) * diameter, p["girdle"] * diameter
    near = (z > top) & (z < cul)
    if not near.any():
        return 0
    d, z = d[near], z[near]
    r = np.linalg.norm(d - np.outer(z, axis), axis=1)
    edge = np.where(z < 0, R + (R - p["table"] * R) * z / (p["crown"] * diameter),
                    np.where(z <= gird, R, R * (cul - z) / (cul - gird)))
    return int((r < edge).sum())


def feasible(rough, center, axis, diameter, p, allowed=0, cuts=()):
    shell = outline(center, axis, diameter, p)
    if not rough.inside(shell).all():
        return False
    if any((shell @ n < d).any() for n, d in cuts):
        return False
    return hits_inclusion(rough, center, axis, diameter, p) <= allowed


def largest(rough, center, axis, p, allowed=0, cuts=()):
    if not feasible(rough, center, axis, MIN_DIAMETER, p, allowed, cuts):
        return 0.0
    lo, hi = MIN_DIAMETER, 3000.0
    for _ in range(9):
        mid = (lo + hi) / 2
        if feasible(rough, center, axis, mid, p, allowed, cuts):
            lo = mid
        else:
            hi = mid
    return lo


def priced(d, center, axis, p, rates):
    """Best way to cut a placement: full size, or just under the diameter limit."""
    sizes = [d] if d < rates["limit"] else [d, rates["limit"] - 1]
    best = None
    for size in sizes:
        value, ct = value_of(size, p, rates)
        net = value - rates["labour"]
        if best is None or net > best["net"]:
            best = dict(net=net, diameter=size, full=d, center=center, axis=axis, profile=p, ct=ct)
    return best


def best_in_region(rough, rng, tries, allowed, rates, cuts=()):
    """Best single stone inside the part of the rough that satisfies the saw cuts."""
    cells = rough.lo + (rough.interior + 0.5) * VOXEL
    for n, d in cuts:
        cells = cells[cells @ n >= d]
    if not len(cells):
        return None
    found = []
    for _ in range(tries):
        center = cells[rng.integers(len(cells))] + rng.random(3) * VOXEL - VOXEL / 2
        axis = rng.normal(size=3)
        axis /= np.linalg.norm(axis)
        p = PROFILES[rng.integers(len(PROFILES))]
        d = largest(rough, center, axis, p, allowed, cuts)
        if d:
            found.append(priced(d, center, axis, p, rates))
    if not found:
        return None
    found.sort(key=lambda f: -f["net"])
    best = found[0]
    for f in found[:6]:
        c, a, d = f["center"], f["axis"], f["full"]
        for _ in range(max(24, tries // 6)):
            c2 = c + rng.normal(size=3) * 50
            a2 = a + rng.normal(size=3) * 0.07
            a2 /= np.linalg.norm(a2)
            d2 = largest(rough, c2, a2, f["profile"], allowed, cuts)
            if d2 > d:
                c, a, d = c2, a2, d2
        f = priced(d, c, a, f["profile"], rates)
        if f["net"] > best["net"]:
            best = f
    return best


WORK = {}


def _try_cut(job):
    """Scores one saw plane: the best stone on each side of it."""
    region, normal, offset, tries, seed = job
    rng = np.random.default_rng(seed)
    a = best_in_region(WORK["rough"], rng, tries, WORK["allowed"], WORK["rates"], region + [(normal, offset + SAW_WIDTH / 2)])
    b = best_in_region(WORK["rough"], rng, tries, WORK["allowed"], WORK["rates"], region + [(-normal, -offset + SAW_WIDTH / 2)])
    if a is None or b is None:
        return None
    return dict(net=a["net"] + b["net"], normal=normal, offset=offset, a=a, b=b)


def random_cuts(rough, region, rng, count, tries):
    cells = rough.lo + (rough.interior + 0.5) * VOXEL
    for n, d in region:
        cells = cells[cells @ n >= d]
    jobs = []
    for _ in range(count):
        n = rng.normal(size=3)
        n /= np.linalg.norm(n)
        jobs.append((region, n, float(cells[rng.integers(len(cells))] @ n), tries, int(rng.integers(1 << 31))))
    return jobs


def plan_rough(rough, rng, pool, allowed, rates, planes=64, tries=120, max_stones=5):
    regions = [dict(cuts=[], stone=best_in_region(rough, rng, tries * 8, allowed, rates))]
    while len(regions) < max_stones:
        best = None
        for r in regions:
            if r["stone"] is None:
                continue
            scored = [x for x in pool.map(_try_cut, random_cuts(rough, r["cuts"], rng, planes, tries)) if x]
            if not scored:
                continue
            scored.sort(key=lambda x: -x["net"])
            # Worth a closer look: the most promising planes, searched harder.
            again = [(r["cuts"], x["normal"], x["offset"], tries * 4, int(rng.integers(1 << 31))) for x in scored[:planes // 8]]
            scored += [x for x in pool.map(_try_cut, again) if x]
            top = max(scored, key=lambda x: x["net"])
            gain = top["net"] - r["stone"]["net"]
            if gain > 0 and (best is None or gain > best[0]):
                best = (gain, r, top)
        if best is None:
            break
        _, r, top = best
        regions = [x for x in regions if x is not r]
        regions.append(dict(cuts=r["cuts"] + [(top["normal"], top["offset"] + SAW_WIDTH / 2)], stone=top["a"]))
        regions.append(dict(cuts=r["cuts"] + [(-top["normal"], -top["offset"] + SAW_WIDTH / 2)], stone=top["b"]))
    return [r["stone"] for r in regions if r["stone"]]


def rotation_axis(angles):
    b, c = angles[1], angles[2]
    return np.array([math.sin(b) * math.sin(c), -math.sin(b) * math.cos(c), math.cos(b)])


def advisor_baseline(stone, rough, rates):
    """Advisor's own plan, priced the same way and checked against the same rules."""
    weights = stone["polished"]
    plans = sorted(stone["plan"], key=lambda p: -p["diameter"])
    net, rows = 0.0, []
    for w, pl in zip(weights, plans):
        rate = rates["small"] if pl["diameter"] < rates["limit"] else rates["large"]
        net += w * rate - rates["labour"]
        p = pl["proportions"] or PROFILES[0]
        a = rotation_axis(pl["angles"])
        shell = outline(pl["center"], a, pl["diameter"], p)
        rows.append(dict(diameter=round(pl["diameter"]), ct=round(w, 5), outside=round(float(1 - rough.inside(shell).mean()), 3),
                         inclusion_points=hits_inclusion(rough, pl["center"], a, pl["diameter"], p)))
    return net, rows


def plan_stone(path, rates, seed=1, clarity="si1_like", planes=96, tries=320):
    t0 = time.time()
    stone = adv_reader.load(path)
    rough = Rough(stone)
    # Every third inclusion vertex keeps each check fast; the allowance is scaled to match.
    rough.inclusions = rough.inclusions[::3]
    allowed = CLARITY_LIMITS[clarity] // 3
    WORK.update(rough=rough, allowed=allowed, rates=rates)
    rng = np.random.default_rng(seed)
    with multiprocessing.get_context("fork").Pool(WORKERS) as pool:
        chosen = plan_rough(rough, rng, pool, allowed, rates, planes, tries)
    net = sum(o["net"] for o in chosen)
    base, rows = advisor_baseline(stone, rough, rates)
    return dict(
        stone=stone["name"], clarity=clarity, rough_ct=round(stone["rough_ct"], 3), outline_is_simple=stone["repaired"],
        advisor=dict(profit=round(base, 1), polished_ct=round(sum(stone["polished"]), 5), stones=rows),
        ours=dict(profit=round(net, 1), polished_ct=round(sum(o["ct"] for o in chosen), 5),
                  stones=[dict(diameter=round(o["diameter"]), ct=round(o["ct"], 5), cut=o["profile"]["name"],
                               center=[round(float(v), 1) for v in o["center"]], axis=[round(float(v), 4) for v in o["axis"]]) for o in chosen]),
        seconds=round(time.time() - t0),
    )


if __name__ == "__main__":
    downloads = os.path.expanduser("~/Downloads")
    stones = sys.argv[1].split(",") if len(sys.argv) > 1 else ["101", "102", "103", "104", "105"]
    results = []
    for n in stones:
        for clarity in CLARITY_LIMITS:
            r = plan_stone(f"{downloads}/1.S525-{n}.adv", RATES, clarity=clarity)
            print(json.dumps(r), flush=True)
            results.append(r)
            with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "results.json"), "w") as f:
                json.dump(results, f, indent=1)
