# Groups the inclusions where our Auto select and Advisor's saved mark differ.
# Input: comparison/inclusions-all.csv, or the file named first on the command line, with an optional tag second.
# Output: comparison/auto-mismatches.csv and comparison/AUTO-MISMATCH-REPORT.md
import csv, os, statistics, sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else 'inclusions-all.csv'
TAG = sys.argv[2] if len(sys.argv) > 2 else ''
rows = list(csv.DictReader(open(os.path.join(HERE, SRC))))
for r in rows:
    for k in ('size_um', 'long_um', 'mid_um', 'short_um', 'volume_um3', 'ignore_to', 'auto_from', 'auto_top', 'deepest_um', 'pieces', 'row'):
        r[k] = float(r[k]) if r[k] != '' else None
    r['inside'] = r['inside_advisor_stone'] != ''
    r['depth'] = float(r['inside_depth_um']) if r['inside_depth_um'] else 0.0
    r['deep_inside'] = r['inside'] and r['depth'] >= 25
rows = [r for r in rows if r['advisor'] in ('ignore', 'use', 'auto')]

CAUSE = {
    ('ignore', 'use', 'skin_back_to_use'): 'A1 Advisor Ignore, ours Use: our skin rule sent a small inclusion back to Use',
    ('ignore', 'use', 'size_over_auto_top'): 'A2 Advisor Ignore, ours Use: bigger than the Auto top',
    ('auto', 'use', 'skin_back_to_use'): 'B1 Advisor Auto, ours Use: our skin rule sent it back to Use',
    ('auto', 'use', 'size_over_auto_top'): 'B2 Advisor Auto, ours Use: bigger than our Auto top',
    ('use', 'ignore', 'size_ignore'): 'C1 Advisor Use, ours Ignore: small by our size, not in our skin',
    ('use', 'auto', 'size_auto'): 'C2 Advisor Use, ours Auto: in our Auto range, not in our skin',
    ('auto', 'ignore', 'size_ignore'): 'D1 Advisor Auto, ours Ignore: at or below 201 by our size',
    ('ignore', 'auto', 'size_auto'): 'D2 Advisor Ignore, ours Auto: in our Auto range',
    ('use', 'auto', 'size_auto_crown_only'): 'C3 Advisor Use, ours Auto crown only: between TABLE CTR+ and CROWN+',
    ('ignore', 'auto', 'size_auto_crown_only'): 'D3 Advisor Ignore, ours Auto crown only: between TABLE CTR+ and CROWN+',
}
def cause(r):
    return CAUSE.get((r['advisor'], r['ours'], r['our_reason']), f"X {r['advisor']}/{r['ours']}/{r['our_reason']}")

def q(vals, ps=(.1, .5, .9)):
    v = sorted(x for x in vals if x is not None)
    if not v:
        return '-'
    return ' / '.join(str(round(v[min(len(v) - 1, int(p * (len(v) - 1)))])) for p in ps)

mis = [r for r in rows if r['advisor'] != r['ours']]
stones = sorted({r['stone'] for r in rows})
out = []
out.append('# Our Auto select against Advisor\'s saved marks\n')
out.append(f"{len(stones)} stones, {len(rows):,} inclusions. Same mark on {len(rows)-len(mis):,} ({100*(len(rows)-len(mis))/len(rows):.1f}%), different on {len(mis):,}.\n")
out.append('"Inside" means part of the inclusion is inside one of Advisor\'s polished stones; "deep" means 25 um or more inside, so it changes what a stone can be. Sizes are ours: the diagonal across the two longest box sides. Deepest = how far the deepest part is from the rough surface. Figures are 10th / median / 90th percentile.\n')

out.append('## All marks\n')
out.append('| Advisor \\ ours | ignore | auto | use |\n|---|---:|---:|---:|')
for a in ('ignore', 'auto', 'use'):
    c = Counter(r['ours'] for r in rows if r['advisor'] == a)
    out.append(f"| {a} | {c['ignore']:,} | {c['auto']:,} | {c['use']:,} |")
out.append('')

groups = defaultdict(list)
for r in mis:
    groups[cause(r)].append(r)
out.append('## Mismatches by cause\n')
out.append('| Cause | Count | Inside Advisor stones | Deep inside | Size um | Deepest from surface um | Size class (band) |\n|---|---:|---:|---:|---|---|---|')
for k in sorted(groups):
    g = groups[k]
    band = Counter(r['band'] for r in g).most_common(3)
    out.append(f"| {k} | {len(g):,} | {sum(r['inside'] for r in g):,} | {sum(r['deep_inside'] for r in g):,} | {q(r['size_um'] for r in g)} | {q(r['deepest_um'] for r in g)} | {', '.join(f'{b}: {n}' for b, n in band)} |")
out.append('')

# What the planner feels: inclusions deep inside Advisor's stones that we would block.
block = [r for r in mis if r['deep_inside'] and r['ours'] == 'use']
allow = [r for r in mis if r['ours'] != 'use' and r['advisor'] == 'use']
out.append('## Mismatches that change planning\n')
out.append(f"- We block, Advisor kept inside its stone (25 um or deeper): {len(block)} inclusions on {len({r['stone'] for r in block})} stones. These cost us size.")
out.append(f"- We allow, Advisor marked Use: {len(allow):,} inclusions, {sum(r['inside'] for r in allow)} of them inside Advisor stones. These can give us bigger stones than Advisor would allow.\n")

# Tests of single rules against Advisor.
out.append('## Rule checks\n')
small_skin = [r for r in rows if r['size_um'] <= r['ignore_to']]
for lim in (25, 50, 75, 100, 125, 150, 200):
    pred = lambda r: 'use' if r['deepest_um'] <= lim else 'ignore'
    ok = sum(pred(r) == r['advisor'] for r in small_skin if r['advisor'] in ('use', 'ignore'))
    n = sum(r['advisor'] in ('use', 'ignore') for r in small_skin)
    out.append(f"- Small inclusions (our size up to Ignore limit): skin distance {lim} um would match {100*ok/n:.1f}% of Advisor's Use/Ignore marks.")
mid = [r for r in rows if r['auto_from'] <= r['size_um'] <= r['auto_top']]
for lim in (50, 75, 100, 125, 150, 200):
    pred = lambda r: 'use' if r['deepest_um'] <= lim else 'auto'
    ok = sum(pred(r) == r['advisor'] for r in mid if r['advisor'] in ('use', 'auto'))
    n = sum(r['advisor'] in ('use', 'auto') for r in mid)
    out.append(f"- Auto size range: skin distance {lim} um would match {100*ok/n:.1f}% of Advisor's Use/Auto marks.")
out.append('')
out.append('Advisor Use/Ignore by our size, small inclusions not in our skin (does Advisor\'s Ignore limit differ from 201?):\n')
out.append('| Our size um | Advisor ignore | Advisor use | Advisor auto |\n|---|---:|---:|---:|')
for a, b in ((0, 100), (100, 150), (150, 180), (180, 201), (201, 230), (230, 260), (260, 300), (300, 361), (361, 450), (450, 10**9)):
    g = [r for r in rows if a < r['size_um'] <= b and r['deepest_um'] > 100]
    c = Counter(r['advisor'] for r in g)
    out.append(f"| {a}-{b if b < 10**9 else ''} | {c['ignore']:,} | {c['use']:,} | {c['auto']:,} |")
out.append('')
out.append('Advisor Auto rate by size class byte (band) and our size, inclusions not in our skin:\n')
out.append('| Band | Count | Auto | Use | Ignore | Our size um |\n|---|---:|---:|---:|---:|---|')
bands = defaultdict(list)
for r in rows:
    if r['deepest_um'] > 100:
        bands[r['band']].append(r)
for b in sorted(bands, key=lambda x: int(x) if x.isdigit() else 999):
    g = bands[b]
    c = Counter(r['advisor'] for r in g)
    if len(g) >= 20:
        out.append(f"| {b} | {len(g):,} | {c['auto']:,} | {c['use']:,} | {c['ignore']:,} | {q(r['size_um'] for r in g)} |")
out.append('')

out.append('## By rough weight row\n')
out.append('| Row (ct x 100) | Stones | Inclusions | Same | Deep inside, we block |\n|---|---:|---:|---:|---:|')
for row in sorted({r['row'] for r in rows}):
    g = [r for r in rows if r['row'] == row]
    out.append(f"| {int(row)} | {len({r['stone'] for r in g})} | {len(g):,} | {100*sum(r['advisor']==r['ours'] for r in g)/len(g):.1f}% | {sum(r['deep_inside'] and r['ours']=='use' and r['advisor']!='use' for r in g)} |")
out.append('')

out.append('## Stones with most planning mismatches\n')
per = Counter(r['stone'] for r in block)
out.append('| Stone | We block (deep inside Advisor) | Inclusions (id, size, Advisor, our reason, depth) |\n|---|---:|---|')
for s, n in per.most_common(25):
    ex = '; '.join(f"{r['inc_id']} {int(r['size_um'])}um {r['advisor']} {r['our_reason']} {int(r['depth'])}um" for r in block if r['stone'] == s)
    out.append(f"| {s} | {n} | {ex} |")
out.append('')
out.append('Full list: auto-mismatches.csv (one row per mismatched inclusion, with cause).')

open(os.path.join(HERE, f'AUTO-MISMATCH-REPORT{TAG}.md'), 'w').write('\n'.join(out) + '\n')
with open(os.path.join(HERE, f'auto-mismatches{TAG}.csv'), 'w', newline='') as f:
    keys = list(csv.DictReader(open(os.path.join(HERE, SRC))).fieldnames)
    w = csv.writer(f)
    w.writerow(['cause', 'changes_planning'] + keys)
    for r in sorted(mis, key=lambda r: (cause(r), r['stone'])):
        w.writerow([cause(r), 'yes' if r in block or (r in allow and r['inside']) else ''] + [r[k] if not isinstance(r[k], float) else (int(r[k]) if r[k] == int(r[k]) else r[k]) for k in keys])
print('\n'.join(out[:40]))
