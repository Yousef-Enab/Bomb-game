// واجهة اللعبة (المتصفح). الخادم هو المرجع الوحيد للقواعد؛ هنا عرض فقط:
// الحلبة عناصر دائمة تُحدَّث ولا تُعاد بناؤها (لئلا تُعاد الحركات عند كل تحديث شبكة).
import { ASSETS, SHEETS, THEME, AUDIO, REST, ATTACK, attackPlan } from './config.js';
import { layout } from './layout.js';

const $ = (s) => document.querySelector(s);
const h = (t, a = {}, ...c) => {
  const e = document.createElement(t);
  for (const k in a) { const v = a[k]; if (v === false || v == null) continue; k.startsWith('on') ? (e[k] = v) : e.setAttribute(k, v === true ? '' : v); }
  e.append(...c.flat().filter((x) => x != null && x !== false));
  return e;
};
const sum = (a) => a.reduce((x, y) => x + y, 0), lerp = (a, b, t) => a + (b - a) * t, ease = (t) => t * t * (3 - 2 * t);
const store = {
  get() { try { return JSON.parse(localStorage.getItem('bomb') || 'null'); } catch { return null; } },
  set(v) { try { v ? localStorage.setItem('bomb', JSON.stringify(v)) : localStorage.removeItem('bomb'); } catch {} },
};
const pref = {
  get() { try { return JSON.parse(localStorage.getItem('bomb-pref') || '{}'); } catch { return {}; } },
  set(k, v) { try { localStorage.setItem('bomb-pref', JSON.stringify({ ...pref.get(), [k]: v })); } catch {} },
};
const S = { sess: store.get(), v: null, at: 0, seen: 0, msg: ['', ''], blocked: false };
const ROOM = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
const RULES = 'القنبلة تنتقل بين اللاعبين والسؤال واحد للجميع، وقد يحتاج عدة إجابات مختلفة. من معه القنبلة يكتب إجابة صحيحة لم تُقَل من قبل فتنتقل القنبلة ويعود المؤقت. الخاطئة والمكررة لا تخسّرك شيئاً فحاول ثانية. إذا وصل المؤقت إلى الصفر يطلق الرامي سهماً عليك وتخسر قلباً. عند اكتمال الإجابات المطلوبة يظهر سؤال جديد. من تنتهي قلوبه يخرج، والفائز آخر لاعب يبقى.';
const NAME_H = 24;
let es, AR = null;   // AR: حالة الحلبة الدائمة

const say = (m, c = '') => { S.msg = [m, c]; const e = $('#msg'); if (e) { e.textContent = m; e.className = 'toast ' + c; } };
const msgEl = () => h('div', { id: 'msg', class: 'toast ' + S.msg[1] }, S.msg[0]);
const nameOf = (id) => S.v?.game?.players.find((p) => p.id === id)?.name ?? '';
const left = () => Math.max(0, S.at - performance.now());

// ── الـsprites: شرائح إطارات بتوقيت الـGIF الأصلي، تحريك بـrequestAnimationFrame، تكبير صحيح بلا تنعيم ──
const live = new Set();
function sprite(key, scale) {
  const sh = SHEETS[key], el = h('div', { class: 'spr' }), s = { el, sh, scale, row: 0, col: 0, a: null };
  const pos = (r, c) => { s.row = r; s.col = c; el.style.backgroundPosition = `${-c * sh.w * s.scale}px ${-r * sh.h * s.scale}px`; };
  s.size = (sc) => {
    s.scale = sc;
    Object.assign(el.style, { width: sh.w * sc + 'px', height: sh.h * sc + 'px', backgroundImage: `url(${sh.url})`, backgroundSize: `${sh.cols * sh.w * sc}px ${sh.rows * sh.h * sc}px` });
    pos(s.row, s.col);
  };
  s.show = (r, c = 0) => { s.a = null; live.delete(s); pos(r, c); };
  s.play = (name, o = {}) => { s.a = { an: sh.anim[name], t0: performance.now() - (o.at || 0), loop: o.loop !== false, speed: o.speed || 1, i: -1 }; live.add(s); s.step(performance.now()); };
  s.step = (now) => {
    const a = s.a; if (!a) return;
    const ms = a.an.ms, tot = sum(ms); let t = (now - a.t0) * a.speed;
    if (a.loop) t %= tot; else if (t >= tot) { pos(a.an.row, ms.length - 1); s.a = null; live.delete(s); return; }
    let i = 0; while (i < ms.length - 1 && t >= ms[i]) { t -= ms[i]; i++; }
    if (i !== a.i) { a.i = i; pos(a.an.row, i); }
  };
  s.size(scale);
  return s;
}

// ── المظهر (نهار/ليل): تفضيل محلي لكل لاعب؛ لا يمسّ حالة اللعبة ──
function setTheme(t) { document.documentElement.dataset.theme = t; pref.set('theme', t); tools(); }

// ── الصوت: سياق واحد، مصدر واحد متكرر، كتم بخفض المستوى (لا إعادة تشغيل) ──
const Sound = (() => {
  let ctx, gain, buf, src, wanted = false, loading = null;
  const vol = () => (pref.get().muted ? 0 : AUDIO.volume);
  const begin = () => {
    if (!wanted || src || !buf || !ctx || ctx.state !== 'running') return;
    src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(gain); src.start();
    if (S.blocked) { S.blocked = false; tools(); }
  };
  const make = () => {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    gain = ctx.createGain(); gain.gain.value = vol(); gain.connect(ctx.destination); ctx.onstatechange = begin;
  };
  const load = () => (loading ??= fetch(ASSETS.audio).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)).then((b) => { buf = b; begin(); }).catch(() => { loading = null; }));
  return {
    preload() { try { make(); load(); } catch {} },                                        // يفك الترميز بصمت فقط (لا تشغيل قبل بدء المباراة)
    unlock() { try { make(); if (wanted && ctx.state !== 'running') ctx.resume().catch(() => {}); } catch {} },   // عند أول لمسة (قيود المتصفح)
    start() {          // عند بدء المباراة فقط
      wanted = true; if (src) return;
      try {
        make(); if (ctx.state !== 'running') ctx.resume().catch(() => {});
        load(); begin();
        const b = ctx.state !== 'running'; if (b !== S.blocked) { S.blocked = b; tools(); }
      } catch { /* الصوت لا يوقف اللعب */ }
    },
    stop() { wanted = false; try { src?.stop(); } catch {} src = null; if (S.blocked) { S.blocked = false; tools(); } },
    apply() { if (gain) gain.gain.value = vol(); },
  };
})();

function tools() {
  const th = document.documentElement.dataset.theme, muted = !!pref.get().muted;
  const tb = (label, on, fn) => h('button', { class: 'tb' + (on ? ' on' : ''), 'aria-pressed': String(!!on), onclick: fn }, label);
  $('#tools').replaceChildren(...[
    h('div', { class: 'seg', role: 'group', 'aria-label': 'الوضع' }, tb('نهار', th === 'day', () => setTheme('day')), tb('ليل', th === 'night', () => setTheme('night'))),
    tb(muted ? 'الصوت: مكتوم' : 'الصوت: يعمل', !muted, () => { pref.set('muted', !muted); Sound.apply(); tools(); }),
    S.blocked && !muted && h('button', { class: 'tb on', onclick: () => Sound.start() }, 'اضغط لتفعيل الصوت'),
  ].filter(Boolean));
}

// ── الشبكة ──
async function api(path, body) {
  let r, j;
  try { r = await fetch(path, { method: 'POST', body: JSON.stringify({ ...S.sess, ...body }) }); j = await r.json(); }
  catch { say('تعذّر الاتصال بالخادم', 'bad'); return null; }
  if (!r.ok) { say(j.error || 'حدث خطأ', 'bad'); return null; }
  return j;
}
function connect() {
  es?.close();
  es = new EventSource(`/api/events?code=${S.sess.code}&token=${S.sess.token}`);
  es.onmessage = (e) => {
    S.v = JSON.parse(e.data); S.at = performance.now() + (S.v.game?.turn?.ms ?? 0);
    if (S.msg[0].startsWith('انقطع')) say('');
    news(); render();
  };
  es.onerror = async () => {
    if (S.leaving || !S.sess) return;
    if (es.readyState !== 2) { say('انقطع الاتصال… جارٍ إعادة المحاولة', 'bad'); return; }   // المتصفح يعيد المحاولة تلقائياً
    // أُغلق الاتصال نهائياً: إمّا رفضه الخادم (غرفة منتهية/لست عضواً) أو أُغلق لأن الصفحة تُحدَّث/تُغلق.
    // لا نمسح الجلسة إلا إذا أكّد الخادم أنها انتهت، حتى تعود الغرفة بعد تحديث الصفحة على الهاتف.
    let r; try { r = await fetch('/api/join', { method: 'POST', body: JSON.stringify(S.sess) }); } catch { setTimeout(() => S.sess && !S.leaving && connect(), 2000); return; }
    if (r.ok) return connect();
    store.set(null); S.sess = S.v = null; say('انتهت صلاحية الغرفة أو الدعوة', 'bad'); render();
  };
}
function enter(j) { S.sess = { code: j.code, token: j.token, id: j.id }; S.v = null; S.seen = 0; say(''); store.set(S.sess); history.replaceState(null, '', '/'); connect(); render(); }
async function leave() { await api('/api/leave'); es?.close(); store.set(null); S.sess = S.v = null; S.seen = 0; say(''); render(); }

function news() {   // رسائل الأحداث الجديدة القادمة من الخادم (كل حدث له رقم n فلا يُعرض مرتين)
  const g = S.v.game; if (!g) { S.seen = 0; return; }
  const out = []; let cls = '';
  for (const e of g.ev) {
    if (e.n <= S.seen) continue;
    S.seen = e.n;
    if (e.t === 'hit') { cls = 'bad'; out.push(`أصاب السهم ${nameOf(e.id)} — خسر قلباً`); const pl = AR?.P.get(e.id); if (pl) { pl.el.classList.add('hit'); setTimeout(() => pl.el.classList.remove('hit'), 1100); } }
    else if (e.t === 'ok') { cls ||= 'ok'; out.push(`${nameOf(e.id)}: إجابة صحيحة!`); }
    else if (e.t === 'done') out.push('اكتملت الإجابات — سؤال جديد!');
    else if (e.t === 'skip') out.push(`سؤال جديد — الناقص: ${e.a.join('، ')}`);
    else if (e.t === 'left') out.push(`${nameOf(e.id)} غادر المباراة`);
  }
  if (out.length) say(out.join(' · '), cls);
}

// ── الصفحة الرئيسية وغرفة الانتظار ──
function home() {
  const nm = h('input', { placeholder: 'اسمك', maxlength: '20', autocomplete: 'nickname' });
  const cd = h('input', { placeholder: 'كود الغرفة', maxlength: '5', value: ROOM, style: 'direction:ltr;text-align:center;text-transform:uppercase' });
  const go = async (path, extra) => { const j = await api(path, { name: nm.value, ...extra }); if (j) enter(j); };
  const logo = sprite('bomb', 6); logo.play('fuse');
  return h('div', { class: 'screen' }, h('div', { class: 'logo' }, logo.el, h('h1', {}, 'القنبلة')), h('p', { class: 'sub' }, 'مين هيلحق يجاوب؟'), msgEl(),
    h('div', { class: 'panel col' }, nm, h('button', { onclick: () => go('/api/create') }, 'إنشاء لعبة'),
      cd, h('button', { class: 'alt', onclick: () => go('/api/join', { code: cd.value.trim().toUpperCase() }) }, 'الانضمام إلى لعبة')),
    h('details', { class: 'panel' }, h('summary', {}, 'كيف تلعب؟'), h('p', {}, RULES)));
}
async function share(url) {
  try {
    if (navigator.share) await navigator.share({ title: 'القنبلة', text: 'انضم إلى لعبتي!', url });
    else { await navigator.clipboard.writeText(url); say('تم نسخ رابط الدعوة', 'ok'); }
  } catch (e) { if (e.name !== 'AbortError') prompt('انسخ الرابط:', url); }
}
function lobby() {
  const v = S.v, me = v.host === S.sess.id, link = `${location.origin}/?room=${v.code}`;
  const rng = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const sel = (k, label, opts, fmt = (o) => o) => h('label', { class: 'mut' }, label,
    h('select', { disabled: !me, onchange: (e) => api('/api/settings', { ...v.s, [k]: e.target.value }) },
      ...opts.map((o) => h('option', { value: o, selected: o === v.s[k] }, fmt(o)))));
  return h('div', { class: 'screen' }, h('h1', { class: 'sub' }, 'غرفة الانتظار'), msgEl(),
    h('div', { class: 'panel col' }, h('div', { class: 'mut' }, 'كود الغرفة'), h('div', { class: 'code' }, v.code), h('button', { class: 'alt', onclick: () => share(link) }, 'مشاركة الدعوة')),
    h('div', { class: 'panel' }, h('div', { class: 'mut' }, `اللاعبون ${v.players.length}/${v.s.max}`),
      ...v.players.map((p) => h('div', { class: 'row' }, h('span', {}, (p.id === v.host ? '[مضيف] ' : '') + p.name + (p.id === S.sess.id ? ' (أنت)' : '')), h('span', { class: 'mut' }, p.up ? 'متصل' : 'غير متصل')))),
    h('div', { class: 'panel col' }, sel('hearts', 'القلوب لكل لاعب', rng(1, 10)), sel('sec', 'مدة المؤقت لكل دور', [5, 10, 15, 20, 30, 45, 60], (o) => o + ' ثانية'),
      sel('max', 'أقصى عدد للاعبين', rng(2, 20)), me ? null : h('div', { class: 'mut' }, 'المضيف وحده يعدّل الإعدادات.')),
    me ? h('button', { disabled: v.players.length < 2, onclick: () => api('/api/start') }, v.players.length < 2 ? 'بانتظار لاعب آخر…' : 'ابدأ اللعبة')
       : h('p', { class: 'sub' }, 'بانتظار المضيف ليبدأ اللعبة…'),
    h('button', { class: 'alt', onclick: leave }, 'مغادرة الغرفة'));
}

// ── الحلبة ──
function mountArena() {
  const q = { cat: h('div', { class: 'cat' }), text: h('div', { class: 'qt' }), found: h('div', { class: 'found' }) };
  const tmBomb = sprite('bomb', 3); tmBomb.play('fuse');
  const tmNum = h('div', { class: 'num' }, '0');
  const ans = h('input', { id: 'ans', placeholder: 'اكتب إجابتك…', autocomplete: 'off', autocapitalize: 'off', enterkeyhint: 'send', onkeydown: (e) => e.key === 'Enter' && send() });
  const btn = h('button', { onclick: send }, 'إرسال الإجابة');
  const hud = h('div', { class: 'hud' }, h('div', { class: 'panel q' }, q.cat, q.text, q.found), h('div', { class: 'panel tm' }, tmBomb.el, tmNum), msgEl());
  const bar = h('div', { class: 'bar' }, ans, btn, h('button', { class: 'alt', onclick: () => confirm('تغادر المباراة؟') && leave() }, 'خروج'));
  const field = h('div', { id: 'field' });
  const arch = sprite('archer', 1), arrow = sprite('arrow', 2), bomb = sprite('bomb', 2); bomb.play('fuse');
  arch.el.id = 'arch'; arrow.el.id = 'arrow'; bomb.el.id = 'bomb'; arrow.el.style.display = 'none';
  field.append(arch.el, arrow.el, bomb.el);
  const el = h('div', { id: 'arena' }, field, hud, bar);
  $('#app').replaceChildren(el);
  AR = { el, q, tmNum, ans, btn, hud, bar, field, arch, arrow, bomb, P: new Map(), L: null, G: null, atk: null, ret: null, flip: false, phase: '', bombInit: false, over: null };
}
function mkPlayer(id) {
  const spr = sprite('player', 1), nm = h('div', { class: 'nm' }), hp = h('div', { class: 'hp' }), sp = h('div', { class: 'sp' }, spr.el);
  Object.assign(spr.el.style, { position: 'absolute', left: '50%' });
  const pl = { el: h('div', { class: 'pl' }, nm, sp, hp), spr, nm, hp, sp, hearts: [], dir: '', s: 0 };
  AR.field.append(pl.el); AR.P.set(id, pl);
  return pl;
}
function geometry(v) {
  const sh = SHEETS.player, ar = SHEETS.archer, ht = SHEETS.heart, max = v.s.hearts, per = Math.min(max, 5), hs = 2, rows = Math.ceil(max / per);
  const o = { vw: sh.vis.w, vh: sh.vis.h, minW: 56, nameH: NAME_H, heartsH: rows * (ht.h * hs + 2) + 2, perW: per * (ht.w * hs + 2), aw: ar.vis.w, ah: ar.vis.h };
  const A = AR.el.getBoundingClientRect();
  const top = AR.hud.getBoundingClientRect().bottom - A.top + 6, bottom = AR.bar.getBoundingClientRect().top - A.top - 6;
  return { hs, o, top, W: A.width, H: Math.max(60, bottom - top) };
}

function updateArena() {
  const v = S.v, g = v.game, me = S.sess.id, turn = g.turn, over = g.status === 'over';
  if (!AR) mountArena();
  if (over) Sound.stop(); else Sound.start();
  // لوحة السؤال والتقدم في الإجابات (لا تُكشف الإجابات الناقصة)
  AR.q.cat.textContent = `${g.q.cat} — الإجابات: ${g.q.done.length}/${g.q.need}`;
  AR.q.text.textContent = g.q.text;
  AR.q.found.replaceChildren(...g.q.done.map((a) => h('span', { class: 'chip' }, a)));
  const mine = !over && turn?.pid === me && !turn.atk;
  const wasOff = AR.ans.disabled;
  AR.ans.disabled = AR.btn.disabled = !mine;
  AR.ans.placeholder = mine ? 'اكتب إجابتك…' : turn?.atk ? 'الرامي يصوّب…' : over ? '' : `دور ${nameOf(turn?.pid)}…`;
  if (mine && wasOff) AR.ans.focus();
  // التخطيط: اللاعب المحلي في الأسفل دائماً، والترتيب الحقيقي للأدوار لا يتغيّر
  const G = geometry(v), ids = g.players.map((p) => p.id), L = layout(ids, me, G.W, G.H, G.o);
  AR.G = G; AR.L = L;
  for (const p of g.players) {
    const slot = L.slots.find((q) => q.id === p.id), pl = AR.P.get(p.id) || mkPlayer(p.id), sh = SHEETS.player;
    if (pl.s !== L.s) {
      pl.s = L.s; pl.spr.size(L.s);
      pl.sp.style.width = L.box.w + 'px'; pl.sp.style.height = sh.vis.h * L.s + 'px'; pl.hp.style.width = L.box.w + 'px';
      Object.assign(pl.spr.el.style, { marginLeft: -(sh.w * L.s) / 2 + 'px', top: -(sh.vis.y * L.s) + 'px' });
    }
    if (pl.dir !== slot.dir) { pl.dir = slot.dir; pl.spr.play(slot.dir); }            // يلتفت نحو المركز
    pl.el.style.left = slot.x + 'px'; pl.el.style.top = G.top + slot.y + 'px'; pl.el.style.zIndex = Math.round(G.top + slot.y);
    pl.nm.textContent = (p.id === me ? '★ ' : '') + p.name + (p.left ? ' (غادر)' : '');
    while (pl.hearts.length < v.s.hearts) { const hs = sprite('heart', G.hs); pl.hp.append(hs.el); pl.hearts.push(hs); }
    pl.hearts.forEach((hs, i) => hs.show(0, i < p.hearts ? 0 : 1));                  // القلوب = الحالة الموثوقة من الخادم
    pl.el.classList.toggle('cur', !over && turn?.pid === p.id);
    pl.el.classList.toggle('out', p.hearts < 1 || p.left);
  }
  // القنبلة فوق حاملها (تنزلق عند التمرير)
  const holder = turn && L.slots.find((q) => q.id === turn.pid), bs = L.s >= 2 ? 3 : 2;
  AR.bomb.el.style.display = holder ? '' : 'none';
  if (holder) {
    if (AR.bomb.scale !== bs) AR.bomb.size(bs);
    if (!AR.bombInit) AR.bomb.el.style.transition = 'none';
    const dir = holder.x >= L.cx ? 1 : -1, pv = SHEETS.player.vis;                     // القنبلة بجانب حاملها (للخارج) على مستوى الصدر
    const bx = Math.min(G.W - 8 * bs, Math.max(8 * bs, holder.x + dir * (L.box.w / 2 + 8 * bs)));
    Object.assign(AR.bomb.el.style, { left: bx - 8 * bs + 'px', top: G.top + holder.y - L.box.h / 2 + NAME_H + 0.35 * pv.h * L.s - 8 * bs + 'px' });
    if (!AR.bombInit) { void AR.bomb.el.offsetWidth; AR.bomb.el.style.transition = ''; AR.bombInit = true; }
    AR.bomb.el.classList.toggle('hot', left() < 5000);
  }
  if (AR.arch.scale !== L.s) AR.arch.size(L.s);
  if (AR.arrow.scale !== Math.max(2, L.s)) AR.arrow.size(Math.max(2, L.s));
  // بدء هجوم الرامي مرة واحدة لكل دور (يُشتقّ من وقت الخادم فلا يُعاد عند التحديثات ولا عند إعادة الاتصال)
  const atk = turn?.atk;
  if (atk && AR.atk?.id !== turn.id) {
    const tg = L.slots.find((q) => q.id === turn.pid);
    AR.atk = { id: turn.id, pid: turn.pid, plan: attackPlan(turn.total), t0: performance.now() - Math.max(0, atk.total - atk.ms) };
    AR.ret = null; AR.phase = ''; AR.flip = !!tg && tg.x < L.cx - 2;
  } else if (AR.atk && AR.atk.id !== turn?.id && !AR.atk.endAt) AR.atk.endAt = performance.now() + 250;
  overlay(g, v);
}
function overlay(g, v) {
  if (g.status !== 'over') { AR.over?.remove(); AR.over = null; return; }
  AR.over ??= AR.el.appendChild(h('div', { class: 'over' }));
  const rank = [...g.players].sort((a, b) => (b.id === g.winner) - (a.id === g.winner) || b.hearts - a.hearts || b.correct - a.correct);
  AR.over.replaceChildren(h('div', { class: 'panel' }, h('h2', {}, g.winner ? `الفائز هو ${nameOf(g.winner)}` : 'انتهت المباراة بالتعادل'),
    ...rank.map((p) => h('div', { class: 'row' }, h('span', {}, p.name), h('span', { class: 'mut' }, `قلوب ${p.hearts} · انفجارات ${p.booms} · صحيحة ${p.correct}`))),
    v.host === S.sess.id ? h('button', { onclick: () => api('/api/restart') }, 'العب مرة أخرى') : h('div', { class: 'mut' }, 'بانتظار المضيف لإعادة اللعب…'),
    h('button', { class: 'alt', onclick: leave }, 'العودة إلى الصفحة الرئيسية')));
}
async function send() {
  const g = S.v?.game, x = $('#ans'), text = x?.value.trim();
  if (!g?.turn || g.turn.atk || g.turn.pid !== S.sess.id || !text) return;
  const j = await api('/api/answer', { turnId: g.turn.id, qv: g.qv, text }); if (!j) return;
  x.value = '';
  if (j.correct) say('إجابة صحيحة!', 'ok');
  else if (j.dup) { say('قيلت هذه الإجابة من قبل — جرّب إجابة أخرى!', 'bad'); x.focus(); }
  else if (j.ok) { say('إجابة خاطئة، حاول مرة أخرى!', 'bad'); x.focus(); }
  else say('فات الأوان — انتهى دورك', 'bad');
}

// حركة الرامي: تُحسب كل إطار من (الآن − بداية الهجوم) فتبقى صحيحة مهما تكررت التحديثات
function archerStep(now) {
  if (!AR?.L) return;
  const { L, G, arch, arrow } = AR, s = L.s, ar = SHEETS.archer, cx = L.cx, cy = G.top + L.cy, restRow = ar.anim[REST.anim].row;
  let x = cx, y = cy;
  const a = AR.atk, tg = a && L.slots.find((q) => q.id === a.pid);
  if (a && !tg) AR.atk = null;
  if (AR.atk) {
    const tx = tg.x, ty = G.top + tg.y, d = Math.hypot(cx - tx, cy - ty) || 1, gap = Math.max(d * 0.45, Math.min(d, L.box.h * 0.6));
    const fx = tx + ((cx - tx) / d) * gap, fy = ty + ((cy - ty) / d) * gap;           // أمام اللاعب على الخط نحو المركز
    const p = a.plan, e = now - a.t0, b1 = p.move, b2 = b1 + p.reload, b3 = b2 + p.idle, b4 = b3 + p.release, b5 = b4 + p.arrow;
    if (e >= b5 || (a.endAt && now >= a.endAt)) {
      const k = e < b1 ? ease(e / b1) : 1;
      AR.ret = { t0: now, x: lerp(cx, fx, k), y: lerp(cy, fy, k) }; AR.atk = null; arrow.el.style.display = 'none';
    } else {
      const k = b1 ? ease(Math.min(1, e / b1)) : 1; x = lerp(cx, fx, k); y = lerp(cy, fy, k);
      const ph = e < b1 ? 'move' : e < b2 ? 'reload' : e < b3 ? 'idle' : 'shoot';      // reload ثم idle (يتكرر) ثم shoot مرة واحدة
      if (ph !== AR.phase) {
        AR.phase = ph;
        if (ph === 'move') arch.show(restRow, REST.frame);
        else arch.play(ph, { loop: ph === 'idle', at: e - (ph === 'reload' ? b1 : ph === 'idle' ? b2 : b3), speed: ATTACK.speed });
      }
      if (e >= b4) {                                                                  // السهم من القوس إلى صدر الهدف
        const t = Math.min(1, (e - b4) / p.arrow), mx = x + (AR.flip ? -1 : 1) * (ar.muzzle[0] - ar.w / 2) * s, my = y + (ar.muzzle[1] - ar.h / 2) * s;
        const ex = tx, ey = ty - L.box.h / 2 + NAME_H + 0.4 * SHEETS.player.vis.h * s, as = arrow.scale;
        Object.assign(arrow.el.style, { display: '', left: lerp(mx, ex, t) - (SHEETS.arrow.w * as) / 2 + 'px', top: lerp(my, ey, t) - (SHEETS.arrow.h * as) / 2 + 'px', transform: `rotate(${Math.atan2(ey - my, ex - mx)}rad)` });
      } else arrow.el.style.display = 'none';
    }
  }
  if (!AR.atk && AR.ret) {
    const t = Math.min(1, (now - AR.ret.t0) / ATTACK.returnMs), k = ease(t);
    x = lerp(AR.ret.x, cx, k); y = lerp(AR.ret.y, cy, k);
    if (AR.phase !== 'return') { AR.phase = 'return'; arch.show(restRow, REST.frame); }
    if (t >= 1) { AR.ret = null; AR.flip = false; }
  }
  if (!AR.atk && !AR.ret && AR.phase !== 'rest') { AR.phase = 'rest'; arch.show(restRow, REST.frame); }
  Object.assign(arch.el.style, { left: x - (ar.w * s) / 2 + 'px', top: y - (ar.h * s) / 2 + 'px', transform: AR.flip ? 'scaleX(-1)' : '' });
}

// ── التشغيل ──
function show(build) { AR = null; live.clear(); Sound.stop(); $('#app').replaceChildren(build()); }
function render() {
  if (!S.sess) return show(home);
  if (!S.v) return show(() => h('div', { class: 'screen' }, h('div', { class: 'panel' }, 'جارٍ الاتصال…')));
  if (S.v.phase === 'lobby') { Sound.preload(); return show(lobby); }
  updateArena();
}
const root = document.documentElement;
root.style.setProperty('--bg-day', `url(${ASSETS.bg.day})`); root.style.setProperty('--bg-night', `url(${ASSETS.bg.night})`); root.style.setProperty('--focus', THEME.focusY);
root.dataset.theme = pref.get().theme || THEME.default;
const frame = (now) => { live.forEach((s) => s.step(now)); archerStep(now); requestAnimationFrame(frame); };
requestAnimationFrame(frame);
setInterval(() => {   // عدّاد العرض فقط؛ الخادم هو من يقرّر انتهاء الوقت
  if (!AR || !S.v?.game?.turn) return;
  const ms = left(); AR.tmNum.textContent = Math.ceil(ms / 1000); AR.tmNum.classList.toggle('hot', ms < 5000 && ms > 0);
}, 100);
addEventListener('pagehide', () => { S.leaving = true; });
addEventListener('pointerdown', () => Sound.unlock()); addEventListener('keydown', () => Sound.unlock());
addEventListener('resize', () => AR && S.v?.game && updateArena());
tools();
if (S.sess) connect();
render();
