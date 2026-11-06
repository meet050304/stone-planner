const fs = require('fs');
const rows = fs.readFileSync(__dirname + '/results.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const ok = rows.filter(r => !r.error);
console.log('rows', rows.length, 'ok', ok.length, 'errors', rows.filter(r => r.error).map(r => r.rel + ': ' + r.error));
const names = ['Ignore', 'Use', 'Auto'], c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
ok.forEach(r => r.conf.forEach((x, i) => x.forEach((v, j) => c[i][j] += v)));
const tot = c.flat().reduce((a, b) => a + b, 0), hit = c[0][0] + c[1][1] + c[2][2];
console.log('inclusions', tot, 'match', hit, (hit / tot * 100).toFixed(1) + '%');
c.forEach((x, i) => console.log('Advisor', names[i], x, (x[i] / x.reduce((a, b) => a + b, 0) * 100).toFixed(0) + '%'));
const best = l => l.reduce((a, b) => b.profit > a.profit ? b : a);
const stat = { adv: 0, saved: 0, auto: 0, both: 0 };
let same = 0, better = 0, worse = 0, close = 0, nAdv = 0, nOurs = 0;
const byCount = {}, lines = [];
for (const r of ok) {
  const a = r.adv.reduce((t, s) => t + s.profit, 0), s = best(r.savedPlan), u = best(r.autoPlan);
  const advCt = r.adv.reduce((t, x) => t + x.ct, 0), ourCt = s.ct.reduce((t, x) => t + x, 0);
  stat.adv += a; stat.saved += s.profit; stat.auto += u.profit; stat.both += Math.max(a, s.profit);
  nAdv += r.adv.length; nOurs += s.sizes.length;
  if (r.adv.length === s.sizes.length) same++;
  if (s.profit > a + 1) better++; else if (s.profit < a - 1) worse++; else close++;
  const k = r.adv.length, b = byCount[k] ||= { n: 0, adv: 0, saved: 0, auto: 0, same: 0 };
  b.n++; b.adv += a; b.saved += s.profit; b.auto += u.profit; if (s.sizes.length === k) b.same++;
  lines.push([r.name.replace('1.S525-', ''), r.adv.map(x => x.D.toFixed(2)).join('+'), a.toFixed(0), s.sizes.map(x => x.toFixed(2)).join('+'), s.profit.toFixed(0), u.sizes.map(x => x.toFixed(2)).join('+'), u.profit.toFixed(0), advCt.toFixed(4), ourCt.toFixed(4)].join('\t'));
}
console.log(stat, 'stones adv', nAdv, 'ours', nOurs, 'same count', same, 'of', ok.length, 'better', better, 'worse', worse, 'within Rs1', close);
console.log(byCount);
console.log('name\tadvisor\tRs\tours(saved)\tRs\tours(auto)\tRs\tadvCt\tourCt'); console.log(lines.join('\n'));
const sec = ok.filter(r => r.sec).map(r => r.sec[1] + r.sec[2]).sort((a, b) => a - b);
console.log('plan seconds median', sec[sec.length >> 1]);
