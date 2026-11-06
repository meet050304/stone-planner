"""Runs the planner on every stone and checks each plan independently."""
import json
import os
import sys

import numpy as np

import adv_reader
import planner as P

MODES = {
    "your_rates": P.RATES,
    "max_weight": dict(limit=1250.0, small=10000.0, large=10000.0, labour=0.0),
}


def check(stone, result):
    """Rechecks a plan with all inclusion vertices, not the sample used while searching."""
    rough = P.Rough(stone)
    profile = {p["name"]: p for p in P.PROFILES}
    placed = [(np.array(s["center"]), np.array(s["axis"]), s["diameter"], profile[s["cut"]]) for s in result["ours"]["stones"]]
    outside = max(float(1 - rough.inside(P.outline(c, a, d, p)).mean()) for c, a, d, p in placed)
    points = [P.hits_inclusion(rough, c, a, d, p) for c, a, d, p in placed]
    overlap = 0
    for i, (c, a, d, p) in enumerate(placed):
        for j, other in enumerate(placed):
            if i != j:
                rough.inclusions = P.outline(*other)
                overlap += P.hits_inclusion(rough, c, a, d, p)
    return dict(outside=round(outside, 3), inclusion_points=points, overlap_points=overlap)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    names = sys.argv[1].split(",") if len(sys.argv) > 1 else ["101", "102", "103", "104", "105"]
    results = []
    for n in names:
        path = os.path.expanduser(f"~/Downloads/1.S525-{n}.adv")
        stone = adv_reader.load(path)
        for mode, rates in MODES.items():
            for clarity in P.CLARITY_LIMITS:
                r = P.plan_stone(path, rates, clarity=clarity)
                r["mode"] = mode
                r["check"] = check(stone, r)
                results.append(r)
                print(json.dumps(r), flush=True)
                with open(os.path.join(here, "results.json"), "w") as f:
                    json.dump(results, f, indent=1)
