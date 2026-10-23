// خادم «القنبلة» — HTTP + Server-Sent Events بلا اعتماديات.
// الخادم هو المرجع الوحيد للوقت والقلوب والأدوار؛ المتصفح يعرض فقط ويرسل الإجابات.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Game } from './engine.js';
import { QUESTIONS } from './questions.js';
import { attackPlan, SMALL_ROOM } from './public/config.js';   // التوقيتات نفسها التي يرسم بها المتصفح

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CSP = "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'";
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const PUB = fileURLToPath(new URL('./public/', import.meta.url));
class Err extends Error { constructor(status, message) { super(message); this.status = status; } }
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>&"'`]/g, '').trim().slice(0, n);
const clamp = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

export function createApp({ minSec = 5, now = Date.now, questions = QUESTIONS, attackMs = (turnMs) => attackPlan(turnMs).total } = {}) {
  const rooms = new Map(), hits = new Map(), files = new Map();

  // ملفات public/ المسطّحة فقط (بلا مجلدات فرعية ولا مسارات خارجها). يدعم Range لأن iOS يطلبه لتشغيل الصوت.
  const serveStatic = (req, res, name) => {
    const ext = name.slice(name.lastIndexOf('.'));
    if (!MIME[ext] || /[\\/]/.test(name) || name.startsWith('.')) throw new Err(404, 'غير موجود');
    let buf = files.get(name);
    if (!buf) { try { buf = readFileSync(PUB + name); } catch { throw new Err(404, 'غير موجود'); } files.set(name, buf); }
    const head = { 'content-type': MIME[ext], 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff', 'content-security-policy': CSP,
      'cache-control': ext === '.png' || ext === '.mp3' ? 'public, max-age=3600' : 'no-cache' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (m && (m[1] || m[2])) {
      const s = m[1] === '' ? Math.max(0, buf.length - Number(m[2])) : Number(m[1]);
      const e = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
      if (s > e || s >= buf.length) { res.writeHead(416, { 'content-range': `bytes */${buf.length}` }); return res.end(); }
      res.writeHead(206, { ...head, 'content-range': `bytes ${s}-${e}/${buf.length}`, 'content-length': e - s + 1 });
      return res.end(buf.subarray(s, e + 1));
    }
    res.writeHead(200, { ...head, 'content-length': buf.length });
    res.end(buf);
  };

  const limited = (k) => { const t = now(), a = (hits.get(k) ?? []).filter((x) => t - x < 1000); a.push(t); hits.set(k, a); return a.length > 8; };
  const view = (r) => ({
    code: r.code, host: r.host, s: r.s, phase: r.game ? r.game.status : 'lobby',
    players: [...r.players.values()].map(({ id, name, up }) => ({ id, name, up })),
    game: r.game?.view() ?? null,
  });
  const push = (r) => { const d = `data: ${JSON.stringify(view(r))}\n\n`; for (const c of r.subs) c.res.write(d); };
  const arm = (r) => {   // مؤقت واحد لكل غرفة يوقظ الخادم عند الموعد القادم (نهاية المؤقت ثم نهاية هجوم الرامي)
    clearTimeout(r.t);
    const at = r.game?.due();
    if (at == null) return;
    r.t = setTimeout(() => { r.game.tick(); sync(r); }, Math.max(0, at - now()) + 3);
    r.t.unref();
  };
  const sync = (r) => { r.seen = now(); push(r); arm(r); };
  const addPlayer = (r, name) => { const p = { id: 'p' + ++r.n, name, token: randomUUID(), up: false }; r.players.set(p.id, p); return p; };
  const xfer = (r) => { if (!r.players.get(r.host)?.up) { const o = [...r.players.values()].find((x) => x.up); if (o) r.host = o.id; } };
  const drop = (r, p) => {
    clearTimeout(p.gone); r.game?.leave(p.id); r.players.delete(p.id);
    for (const c of [...r.subs]) if (c.pid === p.id) { c.res.end(); r.subs.delete(c); }
    if (!r.players.size) { clearTimeout(r.t); rooms.delete(r.code); return; }
    if (r.host === p.id) r.host = [...r.players.values()].find((x) => x.up)?.id ?? r.players.keys().next().value;
    sync(r);
  };
  const find = (b) => {
    const r = rooms.get(String(b.code ?? '').toUpperCase());
    if (!r) throw new Err(404, 'الغرفة غير موجودة أو انتهت صلاحية الدعوة');
    return [r, [...r.players.values()].find((p) => p.token === b.token)];
  };
  const need = (b, host) => {
    const [r, p] = find(b);
    if (!p) throw new Err(403, 'لست عضواً في هذه الغرفة');
    if (host && r.host !== p.id) throw new Err(403, 'هذا الإجراء للمضيف فقط');
    return [r, p];
  };

  const POST = {
    '/api/create': (b) => {
      const name = clean(b.name, 20); if (!name) throw new Err(400, 'اكتب اسمك أولاً');
      if (rooms.size >= 500) throw new Err(503, 'الخادم مشغول، حاول لاحقاً');
      let code; do code = Array.from({ length: 5 }, () => ALPHA[randomInt(ALPHA.length)]).join(''); while (rooms.has(code));
      const r = { code, host: null, players: new Map(), n: 0, subs: new Set(), game: null, s: { hearts: 3, sec: 15, max: 10 }, seen: now() };
      const p = addPlayer(r, name); r.host = p.id; rooms.set(code, r);
      return { code, token: p.token, id: p.id };
    },
    '/api/join': (b) => {
      const [r, me] = find(b);
      if (me) return { code: r.code, token: me.token, id: me.id };       // إعادة انضمام بالرمز السري
      if (r.game) throw new Err(409, 'بدأت المباراة بالفعل');
      if (r.players.size >= r.s.max) throw new Err(409, 'الغرفة ممتلئة');
      const name = clean(b.name, 20); if (!name) throw new Err(400, 'اكتب اسمك أولاً');
      const p = addPlayer(r, name); push(r);
      return { code: r.code, token: p.token, id: p.id };
    },
    '/api/settings': (b) => {
      const [r] = need(b, true);
      if (r.game) throw new Err(409, 'لا يمكن تغيير الإعدادات أثناء المباراة');
      r.s = { hearts: clamp(b.hearts, 1, 10, r.s.hearts), sec: clamp(b.sec, minSec, 120, r.s.sec), max: clamp(b.max, Math.max(2, r.players.size), 20, r.s.max) };
      push(r); return { ok: true };
    },
    '/api/start': (b) => {
      const [r] = need(b, true);
      if (r.game) throw new Err(409, 'المباراة قيد التشغيل');
      if (r.players.size < 2) throw new Err(409, 'تحتاج لاعبَين على الأقل');
      r.game = new Game({ players: [...r.players.values()], hearts: r.s.hearts, turnMs: r.s.sec * 1000, attackMs: attackMs(r.s.sec * 1000), smallRoom: SMALL_ROOM, questions, now });
      sync(r); return { ok: true };
    },
    '/api/answer': (b) => {
      const [r, p] = need(b);
      if (!r.game) throw new Err(409, 'لم تبدأ المباراة');
      if (limited(p.token)) throw new Err(429, 'محاولات كثيرة، تمهّل قليلاً');
      const res = r.game.submit(p.id, Number(b.turnId), String(b.text ?? '').slice(0, 100), b.qv == null ? null : Number(b.qv));
      sync(r); return res;
    },
    '/api/restart': (b) => {
      const [r] = need(b, true);
      if (r.game?.status !== 'over') throw new Err(409, 'المباراة لم تنتهِ بعد');
      r.game = null; sync(r); return { ok: true };
    },
    '/api/leave': (b) => { const [r, p] = need(b); drop(r, p); return { ok: true }; },
  };

  const events = (req, res, u) => {
    const [r, p] = need({ code: u.searchParams.get('code'), token: u.searchParams.get('token') });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
    res.write('retry: 2000\n\n');
    const c = { res, pid: p.id }; r.subs.add(c); clearTimeout(p.gone); p.up = true; sync(r);
    req.on('close', () => {
      r.subs.delete(c);
      if (!r.players.has(p.id) || [...r.subs].some((x) => x.pid === p.id)) return;
      p.up = false; push(r);
      p.gone = setTimeout(() => (r.game ? (xfer(r), sync(r)) : drop(r, p)), 15000);   // مهلة عودة قبل الإزالة/نقل المضيف
      p.gone.unref();
    });
  };

  const send = (res, code, data, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': CSP });
    res.end(data);
  };
  const readBody = (req) => new Promise((ok, no) => {
    let s = '';
    req.on('data', (c) => { if (s.length <= 4096) s += c; });
    req.on('end', () => { try { if (s.length > 4096) throw new Err(413, 'الطلب كبير'); ok(s ? JSON.parse(s) : {}); } catch (e) { no(e.status ? e : new Err(400, 'بيانات غير صالحة')); } });
  });

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      if (req.method === 'GET' && u.pathname === '/healthz') return send(res, 200, 'ok', 'text/plain');
      if (req.method === 'GET' && u.pathname === '/api/events') return events(req, res, u);
      if (req.method === 'GET') return serveStatic(req, res, u.pathname === '/' ? 'index.html' : u.pathname.slice(1));
      const f = req.method === 'POST' && POST[u.pathname];
      if (!f) throw new Err(404, 'غير موجود');
      send(res, 200, JSON.stringify(f(await readBody(req))));
    } catch (e) {
      if (!e.status) console.error(e);
      send(res, e.status ?? 500, JSON.stringify({ error: e.status ? e.message : 'خطأ في الخادم' }));
    }
  });

  const sweep = setInterval(() => {   // تنظيف الغرف المهجورة وعدّادات المعدّل
    hits.clear();
    for (const [c, r] of rooms) if (now() - r.seen > 30 * 60e3 && ![...r.players.values()].some((p) => p.up)) { clearTimeout(r.t); rooms.delete(c); }
  }, 60e3);
  sweep.unref();

  const close = () => {
    clearInterval(sweep);
    for (const r of rooms.values()) { clearTimeout(r.t); for (const p of r.players.values()) clearTimeout(p.gone); for (const c of r.subs) c.res.end(); }
    server.close(); server.closeAllConnections?.();
  };
  return { server, close, rooms };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = process.env.PORT || 3000;
  createApp().server.listen(port, () => console.log(`القنبلة 💣 تعمل على http://localhost:${port}`));
}
