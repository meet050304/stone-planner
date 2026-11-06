// Read-only test server: serves the viewer and the stones, and stores results in the scratchpad.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = '/Users/meetmangukiya/Desktop/development/adv-viewer.html';
const ROOT = '/Volumes/MY BOOK/autook';
const OUT = path.join(__dirname, 'results.jsonl');
const list = () => ['201-300', '401-500'].flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => /\.adv$/i.test(f) && !f.startsWith('._')).map(f => d + '/' + f));
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.setHeader('content-type', 'text/html'); return fs.createReadStream(VIEWER).pipe(res); }
  if (url === '/list') return res.end(JSON.stringify(list()));
  if (url === '/done') return res.end(fs.existsSync(OUT) ? fs.readFileSync(OUT) : '');
  if (url.startsWith('/stone/')) {
    const rel = url.slice(7);
    if (!list().includes(rel)) { res.statusCode = 404; return res.end(); }
    return fs.createReadStream(path.join(ROOT, rel)).pipe(res);
  }
  if (url === '/result' && req.method === 'POST') {
    let body = ''; req.on('data', d => body += d);
    return req.on('end', () => { fs.appendFileSync(OUT, body.replace(/\n/g, ' ') + '\n'); res.end('ok'); });
  }
  res.statusCode = 404; res.end();
}).listen(8765, '127.0.0.1', () => console.log('ready'));
